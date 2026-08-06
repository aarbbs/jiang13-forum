import hljs from 'highlight.js/lib/common';
import { registerAardioLanguage } from './hljsAardio';

registerAardioLanguage(hljs);

/** 至少这么多行才显示折叠按钮（与默认折叠裁切高度一致） */
const CODE_FOLD_MIN_LINES = 5;

/** 预览头栏语言标签：aardio 保持全小写，其余沿用检测结果 */
function formatLangLabel(lang: string): string {
  if (lang === 'aardio') return 'aardio';
  return lang;
}

/** 从 class / data-lang 中解析作者标注的语言标识 */
function detectLang(...els: Element[]): string {
  for (const el of els) {
    const data = el.getAttribute('data-lang') || el.getAttribute('data-language');
    if (data?.trim()) return data.trim().toLowerCase();
    const cls = el.getAttribute('class') || '';
    const m = cls.match(/(?:language|lang)-([a-z0-9_+-]+)/i);
    if (m?.[1]) return m[1].toLowerCase();
  }
  return '';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 读取作者配置的展示选项（写在 pre 上；外观由站点主题决定） */
function readDisplayOptions(pre: Element) {
  return {
    lineNumbers: pre.getAttribute('data-line-numbers') === 'true',
    collapsed: pre.getAttribute('data-collapsed') === 'true',
  };
}

/**
 * 在换行处闭合并重开跨行 <span>，使每行 HTML 片段自包含。
 * hljs token 常跨多行，直接按 \\n 切开会破坏标签导致行号布局叠字。
 */
function balanceHighlightLines(highlightedHtml: string): string[] {
  const openTags: string[] = [];
  let balanced = '';
  const tokenRe = /(<span\b[^>]*>)|(<\/span>)|(\n)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(highlightedHtml)) !== null) {
    balanced += highlightedHtml.slice(lastIndex, match.index);
    lastIndex = tokenRe.lastIndex;

    if (match[3] !== undefined) {
      // 换行：先闭合当前栈，再于下一行重开
      for (let i = openTags.length - 1; i >= 0; i--) balanced += '</span>';
      balanced += '\n';
      for (const tag of openTags) balanced += tag;
      continue;
    }

    if (match[2] !== undefined) {
      openTags.pop();
      balanced += match[2];
      continue;
    }

    // 开标签
    openTags.push(match[1]);
    balanced += match[1];
  }

  balanced += highlightedHtml.slice(lastIndex);
  return balanced.split('\n');
}

/** 为高亮后的 HTML 按行包一层，便于行号与折叠计数 */
function wrapCodeLines(highlightedHtml: string, withLineNumbers: boolean): string {
  const lines = balanceHighlightLines(highlightedHtml);
  return lines
    .map((line, i) => {
      const num = i + 1;
      const body = line.length > 0 ? line : '';
      if (withLineNumbers) {
        return `<span class="md-code-line"><span class="md-code-line__num" aria-hidden="true">${num}</span><span class="md-code-line__body">${body}</span></span>`;
      }
      return `<span class="md-code-line"><span class="md-code-line__body">${body}</span></span>`;
    })
    .join('');
}

/** 美化并高亮文档中的代码块（语言标签、复制、行号、折叠；外观跟主题） */
export function enhanceCodeBlocks(root: ParentNode): void {
  root.querySelectorAll('pre').forEach(pre => {
    if (pre.closest('.md-codeblock')) return;
    const code = pre.querySelector('code') || pre;
    const raw = code.textContent || '';
    const display = readDisplayOptions(pre);

    // 作者写了语言标签则以标注为准，绝不被自动识别覆盖
    const declaredLang = detectLang(code, pre);
    let label = formatLangLabel(declaredLang || 'code');

    try {
      if (declaredLang && hljs.getLanguage(declaredLang)) {
        const result = hljs.highlight(raw, { language: declaredLang, ignoreIllegals: true });
        code.innerHTML = wrapCodeLines(result.value, display.lineNumbers);
        code.classList.add('hljs', `language-${declaredLang}`);
      } else if (declaredLang) {
        // 未收录语言：保留原文与标签，不做自动猜测
        code.innerHTML = wrapCodeLines(escapeHtml(raw), display.lineNumbers);
        code.classList.add('hljs', `language-${declaredLang}`);
      } else if (raw.length >= 24) {
        const result = hljs.highlightAuto(raw);
        code.innerHTML = wrapCodeLines(result.value, display.lineNumbers);
        code.classList.add('hljs');
        if (result.language) {
          label = formatLangLabel(result.language);
          code.classList.add(`language-${result.language}`);
        }
      } else {
        code.innerHTML = wrapCodeLines(escapeHtml(raw), display.lineNumbers);
        code.classList.add('hljs');
      }
    } catch {
      code.innerHTML = wrapCodeLines(escapeHtml(raw), display.lineNumbers);
      code.classList.add('hljs');
      if (declaredLang) code.classList.add(`language-${declaredLang}`);
    }

    if (display.lineNumbers) {
      code.classList.add('md-code--lines');
    }

    const lineCount = raw === '' ? 1 : raw.split('\n').length;
    const canFold = lineCount >= CODE_FOLD_MIN_LINES;
    const initiallyCollapsed = display.collapsed && canFold;
    const wrap = pre.ownerDocument.createElement('div');
    wrap.className = [
      'md-codeblock',
      display.lineNumbers ? 'md-codeblock--lines' : '',
      initiallyCollapsed ? 'md-codeblock--collapsed' : '',
      initiallyCollapsed && lineCount <= CODE_FOLD_MIN_LINES ? 'md-codeblock--short' : '',
    ].filter(Boolean).join(' ');
    wrap.setAttribute('data-lang', label);
    if (display.lineNumbers) wrap.setAttribute('data-line-numbers', 'true');
    if (display.collapsed) wrap.setAttribute('data-collapsed', 'true');
    wrap.setAttribute('data-line-count', String(lineCount));
    // 行号列宽按最大位数自适应（用 data-*，避免 style 被消毒剥掉）
    if (display.lineNumbers) {
      wrap.setAttribute('data-lineno-digits', String(String(lineCount).length));
    }

    const head = pre.ownerDocument.createElement('div');
    head.className = 'md-codeblock__head';

    const actions: string[] = [];
    if (canFold) {
      const foldLabel = initiallyCollapsed ? '展开' : '收起';
      actions.push(`<button type="button" class="md-codeblock__fold" data-code-fold>${foldLabel}</button>`);
    }
    actions.push('<button type="button" class="md-codeblock__copy" data-code-copy>复制</button>');

    head.innerHTML = `
      <span class="md-codeblock__lang">${escapeHtml(label)}</span>
      <span class="md-codeblock__actions">${actions.join('')}</span>
    `;

    pre.parentNode?.insertBefore(wrap, pre);
    wrap.appendChild(head);
    wrap.appendChild(pre);
    pre.classList.add('md-codeblock__pre');
    if (display.lineNumbers) pre.classList.add('md-codeblock__pre--lines');
  });
}
