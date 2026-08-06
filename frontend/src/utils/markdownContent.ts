import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { POST_CONTENT_PURIFY_CONFIG } from './postContent';
import { parseFenceInfo, formatFenceInfo } from './codeBlockOptions';
import { mapOutsideFences, wrapFencedCode } from './markdownFences';

const GATED_BLOCK_RE = /<(members-only|reply-only)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi;

const TURNDOWN_OPTIONS = {
  headingStyle: 'atx' as const,
  codeBlockStyle: 'fenced' as const,
  emDelimiter: '*',
  bulletListMarker: '-',
};

/** 仅去除区块首尾空行，保留各行行首缩进 */
function trimBlockBoundaryLines(content: string): string {
  return content.replace(/^\n+/, '').replace(/\n+$/, '');
}

/** 不换行空格还原为普通空格，便于 Markdown 源码编辑 */
function nbspToSpaces(text: string): string {
  return text.replace(/\u00A0/g, ' ');
}

/** 将含 <br> 的段落拆成多个 <p>，避免聚合转换时丢失首行缩进 */
function splitParagraphBreaks(html: string): string {
  if (!/<br\s*\/?>/i.test(html)) return html;

  const doc = new DOMParser().parseFromString(`<div data-wrap="1">${html}</div>`, 'text/html');
  const container = doc.querySelector('[data-wrap]');
  if (!container) return html;

  [...container.querySelectorAll('p')].forEach(p => {
    const inner = p.innerHTML;
    if (!/<br\s*\/?>/i.test(inner)) return;

    const parts = inner.split(/<br\s*\/?>/i);
    const fragment = doc.createDocumentFragment();
    parts.forEach((part, index) => {
      if (part === '' && index === parts.length - 1) return;
      const newP = doc.createElement('p');
      newP.innerHTML = part;
      fragment.appendChild(newP);
    });
    p.replaceWith(fragment);
  });

  return container.innerHTML;
}

/** 为 Turndown 注册通用正文规则（不含 members-only） */
function addTurndownContentRules(service: TurndownService): void {
  // TipTap 列表项内是 <li><p>…</p></li>：默认 paragraph 规则会塞多余空行，
  // 导致列表结构异常；列表内段落只输出内容本身。
  service.addRule('paragraphInListItem', {
    filter: (node) =>
      node.nodeName === 'P' && Boolean(node.parentNode && node.parentNode.nodeName === 'LI'),
    replacement: (content) => content.trim(),
  });

  // 代码块统一输出围栏，展示选项写入 info 串：```js lines collapsed
  service.addRule('fencedCodeBlock', {
    filter: (node) => node.nodeName === 'PRE',
    replacement: (_content, node) => {
      const pre = node as HTMLElement;
      const codeEl = pre.querySelector('code') || pre;
      // 行号装饰 span 时仍取纯文本
      const text = codeEl.textContent || '';
      const langMatch = (codeEl.getAttribute('class') || '').match(/(?:language|lang)-([a-z0-9_+-]+)/i);
      const wrap = pre.closest('.md-codeblock') as HTMLElement | null;
      const language = (
        pre.getAttribute('data-lang')
        || wrap?.getAttribute('data-lang')
        || langMatch?.[1]
        || ''
      ).trim().toLowerCase();
      const lineNumbers = pre.getAttribute('data-line-numbers') === 'true'
        || wrap?.getAttribute('data-line-numbers') === 'true';
      const collapsed = pre.getAttribute('data-collapsed') === 'true'
        || wrap?.getAttribute('data-collapsed') === 'true';
      const info = formatFenceInfo({ language, lineNumbers, collapsed });
      return wrapFencedCode(info, text);
    },
  });

  service.addRule('imageGroup', {
    filter: (node) =>
      node.nodeName === 'DIV' && (node as HTMLElement).hasAttribute('data-image-group'),
    replacement: (_content, node) => {
      const el = node as HTMLElement;
      const layout = el.getAttribute('data-layout') || 'cols-2';
      const imgs = [...el.querySelectorAll(':scope > img, :scope .image-group__grid > img')]
        .map(img => {
          const src = img.getAttribute('src') || '';
          const alt = img.getAttribute('alt') || '';
          return src ? `<img src="${src}" alt="${alt}">` : '';
        })
        .filter(Boolean)
        .join('');
      if (!imgs) return '';
      return `\n\n<div data-image-group data-layout="${layout}" class="image-group image-group--${layout}">${imgs}</div>\n\n`;
    },
  });

  service.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      // 已由图组规则处理的子图跳过
      if (el.closest('[data-image-group]')) return '';
      const alt = el.getAttribute('alt') ?? '';
      const src = el.getAttribute('src') ?? '';
      if (!src) return '';
      const display = el.getAttribute('data-display');
      if (display && display !== 'default') {
        return `\n\n<img src="${src}" alt="${alt}" data-display="${display}" class="article-img article-img--${display}">\n\n`;
      }
      return `![${alt}](${src})`;
    },
  });

  // 清浮动段落：保留为 HTML，避免空行被 Markdown 折叠后绕排失效
  service.addRule('clearFloatParagraph', {
    filter: (node) =>
      node.nodeName === 'P' && (node as HTMLElement).hasAttribute('data-clear-float'),
    replacement: (content) =>
      `\n\n<p data-clear-float class="article-clear-float">${content}</p>\n\n`,
  });

  service.addRule('underline', {
    filter: ['u'],
    replacement: (content) => `<u>${content}</u>`,
  });

  service.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => `~~${content}~~`,
  });

  service.addRule('horizontalRule', {
    filter: 'hr',
    replacement: () => '\n\n---\n\n',
  });

  // HTML 表格 → GFM 管道表，便于富文本与源码来回切换
  service.addRule('table', {
    filter: 'table',
    replacement: (_content, node) => {
      const table = node as HTMLTableElement;
      const rows = [...table.querySelectorAll('tr')];
      if (!rows.length) return '';

      const cellText = (cell: Element) =>
        (cell.textContent || '')
          .replace(/\u00A0/g, ' ')
          .trim()
          .replace(/\|/g, '\\|')
          .replace(/\n+/g, ' ');

      const matrix = rows
        .map(tr => [...tr.querySelectorAll('th, td')].map(cellText))
        .filter(row => row.length > 0);
      if (!matrix.length) return '';

      const colCount = Math.max(...matrix.map(r => r.length));
      if (!colCount) return '';

      const pad = (row: string[]) => {
        const next = [...row];
        while (next.length < colCount) next.push('');
        return next.slice(0, colCount);
      };

      const lines = matrix.map(row => `| ${pad(row).join(' | ')} |`);
      const sep = `| ${Array.from({ length: colCount }, () => '---').join(' | ')} |`;
      lines.splice(1, 0, sep);
      return `\n\n${lines.join('\n')}\n\n`;
    },
  });

  service.addRule('anchor', {
    filter: (node) => {
      if (node.nodeName !== 'A') return false;
      const href = (node as HTMLAnchorElement).getAttribute('href');
      return Boolean(href);
    },
    replacement: (content, node) => {
      const el = node as HTMLAnchorElement;
      const href = el.getAttribute('href') ?? '';
      const title = el.getAttribute('title');
      return title ? `[${content}](${href} "${title}")` : `[${content}](${href})`;
    },
  });
}

/** 子节点转 Markdown 专用，避免 members-only 规则递归 */
const contentTurndown = new TurndownService(TURNDOWN_OPTIONS);
addTurndownContentRules(contentTurndown);
patchTurndownEscape(contentTurndown);

const turndown = new TurndownService(TURNDOWN_OPTIONS);
addTurndownContentRules(turndown);
patchTurndownEscape(turndown);

/**
 * Turndown 默认会把「行首 1. 」转义成 1\. ，避免被当成列表。
 * 富文本有序列表 / 用户手写序号在源码里都应保持 1. ，故去掉该转义。
 */
function patchTurndownEscape(service: TurndownService): void {
  const original = service.escape.bind(service);
  service.escape = (str: string) => original(str).replace(/(\d+)\\(\.)/g, '$1$2');
}

/** 将门控区块（登录可见 / 回复可见）转为 Markdown 标签 */
function gatedBlockToMarkdown(tag: 'members-only' | 'reply-only', node: HTMLElement): string {
  const parts: string[] = [];

  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = (child.textContent ?? '').trim();
      if (text) parts.push(nbspToSpaces(text));
      return;
    }
    if (child instanceof HTMLElement) {
      parts.push(nbspToSpaces(contentTurndown.turndown(child.outerHTML).trim()));
    }
  });

  const body = trimBlockBoundaryLines(parts.join('\n\n'));
  const gate = tag === 'reply-only' ? 'reply' : 'login';
  return `\n\n<${tag} data-gate="${gate}">\n\n${body}\n\n</${tag}>\n\n`;
}

turndown.addRule('membersOnly', {
  filter: 'members-only',
  replacement: (_content, node) => gatedBlockToMarkdown('members-only', node as HTMLElement),
});

turndown.addRule('replyOnly', {
  filter: 'reply-only',
  replacement: (_content, node) => gatedBlockToMarkdown('reply-only', node as HTMLElement),
});

marked.setOptions({
  gfm: true,
  breaks: true,
});

/** HTML 转义代码正文 */
function escapeCodeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 禁用缩进代码块；围栏支持 lines/collapsed 简写（旧 style=* 解析时忽略） */
marked.use({
  tokenizer: {
    code() {
      return undefined;
    },
  },
  renderer: {
    code({ text, lang, escaped }) {
      const opts = parseFenceInfo(lang || '');
      const attrs: string[] = [];
      if (opts.lineNumbers) attrs.push('data-line-numbers="true"');
      if (opts.collapsed) attrs.push('data-collapsed="true"');
      const preOpen = attrs.length ? `<pre ${attrs.join(' ')}>` : '<pre>';
      const classAttr = opts.language ? ` class="language-${opts.language}"` : '';
      const body = escaped ? text : escapeCodeHtml(text);
      return `${preOpen}<code${classAttr}>${body}</code></pre>\n`;
    },
  },
});

/** 净化并保留 members-only 标签 */
function sanitizeContentHtml(html: string): string {
  return DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG);
}

/** 将行首空格转为不换行空格，避免 HTML 折叠缩进；跳过围栏代码块 */
function preserveLeadingIndent(markdown: string): string {
  return mapOutsideFences(markdown, (outside) =>
    outside.replace(/^( +)(?=\S)/gm, (_match, spaces: string) => '\u00A0'.repeat(spaces.length)),
  );
}

/** 将普通 Markdown 片段转为 HTML */
function parseMarkdownFragment(markdown: string): string {
  if (!markdown.trim()) return '';
  return marked.parse(preserveLeadingIndent(markdown), { async: false }) as string;
}

/** 转换前清理编辑态装饰结构，避免污染 Markdown */
function prepareHtmlForMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(sanitizeContentHtml(html), 'text/html');

  doc.querySelectorAll([
    '.post-members-only__badge', '.post-members-only__exit-btn', '.post-members-only__unwrap-btn',
    '.post-reply-only__badge', '.post-reply-only__exit-btn', '.post-reply-only__unwrap-btn',
  ].join(', ')).forEach(el => {
    el.remove();
  });

  doc.querySelectorAll('members-only').forEach(el => {
    const body = el.querySelector('.post-members-only__body');
    const raw = body ? body.innerHTML : el.innerHTML;
    el.innerHTML = splitParagraphBreaks(raw);
  });

  doc.querySelectorAll('reply-only').forEach(el => {
    const body = el.querySelector('.post-reply-only__body');
    const raw = body ? body.innerHTML : el.innerHTML;
    el.innerHTML = splitParagraphBreaks(raw);
  });

  return doc.body.innerHTML;
}

/** 规范化门控标签边界，避免闭合标签与正文粘连 */
function normalizeGatedMarkdown(markdown: string): string {
  return markdown
    .replace(/<\/members-only>(?=[^\s\n])/g, '</members-only>\n\n')
    .replace(/<members-only(?:\s[^>]*)?>\s*<\/members-only>/g, '<members-only data-gate="login">\n\n</members-only>')
    .replace(/<\/reply-only>(?=[^\s\n])/g, '</reply-only>\n\n')
    .replace(/<reply-only(?:\s[^>]*)?>\s*<\/reply-only>/g, '<reply-only data-gate="reply">\n\n</reply-only>');
}

/** 列表标记后统一为单个空格（Turndown 默认会输出两个及以上空格） */
function normalizeListMarkerSpacing(markdown: string): string {
  return markdown
    .replace(/^(\s*[-+*])\s+(?=\S)/gm, '$1 ')
    .replace(/^(\s*\d+\.)\s+(?=\S)/gm, '$1 ');
}

/** 编辑器 HTML 转为 Markdown 源码 */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return '';
  const prepared = prepareHtmlForMarkdown(html);
  const raw = turndown.turndown(prepared).replace(/\n{3,}/g, '\n\n').trim();
  return normalizeListMarkerSpacing(raw);
}

/**
 * Markdown 源码转为编辑器 HTML。
 * 先提取门控块再分别解析，避免闭合标签后同行文字被吞入区块。
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return '';

  const normalized = normalizeGatedMarkdown(markdown);
  const re = new RegExp(GATED_BLOCK_RE.source, 'gi');
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null = re.exec(normalized);

  while (match) {
    const before = normalized.slice(lastIndex, match.index);
    if (before.trim()) {
      result += parseMarkdownFragment(before);
    }

    const tag = match[1];
    const gate = tag === 'reply-only' ? 'reply' : 'login';
    const innerMd = trimBlockBoundaryLines(match[2]);
    const innerHtml = innerMd.trim()
      ? splitParagraphBreaks(parseMarkdownFragment(innerMd))
      : '';
    result += `<${tag} data-gate="${gate}">${innerHtml}</${tag}>`;
    lastIndex = re.lastIndex;
    match = re.exec(normalized);
  }

  const tail = normalized.slice(lastIndex);
  if (tail.trim()) {
    result += parseMarkdownFragment(tail);
  }

  return sanitizeContentHtml(result);
}
