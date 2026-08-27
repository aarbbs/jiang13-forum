import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import ArticleEditor from '../../components/ArticleEditor';
import UnsavedChangesDialog from '../../components/UnsavedChangesDialog';
import { notify } from '@/lib/notify';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import { useUnsavedChangesGuard } from '../../hooks/useUnsavedChangesGuard';
import { useNoIndexSEO } from '../../hooks/usePageSEO';
import { useForumLimits } from '../../hooks/useForumLimits';
import { invalidateSitePagesCache } from '../../hooks/useSitePages';
import { isHtmlEmpty } from '../../utils/postContent';
import { pagePath } from '../../utils/permalink';
import { cn } from '@/lib/utils';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

export type SitePageForm = {
  title: string;
  slug: string;
  content: string;
  published: boolean;
  sort_order: number;
  show_in_footer: boolean;
  show_in_nav: boolean;
};

const EMPTY_FORM: SitePageForm = {
  title: '',
  slug: '',
  content: '',
  published: true,
  sort_order: 0,
  show_in_footer: true,
  show_in_nav: false,
};

function slugifyAscii(title: string): string {
  const s = title.trim().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return s.slice(0, 64);
}

function isValidSlug(slug: string): boolean {
  const s = slug.trim();
  if (!s || s.length > 64) return false;
  return SLUG_RE.test(s);
}

function formSnapshot(f: SitePageForm): string {
  return JSON.stringify(f);
}

/** 后台：单页全屏编辑 */
export default function AdminSitePageEditPage() {
  const nav = useNavigate();
  const { id: idParam } = useParams();
  const { ready } = useAdminGuard();
  const { limits } = useForumLimits();
  const pageId = idParam ? Number(idParam) : NaN;
  const isNew = !idParam || Number.isNaN(pageId) || pageId <= 0;

  useNoIndexSEO(isNew ? '新建单页' : '编辑单页');

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SitePageForm>({ ...EMPTY_FORM });
  const [baseline, setBaseline] = useState(formSnapshot(EMPTY_FORM));
  const [slugTouched, setSlugTouched] = useState(false);

  const isDirty = formSnapshot(form) !== baseline;
  const { dialogOpen, stayOnPage, discardAndLeave, requestLeave, markSaved } = useUnsavedChangesGuard({ isDirty });

  const slugError = useMemo(() => {
    const slug = form.slug.trim();
    if (!slug) return '请填写 URL 路径（slug）';
    if (!isValidSlug(slug)) return '2–64 位小写字母、数字或连字符，且不能以连字符开头/结尾';
    return '';
  }, [form.slug]);

  const canPreview = isValidSlug(form.slug);

  useEffect(() => {
    if (!ready || isNew) return;
    setLoading(true);
    api.adminPage(pageId)
      .then(d => {
        const p = d.page;
        const next: SitePageForm = {
          title: p.title ?? '',
          slug: p.slug ?? '',
          content: p.content ?? '',
          published: !!p.published,
          sort_order: p.sort_order ?? 0,
          show_in_footer: p.show_in_footer ?? true,
          show_in_nav: !!p.show_in_nav,
        };
        setForm(next);
        setBaseline(formSnapshot(next));
        setSlugTouched(true);
      })
      .catch(e => {
        notify.error(e instanceof Error ? e.message : '加载失败');
        nav('/admin/pages', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [ready, isNew, pageId, nav]);

  const goBack = useCallback(() => {
    requestLeave(() => nav('/admin/pages'));
  }, [requestLeave, nav]);

  const preview = () => {
    if (!canPreview) {
      notify.warning('请先填写有效的 slug');
      return;
    }
    window.open(pagePath(form.slug.trim(), limits), '_blank', 'noopener,noreferrer');
  };

  const save = async () => {
    const title = form.title.trim();
    if (!title) {
      notify.warning('标题不能为空');
      return;
    }
    if (slugError) {
      notify.warning(slugError);
      return;
    }
    if (isHtmlEmpty(form.content)) {
      notify.warning('正文不能为空');
      return;
    }

    const payload = {
      title,
      slug: form.slug.trim(),
      content: form.content,
      published: form.published,
      sort_order: form.sort_order,
      show_in_footer: form.show_in_footer,
      show_in_nav: form.show_in_nav,
    };

    setSaving(true);
    try {
      if (isNew) {
        await api.adminCreatePage(payload);
        notify.success('单页已创建');
      } else {
        await api.adminUpdatePage(pageId, payload);
        notify.success('单页已更新');
      }
      invalidateSitePagesCache();
      setBaseline(formSnapshot({ ...form, ...payload, title, slug: payload.slug }));
      markSaved();
      nav('/admin/pages');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  if (!ready) return null;

  if (loading) {
    return (
      <div className="admin-site-page-edit admin-site-page-edit--loading">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="admin-site-page-edit">
      <header className="admin-site-page-edit__header">
        <div className="admin-site-page-edit__header-left">
          <button type="button" className="compose-back" onClick={goBack}>
            <ArrowLeft size={16} aria-hidden />
            <span>返回列表</span>
          </button>
          <h1 className="admin-site-page-edit__title">{isNew ? '新建单页' : '编辑单页'}</h1>
        </div>
        <div className="admin-site-page-edit__header-actions">
          <Button type="button" variant="outline" size="sm" onClick={preview} disabled={!canPreview}>
            <ExternalLink size={14} aria-hidden />
            预览
          </Button>
        </div>
      </header>

      <section className="admin-site-page-edit__meta" aria-label="单页设置">
        <div className="admin-site-page-edit__meta-grid">
          <div className="admin-site-page-edit__field">
            <Label htmlFor="site-page-title">标题</Label>
            <Input
              id="site-page-title"
              value={form.title}
              onChange={(e) => {
                const title = e.target.value;
                setForm(f => {
                  const next = { ...f, title };
                  if (!slugTouched && !f.slug.trim()) {
                    const auto = slugifyAscii(title);
                    if (auto) next.slug = auto;
                  }
                  return next;
                });
              }}
              placeholder="关于我们"
            />
          </div>
          <div className="admin-site-page-edit__field">
            <Label htmlFor="site-page-slug">Slug（URL 路径）</Label>
            <Input
              id="site-page-slug"
              value={form.slug}
              onChange={(e) => {
                setSlugTouched(true);
                setForm(f => ({ ...f, slug: e.target.value.trim().toLowerCase() }));
              }}
              placeholder="about-us"
              spellCheck={false}
              aria-invalid={!!slugError && !!form.slug.trim()}
            />
            <p className={cn('admin-site-page-edit__hint', slugError && form.slug.trim() && 'admin-site-page-edit__hint--error')}>
              {slugError && form.slug.trim() ? slugError : '访问路径：/page/your-slug · 2–64 位小写/数字/连字符'}
            </p>
          </div>
          <div className="admin-site-page-edit__field admin-site-page-edit__field--narrow">
            <Label htmlFor="site-page-sort">排序权重</Label>
            <Input
              id="site-page-sort"
              type="number"
              value={form.sort_order}
              onChange={(e) => setForm(f => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
            />
          </div>
        </div>
        <div className="admin-site-page-edit__switches">
          <label className="admin-site-page-edit__switch">
            <Switch checked={form.published} onCheckedChange={v => setForm(f => ({ ...f, published: v }))} />
            <span>发布</span>
          </label>
          <label className="admin-site-page-edit__switch">
            <Switch checked={form.show_in_footer} onCheckedChange={v => setForm(f => ({ ...f, show_in_footer: v }))} />
            <span>页脚展示</span>
          </label>
          <label className="admin-site-page-edit__switch">
            <Switch checked={form.show_in_nav} onCheckedChange={v => setForm(f => ({ ...f, show_in_nav: v }))} />
            <span>侧栏导航</span>
          </label>
        </div>
      </section>

      <div className="admin-site-page-edit__body">
        <div className="admin-site-page-edit__shell">
          <ArticleEditor
            value={form.content}
            onChange={html => setForm(f => ({ ...f, content: html }))}
            placeholder="撰写单页正文…"
            enableContentGates={false}
          />
        </div>
      </div>

      <footer className="admin-site-page-edit__footer">
        <Button type="button" variant="outline" onClick={goBack}>取消</Button>
        <Button type="button" disabled={saving} onClick={save}>
          <Save size={16} aria-hidden />
          {saving ? '保存中…' : '保存'}
        </Button>
      </footer>

      <UnsavedChangesDialog
        open={dialogOpen}
        onStay={stayOnPage}
        onLeave={discardAndLeave}
      />
    </div>
  );
}
