import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';
import './exam.css';

const el = document.getElementById('root');
if (el)
  createRoot(el).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );

// 离线缓存：Service Worker（PWA）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
