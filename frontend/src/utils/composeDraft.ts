/** 新建帖本地草稿（localStorage） */

const STORAGE_KEY = 'j13-compose-draft-v2';

export type ComposeDraftPostType = 'normal' | 'question' | 'poll' | 'bounty' | 'lottery';

export type ComposeDraft = {
  title: string;
  tags: string;
  content: string;
  boardId: string;
  postType: ComposeDraftPostType;
  pollOptions?: string[];
  pollMulti?: boolean;
  pollMaxChoices?: number;
  pollEndsAt?: string;
  pollNoEndTime?: boolean;
  savedAt: number;
};

const VALID_POST_TYPES: ComposeDraftPostType[] = ['normal', 'question', 'poll', 'bounty', 'lottery'];

function normalizePostType(value: unknown): ComposeDraftPostType {
  if (typeof value === 'string' && VALID_POST_TYPES.includes(value as ComposeDraftPostType)) {
    return value as ComposeDraftPostType;
  }
  return 'normal';
}

export function loadComposeDraft(): ComposeDraft | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<ComposeDraft>;
    if (!data || typeof data !== 'object') return null;
    const postType = normalizePostType(data.postType);
    const draft: ComposeDraft = {
      title: typeof data.title === 'string' ? data.title : '',
      tags: typeof data.tags === 'string' ? data.tags : '',
      content: typeof data.content === 'string' ? data.content : '',
      boardId: typeof data.boardId === 'string' ? data.boardId : '',
      postType,
      savedAt: typeof data.savedAt === 'number' ? data.savedAt : Date.now(),
    };
    if (postType === 'poll') {
      if (Array.isArray(data.pollOptions) && data.pollOptions.every(o => typeof o === 'string')) {
        draft.pollOptions = data.pollOptions.length >= 2 ? data.pollOptions : ['', ''];
      }
      if (typeof data.pollMulti === 'boolean') draft.pollMulti = data.pollMulti;
      if (typeof data.pollMaxChoices === 'number' && data.pollMaxChoices > 0) {
        draft.pollMaxChoices = data.pollMaxChoices;
      }
      if (typeof data.pollEndsAt === 'string') draft.pollEndsAt = data.pollEndsAt;
      if (typeof data.pollNoEndTime === 'boolean') draft.pollNoEndTime = data.pollNoEndTime;
    }
    return draft;
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
    // 清理旧版草稿键
    localStorage.removeItem('j13-compose-draft-v1');
  } catch {
    // ignore
  }
}

/** 草稿是否有实质内容 */
export function composeDraftHasContent(d: ComposeDraft | null | undefined): boolean {
  if (!d) return false;
  const hasPollOptions = d.postType === 'poll'
    && Array.isArray(d.pollOptions)
    && d.pollOptions.some(o => o.trim());
  return !!(
    d.title.trim()
    || d.tags.trim()
    || d.content.trim()
    || (d.content && d.content.replace(/<[^>]*>/g, '').trim())
    || hasPollOptions
  );
}
