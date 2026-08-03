import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { MediaItem } from '../../api/types';
import { cn } from '@/lib/utils';

type CategoryTab = 'all' | 'avatars' | 'posts' | 'site';

const CATEGORY_LABEL: Record<string, string> = {
  avatars: '头像',
  posts: '帖子图',
  site: '站点资源',
};

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminMediaPage() {
  const { ready } = useAdminGuard();
  const [category, setCategory] = useState<CategoryTab>('all');
  const [q, setQ] = useState('');
  const [keyword, setKeyword] = useState('');
  const [files, setFiles] = useState<MediaItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [storageType, setStorageType] = useState<'local' | 's3'>('local');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingUrls, setPendingUrls] = useState<string[]>([]);

  const load = useCallback(async (p = 1, cat: CategoryTab = category, query = keyword) => {
    setLoading(true);
    try {
      const r = await api.adminMedia({
        category: cat,
        page: p,
        size: 24,
        q: query || undefined,
      });
      setFiles(r.files ?? []);
      setCounts(r.category_counts ?? {});
      setStorageType(r.storage_type || 'local');
      setPage(r.page || p);
      setTotalPages(r.total_pages || 1);
      setTotal(r.total || 0);
      setSelected(new Set());
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [category, keyword]);

  useEffect(() => {
    if (ready) load(1, category, keyword);
  }, [ready, category, keyword, load]);

  const allSelected = useMemo(
    () => files.length > 0 && files.every(f => selected.has(f.url)),
    [files, selected],
  );

  const toggleOne = (url: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(files.map(f => f.url)));
  };

  const askDelete = (urls: string[]) => {
    if (urls.length === 0) {
      notify.warning('请先选择文件');
      return;
    }
    setPendingUrls(urls);
    setConfirmOpen(true);
  };

  const doDelete = async () => {
    if (pendingUrls.length === 0) return;
    setDeleting(true);
    try {
      const r = await api.adminDeleteMedia(pendingUrls);
      notify.success(r.message);
      setConfirmOpen(false);
      setPendingUrls([]);
      await load(page, category, keyword);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '删除失败');
    } finally {
      setDeleting(false);
    }
  };

  const copyURL = async (url: string) => {
    try {
      const abs = url.startsWith('http') ? url : `${window.location.origin}${url}`;
      await navigator.clipboard.writeText(abs);
      notify.success('已复制链接');
    } catch {
      notify.error('复制失败');
    }
  };

  if (!ready) return null;

  const tabs: { key: CategoryTab; label: string }[] = [
    { key: 'all', label: `全部 (${Object.values(counts).reduce((a, b) => a + (b || 0), 0)})` },
    { key: 'avatars', label: `头像 (${counts.avatars || 0})` },
    { key: 'posts', label: `帖子图 (${counts.posts || 0})` },
    { key: 'site', label: `站点 (${counts.site || 0})` },
  ];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h1>媒体库</h1>
        <p>
          浏览并管理上传资源（头像 / 帖子图 / 站点品牌图）。当前存储：
          {storageType === 's3' ? 'S3 兼容' : '本地磁盘'}
          。列表来自数据库索引；删除会同时清理伴生原图/WebP。
        </p>
      </div>

      <div className="admin-tabs">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            className={cn('admin-tab', category === t.key && 'active')}
            onClick={() => setCategory(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="admin-media-toolbar">
        <form
          className="admin-media-search"
          onSubmit={e => {
            e.preventDefault();
            setKeyword(q.trim());
          }}
        >
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="按文件名搜索…"
            aria-label="搜索媒体"
          />
          <Button type="submit" variant="outline">搜索</Button>
          {keyword && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setQ('');
                setKeyword('');
              }}
            >
              清除
            </Button>
          )}
        </form>
        <div className="admin-media-toolbar-actions">
          <Button size="sm" variant="outline" onClick={toggleAll} disabled={files.length === 0}>
            {allSelected ? '取消全选' : '全选本页'}
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selected.size === 0 || deleting}
            onClick={() => askDelete([...selected])}
          >
            <Trash2 size={14} aria-hidden />
            删除所选 ({selected.size})
          </Button>
        </div>
      </div>

      <div className="admin-card">
        {loading ? (
          <div className="flex justify-center py-12"><Spinner size="lg" /></div>
        ) : files.length === 0 ? (
          <div className="admin-empty">暂无媒体文件</div>
        ) : (
          <>
            <div className="admin-media-grid">
              {files.map(f => (
                <article
                  key={f.url}
                  className={cn('admin-media-card', selected.has(f.url) && 'is-selected')}
                >
                  <label className="admin-media-check">
                    <input
                      type="checkbox"
                      checked={selected.has(f.url)}
                      onChange={() => toggleOne(f.url)}
                      aria-label={`选择 ${f.name}`}
                    />
                  </label>
                  <a
                    className="admin-media-thumb"
                    href={f.url}
                    target="_blank"
                    rel="noreferrer"
                    title={f.name}
                  >
                    <img src={f.url} alt="" loading="lazy" decoding="async" />
                  </a>
                  <div className="admin-media-meta">
                    <div className="admin-media-name" title={f.name}>{f.name}</div>
                    <div className="admin-media-sub">
                      <Badge variant="secondary">{CATEGORY_LABEL[f.category] || f.category}</Badge>
                      <span>{formatBytes(f.size)}</span>
                    </div>
                    <div className="admin-media-time">
                      {f.modified_at ? new Date(f.modified_at).toLocaleString('zh-CN') : '—'}
                    </div>
                    <div className="admin-media-actions">
                      <Button size="sm" variant="outline" onClick={() => copyURL(f.url)}>
                        <Copy size={13} aria-hidden />
                        复制
                      </Button>
                      <Button size="sm" variant="outline" asChild>
                        <a href={f.url} target="_blank" rel="noreferrer">
                          <ExternalLink size={13} aria-hidden />
                          打开
                        </a>
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => askDelete([f.url])}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="admin-pagination">
              <span>共 {total} 个文件</span>
              {totalPages > 1 && (
                <>
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>
                    上一页
                  </Button>
                  <span>第 {page} / {totalPages} 页</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>
                    下一页
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除媒体？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除 {pendingUrls.length} 个文件；若存在同名原图/WebP 伴生文件也会一并清理。此操作不可恢复，且不会自动改写帖子正文中的引用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={e => {
                e.preventDefault();
                void doDelete();
              }}
            >
              {deleting ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
