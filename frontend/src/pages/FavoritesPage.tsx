import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { PostItem } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import PostListItem from '../components/PostListItem';
import { loginPath } from '../utils/authRedirect';
import { useForumLimits } from '../hooks/useForumLimits';
import { openForumPost } from '../utils/openPost';
import { useNoIndexSEO } from '../hooks/usePageSEO';
import { InFlowSiteFooter } from '../components/SiteFooter';

interface FavItem {
  id: number;
  post_id: number;
  created_at: string;
  post?: PostItem;
}

export default function FavoritesPage() {
  const nav = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { limits } = useForumLimits();
  useNoIndexSEO('我的收藏');
  const [list, setList] = useState<FavItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { nav(loginPath('/favorites')); return; }
    api.favorites()
      .then(d => setList(Array.isArray(d.favorites) ? d.favorites as FavItem[] : []))
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  }, [user, authLoading, nav]);

  if (authLoading || loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;

  if (!user) return null;

  return (
    <div className="page-wrap">
      <div className="feed-panel list-page-panel">
        <header className="list-page-panel__head">
          <Button variant="ghost" size="sm" className="list-page-panel__back" onClick={() => nav('/')}>
            <ArrowLeft />
            返回
          </Button>
          <h1 className="page-title">我的收藏</h1>
          <p className="page-desc">共 {list.length} 篇收藏帖子</p>
        </header>

        {list.length === 0 ? (
          <div className="empty-state list-page-panel__empty">
            <Star className="empty-state-icon" aria-hidden size={36} strokeWidth={1.5} />
            <p>还没有收藏任何帖子</p>
            <Button onClick={() => nav('/')}>去逛逛</Button>
          </div>
        ) : (
          <div className="content-surface">
            {list.map(fav => (
              fav.post ? (
                <PostListItem
                  key={fav.id}
                  post={fav.post}
                  onSelect={(id) => openForumPost(nav, id, limits.open_posts_in_new_tab)}
                />
              ) : (
                <button
                  key={fav.id}
                  type="button"
                  className="post-row"
                  onClick={() => openForumPost(nav, fav.post_id, limits.open_posts_in_new_tab)}
                >
                  <div className="post-body">
                    <div className="post-title">帖子已删除</div>
                  </div>
                </button>
              )
            ))}
          </div>
        )}
      </div>
      <InFlowSiteFooter />
    </div>
  );
}
