/** 正文标题节点（用于文章目录树） */
export interface PostHeading {
  id: string;
  level: number;
  text: string;
}

/** 去掉标题内的锚点复制链，避免目录文案带上 # */
function headingPlainText(el: Element): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.post-heading-anchor-link').forEach(n => n.remove());
  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

/** 为标题补全锚点 id，并返回目录树数据 */
export function enhanceHeadingAnchors(root: ParentNode): PostHeading[] {
  const headings: PostHeading[] = [];
  const used = new Map<string, number>();
  const doc = root.ownerDocument ?? (typeof document !== 'undefined' ? document : null);

  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el, index) => {
    const text = headingPlainText(el);
    if (!text) return;

    const level = Number(el.tagName.slice(1)) || 2;
    let id = el.getAttribute('id')?.trim() || '';
    if (!id) {
      id = `heading-${index + 1}`;
    }
    const n = (used.get(id) || 0) + 1;
    used.set(id, n);
    if (n > 1) id = `${id}-${n}`;
    el.setAttribute('id', id);
    el.classList.add('post-heading-anchor');

    // hover 显示 #，点击复制带 hash 的链接
    if (doc && !el.querySelector('.post-heading-anchor-link')) {
      const link = doc.createElement('a');
      link.className = 'post-heading-anchor-link';
      link.href = `#${id}`;
      link.setAttribute('aria-label', '复制本节链接');
      link.setAttribute('data-heading-copy', id);
      link.setAttribute('tabindex', '-1');
      link.textContent = '#';
      el.appendChild(link);
    }

    headings.push({ id, level, text });
  });

  return headings;
}

/** 从已渲染 HTML 中读取目录（假定 id 已由 enhanceHeadingAnchors 写入） */
export function extractHeadingsFromHtml(html: string): PostHeading[] {
  if (!html.trim()) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const headings: PostHeading[] = [];
  doc.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
    const id = el.getAttribute('id')?.trim();
    const text = headingPlainText(el);
    if (!id || !text) return;
    headings.push({
      id,
      level: Number(el.tagName.slice(1)) || 2,
      text,
    });
  });
  return headings;
}
