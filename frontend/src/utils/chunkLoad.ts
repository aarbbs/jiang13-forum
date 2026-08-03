/** sessionStorage：短时内只自动刷新一次，避免死循环 */
const RELOAD_AT_KEY = 'j13:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 15_000;

/** 判断是否为「发版后旧 JS chunk 失效」类错误 */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error ?? '');
  return /Failed to fetch dynamically imported module/i.test(msg)
    || /error loading dynamically imported module/i.test(msg)
    || /Importing a module script failed/i.test(msg)
    || /Loading chunk [\w-]+ failed/i.test(msg)
    || /ChunkLoadError/i.test(msg);
}

/**
 * 发版后旧页面仍引用已删除的 hashed chunk 时，整页刷新以拉取新 index.html。
 * @returns 是否已触发刷新（调用方应暂停渲染）
 */
export function reloadForStaleChunk(): boolean {
  try {
    const prev = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    const now = Date.now();
    if (now - prev < RELOAD_COOLDOWN_MS) {
      return false;
    }
    sessionStorage.setItem(RELOAD_AT_KEY, String(now));
  } catch {
    // sessionStorage 不可用时仍尝试刷新一次
  }
  window.location.reload();
  return true;
}
