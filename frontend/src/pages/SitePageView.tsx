import { useEffect, useMemo, useRef } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import NotFoundPage from './NotFoundPage';
import { api } from '../api/client';
import type { SitePage } from '../api/types';
import ArticleOutline from '../components/ArticleOutline';
import PostContent from '../components/PostContent';
import { usePageSEO } from '../hooks/usePageSEO';
import { parsePermalinkSlug, pagePath } from '../utils/permalink';
import { useForumLimits } from '../hooks/useForumLimits';
import { useAuth } from '../hooks/useAuth';
import { useSessionResource } from '../hooks/useSessionResource';
import type { LayoutCtx } from '../layouts/MainLayout';
import { extractHeadingsFromHtml } from '../utils/postHeadings';
import { renderPostContentHtml } from '../utils/postContent';

/** 自定义单页（关于我们、版规等） */
export default function SitePageView() {
  const { slug: rawSlug } = useParams();
  const slug = parsePermalinkSlug(rawSlug);
  const { limits } = useForumLimits();
  const { user } = useAuth();
  const { setPostOutline, isMobile } = useOutletContext<LayoutCtx>();
  const pageRef = useRef<HTMLDivElement>(null);
  const { data: page, loading } = useSessionResource<SitePage | null>(
    slug ? `sitepage:${slug}` : null,
    () => api.page(slug).then(d => d.page),
    { enabled: !!slug },
  );
  const notFound = !slug || (!loading && !page);
  const isLoggedIn = !!user;
  const pageContent = page?.content ?? '';

  // 同步从正文派生目录，与帖子详情共用右侧栏目录布局
  const headings = useMemo(() => {
    if (!pageContent.trim()) return [];
    const rendered = renderPostContentHtml(pageContent, isLoggedIn, {
      openLinksInNewTab: limits.open_content_links_in_new_tab,
    });
    return extractHeadingsFromHtml(rendered);
  }, [pageContent, isLoggedIn, limits.open_content_links_in_new_tab]);

  usePageSEO({
    title: page?.title,
    description: page?.title,
    canonicalPath: slug ? pagePath(slug, limits) : undefined,
    ogType: 'article',
  });

  useEffect(() => {
    if (loading || !page) {
      setPostOutline({ headings: [], scrollRoot: null, title: '文章目录' });
      return () => setPostOutline(null);
    }
    setPostOutline({
      headings,
      scrollRoot: pageRef.current,
      title: '文章目录',
    });
    return () => setPostOutline(null);
  }, [headings, loading, page, setPostOutline]);

  if (!slug) return <NotFoundPage title="页面不存在" />;
  if (loading) return null;
  if (notFound || !page) return <NotFoundPage title="页面不存在" description="该页面不存在或未发布" />;

  return (
    <div className="page-wrap" ref={pageRef}>
      <article className="site-page">
        <header className="site-page__head">
          <h1>{page.title}</h1>
        </header>
        {isMobile && headings.length > 0 && (
          <details className="post-detail-toc-mobile">
            <summary>文章目录（{headings.length}）</summary>
            <ArticleOutline
              headings={headings}
              scrollRoot={pageRef.current}
              title="目录"
            />
          </details>
        )}
        <PostContent
          html={page.content}
          isLoggedIn={isLoggedIn}
          className="site-page__body post-detail-content"
        />
      </article>
    </div>
  );
}
