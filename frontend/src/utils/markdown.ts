import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { POST_CONTENT_PURIFY_CONFIG } from './postContent';

marked.setOptions({ breaks: true, gfm: true });

const MEMBERS_BLOCK_RE = /:::members[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*:::/g;

type MdPart = { type: 'text' | 'members'; content: string };

/** 拆分普通 Markdown 与 :::members 区块 */
function splitMembersBlocks(md: string): MdPart[] {
  const parts: MdPart[] = [];
  let lastIndex = 0;
  const re = new RegExp(MEMBERS_BLOCK_RE.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = re.exec(md)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', content: md.slice(lastIndex, match.index) });
    }
    parts.push({ type: 'members', content: match[1] });
    lastIndex = re.lastIndex;
  }

  if (lastIndex < md.length) {
    parts.push({ type: 'text', content: md.slice(lastIndex) });
  }
  if (parts.length === 0) {
    parts.push({ type: 'text', content: md });
  }
  return parts;
}

/** Markdown 转 HTML，用于预览与发布 */
export function markdownToHtml(md: string): string {
  const parts = splitMembersBlocks(md);
  const html = parts.map(part => {
    if (part.type === 'members') {
      const inner = marked.parse(part.content.trim()) as string;
      return `<members-only>${inner}</members-only>`;
    }
    return marked.parse(part.content) as string;
  }).join('');

  return DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG);
}

/** HTML 转 Markdown，用于编辑已有帖子时回填编辑器 */
export function htmlToMarkdown(html: string): string {
  if (!html.trim()) return '';

  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG),
    'text/html',
  );

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const inner = () => Array.from(el.childNodes).map(walk).join('');

    switch (tag) {
      case 'members-only': {
        if (el.getAttribute('data-locked') === 'true') return '';
        const body = el.querySelector('.post-members-only__body');
        const content = body ? Array.from(body.childNodes).map(walk).join('') : inner();
        return `:::members\n${content.trim()}\n:::\n\n`;
      }
      case 'br': return '\n';
      case 'p': return inner().trimEnd() + '\n\n';
      case 'h1': return `# ${inner().trim()}\n\n`;
      case 'h2': return `## ${inner().trim()}\n\n`;
      case 'h3': return `### ${inner().trim()}\n\n`;
      case 'h4': return `#### ${inner().trim()}\n\n`;
      case 'h5': return `##### ${inner().trim()}\n\n`;
      case 'h6': return `###### ${inner().trim()}\n\n`;
      case 'strong':
      case 'b': return `**${inner()}**`;
      case 'em':
      case 'i': return `*${inner()}*`;
      case 'code': return `\`${inner()}\``;
      case 'pre': return `\`\`\`\n${el.textContent ?? ''}\n\`\`\`\n\n`;
      case 'a': return `[${inner()}](${el.getAttribute('href') ?? ''})`;
      case 'img': return `![${el.getAttribute('alt') ?? ''}](${el.getAttribute('src') ?? ''})`;
      case 'ul':
        return Array.from(el.children)
          .map(li => `- ${walk(li).trim()}`)
          .join('\n') + '\n\n';
      case 'ol':
        return Array.from(el.children)
          .map((li, i) => `${i + 1}. ${walk(li).trim()}`)
          .join('\n') + '\n\n';
      case 'li': return inner();
      case 'blockquote': {
        const text = inner().trim().replace(/\n/g, '\n> ');
        return `> ${text}\n\n`;
      }
      case 'hr': return '---\n\n';
      case 'div':
        if (el.classList.contains('post-members-only__badge')
          || el.classList.contains('post-members-only__gate')
          || el.classList.contains('post-members-only__gate-icon')) {
          return '';
        }
        if (el.classList.contains('post-members-only__body')) {
          return inner();
        }
        return inner();
      default: return inner();
    }
  };

  return walk(doc.body).replace(/\n{3,}/g, '\n\n').trim();
}

/** 统计正文字数（不含空白） */
export function countWords(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const cjk = t.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
  const en = t.match(/[a-zA-Z0-9]+/g)?.length ?? 0;
  return cjk + en;
}

/** 编辑器插入用的会员专属区块模板 */
export const MEMBERS_ONLY_TEMPLATE = ':::members\n在此输入仅登录用户可见的内容…\n:::';
