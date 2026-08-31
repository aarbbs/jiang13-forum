import React from 'react';
import ReactDOM from 'react-dom/client';
import { applyTheme, getStoredTheme } from './utils/theme';
import App from './App';
import { ensureColdBootReady, isMainLayoutPath } from './utils/prefetchRoute';

applyTheme(getStoredTheme());

async function boot() {
  const path = `${window.location.pathname}${window.location.search}`;
  // 前台：齐套前不挂载；完成后一次 createRoot
  if (isMainLayoutPath(window.location.pathname)) {
    await ensureColdBootReady(path);
  }
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
