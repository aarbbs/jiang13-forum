/** 从 HTML 提取纯文本摘要（供页面 description / OG） */
export function excerptFromHTML(html: string, max = 160): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

/** 正文中第一张图片 URL */
export function firstImageFromHTML(html: string): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const img = doc.querySelector('img[src]');
  const src = img?.getAttribute('src')?.trim() || '';
  if (!src || src.startsWith('data:')) return '';
  return src;
}
