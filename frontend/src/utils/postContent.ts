import DOMPurify from 'dompurify';
import type { Config } from 'dompurify';
import { enhanceCodeBlocks } from './enhanceCodeBlocks';
import { enhanceHeadingAnchors } from './postHeadings';

/** DOMPurify 配置：允许会员专属自定义标签与链接 target */
export const POST_CONTENT_PURIFY_CONFIG: Config = {
  ADD_TAGS: ['members-only'],
  ADD_ATTR: ['data-locked', 'data-length', 'target', 'rel', 'data-code-copy', 'data-lang'],
};

const LOCK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

/** 游客看到的锁定区块：流内嵌条 + 登录引导（精简高度） */
function buildLockedGateHtml(charLength: number): string {
  const lengthHint = charLength > 0
    ? `约 ${charLength} 字`
    : '专属内容';

  return `
<div class="post-members-only__locked-wrap">
  <div class="post-members-only__gate">
    <span class="post-members-only__gate-icon" aria-hidden="true">${LOCK_ICON_SVG}</span>
    <div class="post-members-only__gate-text">
      <p class="post-members-only__gate-title">登录后可见（${lengthHint}）</p>
      <p class="post-members-only__gate-desc">作者将此段设为仅登录用户可读</p>
    </div>
    <div class="post-members-only__gate-actions">
      <button type="button" class="post-members-only__gate-btn" data-members-login>登录查看</button>
      <button type="button" class="post-members-only__gate-link" data-members-register>免费注册</button>
    </div>
  </div>
</div>`;
}

/** 判断 HTML 正文是否为空（忽略空段落等） */
export function isHtmlEmpty(html: string): boolean {
  if (!html.trim()) return true;
  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG) as string,
    'text/html',
  );
  return (doc.body.textContent ?? '').trim().length === 0;
}

/** 根据登录状态渲染帖子正文 HTML */
export function renderPostContentHtml(
  html: string,
  isLoggedIn: boolean,
  opts?: { openLinksInNewTab?: boolean },
): string {
  if (!html.trim()) return '';

  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG) as string,
    'text/html',
  );

  doc.querySelectorAll('members-only').forEach(el => {
    const locked = el.getAttribute('data-locked') === 'true' || !isLoggedIn;

    if (locked) {
      const charLength = parseInt(el.getAttribute('data-length') || '0', 10) || 0;
      el.setAttribute('data-locked', 'true');
      el.className = 'post-members-only post-members-only--locked';
      el.innerHTML = buildLockedGateHtml(charLength);
      return;
    }

    const innerHtml = el.querySelector('.post-members-only__body')?.innerHTML
      ?? Array.from(el.childNodes)
        .filter(n => !(n instanceof Element && n.classList.contains('post-members-only__badge')))
        .map(n => (n instanceof Element ? n.outerHTML : n.textContent ?? ''))
        .join('');

    // 已登录：降噪，不展示醒目 badge，仅保留结构容器
    el.className = 'post-members-only post-members-only--visible';
    el.innerHTML = `<div class="post-members-only__body">${innerHtml}</div>`;
  });

  doc.querySelectorAll('img').forEach(img => {
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
  });

  if (opts?.openLinksInNewTab) {
    doc.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      a.setAttribute('target', '_blank');
      const rel = new Set((a.getAttribute('rel') || '').split(/\s+/).filter(Boolean));
      rel.add('noopener');
      rel.add('noreferrer');
      a.setAttribute('rel', Array.from(rel).join(' '));
    });
  }

  enhanceHeadingAnchors(doc.body);
  enhanceCodeBlocks(doc.body);

  return doc.body.innerHTML;
}
