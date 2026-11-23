import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
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
  !Capacitor.isNativePlatform()
) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        reg.update();
      })
      .catch(() => {
        // Silently ignore in restricted preview iframes or non-HTTPS local contexts
      });
  });
}
