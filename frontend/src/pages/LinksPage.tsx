import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Link2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import type { FriendLink, FriendLinkApply } from '../api/types';
import { useAuth } from '../hooks/useAuth';
import { joinSEOKeywords, usePageSEO } from '../hooks/usePageSEO';
import { getCachedSiteBranding, invalidateSiteBrandingCache, useSiteBranding } from '../hooks/useSiteBranding';
import { formatTime } from '../utils/content';
import { loginPath } from '../utils/authRedirect';
import { resolveFriendLinkLogo, isReciprocalChecking, reciprocalStatusLabel } from '../utils/friendLink';
import { InFlowSiteFooter } from '../components/SiteFooter';
import FriendLinkApplyDialog from '../components/FriendLinkApplyDialog';

function applyStatusBadge(status: FriendLinkApply['status']) {
  switch (status) {
    case 'pending':
      return <Badge variant="orange">待审核</Badge>;
    case 'approved':
      return <Badge variant="green">已通过</Badge>;
    case 'rejected':
      return <Badge variant="secondary">已拒绝</Badge>;
    default:
      return null;
  }
}

function linkInitial(name: string): string {
  const t = name.trim();
  return t ? t.charAt(0).toUpperCase() : '?';
}

/** 友情链接独立页面：展示友链、申请与管理自己的申请 */
export default function LinksPage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const { branding } = useSiteBranding();
  const { user } = useAuth();
  const [applyOpen, setApplyOpen] = useState(false);
  const [editApply, setEditApply] = useState<FriendLinkApply | null>(null);
  const [myApplies, setMyApplies] = useState<FriendLinkApply[]>([]);
  const [myLoading, setMyLoading] = useState(false);
  const [cancelingId, setCancelingId] = useState<number | null>(null);

  usePageSEO({
    title: '友情链接',
    description: `${branding.name} 的友情链接与申请入口`,
    keywords: joinSEOKeywords('友情链接', getCachedSiteBranding().keywords),
    canonicalPath: '/links',
  });

  const friendLinks = (branding.friend_links ?? []).filter(
    (l: FriendLink) => l.name?.trim() && l.url?.trim(),
  );

  const loadMyApplies = useCallback(() => {
    if (!user) {
      setMyApplies([]);
      return;
    }
    setMyLoading(true);
    api.myFriendLinkApplies()
      .then(r => setMyApplies(r.applies ?? []))
      .catch(e => notify.error(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setMyLoading(false));
  }, [user]);

  useEffect(() => {
    loadMyApplies();
  }, [loadMyApplies]);

  useEffect(() => {
    if (!user || !myApplies.some(isReciprocalChecking)) return;
    const timer = window.setInterval(loadMyApplies, 3000);
    return () => window.clearInterval(timer);
  }, [user, myApplies, loadMyApplies]);

  useEffect(() => {
    if (params.get('apply') === '1') {
      if (!user) {
        nav(loginPath('/links?apply=1'));
        return;
      }
      setApplyOpen(true);
      const next = new URLSearchParams(params);
      next.delete('apply');
      setParams(next, { replace: true });
    }
  }, [params, setParams, user, nav]);

  const openApply = () => {
    if (!user) {
      nav(loginPath('/links?apply=1'));
      return;
    }
    setEditApply(null);
    setApplyOpen(true);
  };

  const openEditApply = (apply: FriendLinkApply) => {
    setEditApply(apply);
    setApplyOpen(true);
  };

  const handleApplyOpenChange = (open: boolean) => {
    setApplyOpen(open);
    if (!open) setEditApply(null);
  };

  const onApplySubmitted = useCallback(() => {
    loadMyApplies();
    invalidateSiteBrandingCache();
  }, [loadMyApplies]);

  const cancelApply = async (apply: FriendLinkApply) => {
    if (apply.status !== 'pending') return;
    setCancelingId(apply.id);
    try {
      const r = await api.cancelFriendLinkApply(apply.id);
      notify.success(r.message);
      loadMyApplies();
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '撤销失败');
    } finally {
      setCancelingId(null);
    }
  };
  return (
    <div className="page-wrap">
      <div className="page-inner-wide">
        <Button variant="ghost" className="mb-3" onClick={() => nav('/')}>
          <ArrowLeft />
          返回
        </Button>

        <div className="links-page-head">
          <div>
            <h1 className="page-title">友情链接</h1>
            <p className="page-desc">
              与本站互链的站点列表
              {friendLinks.length > 0 ? ` · 共 ${friendLinks.length} 个` : ''}
            </p>
          </div>
          <Button type="button" onClick={openApply}>
            <Plus size={16} aria-hidden />
            申请友链
          </Button>
        </div>

        {friendLinks.length === 0 ? (
          <div className="empty-state links-page-empty">
            <Link2 className="empty-state-icon" aria-hidden size={36} strokeWidth={1.5} />
            <p>暂无友情链接</p>
            <p className="page-desc" style={{ marginTop: 8 }}>
              注册登录后可提交申请，审核通过后将展示在此页
            </p>
          </div>
        ) : (
          <div className="links-page-board">
            <div className="links-page-grid">
              {friendLinks.map(link => {
                const logoURL = resolveFriendLinkLogo(link.logo, branding.site_url);
                return (
                  <a
                    key={`${link.name}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="links-page-card"
                    title={link.name}
                  >
                    <div className="links-page-card__logo">
                      {logoURL ? (
                        <img src={logoURL} alt="" loading="lazy" decoding="async" />
                      ) : (
                        <span>{linkInitial(link.name)}</span>
                      )}
                    </div>
                    <strong className="links-page-card__name">{link.name}</strong>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {user && (
          <section className="links-page-my" aria-label="我的友链申请">
            <h2 className="links-page-my__title">我的申请</h2>
            {myLoading ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : myApplies.length === 0 ? (
              <p className="links-page-my__empty">你还没有提交过友链申请</p>
            ) : (
              <div className="links-page-my-list">
                {myApplies.map(apply => (
                  <div key={apply.id} className="links-page-my-row">
                    {apply.logo?.trim() && (
                      <div className="links-page-my-row__logo">
                        <img src={resolveFriendLinkLogo(apply.logo, branding.site_url)} alt="" loading="lazy" decoding="async" />
                      </div>
                    )}
                    <div className="links-page-my-row__main">
                      <div className="links-page-my-row__title">
                        <strong>{apply.name}</strong>
                        {applyStatusBadge(apply.status)}
                      </div>
                      <a href={apply.url} target="_blank" rel="noopener noreferrer" className="links-page-my-row__url">
                        {apply.url}
                      </a>
                      {apply.status === 'rejected' && apply.review_note?.trim() && (
                        <p className="links-page-my-row__note">拒绝原因：{apply.review_note}</p>
                      )}
                      {apply.status === 'pending' && (
                        <p className="links-page-my-row__note">
                          回链检测：{reciprocalStatusLabel(apply).text}
                        </p>
                      )}
                      {apply.status === 'approved' && (
                        <p className="links-page-my-row__note">修改后将重新进入审核，友链会暂时从列表移除</p>
                      )}
                      <p className="links-page-my-row__meta">{formatTime(apply.created_at)}</p>
                    </div>
                    {apply.status === 'pending' && (
                      <div className="links-page-my-row__actions">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEditApply(apply)}
                        >
                          <Pencil size={14} aria-hidden />
                          修改
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={cancelingId === apply.id}
                          onClick={() => cancelApply(apply)}
                        >
                          <Trash2 size={14} aria-hidden />
                          撤销
                        </Button>
                      </div>
                    )}
                    {apply.status === 'rejected' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEditApply(apply)}
                      >
                        <Pencil size={14} aria-hidden />
                        修改并重新提交
                      </Button>
                    )}
                    {apply.status === 'approved' && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openEditApply(apply)}
                      >
                        <Pencil size={14} aria-hidden />
                        修改
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {!user && (
          <p className="links-page-login-hint">
            <Link to={loginPath('/links')}>登录</Link>
            或
            <Link to="/register">注册</Link>
            后可申请友链并管理自己的申请
          </p>
        )}

        <InFlowSiteFooter />
      </div>

      <FriendLinkApplyDialog
        open={applyOpen}
        onOpenChange={handleApplyOpenChange}
        editApply={editApply}
        onSubmitted={onApplySubmitted}
      />
    </div>
  );
}
