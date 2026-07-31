export interface User {
  id: number;
  username: string;
  email?: string;
  nickname: string;
  avatar: string;
  role: 'user' | 'admin';
  banned?: boolean;
  banned_at?: string;
  last_login_at?: string;
  last_login_ip?: string;
  created_at?: string;
  updated_at?: string;
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
  pinned: boolean;
  edit_locked?: boolean;
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

export interface PostDetailResponse {
  post: PostItem;
  comment_count: number;
  liked: boolean;
  favorited: boolean;
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
  guest_nick?: string;
  guest_email?: string;
  guest_url?: string;
  is_private?: boolean;
  content_hidden?: boolean;
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
  open_posts_in_new_tab: boolean;
  open_content_links_in_new_tab: boolean;
}

export interface ForumLimitsPublic {
  post_title_max: number;
  post_tags_max: number;
  post_content_max: number;
  comment_max: number;
  search_keyword_min: number;
  search_keyword_max: number;
  page_size_default: number;
  password_min_len: number;
  avatar_max_mb: number;
  open_posts_in_new_tab: boolean;
  open_content_links_in_new_tab: boolean;
}

export interface SiteBranding {
  name: string;
  name_en: string;
  slogan: string;
  logo_mark: string;
  logo: string;
  favicon: string;
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
  branding?: SiteBranding;
  filter_words: string;
  filter_word_count: number;
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
  author: string;
  avatar: string;
  excerpt: string;
  post_title: string;
  created_at: string;
}
