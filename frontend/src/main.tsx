import React from 'react';
import { hydrateRoot, createRoot } from 'react-dom/client';
import { applyTheme, getStoredTheme } from './utils/theme';
import App from './App';
import { consumeHomeBoot } from './utils/homeBoot';
import { beginHomeHydrate } from './utils/homeHydrate';
import { ensureColdBootReady, isMainLayoutPath } from './utils/prefetchRoute';

applyTheme(getStoredTheme());
consumeHomeBoot();

function hasSSRHome(): boolean {
  return !!document.querySelector('#root .ssr-home');
}

function waitForStylesheets(): Promise<void> {
  const links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
  if (links.length === 0) return Promise.resolve();
  return Promise.all(
    links.map(
      (node) =>
        new Promise<void>((resolve) => {
          const link = node as HTMLLinkElement;
          try {
            if (link.sheet) {
              resolve();
              return;
            }
          } catch {
            /* cross-origin */
          }
          const finish = () => resolve();
          link.addEventListener('load', finish, { once: true });
          link.addEventListener('error', finish, { once: true });
        }),
    ),
  ).then(() => undefined);
}

function renderApp() {
  return (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

function mountCreateRoot(el: HTMLElement) {
  createRoot(el).render(renderApp());
}

/** 有 SSR 正文：hydrate 接管同一 DOM；失败则回退 createRoot */
function mountHydrateHome(el: HTMLElement) {
  beginHomeHydrate();
  try {
    hydrateRoot(el, renderApp());
  } catch (err) {
    console.warn('[j13] hydrateRoot 失败，回退 createRoot', err);
    el.innerHTML = '';
    mountCreateRoot(el);
  }
}

async function boot() {
  const path = `${window.location.pathname}${window.location.search}`;
  const ssr = hasSSRHome();

  await waitForStylesheets();
  try {
    if (document.fonts?.ready) await document.fonts.ready;
  } catch {
    /* ignore */
  }

  if (isMainLayoutPath(window.location.pathname)) {
    await ensureColdBootReady(path);
  }

  const root = document.getElementById('root');
  if (!root) return;

  if (ssr) {
    mountHydrateHome(root);
  } else {
    mountCreateRoot(root);
  }
}

void boot();
