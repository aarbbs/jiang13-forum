import DOMPurify from 'dompurify';
import { POST_CONTENT_PURIFY_CONFIG } from './postContent';
import { enhanceCodeBlocks } from './enhanceCodeBlocks';

/** 转义 HTML 并保留换行 */
function escapeWithBreaks(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

/** @用户名 高亮（data-name 供点击跳转用户主页） */
export function highlightMentions(text: string): string {
  return escapeWithBreaks(text)
    .replace(
      /@([\w\u4e00-\u9fa5_-]+)/g,
      '<span class="mention" data-name="$1" role="link" tabindex="0">@$1</span>',
    );
}

/** 判断内容是否为 HTML（包含常见 HTML 标签） */
function isHtmlContent(text: string): boolean {
  return /<(?:p|div|span|br|h[1-6]|ul|ol|li|pre|code|blockquote|a|img|table|strong|em|u|s)\b/i.test(text);
}

/** 在 HTML 文本节点中高亮 @ 提及（DOM 遍历，避免破坏标签） */
function processMentionsInHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    textNodes.push(node as Text);
  }
  for (const textNode of textNodes) {
    const text = textNode.textContent ?? '';
    if (!/@[\w\u4e00-\u9fa5_-]/.test(text)) continue;
    const frag = document.createDocumentFragment();
    const parts = text.split(/(@[\w\u4e00-\u9fa5_-]+)/);
    for (const part of parts) {
      const m = part.match(/^@([\w\u4e00-\u9fa5_-]+)$/);
      if (m) {
        const span = document.createElement('span');
        span.className = 'mention';
        span.setAttribute('data-name', m[1]);
        span.setAttribute('role', 'link');
        span.setAttribute('tabindex', '0');
        span.textContent = part;
        frag.appendChild(span);
      } else if (part) {
        frag.appendChild(document.createTextNode(part));
      }
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }
  return div.innerHTML;
}

/** 渲染评论内容：HTML 净化 + @提及高亮 + 代码块阅读态，兼容旧版纯文本 */
export function renderCommentContent(content: string): string {
  if (isHtmlContent(content)) {
    const sanitized = DOMPurify.sanitize(content, POST_CONTENT_PURIFY_CONFIG) as string;
    const withMentions = processMentionsInHtml(sanitized);
    const doc = new DOMParser().parseFromString(`<div id="j13-comment-root">${withMentions}</div>`, 'text/html');
    const root = doc.getElementById('j13-comment-root') ?? doc.body;
    enhanceCodeBlocks(root);
    return root.innerHTML;
  }
  return highlightMentions(content);
}

/** 相对时间：刚刚 / N分钟前 / N小时前 / N天前；更早用具体日期 */
export function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const now = new Date();
  const diffSec = Math.max(0, (now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}小时前`;

  const diffDay = Math.floor(diffSec / 86400);
  if (diffDay < 30) return `${diffDay}天前`;

  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 会话列表时间：今天 HH:mm，同年 M月D日，更早含年 */
export function formatConvListTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  if (
    d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate()
  ) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 完整日期时间（用于帖子发布/修改时间展示） */
export function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 短日期时间（本地时区）：MM-DD HH:mm，用于右栏最新评论等 */
export function formatShortDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 判断两个 ISO 时间是否相差超过 1 分钟 */
export function isTimeDiffSignificant(a: string, b: string) {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return false;
  return Math.abs(da - db) > 60_000;
}
