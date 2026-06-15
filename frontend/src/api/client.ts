import type { User, Board, PostItem, Comment, Notification, OnlineUser, OnlineStats, ForumStats } from './types';

const BASE = '';

async function request<T>(url: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + url, {
    credentials: 'same-origin',
    ...opts,
    headers: {
      ...(opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...opts.headers,
    },
  });
  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new Error('服务器响应异常');
  }
  if (!res.ok) throw new Error((data.error as string) || '请求失败');
  return data as T;
}

export const api = {
  me: () => request<{ user: User | null }>('/api/me'),
  stats: () => request<ForumStats>('/api/stats'),
  boards: () => request<{ boards: Board[] }>('/api/boards'),
  posts: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ posts: PostItem[]; total: number; page: number; has_more: boolean }>(`/api/posts?${q}`);
  },
  hotPosts: () => request<{ posts: PostItem[] }>('/api/posts/hot'),
  post: (id: number) => request<{ post: PostItem; comment_count: number; liked: boolean; favorited: boolean }>(`/api/posts/${id}`),
  comments: (id: number, myIds?: number[]) => {
    const q = myIds?.length ? `?my_ids=${myIds.join(',')}` : '';
    return request<{ comments: Comment[]; total: number }>(`/api/posts/${id}/comments${q}`);
  },
  notifications: () => request<{ notifications: Notification[] }>('/api/notifications'),
  online: () => request<OnlineStats>('/api/online'),
  presence: () => request<Pick<OnlineStats, 'count' | 'members' | 'guests'>>('/api/presence', { method: 'POST' }),
  favorites: () => request<{ favorites: unknown[]; total: number }>('/api/favorites'),
  createBoard: (body: { name: string; description: string; sort_order: number }) =>
    request<{ board: Board }>('/api/admin/boards', { method: 'POST', body: JSON.stringify(body) }),
  updateBoard: (id: number, body: { name: string; description: string; sort_order: number }) =>
    request<{ board: Board }>(`/api/admin/boards/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteBoard: (id: number) => request(`/api/admin/boards/${id}`, { method: 'DELETE' }),
  updateNickname: (nickname: string) => {
    const fd = new FormData();
    fd.append('nickname', nickname);
    return request('/api/profile/nickname', { method: 'POST', body: fd, headers: {} });
  },
  updatePassword: (oldPassword: string, newPassword: string) => {
    const fd = new FormData();
    fd.append('old_password', oldPassword);
    fd.append('new_password', newPassword);
    return request('/api/profile/password', { method: 'POST', body: fd, headers: {} });
  },
  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request<{ avatar: string }>('/api/profile/avatar', { method: 'POST', body: fd, headers: {} });
  },
  createPost: (data: { board_id: string; title: string; content: string; tags?: string }) => {
    const fd = new FormData();
    fd.append('board_id', data.board_id);
    fd.append('title', data.title);
    fd.append('content', data.content);
    fd.append('tags', data.tags || '');
    return request<{ post_id: number }>('/api/posts', { method: 'POST', body: fd, headers: {} });
  },
  updatePost: (id: number, data: { title: string; content: string; tags?: string }) => {
    const fd = new FormData();
    fd.append('title', data.title);
    fd.append('content', data.content);
    fd.append('tags', data.tags || '');
    return request<{ message: string }>(`/api/posts/${id}`, { method: 'PUT', body: fd, headers: {} });
  },
  login: (username: string, password: string) => {
    const fd = new FormData();
    fd.append('username', username);
    fd.append('password', password);
    return request('/api/login', { method: 'POST', body: fd, headers: {} });
  },
  register: (username: string, password: string, nickname: string) => {
    const fd = new FormData();
    fd.append('username', username);
    fd.append('password', password);
    fd.append('nickname', nickname);
    return request('/api/register', { method: 'POST', body: fd, headers: {} });
  },
  logout: () => request('/api/logout', { method: 'POST' }),
  like: (id: number) => request<{ liked: boolean; like_count: number }>(`/api/posts/${id}/like`, { method: 'POST' }),
  favorite: (id: number) => request<{ favorited: boolean }>(`/api/posts/${id}/favorite`, { method: 'POST' }),
  addComment: (postId: number, data: {
    content: string;
    replyTo?: number;
    guestNick?: string;
    guestEmail?: string;
    guestUrl?: string;
    isPrivate?: boolean;
  }) => {
    const fd = new FormData();
    fd.append('content', data.content);
    if (data.replyTo) fd.append('reply_to', String(data.replyTo));
    if (data.guestNick) fd.append('guest_nick', data.guestNick);
    if (data.guestEmail) fd.append('guest_email', data.guestEmail);
    if (data.guestUrl) fd.append('guest_url', data.guestUrl);
    if (data.isPrivate) fd.append('is_private', '1');
    return request<{ message: string; floor: number; id: number }>(`/api/posts/${postId}/comments`, { method: 'POST', body: fd, headers: {} });
  },
  ping: () => request<Pick<OnlineStats, 'count' | 'members' | 'guests'>>('/api/ping', { method: 'POST' }),
};
