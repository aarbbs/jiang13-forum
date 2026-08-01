import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  Hash,
  Heart,
  MessageCircle,
  PenLine,
  Settings,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem, UserActivityStats, UserPublic } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { useForumLimits } from '../hooks/useForumLimits';
import PostListItem from '../components/PostListItem';
import FeedPagination from '../components/FeedPagination';
import { openForumPost } from '../utils/openPost';
import { formatDateTime } from '../utils/content';

export default function UserProfilePage() {
  const { id: idParam } = useParams();
  const userId = Number(idParam);
  const nav = useNavigate();
  const { user: me } = useAuth();
  const { limits } = useForumLimits();
  const pageSize = limits.page_size_default > 0 ? limits.page_size_default : 20;

  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [stats, setStats] = useState<UserActivityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postPage, setPostPage] = useState(1);
  const [postTotal, setPostTotal] = useState(0);

  const isSelf = !!me && me.id === userId;
  const totalPages = Math.max(1, Math.ceil(postTotal / pageSize));

  useEffect(() => {
    if (!userId || Number.isNaN(userId)) {
      notify.error('无效用户');
      nav('/');
      return;
    }
    setLoading(true);
    setPostPage(1);
    api.userProfile(userId)
      .then(d => {
        setProfile(d.user);
        setStats(d.stats);
      })
      .catch(e => {
        notify.error(e instanceof Error ? e.message : '用户不存在');
        nav('/');
      })
      .finally(() => setLoading(false));
  }, [userId, nav]);

  useEffect(() => {
    if (!userId || Number.isNaN(userId) || !profile) return;
    let cancelled = false;
    setPostsLoading(true);
    api.posts({ user_id: userId, page: postPage, size: pageSize, sort: 'latest' })
      .then(d => {
        if (cancelled) return;
        setPosts(Array.isArray(d.posts) ? d.posts : []);
        setPostTotal(d.total ?? 0);
      })
      .catch(e => {
        if (!cancelled) notify.error(e instanceof Error ? e.message : '加载帖子失败');
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false);
      });
    return () => { cancelled = true; };
  }, [userId, profile, postPage, pageSize]);

  if (loading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }
  if (!profile) return null;

  const joinedAt = profile.created_at ? formatDateTime(profile.created_at) : '';
  const signature = profile.signature?.trim() || '';

  return (
    <div className="page-wrap">
      <div className="page-inner-wide page-inner-wide--profile">
        <Button variant="ghost" className="mb-3" onClick={() => nav(-1)}>
          <ArrowLeft />
          返回
        </Button>

        <div className="profile-header-card profile-header-card--public">
          <div className="profile-avatar-lg" aria-hidden>
            {profile.avatar
              ? <img src={profile.avatar} alt="" loading="lazy" decoding="async" />
              : profile.nickname[0]}
          </div>

          <div className="profile-header-info">
            <div className="profile-header-main">
              <div className="profile-name-row">
                <h1 className="profile-display-name">{profile.nickname}</h1>
                {profile.role === 'admin' && <Badge variant="green">管理员</Badge>}
                {profile.banned && <Badge variant="destructive">已禁言</Badge>}
              </div>
              <div className="profile-username">@{profile.username}</div>
              <div className="profile-id-row">
                <span className="profile-id-chip" title="用户 ID">
                  <Hash size={13} aria-hidden />
                  UID {profile.id}
                </span>
              </div>
              {signature ? (
                <p className="profile-signature">{signature}</p>
              ) : (
                <p className="profile-signature profile-signature--empty">这个人很懒，还没有签名</p>
              )}
              <dl className="profile-meta-list">
                {joinedAt && (
                  <div>
                    <dt>注册时间</dt>
                    <dd>{joinedAt}</dd>
                  </div>
                )}
              </dl>
            </div>
            {isSelf && (
              <div className="profile-avatar-actions">
                <Button size="sm" variant="outline" onClick={() => nav('/profile?tab=settings')}>
                  <Settings size={14} />
                  编辑资料
                </Button>
              </div>
            )}
          </div>

          <div className="profile-stat-grid" aria-label="活动统计">
            <div className="profile-stat">
              <FileText size={16} aria-hidden />
              <strong>{stats?.post_count ?? 0}</strong>
              <span>帖子</span>
            </div>
            <div className="profile-stat">
              <MessageCircle size={16} aria-hidden />
              <strong>{stats?.comment_count ?? 0}</strong>
              <span>评论</span>
            </div>
            <div className="profile-stat">
              <Heart size={16} aria-hidden />
              <strong>{stats?.like_received ?? 0}</strong>
              <span>获赞</span>
            </div>
            {isSelf && (
              <button type="button" className="profile-stat" onClick={() => nav('/favorites')}>
                <Star size={16} aria-hidden />
                <strong>{stats?.favorite_count ?? 0}</strong>
                <span>收藏</span>
              </button>
            )}
          </div>
        </div>

        <div className="section-card-title profile-posts-heading">
          {isSelf ? '我的帖子' : `${profile.nickname} 的帖子`}
          {postTotal > 0 && <span className="profile-tab-count">{postTotal}</span>}
        </div>

        <div className="profile-panel">
          {postsLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : posts.length === 0 ? (
            <div className="empty-state">
              <PenLine className="empty-state-icon" aria-hidden size={36} strokeWidth={1.5} />
              <p>{isSelf ? '还没有发布过帖子' : '暂无公开帖子'}</p>
              {isSelf && <Button onClick={() => nav('/compose')}>去发帖</Button>}
            </div>
          ) : (
            <>
              <div className="content-surface">
                {posts.map(post => (
                  <PostListItem
                    key={post.id}
                    post={post}
                    onSelect={(id) => openForumPost(nav, id, limits.open_posts_in_new_tab)}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <FeedPagination
                  page={postPage}
                  totalPages={totalPages}
                  postTotal={postTotal}
                  loading={postsLoading}
                  onPageChange={setPostPage}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
