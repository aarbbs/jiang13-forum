import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ExternalLink, FolderGit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { GiteaProject } from '../api/types';
import { joinSEOKeywords, usePageSEO } from '../hooks/usePageSEO';
import { getCachedSiteBranding } from '../hooks/useSiteBranding';
import { InFlowSiteFooter } from '../components/SiteFooter';

function formatRemoteTime(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function ProjectsPage() {
  const nav = useNavigate();
  const [list, setList] = useState<GiteaProject[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  usePageSEO({
    title: '项目',
    description: '公开项目列表',
    keywords: joinSEOKeywords('项目', getCachedSiteBranding().keywords),
    canonicalPath: '/projects',
  });

  useEffect(() => {
    setLoading(true);
    api.projects({ page, limit: 30 })
      .then(d => {
        setList(Array.isArray(d.projects) ? d.projects : []);
        setTotal(d.total ?? 0);
        setTotalPages(d.total_pages ?? 0);
      })
      .catch(e => notify.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [page]);

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
        </header>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : list.length === 0 ? (
          <div className="empty-state list-page-panel__empty">
            <FolderGit2 className="empty-state-icon" aria-hidden size={36} strokeWidth={1.5} />
            <p>暂无同步到的公开项目</p>
            <p className="page-desc" style={{ marginTop: 8 }}>
              管理员可在「系统设置 → Gitea 同步」配置后执行同步
            </p>
          </div>
        ) : (
          <>
            <div className="content-surface projects-list">
              {list.map(p => (
                <article key={p.id} className="project-row">
                  <div className="project-row-body">
                    <h2 className="project-row-title">{p.full_name || p.name}</h2>
                    {p.description ? (
                      <p className="project-row-desc">{p.description}</p>
                    ) : null}
                    <div className="project-row-meta">
                      <span>{p.owner_login}</span>
                      {p.updated_at_remote && (
                        <span>更新于 {formatRemoteTime(p.updated_at_remote)}</span>
                      )}
                    </div>
                  </div>
                  <a
                    className="project-row-link"
                    href={p.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    在 Gitea 打开
                    <ExternalLink size={14} aria-hidden />
                  </a>
                </article>
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
