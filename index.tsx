
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('🚀 App starting...', {
  href: window.location.href,
  pathname: window.location.pathname,
  search: window.location.search
});

const rootElement = document.getElementById('root');
console.log('🎯 Root element found:', !!rootElement, rootElement);

if (!rootElement) {
  console.error('❌ Could not find root element');
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
console.log('✅ ReactDOM root created, rendering App...');

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

console.log('🎉 App render called');
