import { diffLines, diffWords } from 'diff';
import DOMPurify from 'dompurify';
import { POST_CONTENT_PURIFY_CONFIG } from './postContent';

export interface PostSnapshot {
  title: string;
  content: string;
  tags: string;
}

export interface RevisionChangeSummary {
  titleChanged: boolean;
  tagsChanged: boolean;
  contentChanged: boolean;
  hasChanges: boolean;
}

export interface DiffPart {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/** 将 HTML 正文转为适合 diff 的纯文本（保留段落换行） */
export function htmlToDiffText(html: string): string {
  if (!html.trim()) return '';
  const doc = new DOMParser().parseFromString(
    DOMPurify.sanitize(html, POST_CONTENT_PURIFY_CONFIG),
    'text/html',
  );
  doc.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
  const blocks = doc.querySelectorAll('p, div, li, h1, h2, h3, h4, h5, h6, blockquote, pre, members-only');
  blocks.forEach(el => {
    el.prepend(doc.createTextNode('\n'));
    el.append(doc.createTextNode('\n'));
  });
  return (doc.body.textContent ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function summarizeChange(before: PostSnapshot, after: PostSnapshot): RevisionChangeSummary {
  const titleChanged = before.title.trim() !== after.title.trim();
  const tagsChanged = normalizeTags(before.tags) !== normalizeTags(after.tags);
  const contentChanged = htmlToDiffText(before.content) !== htmlToDiffText(after.content);
  return {
    titleChanged,
    tagsChanged,
    contentChanged,
    hasChanges: titleChanged || tagsChanged || contentChanged,
  };
}

function normalizeTags(tags: string) {
  return tags.split(/[,，]/).map(t => t.trim()).filter(Boolean).join(',');
}

export function diffTextLines(before: string, after: string): DiffPart[] {
  return diffLines(before || '', after || '');
}

export function diffTextWords(before: string, after: string): DiffPart[] {
  return diffWords(before || '', after || '');
}

/** 统计 diff 片段中的增删行数 */
export function countLineChanges(parts: DiffPart[]) {
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    const lines = p.value.split('\n').filter(l => l.length > 0);
    if (p.added) added += lines.length;
    else if (p.removed) removed += lines.length;
  }
  return { added, removed };
}
