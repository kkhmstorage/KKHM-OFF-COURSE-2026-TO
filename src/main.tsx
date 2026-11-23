import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isNativeCapacitor } from './lib/capacitorBridge';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register PWA service worker for web browsers only (skip inside native Capacitor Android WebView)
if (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  !isNativeCapacitor()
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Silently ignore in restricted preview iframes or non-HTTPS local contexts
    });
  });
}
