import { Flame, Megaphone, Users } from 'lucide-react';
import type { PostItem, Notification, OnlineStats } from '../api/types';

interface Props {
  hot: PostItem[];
  notifications: Notification[];
  online: OnlineStats | null;
  onPostClick: (id: number) => void;
  /** 首次拉取中，避免空态闪烁 */
  loading?: boolean;
}

function hotRankClass(index: number): string {
  if (index === 0) return 'widget-rank widget-rank--1';
  if (index === 1) return 'widget-rank widget-rank--2';
  if (index === 2) return 'widget-rank widget-rank--3';
  return 'widget-rank';
}

export default function RightPanel({
  hot,
  notifications,
  online,
  onPostClick,
  loading = false,
}: Props) {
  const hotList = hot?.slice(0, 8) ?? [];
  const noticeList = notifications?.slice(0, 6) ?? [];
  const members = online?.users ?? [];

  return (
    <div className="aside-panel-inner">
      <div className="widget-card">
        <div className="widget-card-head">
          <Flame className="widget-card-icon widget-card-icon--hot" aria-hidden />
          热门帖子
        </div>
        <div className="widget-card-body">
          {loading && hotList.length === 0 ? (
            <div className="widget-empty">加载中…</div>
          ) : hotList.length === 0 ? (
            <div className="widget-empty">暂无数据</div>
          ) : hotList.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className="widget-item"
              onClick={() => onPostClick(item.id)}
            >
              <span className={hotRankClass(i)}>{i + 1}</span>
              <span className="widget-item-title">{item.title}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="widget-card">
        <div className="widget-card-head">
          <Megaphone className="widget-card-icon widget-card-icon--notice" aria-hidden />
          最新动态
        </div>
        <div className="widget-card-body">
          {loading && noticeList.length === 0 ? (
            <div className="widget-empty">加载中…</div>
          ) : noticeList.length === 0 ? (
            <div className="widget-empty">暂无动态</div>
          ) : noticeList.map(item => (
            <button
              key={item.id}
              type="button"
              className="widget-item widget-item--notice"
              onClick={() => onPostClick(item.id)}
            >
              <span className="widget-item-title">{item.title}</span>
              <span className="widget-item-time">{item.created_at}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="widget-card">
        <div className="widget-card-head">
          <Users className="widget-card-icon widget-card-icon--online" aria-hidden />
          当前浏览 <span className="widget-head-count">{online?.count ?? '—'}</span> 人
        </div>
        <div className="widget-card-body">
          <div className="widget-online-meta">
            会员 {online?.members ?? 0} · 游客 {online?.guests ?? 0}
          </div>
          <div className="widget-online-list">
            {loading && online == null ? (
              <span className="widget-empty widget-empty--inline">加载中…</span>
            ) : (
              <>
                {members.map(u => (
                  <span key={u.id} className="widget-online-avatar" title={u.nickname}>
                    {u.avatar
                      ? <img src={u.avatar} alt="" loading="lazy" decoding="async" />
                      : (u.nickname?.[0] || '?')}
                  </span>
                ))}
                {members.length === 0 && (
                  <span className="widget-empty widget-empty--inline">暂无会员在线</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="widget-card widget-card--about">
        <div className="widget-card-body">
          <p className="widget-about-text">
            <strong>姜十三论坛</strong>
            拾三一隅，自在交流。轻量社区，专为小圈子打造。
          </p>
        </div>
      </div>
    </div>
  );
}
