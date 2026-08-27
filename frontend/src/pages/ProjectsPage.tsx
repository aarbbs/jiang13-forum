import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FolderGit2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { GiteaProject } from '../api/types';
import ProjectListItem from '../components/ProjectListItem';
import { InFlowSiteFooter } from '../components/SiteFooter';
import { joinSEOKeywords, usePageSEO } from '../hooks/usePageSEO';
import { getCachedSiteBranding } from '../hooks/useSiteBranding';

export default function ProjectsPage() {
  const nav = useNavigate();
  const [list, setList] = useState<GiteaProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');

  usePageSEO({
    title: '开源码桶',
    description: '论坛会员在 Gitea 上的公开仓库',
    keywords: joinSEOKeywords('开源码桶', '项目', getCachedSiteBranding().keywords),
    canonicalPath: '/projects',
  });

  useEffect(() => {
    const t = window.setTimeout(() => {
      const next = queryInput.trim();
      setQuery(prev => {
        if (prev === next) return prev;
        setPage(1);
        return next;
      });
    }, 300);
    return () => window.clearTimeout(t);
  }, [queryInput]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.projects({ page, limit: 30, q: query || undefined })
      .then(d => {
        if (cancelled) return;
        setList(Array.isArray(d.projects) ? d.projects : []);
        setTotal(d.total ?? 0);
        setTotalPages(d.total_pages ?? 0);
      })
      .catch(e => {
        if (!cancelled) notify.error(e instanceof Error ? e.message : '加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [page, query]);

  return (
    <div className="page-wrap">
      <div className="feed-panel list-page-panel">
        <header className="list-page-panel__head">
          <Button variant="ghost" size="sm" className="list-page-panel__back" onClick={() => nav('/')}>
            <ArrowLeft />
            返回
          </Button>
          <h1 className="page-title">开源码桶</h1>
          <p className="page-desc">
            论坛会员在 Gitea 上的公开仓库
            {total > 0 ? ` · 共 ${total} 个` : ''}
          </p>
          <label className="projects-search">
            <Search className="projects-search__icon" size={16} aria-hidden />
            <input
              type="search"
              className="projects-search__input"
              placeholder="搜索仓库名、描述或所有者…"
              value={queryInput}
              onChange={e => setQueryInput(e.target.value)}
              autoComplete="off"
            />
          </label>
        </header>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : list.length === 0 ? (
          <div className="empty-state list-page-panel__empty">
            <FolderGit2 className="empty-state-icon" aria-hidden size={36} strokeWidth={1.5} />
            <p>{query ? '没有匹配的仓库' : '暂无同步到的公开项目'}</p>
            <p className="page-desc" style={{ marginTop: 8 }}>
              {query
                ? '试试其他关键词，或清空搜索'
                : '需管理员在「系统设置 → Gitea 同步」开启并执行同步后才会出现仓库'}
            </p>
          </div>
        ) : (
          <>
            <div className="content-surface post-list projects-list">
              {list.map(p => (
                <ProjectListItem key={p.id} project={p} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="projects-pager">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  上一页
                </Button>
                <span className="projects-pager-info">{page} / {totalPages}</span>
                <Button
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  下一页
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      <InFlowSiteFooter />
    </div>
  );
}
