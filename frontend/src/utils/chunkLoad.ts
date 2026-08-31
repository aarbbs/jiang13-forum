/** sessionStorage：短时内只自动刷新一次，避免死循环 */
const RELOAD_AT_KEY = 'j13:chunk-reload-at';
const RELOAD_COOLDOWN_MS = 15_000;

/** 从 HTML 中提取入口 module script（Vite 产物：/assets/index-*.js） */
function extractEntryScriptSrc(html: string): string | null {
  const re = /<script[^>]*\stype=["']module["'][^>]*\ssrc=["']([^"']+)["'][^>]*>/i;
  const m = html.match(re);
  if (m?.[1]) return m[1];
  // src 在 type 之前
  const re2 = /<script[^>]*\ssrc=["']([^"']+)["'][^>]*\stype=["']module["'][^>]*>/i;
  return html.match(re2)?.[1] ?? null;
}

/** 当前文档已加载的入口 script src */
export function getDocumentEntryScriptSrc(): string | null {
  const el = document.querySelector<HTMLScriptElement>('script[type="module"][src]');
  return el?.getAttribute('src') ?? null;
}

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

/**
 * 软刷新前对比入口 HTML 中的 index-*.js 哈希。
 * 发版后当前页 chunk 仍在内存，裸 import() 不会重新拉文件，必须主动检测。
 * @returns 是否已触发硬刷新（调用方应停止后续软刷新）
 */
export async function reloadIfShellStale(): Promise<boolean> {
  const current = getDocumentEntryScriptSrc();
  if (!current) return false;

  try {
    const res = await fetch(`${window.location.pathname}${window.location.search}`, {
      cache: 'no-store',
      headers: { Accept: 'text/html' },
      credentials: 'same-origin',
    });
    if (!res.ok) return false;
    const html = await res.text();
    const next = extractEntryScriptSrc(html);
    if (!next || next === current) return false;
    return reloadForStaleChunk();
  } catch {
    // 网络失败：跳过，继续软刷新
    return false;
  }
}
