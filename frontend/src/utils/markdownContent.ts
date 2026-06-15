import TurndownService from 'turndown';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { POST_CONTENT_PURIFY_CONFIG } from './postContent';

const MEMBERS_ONLY_BLOCK_RE = /<members-only>([\s\S]*?)<\/members-only>/gi;

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
  service.addRule('image', {
    filter: 'img',
    replacement: (_content, node) => {
      const el = node as HTMLImageElement;
      const alt = el.getAttribute('alt') ?? '';
      const src = el.getAttribute('src') ?? '';
      return src ? `![${alt}](${src})` : '';
    },
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

const turndown = new TurndownService(TURNDOWN_OPTIONS);
addTurndownContentRules(turndown);

/** 登录可见区块转为 Markdown：逐子节点转换，保留首行缩进 */
turndown.addRule('membersOnly', {
  filter: 'members-only',
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const parts: string[] = [];

    el.childNodes.forEach(child => {
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
    return `\n\n<members-only>\n\n${body}\n\n</members-only>\n\n`;
  },
});

marked.setOptions({
  gfm: true,
  breaks: true,
});

/** 禁用缩进代码块，Tab/空格缩进仅作正文排版；围栏 ``` 代码块不受影响 */
marked.use({
  tokenizer: {
    code() {
      return undefined;
    },
  },
});

/** 净化并保留 members-only 标签 */
function sanitizeContentHtml(html: string): string {
  return DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG);
}

/** 将行首空格转为不换行空格，避免 HTML 折叠缩进；跳过围栏代码块 */
function preserveLeadingIndent(markdown: string): string {
  return markdown.split(/(```[\s\S]*?```)/g).map((part, index) => {
    if (index % 2 === 1) return part;
    return part.replace(/^( +)(?=\S)/gm, (_match, spaces: string) => '\u00A0'.repeat(spaces.length));
  }).join('');
}

/** 将普通 Markdown 片段转为 HTML */
function parseMarkdownFragment(markdown: string): string {
  if (!markdown.trim()) return '';
  return marked.parse(preserveLeadingIndent(markdown), { async: false }) as string;
}

/** 转换前清理编辑态装饰结构，避免污染 Markdown */
function prepareHtmlForMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(sanitizeContentHtml(html), 'text/html');

  doc.querySelectorAll('.post-members-only__badge, .post-members-only__exit-btn, .post-members-only__unwrap-btn').forEach(el => {
    el.remove();
  });

  doc.querySelectorAll('members-only').forEach(el => {
    const body = el.querySelector('.post-members-only__body');
    const raw = body ? body.innerHTML : el.innerHTML;
    el.innerHTML = splitParagraphBreaks(raw);
  });

  return doc.body.innerHTML;
}

/** 规范化 members-only 标签边界，避免闭合标签与正文粘连 */
function normalizeMembersOnlyMarkdown(markdown: string): string {
  return markdown
    .replace(/<\/members-only>(?=[^\s\n])/g, '</members-only>\n\n')
    .replace(/<members-only>\s*<\/members-only>/g, '<members-only>\n\n</members-only>');
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
 * 先提取 members-only 块再分别解析，避免闭合标签后同行文字被吞入区块。
 */
export function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return '';

  const normalized = normalizeMembersOnlyMarkdown(markdown);
  const re = new RegExp(MEMBERS_ONLY_BLOCK_RE.source, 'gi');
  let result = '';
  let lastIndex = 0;
  let match: RegExpExecArray | null = re.exec(normalized);

  while (match) {
    const before = normalized.slice(lastIndex, match.index);
    if (before.trim()) {
      result += parseMarkdownFragment(before);
    }

    const innerMd = trimBlockBoundaryLines(match[1]);
    const innerHtml = innerMd.trim()
      ? splitParagraphBreaks(parseMarkdownFragment(innerMd))
      : '';
    result += `<members-only>${innerHtml}</members-only>`;
    lastIndex = re.lastIndex;
    match = re.exec(normalized);
  }

  const tail = normalized.slice(lastIndex);
  if (tail.trim()) {
    result += parseMarkdownFragment(tail);
  }

  return sanitizeContentHtml(result);
}
