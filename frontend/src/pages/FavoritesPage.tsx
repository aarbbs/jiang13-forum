import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { formatTime } from '../utils/content';

interface FavItem {
  id: number;
  post_id: number;
  created_at: string;
  post?: {
    id: number;
    title: string;
    board?: { name: string };
    user?: { nickname: string };
  };
}

export default function FavoritesPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [list, setList] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav('/login'); return; }
    api.favorites()
      .then(d => setList(Array.isArray(d.favorites) ? d.favorites : []))
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  }, [user, authLoading, nav]);

  if (authLoading || loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  if (!user) return null;

  return (
    <div className="page-wrap">
      <div className="page-inner-wide">
        <Button variant="ghost" className="mb-3" onClick={() => nav('/')}>
          <ArrowLeft />
          返回
        </Button>
        <h1 className="page-title">我的收藏</h1>
        <p className="page-desc">共 {list.length} 篇收藏帖子</p>

        {list.length === 0 ? (
          <div className="empty-state">
            <p>还没有收藏任何帖子</p>
            <Button onClick={() => nav('/')}>去逛逛</Button>
          </div>
        ) : (
          <div className="content-surface">
            {list.map(fav => (
              <div
                key={fav.id}
                className="post-row"
                onClick={() => nav(`/post/${fav.post_id}`)}
              >
                <div className="post-body">
                  <div className="post-title">{fav.post?.title || '帖子已删除'}</div>
                  <div className="post-meta">
                    {fav.post?.board?.name && <span>{fav.post.board.name}</span>}
                    {fav.post?.user?.nickname && <span>{fav.post.user.nickname}</span>}
                    <span>收藏于 {formatTime(fav.created_at)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
