export interface User {
  id: number;
  username: string;
  email?: string;
  nickname: string;
  signature?: string;
  avatar: string;
  role: 'user' | 'admin';
  banned?: boolean;
  banned_at?: string;
  last_login_at?: string;
  last_login_ip?: string;
  created_at?: string;
  updated_at?: string;
}

/** 公开用户主页（无邮箱） */
export interface UserPublic {
  id: number;
  username: string;
  nickname: string;
  signature: string;
  avatar: string;
  role: 'user' | 'admin';
  banned?: boolean;
  banned_at?: string;
  created_at: string;
}

/** 个人中心活动统计 */
export interface UserActivityStats {
  post_count: number;
  comment_count: number;
  favorite_count: number;
  like_received: number;
}

export interface Board {
  id: number;
  name: string;
  description: string;
  icon?: string;
  color_index?: number;
  sort_order: number;
  post_count?: number;
}

export interface ForumStats {
  users: number;
  posts: number;
  boards: number;
}

/** 标签云单项 */
export interface TagCount {
  name: string;
  count: number;
}

export interface PostItem {
  id: number;
  board_id: number;
  user_id: number;
  title: string;
  content?: string;
  tags: string;
  /** normal=讨论 | question=问答 */
  post_type?: 'normal' | 'question' | string;
  /** 仅问答帖有意义 */
  question_resolved?: boolean;
  pinned: boolean;
  featured?: boolean;
  edit_locked?: boolean;
  status?: 'pending' | 'published' | 'rejected' | string;
  like_count: number;
  view_count: number;
  comment_count: number;
  last_reply_at?: string;
  created_at: string;
  updated_at?: string;
  board?: Board;
  user?: User;
}

export interface PostRevision {
  id: number;
  post_id: number;
  editor_id: number;
  title: string;
  content: string;
  tags: string;
  created_at: string;
  editor?: User;
}

export interface CommentRevision {
  id: number;
  comment_id: number;
  editor_id: number;
  content: string;
  created_at: string;
  editor?: User;
}

export interface PostDetailResponse {
  post: PostItem;
  comment_count: number;
  liked: boolean;
  favorited: boolean;
  /** 当前用户是否已在本帖发表过评论（含审核中） */
  has_replied?: boolean;
  can_edit?: boolean;
  edit_block_reason?: string;
  is_edited?: boolean;
  post_edit_window_hours?: number;
}

export interface Comment {
  id: number;
  post_id: number;
  user_id: number;
  floor: number;
  content: string;
  reply_to?: number;
  /** 嵌套展示父评论（父评论不可见时可能回挂到祖先） */
  thread_parent_id?: number;
  guest_nick?: string;
  guest_email?: string;
  guest_url?: string;
  is_private?: boolean;
  status?: 'pending' | 'published' | 'rejected' | string;
  content_hidden?: boolean;
  like_count?: number;
  liked?: boolean;
  created_at: string;
  updated_at?: string;
  user?: User;
  post?: PostItem;
  reply_target?: Comment;
}

export interface AdminDashboard {
  users: number;
  posts: number;
  boards: number;
  comments: number;
  recent_posts: PostItem[];
}

export interface ForumLimits {
  post_edit_window_hours: number;
  comment_edit_window_minutes: number;
  rate_limit_post: number;
  rate_limit_comment: number;
  rate_limit_register: number;
  rate_limit_login: number;
  rate_limit_window_sec: number;
  post_title_max: number;
  post_tags_max: number;
  post_content_max: number;
  comment_max: number;
  search_keyword_min: number;
  search_keyword_max: number;
  page_size_default: number;
  password_min_len: number;
  avatar_max_mb: number;
  signature_max: number;
  open_posts_in_new_tab: boolean;
  open_content_links_in_new_tab: boolean;
  /** 伪静态（固定链接）开关 */
  permalink_enabled: boolean;
  /** 伪静态后缀，不含点，如 html / htm */
  permalink_ext: string;
}

export interface ForumLimitsPublic {
  post_title_max: number;
  post_tags_max: number;
  post_content_max: number;
  comment_max: number;
  comment_edit_window_minutes: number;
  search_keyword_min: number;
  search_keyword_max: number;
  page_size_default: number;
  password_min_len: number;
  avatar_max_mb: number;
  signature_max: number;
  open_posts_in_new_tab: boolean;
  open_content_links_in_new_tab: boolean;
  permalink_enabled: boolean;
  permalink_ext: string;
}

export interface FriendLink {
  name: string;
  url: string;
}

export interface SiteBranding {
  name: string;
  slogan: string;
  /** 站点简介（首页可见 + SEO description） */
  description?: string;
  /** SEO keywords，逗号分隔 */
  keywords?: string;
  logo_mark: string;
  logo: string;
  favicon: string;
  /** 默认社交分享图（Open Graph） */
  og_image?: string;
  /** ICP 备案号（可选） */
  icp_beian?: string;
  /** ICP 备案跳转链接（可选，默认工信部查询页） */
  icp_beian_url?: string;
  /** 页脚友情链接 */
  friend_links?: FriendLink[];
}

export interface AdminSettings {
  filter_path: string;
  data_dir: string;
  db_path: string;
  port: number;
  limits: ForumLimits;
  mail: MailConfig;
  oidc: OIDCConfig;
  oauth_clients: OAuthClient[];
  gitea?: GiteaSyncConfig;
  storage?: StorageConfig;
  branding?: SiteBranding;
  filter_words: string;
  filter_word_count: number;
}

export interface StorageConfig {
  type: 'local' | 's3';
  endpoint: string;
  region: string;
  bucket: string;
  access_key: string;
  secret_key?: string;
  public_base_url: string;
  prefix: string;
  force_path_style: boolean;
  has_secret_key: boolean;
  ready: boolean;
  /** 展示方案：webp（默认）| original；上传始终保留原图 */
  image_delivery: 'webp' | 'original';
}

export type MediaCategory = 'avatars' | 'posts' | 'site';

export interface MediaItem {
  category: MediaCategory;
  name: string;
  url: string;
  size: number;
  modified_at: string;
  content_type: string;
}

export interface MediaListResult {
  files: MediaItem[];
  total: number;
  page: number;
  total_pages: number;
  storage_type: 'local' | 's3';
  category_counts: Record<string, number>;
}

export interface MailConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  password?: string;
  from: string;
  from_name: string;
  encryption: 'none' | 'starttls' | 'ssl';
  has_password: boolean;
}

export interface OIDCConfig {
  enabled: boolean;
  root_url: string;
  ready: boolean;
  discovery_url?: string;
  authorize_url?: string;
  logout_url?: string;
  group_claim: string;
  admin_group: string;
  user_group: string;
  client_count: number;
}

export interface OAuthClient {
  id: number;
  client_id: string;
  name: string;
  redirect_uris: string;
  enabled: boolean;
  has_secret: boolean;
  created_at: string;
  updated_at: string;
  client_secret?: string;
}

export interface OAuthClientInput {
  client_id?: string;
  name: string;
  redirect_uris: string;
  enabled?: boolean;
  client_secret?: string;
  rotate_secret?: boolean;
}

export interface GiteaProject {
  id: number;
  gitea_id: number;
  owner_login: string;
  name: string;
  full_name: string;
  description: string;
  html_url: string;
  updated_at_remote?: string | null;
  forum_user_id?: number;
  synced_at: string;
}

export interface GiteaSyncConfig {
  enabled: boolean;
  base_url: string;
  token?: string;
  has_token: boolean;
  sync_interval_min: number;
  ready: boolean;
  repo_count: number;
}

export interface RegisterConfig {
  is_first_user: boolean;
  mail_ready: boolean;
  require_email_code: boolean;
  register_open: boolean;
  /** 邮箱验证码位数，默认 6 */
  email_code_len?: number;
}

export interface Paginated<T> {
  total: number;
  page: number;
  total_pages: number;
  items: T;
}

export interface RecentComment {
  id: number;
  post_id: number;
  floor: number;
  user_id?: number;
  author: string;
  avatar: string;
  excerpt: string;
  post_title: string;
  created_at: string;
}

/** 站内私信 */
export interface PrivateMessage {
  id: number;
  from_user_id: number;
  to_user_id: number;
  subject: string;
  content: string;
  kind: 'user' | 'system' | 'reject' | 'report_result' | string;
  related_post_id?: number;
  related_report_id?: number;
  is_read: boolean;
  created_at: string;
  from_user?: User;
  to_user?: User;
}

/** 按对方聚合的私信会话 */
export interface MessageConversation {
  peer_user_id: number; // 0 = 系统通知
  peer_user?: User;
  is_system: boolean;
  last_message?: PrivateMessage;
  unread_count: number;
  updated_at: string;
}

export type ReportReason = 'spam' | 'abuse' | 'illegal' | 'irrelevant' | 'other';
export type ReportStatus = 'pending' | 'resolved' | 'dismissed';

/** 帖子/评论举报（有 comment_id 时为评论举报） */
export interface PostReport {
  id: number;
  post_id: number;
  comment_id?: number;
  reporter_id: number;
  reason: ReportReason | string;
  detail: string;
  status: ReportStatus | string;
  handler_id?: number;
  handle_note: string;
  created_at: string;
  handled_at?: string;
  post?: PostItem;
  comment?: Comment;
  reporter?: User;
  handler?: User;
}
