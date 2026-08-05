import DOMPurify from 'dompurify';
import type { Config } from 'dompurify';
import { enhanceCodeBlocks } from './enhanceCodeBlocks';
import { enhanceHeadingAnchors } from './postHeadings';

/**
 * DOMPurify 配置：允许会员专属自定义标签与链接 target。
 * 注意：DOMPurify 3.x 默认放行 <style> 与 style=（只做 XSS 向 CSS 消毒），
 * 全局选择器仍会污染整页，故显式禁止。
 */
export const POST_CONTENT_PURIFY_CONFIG: Config = {
  ADD_TAGS: ['members-only', 'reply-only'],
  ADD_ATTR: [
    'data-locked', 'data-length', 'data-gate', 'target', 'rel',
    'data-code-copy', 'data-code-fold', 'data-lang', 'data-full',
    'data-code-style', 'data-line-numbers', 'data-collapsed', 'data-line-count', 'data-lineno-digits',
    'data-image-group', 'data-layout', 'data-display',
    'data-clear-float',
    'colspan', 'rowspan',
    'class',
  ],
  FORBID_TAGS: ['style', 'link', 'meta', 'base', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select'],
  FORBID_ATTR: ['style'],
};

const LOCK_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

const REPLY_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 15v4a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h10"/><path d="M20 7V3"/><path d="M22 5h-4"/></svg>`;

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

/** 回复可见锁定门控：游客引导登录，已登录引导去评论 */
function buildReplyLockedGateHtml(charLength: number, isLoggedIn: boolean): string {
  const lengthHint = charLength > 0
    ? `约 ${charLength} 字`
    : '隐藏内容';

  const actions = isLoggedIn
    ? `<button type="button" class="post-reply-only__gate-btn" data-reply-scroll>去回复</button>`
    : `<button type="button" class="post-reply-only__gate-btn" data-members-login>登录后回复</button>
       <button type="button" class="post-reply-only__gate-link" data-members-register>免费注册</button>`;

  return `
<div class="post-reply-only__locked-wrap">
  <div class="post-reply-only__gate">
    <span class="post-reply-only__gate-icon" aria-hidden="true">${REPLY_ICON_SVG}</span>
    <div class="post-reply-only__gate-text">
      <p class="post-reply-only__gate-title">回复后可见（${lengthHint}）</p>
      <p class="post-reply-only__gate-desc">作者将此段设为回复本帖后可读</p>
    </div>
    <div class="post-reply-only__gate-actions">
      ${actions}
    </div>
  </div>
</div>`;
}

/** 提取门控区块正文 HTML（去掉编辑态 badge） */
function extractGatedInnerHtml(el: Element, bodyClass: string, badgeClass: string): string {
  return el.querySelector(`.${bodyClass}`)?.innerHTML
    ?? Array.from(el.childNodes)
      .filter(n => !(n instanceof Element && n.classList.contains(badgeClass)))
      .map(n => (n instanceof Element ? n.outerHTML : n.textContent ?? ''))
      .join('');
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

    const innerHtml = extractGatedInnerHtml(
      el,
      'post-members-only__body',
      'post-members-only__badge',
    );

    // 已登录：降噪，不展示醒目 badge，仅保留结构容器
    el.className = 'post-members-only post-members-only--visible';
    el.innerHTML = `<div class="post-members-only__body">${innerHtml}</div>`;
  });

  doc.querySelectorAll('reply-only').forEach(el => {
    // 是否解锁由服务端 redact（data-locked）决定
    const locked = el.getAttribute('data-locked') === 'true';

    if (locked) {
      const charLength = parseInt(el.getAttribute('data-length') || '0', 10) || 0;
      el.className = 'post-reply-only post-reply-only--locked';
      el.innerHTML = buildReplyLockedGateHtml(charLength, isLoggedIn);
      return;
    }

    const innerHtml = extractGatedInnerHtml(
      el,
      'post-reply-only__body',
      'post-reply-only__badge',
    );

    el.className = 'post-reply-only post-reply-only--visible';
    el.innerHTML = `<div class="post-reply-only__body">${innerHtml}</div>`;
  });

  doc.querySelectorAll('img').forEach(img => {
    if (!img.getAttribute('loading')) img.setAttribute('loading', 'lazy');
    if (!img.getAttribute('decoding')) img.setAttribute('decoding', 'async');

    const rawSrc = img.getAttribute('src') || '';
    const full = img.getAttribute('data-full') || rawSrc;
    const thumb = toPostImageThumbSrc(full) || toPostImageThumbSrc(rawSrc);
    if (thumb && full) {
      // 正文加载缩略图，点击灯箱用原图
      if (!img.getAttribute('data-full')) img.setAttribute('data-full', full);
      if (rawSrc !== thumb) img.setAttribute('src', thumb);
      img.classList.add('post-content-img--zoomable');
      img.setAttribute('role', 'button');
      img.setAttribute('tabindex', '0');
      img.setAttribute('title', img.getAttribute('title') || '点击查看原图');
    }
  });

  // 规范化图组 class，保证阅读态宫格样式生效
  doc.querySelectorAll('div[data-image-group]').forEach(el => {
    const layout = el.getAttribute('data-layout') || 'cols-2';
    el.classList.add('image-group', `image-group--${layout}`);
  });

  // 单图展示形态 class
  doc.querySelectorAll('img[data-display]').forEach(img => {
    const display = img.getAttribute('data-display');
    if (!display || display === 'default') return;
    img.classList.add('article-img', `article-img--${display}`);
  });

  // 绕排图后：连续 ≥2 个空段落，则其后首个有内容块清除浮动（写到图下）
  markClearFloatAfterBlankRuns(doc.body);

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
  wrapContentTables(doc.body);

  return doc.body.innerHTML;
}

/** 表格外包一层，避免 display:block 时边框撑满而单元格背景偏窄 */
function wrapContentTables(root: ParentNode): void {
  root.querySelectorAll('table').forEach(table => {
    if (table.parentElement?.classList.contains('md-table-wrap')) return;
    const wrap = table.ownerDocument.createElement('div');
    wrap.className = 'md-table-wrap';
    table.replaceWith(wrap);
    wrap.appendChild(table);
  });
}

function isFloatDisplayImage(el: Element): boolean {
  if (el.tagName !== 'IMG') return false;
  const display = el.getAttribute('data-display') || '';
  return display === 'float-left' || display === 'float-right'
    || el.classList.contains('article-img--float-left')
    || el.classList.contains('article-img--float-right');
}

/** 空段落 / 仅含 br、空白 */
function isBlankParagraph(el: Element): boolean {
  if (el.tagName !== 'P') return false;
  const text = (el.textContent || '').replace(/\u00a0/g, ' ').trim();
  if (text.length > 0) return false;
  return !el.querySelector('img, video, iframe, table, pre, blockquote, members-only, reply-only');
}

/**
 * 浮动绕排后若作者连按多次回车再写字，给后续块加 clear，
 * 避免「明明写在图下却仍贴在图右侧」。
 * 阅读态与编辑器 DOM 均可调用。
 */
export function markClearFloatAfterBlankRuns(root: HTMLElement): void {
  const blocks = [...root.children];
  let seenFloat = false;
  let blankRun = 0;

  for (const el of blocks) {
    // 已持久化的清浮动标记始终生效
    if (el.hasAttribute('data-clear-float')) {
      el.classList.add('article-clear-float');
    }

    if (isFloatDisplayImage(el)) {
      seenFloat = true;
      blankRun = 0;
      continue;
    }
    // 通栏块本身会清浮动，重置状态
    if (
      el.tagName === 'IMG'
      || el.classList.contains('image-group')
      || /^H[1-6]$/.test(el.tagName)
      || el.tagName === 'HR'
      || el.tagName === 'PRE'
      || el.tagName === 'TABLE'
      || el.tagName === 'BLOCKQUOTE'
    ) {
      seenFloat = isFloatDisplayImage(el);
      blankRun = 0;
      continue;
    }

    if (!seenFloat) {
      if (!el.hasAttribute('data-clear-float')) {
        el.classList.remove('article-clear-float');
      }
      blankRun = 0;
      continue;
    }

    if (isBlankParagraph(el)) {
      blankRun += 1;
      continue;
    }

    // 双空行 或 已有 data-clear-float：保持写到图下
    if (blankRun >= 2 || el.hasAttribute('data-clear-float')) {
      el.classList.add('article-clear-float');
      if (!el.hasAttribute('data-clear-float')) {
        el.setAttribute('data-clear-float', '');
      }
    } else {
      el.classList.remove('article-clear-float');
    }
    blankRun = 0;
  }
}

/**
 * 将帖子上传图 URL 转为缩略图地址。
 * /uploads/posts/a.jpg → /media/thumb/posts/a.jpg
 */
export function toPostImageThumbSrc(src: string): string | null {
  const path = extractUploadPath(src);
  if (!path) return null;
  if (path.startsWith('/media/thumb/')) return path;
  if (!path.startsWith('/uploads/posts/')) return null;
  return `/media/thumb/${path.slice('/uploads/'.length)}`;
}

/** 提取同源相对路径（忽略 query / hash） */
function extractUploadPath(src: string): string | null {
  const raw = (src || '').trim();
  if (!raw || raw.startsWith('data:') || raw.startsWith('blob:')) return null;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      const u = new URL(raw);
      if (typeof window !== 'undefined' && u.origin !== window.location.origin) return null;
      return u.pathname;
    }
  } catch {
    return null;
  }
  const path = raw.split('?')[0].split('#')[0];
  return path.startsWith('/') ? path : null;
}
