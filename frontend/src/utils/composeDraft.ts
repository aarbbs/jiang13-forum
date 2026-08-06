/** 新建帖本地草稿（localStorage） */

const STORAGE_KEY = 'j13-compose-draft-v1';

export type ComposeDraft = {
  title: string;
  tags: string;
  content: string;
  boardId: string;
  postType: 'normal' | 'question';
  savedAt: number;
};

export function loadComposeDraft(): ComposeDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<ComposeDraft>;
    if (!data || typeof data !== 'object') return null;
    return {
      title: typeof data.title === 'string' ? data.title : '',
      tags: typeof data.tags === 'string' ? data.tags : '',
      content: typeof data.content === 'string' ? data.content : '',
      boardId: typeof data.boardId === 'string' ? data.boardId : '',
      postType: data.postType === 'question' ? 'question' : 'normal',
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveComposeDraft(draft: Omit<ComposeDraft, 'savedAt'>): void {
  try {
    const payload: ComposeDraft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 配额满或隐私模式：忽略
  }
}

export function clearComposeDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** 草稿是否有实质内容 */
export function composeDraftHasContent(d: ComposeDraft | null | undefined): boolean {
  if (!d) return false;
  return !!(
    d.title.trim()
    || d.tags.trim()
    || d.content.trim()
    || (d.content && d.content.replace(/<[^>]*>/g, '').trim())
  );
}
