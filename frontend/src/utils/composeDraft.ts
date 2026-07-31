export interface ComposeDraft {
  title: string;
  tags: string;
  content: string;
  boardId: string;
  savedAt: number;
}

const PREFIX = 'j13-compose-draft:';

function draftKey(editId: number | null): string {
  return editId == null ? `${PREFIX}new` : `${PREFIX}edit:${editId}`;
}

/** 读取发帖/编辑草稿 */
export function loadComposeDraft(editId: number | null): ComposeDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(editId));
    if (!raw) return null;
    const data = JSON.parse(raw) as ComposeDraft;
    if (!data || typeof data !== 'object') return null;
    return {
      title: typeof data.title === 'string' ? data.title : '',
      tags: typeof data.tags === 'string' ? data.tags : '',
      content: typeof data.content === 'string' ? data.content : '',
      boardId: typeof data.boardId === 'string' ? data.boardId : '',
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : 0,
    };
  } catch {
    return null;
  }
}

/** 写入发帖/编辑草稿 */
export function saveComposeDraft(editId: number | null, draft: Omit<ComposeDraft, 'savedAt'>): void {
  try {
    const payload: ComposeDraft = { ...draft, savedAt: Date.now() };
    localStorage.setItem(draftKey(editId), JSON.stringify(payload));
  } catch {
    // 配额不足等场景静默忽略
  }
}

/** 清除发帖/编辑草稿 */
export function clearComposeDraft(editId: number | null): void {
  try {
    localStorage.removeItem(draftKey(editId));
  } catch {
    // ignore
  }
}

/** 草稿是否相对 baseline 有实质内容 */
export function draftHasContent(draft: ComposeDraft): boolean {
  return Boolean(
    draft.title.trim()
    || draft.tags.trim()
    || draft.content.trim()
    || draft.boardId.trim(),
  );
}
