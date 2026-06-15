import type { PostItem, Notification, OnlineStats } from '../api/types';

interface Props {
  hot: PostItem[];
  notifications: Notification[];
  online: OnlineStats | null;
  onPostClick: (id: number) => void;
}

export default function RightPanel({ hot, notifications, online, onPostClick }: Props) {
  const hotList = hot?.slice(0, 8) ?? [];
  const noticeList = notifications?.slice(0, 6) ?? [];
  const members = online?.users ?? [];

  return (
    <>
      <div className="widget-card">
        <div className="widget-card-head">🔥 热门帖子</div>
        <div className="widget-card-body">
          {hotList.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', padding: '8px 0' }}>暂无数据</div>
          ) : hotList.map((item, i) => (
            <div key={item.id} className="widget-item" onClick={() => onPostClick(item.id)}>
              <span style={{ color: i < 3 ? '#e74c3c' : 'var(--color-text-3)', fontWeight: 600, minWidth: 18 }}>{i + 1}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="widget-card">
        <div className="widget-card-head">📢 最新动态</div>
        <div className="widget-card-body">
          {noticeList.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-text-3)', padding: '8px 0' }}>暂无动态</div>
          ) : noticeList.map(item => (
            <div key={item.id} className="widget-item" onClick={() => onPostClick(item.id)}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
              <span style={{ fontSize: 11, color: 'var(--color-text-4)', flexShrink: 0 }}>{item.created_at}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="widget-card">
        <div className="widget-card-head">👀 当前浏览 {online?.count ?? '—'} 人</div>
        <div className="widget-card-body">
          <div style={{ fontSize: 12, color: 'var(--color-text-3)', marginBottom: 8 }}>
            会员 {online?.members ?? 0} · 游客 {online?.guests ?? 0}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {members.map(u => (
              <span key={u.id} title={u.nickname} style={{
                width: 28, height: 28, borderRadius: '50%', background: 'var(--j13-green)',
                color: '#fff', fontSize: 12, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {u.nickname?.[0] || '?'}
              </span>
            ))}
            {members.length === 0 && (
              <span style={{ fontSize: 13, color: 'var(--color-text-3)' }}>暂无会员在线</span>
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
    </>
  );
}
