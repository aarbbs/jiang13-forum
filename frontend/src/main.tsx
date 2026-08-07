import React from 'react';
import ReactDOM from 'react-dom/client';
import { applyTheme, getStoredTheme } from './utils/theme';
import { initScrollRestore } from './utils/scrollRestore';
import App from './App';

applyTheme(getStoredTheme());
initScrollRestore();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
