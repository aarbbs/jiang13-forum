import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/notify';
import { api } from '@/api/client';
import type { PostItem, SitePageSummary } from '@/api/types';
import { pagePath, postPath } from '@/utils/permalink';
import { useForumLimits } from '@/hooks/useForumLimits';
import { Loader2 } from 'lucide-react';

export interface ArticleLinkConfirm {
  url: string;
  text: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialUrl?: string;
  initialText?: string;
  /** 是否正在编辑已有链接 */
  editing?: boolean;
  onConfirm: (payload: ArticleLinkConfirm) => void;
  onRemove?: () => void;
}

type SiteHit = {
  key: string;
  title: string;
  url: string;
  kind: 'post' | 'page';
};

/** 校验可插入的链接地址：外链或站内绝对路径 */
export function isValidLinkHref(url: string): boolean {
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith('/') && !u.startsWith('//')) return true;
  if (u.startsWith('#') && u.length > 1) return true;
  try {
    const parsed = new URL(u);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const SEARCH_DEBOUNCE_MS = 300;
const POST_PAGE_SIZE = 12;

/** 文章/评论编辑器：插入或编辑链接（含站内内容搜索） */
export function ArticleLinkDialog({
  open,
  onOpenChange,
  initialUrl = '',
  initialText = '',
  editing = false,
  onConfirm,
  onRemove,
}: Props) {
  const { limits } = useForumLimits();
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [pages, setPages] = useState<SitePageSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl(initialUrl || '');
    setText(initialText || '');
    setQuery('');
    setDebouncedQuery('');
  }, [open, initialUrl, initialText]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query, open]);

  const loadSiteHits = useCallback(async (keyword: string) => {
    setLoading(true);
    try {
      const [postsRes, pagesRes] = await Promise.all([
        api.posts({
          page: 1,
          size: POST_PAGE_SIZE,
          sort: 'new',
          ...(keyword ? { keyword, title_only: '1' } : {}),
        }),
        api.pages(),
      ]);
      setPosts(postsRes.posts || []);
      let nextPages = pagesRes.pages || [];
      if (keyword) {
        const q = keyword.toLowerCase();
        nextPages = nextPages.filter(
          p => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
        );
      }
      setPages(nextPages.slice(0, POST_PAGE_SIZE));
      setLoaded(true);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '加载站内内容失败');
      setLoaded(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadSiteHits(debouncedQuery);
  }, [open, debouncedQuery, loadSiteHits]);

  const hits: SiteHit[] = useMemo(() => {
    const postHits: SiteHit[] = posts.map(p => ({
      key: `post-${p.id}`,
      title: p.title,
      url: postPath(p.id, limits),
      kind: 'post',
    }));
    const pageHits: SiteHit[] = pages.map(p => ({
      key: `page-${p.slug}`,
      title: p.title,
      url: pagePath(p.slug, limits),
      kind: 'page',
    }));
    return [...postHits, ...pageHits];
  }, [posts, pages, limits]);

  const pickHit = (hit: SiteHit) => {
    setUrl(hit.url);
    setText(prev => (prev.trim() ? prev : hit.title));
  };

  const handleConfirm = () => {
    const nextUrl = url.trim();
    if (!nextUrl) {
      notify.warning('请输入网址');
      return;
    }
    if (!isValidLinkHref(nextUrl)) {
      notify.warning('请使用 http(s) 外链或本站以 / 开头的路径');
      return;
    }
    onConfirm({
      url: nextUrl,
      text: text.trim() || '链接文字',
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="article-link-dialog">
        <DialogHeader>
          <DialogTitle>插入或编辑链接</DialogTitle>
        </DialogHeader>

        <section className="article-link-dialog__section">
          <h3 className="article-link-dialog__section-title">输入目标 URL</h3>
          <div className="article-link-dialog__field">
            <Label htmlFor="article-link-url">网址</Label>
            <Input
              id="article-link-url"
              type="url"
              value={url}
              placeholder="https://… 或 /post/123"
              onChange={e => setUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
              autoFocus
            />
          </div>
          <div className="article-link-dialog__field">
            <Label htmlFor="article-link-text">链接文字</Label>
            <Input
              id="article-link-text"
              value={text}
              placeholder="显示在正文中的文字"
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleConfirm();
                }
              }}
            />
          </div>
        </section>

        <section className="article-link-dialog__section">
          <h3 className="article-link-dialog__section-title">或链接到站点中的内容</h3>
          <div className="article-link-dialog__field">
            <Label htmlFor="article-link-search">搜索</Label>
            <Input
              id="article-link-search"
              type="search"
              value={query}
              placeholder="搜索帖子或单页…"
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <div className="article-link-dialog__hits">
            <p className="article-link-dialog__hits-hint">
              {debouncedQuery
                ? `搜索「${debouncedQuery}」`
                : '未指定搜索条件。自动显示最近发布条目。'}
            </p>
            {loading && !loaded ? (
              <div className="article-link-dialog__hits-empty">
                <Loader2 size={18} className="article-link-dialog__spin" />
                <span>加载中…</span>
              </div>
            ) : !hits.length ? (
              <div className="article-link-dialog__hits-empty">暂无匹配内容</div>
            ) : (
              <ul className="article-link-dialog__hit-list">
                {hits.map(hit => (
                  <li key={hit.key}>
                    <button
                      type="button"
                      className={`article-link-dialog__hit${url === hit.url ? ' is-selected' : ''}`}
                      onClick={() => pickHit(hit)}
                    >
                      <span className="article-link-dialog__hit-title">{hit.title}</span>
                      <span className="article-link-dialog__hit-kind">
                        {hit.kind === 'post' ? '帖子' : '单页'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {loading && loaded ? (
              <div className="article-link-dialog__hits-loading">
                <Loader2 size={14} className="article-link-dialog__spin" />
              </div>
            ) : null}
          </div>
        </section>

        <DialogFooter className="article-link-dialog__footer">
          {editing && onRemove ? (
            <Button
              type="button"
              variant="outline"
              className="article-link-dialog__remove"
              onClick={() => {
                onRemove();
                onOpenChange(false);
              }}
            >
              移除链接
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleConfirm}>
            {editing ? '更新链接' : '添加链接'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
