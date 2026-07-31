/** 正文标题节点（用于文章目录树） */
export interface PostHeading {
  id: string;
  level: number;
  text: string;
}

/** 为标题补全锚点 id，并返回目录树数据 */
export function enhanceHeadingAnchors(root: ParentNode): PostHeading[] {
  const headings: PostHeading[] = [];
  const used = new Map<string, number>();

  root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((el, index) => {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
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
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (!id || !text) return;
    headings.push({
      id,
      level: Number(el.tagName.slice(1)) || 2,
      text,
    });
  });
  return headings;
}
