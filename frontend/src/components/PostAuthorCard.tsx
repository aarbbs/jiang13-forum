import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, FileText, Heart, Mail, MessageCircle, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { api } from '../api/client';
import type { User, UserActivityStats, UserPublic } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { loginPath } from '../utils/authRedirect';
import { formatTime } from '../utils/content';
import { userPath } from '../utils/userPath';
import UserLink from './UserLink';

interface Props {
  author?: User | null;
  publishedAt?: string;
  viewCount?: number;
}

/** 帖子详情右栏：作者信息卡（私信 / 主页 / 统计） */
export default function PostAuthorCard({
  author,
  publishedAt,
  viewCount,
}: Props) {
  const nav = useNavigate();
  const { user: me } = useAuth();
  const [profile, setProfile] = useState<UserPublic | null>(null);
  const [stats, setStats] = useState<UserActivityStats | null>(null);

  useEffect(() => {
    if (!author?.id) {
      setProfile(null);
      setStats(null);
      return;
    }
    let cancelled = false;
    api.userProfile(author.id)
      .then((r) => {
        if (cancelled) return;
        setProfile(r.user);
        setStats(r.stats);
      })
      .catch(() => {
        if (cancelled) return;
        // 详情里已有轻量 user，接口失败时仍可展示基本信息
        setProfile(null);
        setStats(null);
      });
    return () => { cancelled = true; };
  }, [author?.id]);

  if (!author?.id) {
    return (
      <div className="widget-card widget-card--author">
        <div className="widget-card-head">
          <UserRound className="widget-card-icon widget-card-icon--author" aria-hidden />
          作者
        </div>
        <div className="widget-card-body">
          <div className="widget-empty">作者信息加载中…</div>
        </div>
      </div>
    );
  }

  const display = profile ?? author;
  const nick = display.nickname || display.username || `用户 #${author.id}`;
  const initial = nick.charAt(0) || '?';
  const signature = (profile?.signature ?? author.signature ?? '').trim();
  const isSelf = !!me && me.id === author.id;
  const profileHref = userPath(author.id);

  const openMessage = () => {
    if (!me) {
      nav(loginPath(profileHref));
      return;
    }
    nav(`/messages?peer=${author.id}`);
  };

  return (
    <div className="widget-card widget-card--author">
      <div className="widget-card-head">
        <UserRound className="widget-card-icon widget-card-icon--author" aria-hidden />
        作者
      </div>
      <div className="widget-author-panel">
        <div className="widget-author-body">
          <UserLink
            user={display}
            showAvatar={false}
            showName={false}
            className="widget-author-avatar user-link--avatar-only"
          >
            {display.avatar
              ? <img src={display.avatar} alt="" loading="lazy" decoding="async" />
              : initial}
          </UserLink>
          <div className="widget-author-meta">
            <div className="widget-author-name-row">
              <UserLink user={display} className="widget-author-name" showBadges />
              {display.banned && <Badge variant="destructive" className="widget-author-badge">已禁言</Badge>}
            </div>
            {signature ? (
              <p className="widget-author-signature" title={signature}>{signature}</p>
            ) : null}
            {(publishedAt || typeof viewCount === 'number') && (
              <p className="widget-author-stats">
                {publishedAt ? <span>{formatTime(publishedAt)} 发布</span> : null}
                {publishedAt && typeof viewCount === 'number' ? (
                  <span className="widget-author-stats-dot" aria-hidden>·</span>
                ) : null}
                {typeof viewCount === 'number' ? (
                  <span className="widget-author-views">
                    <Eye size={12} aria-hidden />
                    {viewCount}
                  </span>
                ) : null}
              </p>
            )}
          </div>
        </div>

        <div className="widget-author-metrics" aria-label="作者统计">
          <div className="widget-author-metric">
            <FileText size={13} aria-hidden />
            <strong>{stats?.post_count ?? '—'}</strong>
            <span>帖子</span>
          </div>
          <div className="widget-author-metric">
            <MessageCircle size={13} aria-hidden />
            <strong>{stats?.comment_count ?? '—'}</strong>
            <span>评论</span>
          </div>
          <div className="widget-author-metric">
            <Heart size={13} aria-hidden />
            <strong>{stats?.like_received ?? '—'}</strong>
            <span>获赞</span>
          </div>
        </div>

        <div className="widget-author-actions">
          {!isSelf && (
            <Button size="sm" className="widget-author-action" onClick={openMessage}>
              <Mail size={14} />
              私信
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="widget-author-action"
            onClick={() => nav(isSelf ? '/profile' : profileHref)}
          >
            {isSelf ? '我的主页' : '查看主页'}
          </Button>
        </div>
      </div>
    </div>
  );
}
