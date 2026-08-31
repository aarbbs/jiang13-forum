/** 首页 SSR hydrate 首帧同构标志（仅 / 与板块首页） */

declare global {
  interface Window {
    __J13_HYDRATING_HOME__?: boolean;
  }
}

let hydrating = false;

export function beginHomeHydrate() {
  hydrating = true;
  try {
    window.__J13_HYDRATING_HOME__ = true;
  } catch {
    /* ignore */
  }
}

export function endHomeHydrate() {
  hydrating = false;
  try {
    delete window.__J13_HYDRATING_HOME__;
  } catch {
    try {
      window.__J13_HYDRATING_HOME__ = undefined;
    } catch {
      /* ignore */
    }
  }
}

/** 首帧是否必须与 Go SSR DOM 同构 */
export function isHomeHydrating(): boolean {
  if (hydrating) return true;
  try {
    return !!window.__J13_HYDRATING_HOME__;
  } catch {
    return false;
  }
}
