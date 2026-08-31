import { useParams } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';
import { api } from '../api/client';
import type { SitePage } from '../api/types';
import PostContent from '../components/PostContent';
import { usePageSEO } from '../hooks/usePageSEO';
import { parsePermalinkSlug, pagePath } from '../utils/permalink';
import { useForumLimits } from '../hooks/useForumLimits';
import { useAuth } from '../hooks/useAuth';
import { useSessionResource } from '../hooks/useSessionResource';

/** 自定义单页（关于我们、版规等） */
export default function SitePageView() {
  const { slug: rawSlug } = useParams();
  const slug = parsePermalinkSlug(rawSlug);
  const { limits } = useForumLimits();
  const { user } = useAuth();
  const { data: page, loading } = useSessionResource<SitePage | null>(
    slug ? `sitepage:${slug}` : null,
    () => api.page(slug).then(d => d.page),
    { enabled: !!slug },
  );
  const notFound = !slug || (!loading && !page);

  usePageSEO({
    title: page?.title,
    description: page?.title,
    canonicalPath: slug ? pagePath(slug, limits) : undefined,
    ogType: 'article',
  });

  if (!slug) return <NotFoundPage title="页面不存在" />;
  if (loading) return null;
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
