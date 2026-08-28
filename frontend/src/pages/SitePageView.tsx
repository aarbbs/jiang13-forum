import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';
import { api } from '../api/client';
import type { SitePage } from '../api/types';
import PostContent from '../components/PostContent';
import PageLoader from '../components/PageLoader';
import { usePageSEO } from '../hooks/usePageSEO';
import { parsePermalinkSlug, pagePath } from '../utils/permalink';
import { useForumLimits } from '../hooks/useForumLimits';
import { useAuth } from '../hooks/useAuth';

/** 自定义单页（关于我们、版规等） */
export default function SitePageView() {
  const { slug: rawSlug } = useParams();
  const slug = parsePermalinkSlug(rawSlug);
  const { limits } = useForumLimits();
  const { user } = useAuth();
  const [page, setPage] = useState<SitePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    api.page(slug)
      .then(d => setPage(d.page))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  usePageSEO({
    title: page?.title,
    description: page?.title,
    canonicalPath: slug ? pagePath(slug, limits) : undefined,
    ogType: 'article',
  });

  if (!slug) return <NotFoundPage title="页面不存在" />;
  if (loading) return <PageLoader />;
  if (notFound || !page) return <NotFoundPage title="页面不存在" description="该页面不存在或未发布" />;

  return (
    <div className="page-wrap">
      <article className="site-page">
        <header className="site-page__head">
          <h1>{page.title}</h1>
        </header>
        <PostContent
          html={page.content}
          isLoggedIn={!!user}
          className="site-page__body post-detail-content"
        />
      </article>
    </div>
  );
}
