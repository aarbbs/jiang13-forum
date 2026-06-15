export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  role: 'user' | 'admin';
  banned?: boolean;
  created_at?: string;
}

export interface Board {
  id: number;
  name: string;
  description: string;
  sort_order: number;
  post_count?: number;
}

export interface ForumStats {
  users: number;
  posts: number;
  boards: number;
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
  user?: User;
  post?: PostItem;
  reply_target?: Comment;
}

export interface AdminDashboard {
  users: number;
  posts: number;
  boards: number;
  comments: number;
  online: number;
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
  page_size_max: number;
  password_min_len: number;
  avatar_max_mb: number;
}

export interface ForumLimitsPublic {
  post_title_max: number;
  post_tags_max: number;
  post_content_max: number;
  comment_max: number;
  search_keyword_min: number;
  search_keyword_max: number;
  password_min_len: number;
  avatar_max_mb: number;
}

export interface AdminSettings {
  filter_path: string;
  data_dir: string;
  db_path: string;
  port: number;
  limits: ForumLimits;
  filter_words: string;
  filter_word_count: number;
}

export interface Paginated<T> {
  total: number;
  page: number;
  total_pages: number;
  items: T;
}

export interface Notification {
  id: number;
  title: string;
  type: string;
  created_at: string;
}

export interface OnlineUser {
  id: number;
  nickname: string;
  avatar: string;
}

export interface OnlineStats {
  count: number;
  members: number;
  guests: number;
  users: OnlineUser[];
}
