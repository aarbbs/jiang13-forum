import type { User, Board, PostItem, Comment, RecentComment, ForumStats, TagCount, AdminDashboard, AdminSettings, ForumLimits, ForumLimitsPublic, PostDetailResponse, PostRevision, MailConfig, OIDCConfig, OAuthClient, OAuthClientInput, GiteaProject, GiteaSyncConfig, SiteBranding, RegisterConfig } from './types';

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
  forumLimits: () => request<ForumLimitsPublic>('/api/forum-limits'),
  siteBranding: () => request<SiteBranding>('/api/site-branding'),
  boards: () => request<{ boards: Board[] }>('/api/boards'),
  projects: (params?: { page?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return request<{ projects: GiteaProject[]; total: number; page: number; total_pages: number }>(
      `/api/projects${qs ? `?${qs}` : ''}`,
    );
  },
  posts: (params: Record<string, string | number>) => {
    const q = new URLSearchParams(params as Record<string, string>).toString();
    return request<{ posts: PostItem[]; total: number; page: number; has_more: boolean }>(`/api/posts?${q}`);
  },
  hotPosts: () => request<{ posts: PostItem[] }>('/api/posts/hot'),
  tags: (limit = 40) => request<{ tags: TagCount[] }>(`/api/tags?limit=${limit}`),
  post: (id: number, opts?: { skipView?: boolean }) => {
    const q = opts?.skipView ? '?skip_view=1' : '';
    return request<PostDetailResponse>(`/api/posts/${id}${q}`);
  },
  comments: (id: number, myIds?: number[]) => {
    const q = myIds?.length ? `?my_ids=${myIds.join(',')}` : '';
    return request<{ comments: Comment[]; total: number }>(`/api/posts/${id}/comments${q}`);
  },
  recentComments: () => request<{ comments: RecentComment[] }>('/api/comments/recent'),
  favorites: () => request<{ favorites: unknown[]; total: number }>('/api/favorites'),
  createBoard: (body: { name: string; description: string; sort_order: number; icon?: string; color_index?: number }) =>
    request<{ board: Board }>('/api/admin/boards', { method: 'POST', body: JSON.stringify(body) }),
  updateBoard: (id: number, body: { name: string; description: string; sort_order: number; icon?: string; color_index?: number }) =>
    request<{ board: Board }>(`/api/admin/boards/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteBoard: (id: number) => request(`/api/admin/boards/${id}`, { method: 'DELETE' }),
  // 管理后台 API
  adminDashboard: () => request<AdminDashboard>('/api/admin/dashboard'),
  adminSettings: () => request<AdminSettings>('/api/admin/settings'),
  adminPosts: (params: { page?: number; keyword?: string }) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.keyword) q.set('keyword', params.keyword);
    const qs = q.toString();
    return request<{ posts: PostItem[]; total: number; page: number; total_pages: number }>(
      `/api/admin/posts${qs ? `?${qs}` : ''}`,
    );
  },
  adminPinPost: (id: number, pinned: boolean) =>
    request<{ message: string; pinned: boolean }>(`/api/admin/posts/${id}/pin`, {
      method: 'POST', body: JSON.stringify({ pinned }),
    }),
  adminLockPost: (id: number, locked: boolean) =>
    request<{ message: string; edit_locked: boolean }>(`/api/admin/posts/${id}/lock`, {
      method: 'POST', body: JSON.stringify({ locked }),
    }),
  adminUpdateForumSettings: (body: ForumLimits) =>
    request<{ message: string; limits: ForumLimits }>('/api/admin/settings/forum', {
      method: 'PUT', body: JSON.stringify(body),
    }),
  adminUpdateMailSettings: (body: MailConfig) =>
    request<{ message: string; mail: MailConfig }>('/api/admin/settings/mail', {
      method: 'PUT', body: JSON.stringify(body),
    }),
  adminUpdateOIDCSettings: (body: OIDCConfig) =>
    request<{ message: string; oidc: OIDCConfig }>('/api/admin/settings/oidc', {
      method: 'PUT', body: JSON.stringify(body),
    }),
  adminUpdateGiteaSettings: (body: GiteaSyncConfig) =>
    request<{ message: string; gitea: GiteaSyncConfig }>('/api/admin/settings/gitea', {
      method: 'PUT', body: JSON.stringify(body),
    }),
  adminSyncGitea: () =>
    request<{ message: string; count: number; gitea: GiteaSyncConfig }>('/api/admin/settings/gitea/sync', {
      method: 'POST',
    }),
  adminUpdateBranding: (body: SiteBranding) =>
    request<{ message: string; branding: SiteBranding }>('/api/admin/settings/branding', {
      method: 'PUT', body: JSON.stringify(body),
    }),
  adminUploadBrandingAsset: (kind: 'logo' | 'favicon', file: File) => {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    return request<{ message: string; url: string; branding: SiteBranding }>(
      '/api/admin/settings/branding/upload',
      { method: 'POST', body: fd, headers: {} },
    );
  },
  adminClearBrandingAsset: (kind: 'logo' | 'favicon') =>
    request<{ message: string; branding: SiteBranding }>('/api/admin/settings/branding/clear', {
      method: 'POST', body: JSON.stringify({ kind }),
    }),
  adminListOAuthClients: () =>
    request<{ clients: OAuthClient[] }>('/api/admin/oauth/clients'),
  adminCreateOAuthClient: (body: OAuthClientInput) =>
    request<{ message: string; client: OAuthClient; oidc: OIDCConfig }>('/api/admin/oauth/clients', {
      method: 'POST', body: JSON.stringify(body),
    }),
  adminUpdateOAuthClient: (id: number, body: OAuthClientInput) =>
    request<{ message: string; client: OAuthClient; oidc: OIDCConfig }>(`/api/admin/oauth/clients/${id}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  adminDeleteOAuthClient: (id: number) =>
    request<{ message: string; oidc: OIDCConfig }>(`/api/admin/oauth/clients/${id}`, {
      method: 'DELETE',
    }),
  adminTestMail: (to: string) =>
    request<{ message: string }>('/api/admin/settings/mail/test', {
      method: 'POST', body: JSON.stringify({ to }),
    }),
  adminUpdateFilterWords: (content: string) =>
    request<{ message: string; word_count: number }>('/api/admin/settings/filter-words', {
      method: 'PUT', body: JSON.stringify({ content }),
    }),
  postRevisions: (id: number) =>
    request<{ revisions: PostRevision[] }>(`/api/posts/${id}/revisions`),
  postRevision: (id: number, revId: number) =>
    request<{ revision: PostRevision }>(`/api/posts/${id}/revisions/${revId}`),
  adminDeletePost: (id: number) => request(`/api/admin/posts/${id}`, { method: 'DELETE' }),
  adminComments: (page = 1) =>
    request<{ comments: Comment[]; total: number; page: number; total_pages: number }>(
      `/api/admin/comments?page=${page}`,
    ),
  adminDeleteComment: (id: number) => request(`/api/admin/comments/${id}`, { method: 'DELETE' }),
  adminUsers: (page = 1) =>
    request<{ users: User[]; total: number; page: number; total_pages: number }>(
      `/api/admin/users?page=${page}`,
    ),
  adminBanUser: (id: number, banned: boolean) =>
    request<{ message: string; banned: boolean }>(`/api/admin/users/${id}/ban`, {
      method: 'POST', body: JSON.stringify({ banned }),
    }),
  adminBackup: () =>
    request<{ message: string; filename: string; download: string }>('/api/admin/backup', { method: 'POST' }),
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
  uploadPostImage: (file: File) => {
    const fd = new FormData();
    fd.append('image', file);
    return request<{ url: string }>('/api/uploads/image', { method: 'POST', body: fd, headers: {} });
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
  deletePost: (id: number) => request<{ message: string }>(`/api/posts/${id}`, { method: 'DELETE' }),
  login: (username: string, password: string) => {
    const fd = new FormData();
    fd.append('username', username);
    fd.append('password', password);
    return request('/api/login', { method: 'POST', body: fd, headers: {} });
  },
  register: (data: {
    username: string;
    password: string;
    nickname: string;
    email: string;
    emailCode?: string;
  }) => {
    const fd = new FormData();
    fd.append('username', data.username);
    fd.append('password', data.password);
    fd.append('nickname', data.nickname);
    fd.append('email', data.email);
    if (data.emailCode) fd.append('email_code', data.emailCode);
    return request('/api/register', { method: 'POST', body: fd, headers: {} });
  },
  registerConfig: () => request<RegisterConfig>('/api/register/config'),
  sendRegisterEmailCode: (email: string) =>
    request<{ message: string }>('/api/register/email-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  captcha: () => request<{ id: string; image: string }>('/api/captcha'),
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
  updateComment: (id: number, content: string) => {
    const fd = new FormData();
    fd.append('content', content);
    return request<{ message: string; content: string }>(`/api/comments/${id}`, { method: 'PUT', body: fd, headers: {} });
  },
  deleteComment: (id: number) => request<{ message: string }>(`/api/comments/${id}`, { method: 'DELETE' }),
};
