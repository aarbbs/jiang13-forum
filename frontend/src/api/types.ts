export interface User {
  id: number;
  username: string;
  nickname: string;
  avatar: string;
  role: 'user' | 'admin';
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
  like_count: number;
  view_count: number;
  comment_count: number;
  created_at: string;
  board?: Board;
  user?: User;
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
  reply_target?: Comment;
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
