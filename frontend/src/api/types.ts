export interface UserBadge {
  code: string;
  name: string;
  description: string;
  icon: string;
  kind: string;
}

export interface User {
  id: number;
  username: string;
  email?: string;
  nickname: string;
  signature?: string;
  avatar: string;
  role: 'user' | 'admin';
  verified?: boolean;
  exp?: number;
  level?: number;
  points?: number;
  creator_income_total?: number;
  badges?: UserBadge[];
  banned?: boolean;
  banned_at?: string;
  last_login_at?: string;
  last_login_ip?: string;
  last_access_at?: string;
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
  verified?: boolean;
  exp?: number;
  level?: number;
  creator_income_total?: number;
  badges?: UserBadge[];
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
  comments: number;
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
  /** normal=讨论 | question=问答 | poll=投票 | bounty=悬赏 | lottery=抽奖 */
  post_type?: 'normal' | 'question' | 'poll' | 'bounty' | 'lottery' | string;
  /** 仅问答帖有意义 */
  question_resolved?: boolean;
  bounty_points?: number;
  bounty_status?: 'open' | 'awarded' | 'refunded' | string;
  bounty_comment_id?: number;
  lottery_winner_count?: number;
  lottery_status?: 'open' | 'drawn' | string;
  pinned: boolean;
  /** 板块内置顶（仅板块列表抬升，首页不抬升） */
  board_pinned?: boolean;
  featured?: boolean;
  edit_locked?: boolean;
  /** 禁止新评论（结贴） */
  comments_locked?: boolean;
  status?: 'pending' | 'published' | 'rejected' | string;
  like_count: number;
  view_count: number;
  comment_count: number;
  last_reply_at?: string;
  /** 最后回复用户（登录用户）；与 last_reply_guest_nick 二选一 */
  last_reply_user?: User;
  /** 最后回复游客昵称 */
  last_reply_guest_nick?: string;
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
  has_replied?: boolean;
  can_edit?: boolean;
  edit_block_reason?: string;
  is_edited?: boolean;
  post_edit_window_hours?: number;
  poll?: PollView;
  lottery?: PostLotteryView;
  /** 悬赏进行中：当前用户是否可取消悬赏 */
  bounty_can_refund?: boolean;
  bounty_refund_block_reason?: string;
  /** 他人已发布有效回复数 */
  bounty_eligible_reply_count?: number;
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
  pending_posts?: number;
  pending_comments?: number;
  pending_reports?: number;
  pending_friend_links?: number;
  recent_posts: PostItem[];
}

export type AsideWidgetId = 'tag_cloud' | 'recent_comments' | 'recent_users' | 'friend_links';

export interface AsideWidget {
  id: AsideWidgetId;
  enabled: boolean;
}

export const DEFAULT_ASIDE_WIDGETS: AsideWidget[] = [
  { id: 'tag_cloud', enabled: false },
  { id: 'recent_comments', enabled: false },
  { id: 'recent_users', enabled: false },
  { id: 'friend_links', enabled: true },
];

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
  /** 右侧栏标签云 */
  aside_show_tag_cloud: boolean;
  /** 右侧栏最新评论 */
  aside_show_recent_comments: boolean;
  /** 右侧栏友情链接 */
  aside_show_friend_links: boolean;
  /** 右侧栏可选组件顺序与开关 */
  aside_widgets: AsideWidget[];
  /** 首页列表样式：title 仅标题 / thumbnail 缩略图 */
  feed_list_style: 'title' | 'excerpt' | 'thumbnail';
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
  aside_show_tag_cloud: boolean;
  aside_show_recent_comments: boolean;
  aside_show_friend_links: boolean;
  aside_widgets: AsideWidget[];
  feed_list_style: 'title' | 'excerpt' | 'thumbnail';
  permalink_enabled: boolean;
  permalink_ext: string;
}

export interface FriendLink {
  name: string;
  url: string;
  logo?: string;
}

export interface FriendLinkApply {
  id: number;
  user_id: number;
  name: string;
  url: string;
  description?: string;
  logo?: string;
  reciprocal_page_url?: string;
  link_on_homepage?: boolean;
  reciprocal_verified?: boolean;
  reciprocal_check_note?: string;
  reciprocal_checked_at?: string;
  status: 'pending' | 'approved' | 'rejected';
  review_note?: string;
  reviewed_at?: string;
  created_at: string;
  user?: User;
}

export interface SitePageSummary {
  id: number;
  title: string;
  slug: string;
  show_in_footer?: boolean;
  show_in_nav?: boolean;
  sort_order?: number;
}

export interface SitePage extends SitePageSummary {
  content: string;
  published: boolean;
}

export interface PollOptionView {
  id: number;
  text: string;
  vote_count: number;
  percent?: number;
}

export interface PollView {
  multi: boolean;
  max_choices: number;
  closed: boolean;
  ends_at?: string;
  options: PollOptionView[];
  my_option_ids?: number[];
  total_votes: number;
}

export interface PostLotteryWinnerView {
  user_id: number;
  username: string;
  nickname: string;
  comment_id: number;
}

export interface PostLotteryView {
  winner_count: number;
  status: string;
  participant_count: number;
  winners?: PostLotteryWinnerView[];
}

export interface SiteBranding {
  name: string;
  slogan: string;
  /** 站点简介（右侧栏顶部 + SEO description） */
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
  /** 公开站点根 URL（API 动态填充） */
  site_url?: string;
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

/** 右栏「最新注册」用户 */
export interface RecentUser {
  id: number;
  nickname: string;
  avatar: string;
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

export interface BadgeDef {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  kind: 'auto' | 'limited' | string;
  metric: string;
  threshold: number;
  sort_order: number;
  enabled: boolean;
}

export interface PointLedger {
  id: number;
  user_id: number;
  delta: number;
  balance: number;
  reason: string;
  ref_type: string;
  ref_id: number;
  note: string;
  created_at: string;
}

export interface CheckInStatus {
  checked_in: boolean;
  streak: number;
  today_points: number;
  day: string;
}

export interface LotteryStatus {
  drawn: boolean;
  points: number;
  day: string;
  cost: number;
  pool?: { points: number; weight: number }[];
}
