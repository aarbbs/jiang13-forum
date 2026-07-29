import DOMPurify from 'dompurify';

/** DOMPurify 配置：允许会员专属自定义标签 */
export const POST_CONTENT_PURIFY_CONFIG: DOMPurify.Config = {
  ADD_TAGS: ['members-only'],
  ADD_ATTR: ['data-locked', 'data-length'],
};

const VISIBLE_BADGE_HTML = `
<div class="post-members-only__badge">
  <span class="post-members-only__badge-icon" aria-hidden="true">
    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
  </span>
  <span>登录可见</span>
</div>`;

const LOCK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

/** 游客看到的锁定区块：模糊占位 + 登录引导 */
function buildLockedGateHtml(charLength: number): string {
  const lineCount = charLength > 0
    ? Math.min(6, Math.max(3, Math.ceil(charLength / 42)))
    : 4;
  const lines = Array.from({ length: lineCount }, (_, i) => {
    const mod = i % 3;
    const widthClass = mod === 1 ? ' post-members-only__preview-line--medium'
      : mod === 2 ? ' post-members-only__preview-line--short' : '';
    return `<div class="post-members-only__preview-line${widthClass}"></div>`;
  }).join('');

  const lengthHint = charLength > 0
    ? `约 ${charLength} 字的`
    : '一段';

  return `
<div class="post-members-only__locked-wrap">
  <div class="post-members-only__badge post-members-only__badge--locked">
    <span class="post-members-only__badge-icon" aria-hidden="true">${LOCK_ICON_SVG}</span>
    <span>登录可见</span>
  </div>
  <div class="post-members-only__preview" aria-hidden="true">
    ${lines}
  </div>
  <div class="post-members-only__gate">
    <div class="post-members-only__gate-icon" aria-hidden="true">${LOCK_ICON_SVG}</div>
    <p class="post-members-only__gate-title">此处有${lengthHint}专属内容</p>
    <p class="post-members-only__gate-desc">作者已将这部分内容设为仅登录用户可见，登录后即可阅读全文。</p>
    <button type="button" class="post-members-only__gate-btn" data-members-login>登录查看</button>
    <span class="post-members-only__gate-alt">还没有账号？<button type="button" class="post-members-only__gate-link" data-members-register>免费注册</button></span>
  </div>
</div>`;
}

/** 判断 HTML 正文是否为空（忽略空段落等） */
export function isHtmlEmpty(html: string): boolean {
  if (!html.trim()) return true;
  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG),
    'text/html',
  );
  return (doc.body.textContent ?? '').trim().length === 0;
}

/** 根据登录状态渲染帖子正文 HTML */
export function renderPostContentHtml(html: string, isLoggedIn: boolean): string {
  if (!html.trim()) return '';

  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG),
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

    el.className = 'post-members-only post-members-only--visible';
    el.innerHTML = `${VISIBLE_BADGE_HTML}<div class="post-members-only__body">${innerHtml}</div>`;
  });

  doc.querySelectorAll('img').forEach(img => {
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');
  });

  return doc.body.innerHTML;
}
