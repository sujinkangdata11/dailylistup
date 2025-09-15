import { DriveFile } from '../types';

// 브라우저 환경에서 로컬 저장을 위한 유틸리티
const downloadJsonFile = (fileName: string, content: object): void => {
    const jsonContent = JSON.stringify(content, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

// 메모리에 저장된 파일들 (세션 동안만 유지)
const localFileStorage: Map<string, object> = new Map();

// 구독자 히스토리 관리 함수 (월별 최대 5개 유지)
const updateSubscriberHistory = (existingHistory: any[] = [], newSubscriberCount: string): any[] => {
    const currentMonth = new Date().toISOString().slice(0, 7); // "2024-09" 형태
    
    // 기존 히스토리에서 현재 월 데이터가 있는지 확인
    const existingIndex = existingHistory.findIndex(item => item.month === currentMonth);
    
    if (existingIndex >= 0) {
        // 같은 달이면 덮어쓰기
        existingHistory[existingIndex].count = newSubscriberCount;
        return existingHistory;
    } else {
        // 새로운 달이면 맨 앞에 추가
        const newHistory = [
            { month: currentMonth, count: newSubscriberCount },
            ...existingHistory
        ];
        
        // 최대 5개까지만 유지 (오래된 것 삭제)
        return newHistory.slice(0, 5);
    }
};

// 브라우저 환경에서는 폴더 생성 불필요

export const findFileByName = async (fileName: string, folderId: string): Promise<DriveFile | null> => {
    try {
        const query = `name='${fileName}' and '${folderId}' in parents and trashed=false`;
        const response = await gapi.client.drive.files.list({
            q: query,
            spaces: 'drive',
            fields: 'files(id, name, mimeType)',
            pageSize: 1
        });

        const files = response.result.files || [];
        return files.length > 0 ? files[0] : null;
    } catch (error: any) {
        console.error('Error finding file:', error);
        throw new Error(`Failed to search for file: ${error.message}`);
    }
}

export const getFileContent = async (fileId: string): Promise<string> => {
    try {
        const response = await gapi.client.drive.files.get({
            fileId: fileId,
            alt: 'media'
        });

        return response.body;
    } catch (error: any) {
        console.error('Error getting file content:', error);
        throw new Error(`Failed to get file content: ${error.message}`);
    }
}

export const createJsonFile = async (fileName: string, folderId: string, content: object): Promise<DriveFile> => {
    console.log(`🚀 [createJsonFile] 시작: ${fileName} (Google Drive 업로드)`);

    try {
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const metadata = {
            name: fileName,
            parents: [folderId],
            mimeType: 'application/json'
        };

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(content, null, 2) +
            close_delim;

        const request = gapi.client.request({
            path: 'https://www.googleapis.com/upload/drive/v3/files',
            method: 'POST',
            params: { uploadType: 'multipart' },
            headers: {
                'Content-Type': 'multipart/related; boundary="' + boundary + '"'
            },
            body: multipartRequestBody
        });

        const response = await request;
        console.log(`✅ [createJsonFile] 성공: ${fileName} (Google Drive 업로드됨)`);

        return response.result;
    } catch (error: any) {
        console.error(`❌ [createJsonFile] 처리 실패: ${fileName}`, error);
        throw new Error(`Failed to create file in Google Drive: ${error.message}`);
    }
}

export const updateJsonFile = async (fileId: string, content: object): Promise<DriveFile> => {
    try {
        const boundary = '-------314159265358979323846';
        const delimiter = "\r\n--" + boundary + "\r\n";
        const close_delim = "\r\n--" + boundary + "--";

        const multipartRequestBody =
            delimiter +
            'Content-Type: application/json\r\n\r\n' +
            JSON.stringify(content, null, 2) +
            close_delim;

        const request = gapi.client.request({
            path: `https://www.googleapis.com/upload/drive/v3/files/${fileId}`,
            method: 'PATCH',
            params: { uploadType: 'media' },
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(content, null, 2)
        });

        const response = await request;
        return response.result;
    } catch (error: any) {
        console.error('Error updating file:', error);
        throw new Error(`Failed to update file in Google Drive: ${error.message}`);
    }
}

// createFolder 함수 제거됨 - 로컬 저장으로 변경됨

export const updateOrCreateChannelFile = async (
    channelData: any, 
    folderId: string
): Promise<void> => {
    try {
        const fileName = `${channelData.channelId}.json`;
        
        // 기존 채널 파일이 있는지 확인 (folderId가 이미 channels 폴더임)
        console.log(`🔍 [DEBUG] 파일 검색 중: ${fileName} in ${folderId}`);
        const existingFile = await findFileByName(fileName, folderId);
        console.log(`📁 [DEBUG] 기존 파일 검색 결과:`, existingFile ? '있음' : '없음');
        
        const now = new Date().toISOString();

        // 새로운 스냅샷 생성 (staticData + snapshotData 합침, subscriberCount 제외)
        // channelData.snapshot이 없으면 channelData.snapshots[0]을 사용 (두 번째 처리 위치 대응)
        const snapshotData = channelData.snapshot || (channelData.snapshots && channelData.snapshots[0]);
        console.log(`🔍 [DEBUG] 스냅샷 데이터 확인:`, {
            hasSnapshot: !!channelData.snapshot,
            hasSnapshots: !!channelData.snapshots,
            snapshotData: !!snapshotData
        });

        if (!snapshotData) {
            throw new Error('스냅샷 데이터가 없습니다. channelData.snapshot 또는 channelData.snapshots[0]이 필요합니다.');
        }

        const { subscriberCount, ...snapshotWithoutSubscriber } = snapshotData;
        const { publishedAt, ...staticDataForSnapshot } = channelData.staticData || {};
        
        const newSnapshot = {
            ts: now,
            // staticData의 필드들 (채널 정보, 이미지 등)
            ...staticDataForSnapshot,
            // snapshotData의 필드들 (수치 데이터, 응용데이터 등)
            ...snapshotWithoutSubscriber
        };

        if (existingFile) {
            // 기존 파일 업데이트
            const existingContent = await getFileContent(existingFile.id);
            const existingData = JSON.parse(existingContent);
            
            // 1. 정적 데이터 (채널 생성날짜만 유지)
            const updatedStaticData = {
                publishedAt: channelData.staticData?.publishedAt || existingData.staticData?.publishedAt
            };
            
            // 2. 스냅샷 데이터 (최신 1개로 덮어쓰기)
            const updatedSnapshots = [newSnapshot];
            
            // 3. 구독자 히스토리 (월별 5개 관리)
            const updatedSubscriberHistory = updateSubscriberHistory(
                existingData.subscriberHistory || [], 
                subscriberCount
            );
            
            // 4. 메타데이터 업데이트
            const updatedMetadata = {
                firstCollected: existingData.metadata?.firstCollected || now,
                lastUpdated: now,
                totalCollections: (existingData.metadata?.totalCollections || 0) + 1
            };

            const updatedChannelData = {
                channelId: channelData.channelId,
                staticData: updatedStaticData,
                snapshots: updatedSnapshots,
                // 히스토리 데이터 포함 (있는 경우에만)
                ...(channelData.recentThumbnailsHistory && { recentThumbnailsHistory: channelData.recentThumbnailsHistory }),
                ...(channelData.dailyViewsHistory && { dailyViewsHistory: channelData.dailyViewsHistory }),
                ...(channelData.weeklyViewsHistory && { weeklyViewsHistory: channelData.weeklyViewsHistory }),
                subscriberHistory: updatedSubscriberHistory,
                metadata: updatedMetadata
            };

            await updateJsonFile(existingFile.id, updatedChannelData);
            console.log(`✅ 기존 파일 업데이트 완료: ${fileName}`);
        } else {
            // 새 파일 생성
            const newChannelData = {
                channelId: channelData.channelId,
                staticData: {
                    publishedAt: channelData.staticData?.publishedAt
                },
                snapshots: [newSnapshot],
                // 히스토리 데이터 포함 (있는 경우에만)
                ...(channelData.recentThumbnailsHistory && { recentThumbnailsHistory: channelData.recentThumbnailsHistory }),
                ...(channelData.dailyViewsHistory && { dailyViewsHistory: channelData.dailyViewsHistory }),
                ...(channelData.weeklyViewsHistory && { weeklyViewsHistory: channelData.weeklyViewsHistory }),
                subscriberHistory: updateSubscriberHistory([], subscriberCount),
                metadata: {
                    firstCollected: now,
                    lastUpdated: now,
                    totalCollections: 1
                }
            };
            
            console.log(`🆕 새 파일 생성 시도: ${fileName}`);
            await createJsonFile(fileName, folderId, newChannelData);
            console.log(`✅ 새 파일 생성 완료: ${fileName}`);
        }

        // 채널 인덱스 업데이트
        const channelInfo = {
            channelId: channelData.channelId,
            title: channelData.staticData?.title || 'Unknown',
            firstCollected: existingFile ? undefined : now, // 새 채널일때만 설정
            lastUpdated: now,
            totalSnapshots: existingFile ? 
                (JSON.parse(await getFileContent(existingFile.id)).metadata?.totalCollections || 1) : 1
        };

        try {
            // 채널 인덱스를 선택한 Google Drive 폴더에 저장
            await updateChannelIndex(folderId, channelInfo);
        } catch (indexError) {
            console.warn(`채널 인덱스 업데이트 실패 (채널 저장은 성공): ${indexError}`);
            // 인덱스 업데이트 실패해도 채널 저장은 성공한 것으로 처리
        }

    } catch (error: any) {
        console.error(`채널 ${channelData.channelId} 파일 처리 오류:`, error);
        console.error('오류 상세:', error.message);
        console.error('오류 스택:', error.stack);
        throw error;
    }
};

export const getOrCreateChannelIndex = async (folderId: string): Promise<any> => {
    try {
        const indexFileName = '_channel_index.json';
        const existingIndex = await findFileByName(indexFileName, folderId);
        
        if (existingIndex) {
            // 기존 인덱스 파일 로드
            const content = await getFileContent(existingIndex.id);
            return JSON.parse(content);
        } else {
            // 새로운 인덱스 파일 생성
            const newIndex = {
                lastUpdated: new Date().toISOString(),
                totalChannels: 0,
                channels: []
            };
            await createJsonFile(indexFileName, folderId, newIndex);
            return newIndex;
        }
    } catch (error) {
        console.error('채널 인덱스 처리 오류:', error);
        throw error;
    }
};

export const updateChannelIndex = async (folderId: string, channelInfo: any): Promise<void> => {
    try {
        const indexFileName = '_channel_index.json';
        let existingIndexFile = await findFileByName(indexFileName, folderId);
        
        if (!existingIndexFile) {
            // 인덱스 파일이 없으면 자동 생성
            console.log(`인덱스 파일이 없어서 새로 생성합니다: ${folderId}/${indexFileName}`);
            await getOrCreateChannelIndex(folderId);
            // 생성 후 다시 찾기
            existingIndexFile = await findFileByName(indexFileName, folderId);
            if (!existingIndexFile) {
                throw new Error('인덱스 파일 생성 후에도 찾을 수 없습니다.');
            }
        }
        
        const currentIndex = JSON.parse(await getFileContent(existingIndexFile.id));
        
        // 기존 채널 찾기
        const existingChannelIndex = currentIndex.channels.findIndex((ch: any) => ch.channelId === channelInfo.channelId);
        
        if (existingChannelIndex >= 0) {
            // 기존 채널 업데이트
            currentIndex.channels[existingChannelIndex] = {
                ...currentIndex.channels[existingChannelIndex],
                lastUpdated: channelInfo.lastUpdated,
                totalSnapshots: channelInfo.totalSnapshots
            };
        } else {
            // 새 채널 추가
            currentIndex.channels.push(channelInfo);
            currentIndex.totalChannels = currentIndex.channels.length;
        }
        
        currentIndex.lastUpdated = new Date().toISOString();
        
        await updateJsonFile(existingIndexFile.id, currentIndex);
    } catch (error) {
        console.error('채널 인덱스 업데이트 오류:', error);
        throw error;
    }
};

export const getExistingChannelIds = async (folderId: string): Promise<string[]> => {
    try {
        const channelIndex = await getOrCreateChannelIndex(folderId);
        return channelIndex.channels.map((ch: any) => ch.channelId);
    } catch (error) {
        console.error('기존 채널 ID 조회 오류:', error);
        return [];
    }
};

export const listFolders = async (): Promise<DriveFile[]> => {
    try {
        console.log('🔍 Fetching folders from Google Drive...');
        const response = await gapi.client.drive.files.list({
            q: "mimeType='application/vnd.google-apps.folder' and trashed=false",
            spaces: 'drive',
            fields: 'files(id, name, mimeType)',
            pageSize: 100
        });

        console.log('📁 Drive API response:', response);
        console.log('📁 Found folders:', response.result.files);

        return response.result.files || [];
    } catch (error) {
        console.error('❌ Error fetching folders:', error);
        throw error;
    }
}