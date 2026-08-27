import type { User, UserPublic, UserActivityStats, Board, PostItem, Comment, RecentComment, RecentUser, ForumStats, TagCount, AdminDashboard, AdminSettings, ForumLimits, ForumLimitsPublic, PostDetailResponse, PostRevision, CommentRevision, MailConfig, OIDCConfig, OAuthClient, OAuthClientInput, GiteaProject, GiteaSyncConfig, StorageConfig, MediaListResult, SiteBranding, RegisterConfig, PrivateMessage, MessageConversation, PostReport, ReportReason, ReportStatus, BadgeDef, PointLedger, CheckInStatus, LotteryStatus, SitePage, SitePageSummary, PollView, PostLotteryView, FriendLinkApply } from './types';

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
  pages: () => request<{ pages: SitePageSummary[] }>('/api/pages'),
  page: (slug: string) => request<{ page: SitePage }>(`/api/pages/${encodeURIComponent(slug)}`),
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
  recentUsers: () => request<{ users: RecentUser[] }>('/api/users/recent'),
  favorites: () => request<{ favorites: unknown[]; total: number }>('/api/favorites'),
  createBoard: (body: { name: string; description: string; sort_order: number; icon?: string; color_index?: number }) =>
    request<{ board: Board }>('/api/admin/boards', { method: 'POST', body: JSON.stringify(body) }),
  updateBoard: (id: number, body: { name: string; description: string; sort_order: number; icon?: string; color_index?: number }) =>
    request<{ board: Board }>(`/api/admin/boards/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteBoard: (id: number) => request(`/api/admin/boards/${id}`, { method: 'DELETE' }),
  // 管理后台 API
  adminDashboard: () => request<AdminDashboard>('/api/admin/dashboard'),
  adminSettings: () => request<AdminSettings>('/api/admin/settings'),
  adminPosts: (params: { page?: number; keyword?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.keyword) q.set('keyword', params.keyword);
    if (params.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{
      posts: PostItem[];
      total: number;
      page: number;
      total_pages: number;
      pending_count?: number;
      status?: string;
    }>(`/api/admin/posts${qs ? `?${qs}` : ''}`);
  },
  adminApprovePost: (id: number) =>
    request<{ message: string; status: string }>(`/api/admin/posts/${id}/approve`, { method: 'POST' }),
  adminPinPost: (id: number, pinned: boolean) =>
    request<{ message: string; pinned: boolean }>(`/api/admin/posts/${id}/pin`, {
      method: 'POST', body: JSON.stringify({ pinned }),
    }),
  adminBoardPinPost: (id: number, boardPinned: boolean) =>
    request<{ message: string; board_pinned: boolean }>(`/api/admin/posts/${id}/board-pin`, {
      method: 'POST', body: JSON.stringify({ board_pinned: boardPinned }),
    }),
  adminFeaturePost: (id: number, featured: boolean) =>
    request<{ message: string; featured: boolean }>(`/api/admin/posts/${id}/feature`, {
      method: 'POST', body: JSON.stringify({ featured }),
    }),
  adminLockPost: (id: number, locked: boolean) =>
    request<{ message: string; edit_locked: boolean }>(`/api/admin/posts/${id}/lock`, {
      method: 'POST', body: JSON.stringify({ locked }),
    }),
  adminCommentsLockPost: (id: number, locked: boolean) =>
    request<{ message: string; comments_locked: boolean }>(`/api/admin/posts/${id}/comments-lock`, {
      method: 'POST', body: JSON.stringify({ locked }),
    }),
  adminRejectPost: (id: number, reason: string) =>
    request<{ message: string; notified: boolean }>(`/api/admin/posts/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ reason }),
    }),
  adminReports: (params?: { page?: number; status?: ReportStatus | 'all' | string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{
      reports: PostReport[];
      total: number;
      page: number;
      pending_count: number;
      status: string;
    }>(`/api/admin/reports${qs ? `?${qs}` : ''}`);
  },
  adminHandleReport: (id: number, body: {
    action: 'dismiss' | 'resolve' | 'reject_post' | 'reject_comment';
    handle_note?: string;
    reject_reason?: string;
  }) =>
    request<{ message: string; report: PostReport }>(`/api/admin/reports/${id}/handle`, {
      method: 'POST', body: JSON.stringify(body),
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
  adminUpdateStorageSettings: (body: StorageConfig) =>
    request<{ message: string; storage: StorageConfig }>('/api/admin/settings/storage', {
      method: 'PUT', body: JSON.stringify(body),
    }),
  adminUpdateBranding: (body: SiteBranding) =>
    request<{ message: string; branding: SiteBranding }>('/api/admin/settings/branding', {
      method: 'PUT', body: JSON.stringify(body),
    }),
  adminUploadBrandingAsset: (kind: 'logo' | 'favicon' | 'og_image', file: File) => {
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('file', file);
    return request<{ message: string; url: string; branding: SiteBranding }>(
      '/api/admin/settings/branding/upload',
      { method: 'POST', body: fd, headers: {} },
    );
  },
  adminClearBrandingAsset: (kind: 'logo' | 'favicon' | 'og_image') =>
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
  adminTrashPosts: (params: { page?: number; keyword?: string }) => {
    const q = new URLSearchParams();
    if (params.page) q.set('page', String(params.page));
    if (params.keyword) q.set('keyword', params.keyword);
    const qs = q.toString();
    return request<{ posts: (PostItem & { deleted_at: string })[]; total: number; page: number; total_pages: number }>(
      `/api/admin/posts/trash${qs ? `?${qs}` : ''}`,
    );
  },
  adminRestorePost: (id: number) =>
    request<{ message: string }>(`/api/admin/posts/${id}/restore`, { method: 'POST' }),
  adminPurgePost: (id: number) =>
    request<{ message: string }>(`/api/admin/posts/${id}/purge`, { method: 'DELETE' }),
  adminComments: (params?: { page?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{
      comments: Comment[];
      total: number;
      page: number;
      total_pages: number;
      pending_count?: number;
    }>(`/api/admin/comments${qs ? `?${qs}` : ''}`);
  },
  adminApproveComment: (id: number) =>
    request<{ message: string; status: string }>(`/api/admin/comments/${id}/approve`, { method: 'POST' }),
  adminRejectComment: (id: number, reason?: string) =>
    request<{ message: string; status: string }>(`/api/admin/comments/${id}/reject`, {
      method: 'POST', body: JSON.stringify({ reason: reason || '' }),
    }),
  adminDeleteComment: (id: number) => request(`/api/admin/comments/${id}`, { method: 'DELETE' }),
  adminTrashComments: (params?: { page?: number; keyword?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.keyword) q.set('keyword', params.keyword);
    const qs = q.toString();
    return request<{
      comments: (Comment & { deleted_at: string })[];
      total: number;
      page: number;
      total_pages: number;
    }>(`/api/admin/comments/trash${qs ? `?${qs}` : ''}`);
  },
  adminRestoreComment: (id: number) =>
    request<{ message: string }>(`/api/admin/comments/${id}/restore`, { method: 'POST' }),
  adminPurgeComment: (id: number) =>
    request<{ message: string }>(`/api/admin/comments/${id}/purge`, { method: 'DELETE' }),
  adminCommentRevisions: (id: number) =>
    request<{ revisions: CommentRevision[] }>(`/api/admin/comments/${id}/revisions`),
  adminUsers: (page = 1, opts?: { keyword?: string; filter?: string }) => {
    const q = new URLSearchParams({ page: String(page) });
    if (opts?.keyword?.trim()) q.set('keyword', opts.keyword.trim());
    if (opts?.filter && opts.filter !== 'all') q.set('filter', opts.filter);
    return request<{ users: User[]; total: number; page: number; total_pages: number }>(
      `/api/admin/users?${q}`,
    );
  },
  adminBanUser: (id: number, banned: boolean) =>
    request<{ message: string; banned: boolean }>(`/api/admin/users/${id}/ban`, {
      method: 'POST', body: JSON.stringify({ banned }),
    }),
  adminVerifyUser: (id: number, verified: boolean) =>
    request<{ message: string; verified: boolean }>(`/api/admin/users/${id}/verify`, {
      method: 'POST', body: JSON.stringify({ verified }),
    }),
  adminSetUserLevel: (id: number, level: number) =>
    request<{ message: string; level: number; exp: number }>(`/api/admin/users/${id}/level`, {
      method: 'POST', body: JSON.stringify({ level }),
    }),
  adminAdjustPoints: (id: number, delta: number, note?: string) =>
    request<{ message: string; points: number }>(`/api/admin/users/${id}/points`, {
      method: 'POST', body: JSON.stringify({ delta, note: note || '' }),
    }),
  adminListBadges: () => request<{ badges: BadgeDef[] }>('/api/admin/badges'),
  adminUpsertBadge: (badge: Partial<BadgeDef>) =>
    request<{ message: string; badge: BadgeDef }>('/api/admin/badges', {
      method: 'POST', body: JSON.stringify(badge),
    }),
  adminAwardBadge: (userId: number, badgeId: number, revoke = false) =>
    request<{ message: string }>(`/api/admin/users/${userId}/badges`, {
      method: 'POST', body: JSON.stringify({ badge_id: badgeId, revoke }),
    }),
  mePoints: (page = 1) =>
    request<{
      points: number;
      creator_income_total: number;
      ledger: PointLedger[];
      total: number;
      page: number;
      total_pages: number;
      check_in: CheckInStatus;
      lottery: LotteryStatus;
    }>(`/api/me/points?page=${page}`),
  checkInStatus: () => request<{ check_in: CheckInStatus }>('/api/me/check-in'),
  checkIn: () =>
    request<{ message: string; check_in: CheckInStatus; points: number }>('/api/me/check-in', { method: 'POST' }),
  lotteryStatus: () => request<{ lottery: LotteryStatus }>('/api/me/lottery'),
  lotteryDraw: () =>
    request<{ message: string; lottery: LotteryStatus; points: number }>('/api/me/lottery', { method: 'POST' }),
  unlockPostBlock: (postId: number, blockKey: string) =>
    request<{ message: string; unlock: { block_key: string; cost: number; points_balance: number; inner_html: string } }>(
      `/api/posts/${postId}/unlock`,
      { method: 'POST', body: JSON.stringify({ block_key: blockKey }) },
    ),
  adminMedia: (params?: { category?: string; page?: number; size?: number; q?: string }) => {
    const sp = new URLSearchParams();
    if (params?.category) sp.set('category', params.category);
    if (params?.page) sp.set('page', String(params.page));
    if (params?.size) sp.set('size', String(params.size));
    if (params?.q) sp.set('q', params.q);
    const qs = sp.toString();
    return request<MediaListResult>(`/api/admin/media${qs ? `?${qs}` : ''}`);
  },
  adminDeleteMedia: (urls: string[]) =>
    request<{ message: string; deleted: number }>('/api/admin/media/delete', {
      method: 'POST', body: JSON.stringify({ urls }),
    }),
  adminBackup: () =>
    request<{ message: string; filename: string; download: string }>('/api/admin/backup', { method: 'POST' }),
  profileStats: () => request<{ stats: UserActivityStats }>('/api/profile/stats'),
  userProfile: (id: number) =>
    request<{ user: UserPublic; stats: UserActivityStats }>(`/api/users/${id}`),
  updateNickname: (nickname: string) => {
    const fd = new FormData();
    fd.append('nickname', nickname);
    return request('/api/profile/nickname', { method: 'POST', body: fd, headers: {} });
  },
  updateSignature: (signature: string) => {
    const fd = new FormData();
    fd.append('signature', signature);
    return request<{ message: string; user: User }>('/api/profile/signature', {
      method: 'POST', body: fd, headers: {},
    });
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
  createPost: (data: {
    board_id: string; title: string; content: string; tags?: string; post_type?: string;
    poll_options?: string; bounty_points?: number; lottery_winner_count?: number;
  }) => {
    const fd = new FormData();
    fd.append('board_id', data.board_id);
    fd.append('title', data.title);
    fd.append('content', data.content);
    fd.append('tags', data.tags || '');
    fd.append('post_type', data.post_type || 'normal');
    if (data.poll_options) fd.append('poll_options', data.poll_options);
    if (data.bounty_points != null) fd.append('bounty_points', String(data.bounty_points));
    if (data.lottery_winner_count != null) fd.append('lottery_winner_count', String(data.lottery_winner_count));
    return request<{ post_id: number; message?: string; status?: string }>('/api/posts', { method: 'POST', body: fd, headers: {} });
  },
  updatePost: (id: number, data: { title: string; content: string; tags?: string; board_id?: string | number; post_type?: string }) => {
    const fd = new FormData();
    fd.append('title', data.title);
    fd.append('content', data.content);
    fd.append('tags', data.tags || '');
    if (data.board_id != null && data.board_id !== '') {
      fd.append('board_id', String(data.board_id));
    }
    if (data.post_type) {
      fd.append('post_type', data.post_type);
    }
    return request<{ message: string }>(`/api/posts/${id}`, { method: 'PUT', body: fd, headers: {} });
  },
  setQuestionResolved: (id: number, resolved: boolean) => {
    const fd = new FormData();
    fd.append('resolved', resolved ? '1' : '0');
    return request<{ message: string; question_resolved: boolean }>(`/api/posts/${id}/resolve`, {
      method: 'POST',
      body: fd,
      headers: {},
    });
  },
  pollVote: (id: number, optionIds: number[]) =>
    request<{ message: string; poll: PollView }>(`/api/posts/${id}/poll/vote`, {
      method: 'POST', body: JSON.stringify({ option_ids: optionIds }),
    }),
  pollClose: (id: number) =>
    request<{ message: string; poll: PollView }>(`/api/posts/${id}/poll/close`, { method: 'POST', body: '{}' }),
  bountyAward: (id: number, commentId: number) => {
    const fd = new FormData();
    fd.append('comment_id', String(commentId));
    return request<{ message: string }>(`/api/posts/${id}/bounty/award`, { method: 'POST', body: fd, headers: {} });
  },
  bountyRefund: (id: number) =>
    request<{ message: string }>(`/api/posts/${id}/bounty/refund`, { method: 'POST', body: '{}' }),
  postLotteryDraw: (id: number) =>
    request<{ message: string; lottery: PostLotteryView }>(`/api/posts/${id}/lottery/draw`, { method: 'POST', body: '{}' }),
  adminPages: () => request<{ pages: SitePage[] }>('/api/admin/pages'),
  adminPage: (id: number) => request<{ page: SitePage }>(`/api/admin/pages/${id}`),
  adminCreatePage: (data: Partial<SitePage>) =>
    request<{ message: string; page: SitePage }>('/api/admin/pages', { method: 'POST', body: JSON.stringify(data) }),
  adminUpdatePage: (id: number, data: Partial<SitePage>) =>
    request<{ message: string }>(`/api/admin/pages/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  adminSetPagePublished: (id: number, published: boolean) =>
    request<{ message: string; published: boolean }>(`/api/admin/pages/${id}/published`, {
      method: 'PUT',
      body: JSON.stringify({ published }),
    }),
  adminDeletePage: (id: number) =>
    request<{ message: string }>(`/api/admin/pages/${id}`, { method: 'DELETE' }),
  adminFriendLinkApplies: (params?: { page?: number; size?: number; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.size) q.set('size', String(params.size));
    if (params?.status) q.set('status', params.status);
    const qs = q.toString();
    return request<{
      applies: FriendLinkApply[];
      total: number;
      page: number;
      pending_count: number;
      reciprocal_check_enabled?: boolean;
    }>(`/api/admin/friend-link-applies${qs ? `?${qs}` : ''}`);
  },
  adminUpdateFriendLinkSettings: (body: { reciprocal_check_enabled: boolean }) =>
    request<{ message: string; reciprocal_check_enabled: boolean }>('/api/admin/friend-link-settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  adminApproveFriendLinkApply: (id: number) =>
    request<{ message: string; apply: FriendLinkApply }>(`/api/admin/friend-link-applies/${id}/approve`, {
      method: 'POST', body: '{}',
    }),
  adminRejectFriendLinkApply: (id: number, body?: { note?: string }) =>
    request<{ message: string; apply: FriendLinkApply }>(`/api/admin/friend-link-applies/${id}/reject`, {
      method: 'POST', body: JSON.stringify(body ?? {}),
    }),
  adminRecheckFriendLinkApply: (id: number) =>
    request<{ message: string; apply: FriendLinkApply }>(`/api/admin/friend-link-applies/${id}/recheck`, {
      method: 'POST',
    }),
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
  sendResetEmailCode: (email: string) =>
    request<{ message: string }>('/api/password-reset/email-code', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (data: { email: string; emailCode: string; newPassword: string }) =>
    request<{ message: string }>('/api/password-reset', {
      method: 'POST',
      body: JSON.stringify({
        email: data.email,
        email_code: data.emailCode,
        new_password: data.newPassword,
      }),
    }),
  searchUsers: (q: string, limit = 8) => {
    const sp = new URLSearchParams({ q, limit: String(limit) });
    return request<{ users: Array<{ id: number; username: string; nickname: string; avatar?: string }> }>(
      `/api/users/search?${sp}`,
    );
  },
  captcha: () => request<{ id: string; image: string }>('/api/captcha'),
  logout: () => request('/api/logout', { method: 'POST' }),
  like: (id: number) => request<{ liked: boolean; like_count: number }>(`/api/posts/${id}/like`, { method: 'POST' }),
  likeComment: (id: number) => request<{ liked: boolean; like_count: number }>(`/api/comments/${id}/like`, { method: 'POST' }),
  favorite: (id: number) => request<{ favorited: boolean }>(`/api/posts/${id}/favorite`, { method: 'POST' }),
  applyFriendLink: (body: {
    name: string;
    url: string;
    logo: string;
    link_on_homepage: boolean;
    reciprocal_page_url?: string;
  }) =>
    request<{ message: string; apply: FriendLinkApply; warning?: string }>('/api/friend-links/apply', {
      method: 'POST', body: JSON.stringify(body),
    }),
  uploadFriendLinkLogo: (file: File) => {
    const fd = new FormData();
    fd.append('logo', file);
    return request<{ message: string; url: string }>('/api/friend-links/logo', {
      method: 'POST', body: fd, headers: {},
    });
  },
  myFriendLinkApplies: () =>
    request<{ applies: FriendLinkApply[] }>('/api/friend-links/my-applies'),
  updateFriendLinkApply: (id: number, body: {
    name: string;
    url: string;
    logo: string;
    link_on_homepage: boolean;
    reciprocal_page_url?: string;
  }) =>
    request<{ message: string; apply: FriendLinkApply; warning?: string }>(`/api/friend-links/applies/${id}`, {
      method: 'PUT', body: JSON.stringify(body),
    }),
  cancelFriendLinkApply: (id: number) =>
    request<{ message: string }>(`/api/friend-links/applies/${id}`, { method: 'DELETE' }),
  reportPost: (id: number, body: { reason: ReportReason; detail?: string }) =>
    request<{ message: string; report: PostReport }>(`/api/posts/${id}/report`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  reportComment: (id: number, body: { reason: ReportReason; detail?: string }) =>
    request<{ message: string; report: PostReport }>(`/api/comments/${id}/report`, {
      method: 'POST', body: JSON.stringify(body),
    }),
  messageConversations: (params?: { page?: number; size?: number }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.size) q.set('size', String(params.size));
    const qs = q.toString();
    return request<{ conversations: MessageConversation[]; total: number; page: number }>(
      `/api/messages/conversations${qs ? `?${qs}` : ''}`,
    );
  },
  conversationMessages: (peerId: number, params?: { size?: number; before?: number }) => {
    const q = new URLSearchParams();
    if (params?.size) q.set('size', String(params.size));
    if (params?.before) q.set('before', String(params.before));
    const qs = q.toString();
    return request<{
      messages: PrivateMessage[];
      total: number;
      peer_user_id: number;
      peer_user?: User;
      is_system: boolean;
    }>(`/api/messages/conversations/${peerId}${qs ? `?${qs}` : ''}`);
  },
  markConversationRead: (peerId: number) =>
    request<{ message: string }>(`/api/messages/conversations/${peerId}/read`, { method: 'POST' }),
  messageUnreadCount: () =>
    request<{ count: number; dm_count?: number; notify_count?: number }>('/api/messages/unread-count'),
  messageNotifications: (params?: { page?: number; size?: number; kind?: string }) => {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.size) q.set('size', String(params.size));
    if (params?.kind) q.set('kind', params.kind);
    const qs = q.toString();
    return request<{ notifications: PrivateMessage[]; total: number; page: number; kind: string }>(
      `/api/messages/notifications${qs ? `?${qs}` : ''}`,
    );
  },
  markNotificationsRead: () =>
    request<{ message: string }>('/api/messages/notifications/read', { method: 'POST' }),
  sendMessage: (body: { to_user_id: number; subject?: string; content: string }) =>
    request<{ message: PrivateMessage }>('/api/messages', {
      method: 'POST', body: JSON.stringify(body),
    }),
  markAllMessagesRead: () =>
    request<{ message: string }>('/api/messages/read-all', { method: 'POST' }),
  addComment: (postId: number, data: {
    content: string;
    replyTo?: number;
    isPrivate?: boolean;
  }) => {
    const fd = new FormData();
    fd.append('content', data.content);
    if (data.replyTo) fd.append('reply_to', String(data.replyTo));
    if (data.isPrivate) fd.append('is_private', '1');
    return request<{ message: string; floor: number; id: number; status?: string }>(`/api/posts/${postId}/comments`, { method: 'POST', body: fd, headers: {} });
  },
  updateComment: (id: number, content: string) => {
    const fd = new FormData();
    fd.append('content', content);
    return request<{ message: string; content: string; status?: string }>(`/api/comments/${id}`, { method: 'PUT', body: fd, headers: {} });
  },
  deleteComment: (id: number) => request<{ message: string }>(`/api/comments/${id}`, { method: 'DELETE' }),
};
