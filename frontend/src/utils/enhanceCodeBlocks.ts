import hljs from 'highlight.js/lib/common';

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

/** 美化并高亮文档中的代码块（加语言标签与复制按钮） */
export function enhanceCodeBlocks(root: ParentNode): void {
  root.querySelectorAll('pre').forEach(pre => {
    if (pre.closest('.md-codeblock')) return;
    const code = pre.querySelector('code') || pre;
    const raw = code.textContent || '';
    // 作者写了语言标签则以标注为准，绝不被自动识别覆盖
    const declaredLang = detectLang(code, pre);
    let label = declaredLang || 'code';

    try {
      if (declaredLang && hljs.getLanguage(declaredLang)) {
        const result = hljs.highlight(raw, { language: declaredLang, ignoreIllegals: true });
        code.innerHTML = result.value;
        code.classList.add('hljs', `language-${declaredLang}`);
      } else if (declaredLang) {
        // 未收录语言（如 aardio）：保留原文与标签，不做自动猜测
        code.classList.add('hljs', `language-${declaredLang}`);
      } else if (raw.length >= 24) {
        const result = hljs.highlightAuto(raw);
        code.innerHTML = result.value;
        code.classList.add('hljs');
        if (result.language) {
          label = result.language;
          code.classList.add(`language-${result.language}`);
        }
      } else {
        code.classList.add('hljs');
      }
    } catch {
      code.textContent = raw;
      code.classList.add('hljs');
      if (declaredLang) code.classList.add(`language-${declaredLang}`);
    }

    const wrap = pre.ownerDocument.createElement('div');
    wrap.className = 'md-codeblock';
    wrap.setAttribute('data-lang', label);

    const head = pre.ownerDocument.createElement('div');
    head.className = 'md-codeblock__head';
    head.innerHTML = `
      <span class="md-codeblock__lang">${escapeHtml(label)}</span>
      <button type="button" class="md-codeblock__copy" data-code-copy>复制</button>
    `;

    pre.parentNode?.insertBefore(wrap, pre);
    wrap.appendChild(head);
    wrap.appendChild(pre);
    pre.classList.add('md-codeblock__pre');
  });
}
