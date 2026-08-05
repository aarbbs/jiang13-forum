import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award, Ban, BadgeCheck, MoreHorizontal, Search, Shield, UserCog,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { api } from '../../api/client';
import { useAdminGuard } from '../../layouts/AdminLayout';
import type { BadgeDef, User } from '../../api/types';
import { resolveUserLevel } from '../../utils/userMeta';
import { formatDateTime, formatTime } from '../../utils/content';
import { badgeIcon } from '../../utils/badgeIcons';

type FilterTab = 'all' | 'verified' | 'banned' | 'admin';

function fmtAbs(v?: string) {
  if (!v) return '—';
  return formatDateTime(v);
}

function fmtRel(v?: string) {
  if (!v) return '—';
  return formatTime(v);
}

function UserAvatar({ user }: { user: User }) {
  const initial = (user.nickname || user.username || '?').slice(0, 1).toUpperCase();
  if (user.avatar) {
    return <img src={user.avatar} alt="" className="admin-user-avatar" loading="lazy" decoding="async" />;
  }
  return <span className="admin-user-avatar admin-user-avatar--fallback" aria-hidden>{initial}</span>;
}

/** 后台用户管理：成员目录式列表 + 详情弹窗 */
export default function AdminUsersPage() {
  const nav = useNavigate();
  const { ready } = useAdminGuard();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [limitedBadges, setLimitedBadges] = useState<BadgeDef[]>([]);

  const [manageUser, setManageUser] = useState<User | null>(null);
  const [levelVal, setLevelVal] = useState(1);
  const [pointsDelta, setPointsDelta] = useState('10');
  const [pointsNote, setPointsNote] = useState('');
  const [badgeId, setBadgeId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [banTarget, setBanTarget] = useState<User | null>(null);

  const load = useCallback((p = 1, kw = search, f = filter) => {
    setLoading(true);
    api.adminUsers(p, { keyword: kw, filter: f })
      .then(d => {
        setUsers(d.users ?? []);
        setPage(d.page);
        setTotal(d.total);
        setTotalPages(d.total_pages);
      })
      .catch(e => notify.error(e.message))
      .finally(() => setLoading(false));
  }, [search, filter]);

  useEffect(() => {
    if (!ready) return;
    load(1, search, filter);
  }, [ready, filter]); // eslint-disable-line react-hooks/exhaustive-deps -- 鉴权与筛选变化时重载

  useEffect(() => {
    if (!ready) return;
    api.adminListBadges()
      .then(d => setLimitedBadges((d.badges ?? []).filter(b => b.kind === 'limited' && b.enabled)))
      .catch(() => {});
  }, [ready]);

  const openManage = (user: User) => {
    setManageUser(user);
    setLevelVal(resolveUserLevel(user));
    setPointsDelta('10');
    setPointsNote('');
    setBadgeId(limitedBadges[0]?.id ?? '');
  };

  const refreshManaged = async (patch?: Partial<User>) => {
    if (manageUser && patch) {
      setManageUser({ ...manageUser, ...patch });
    }
    load(page);
  };

  const toggleVerify = async (user: User) => {
    try {
      const r = await api.adminVerifyUser(user.id, !user.verified);
      notify.success(r.message);
      if (manageUser?.id === user.id) {
        setManageUser({ ...user, verified: r.verified });
      }
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const confirmBan = async () => {
    if (!banTarget) return;
    try {
      const r = await api.adminBanUser(banTarget.id, !banTarget.banned);
      notify.success(r.message);
      if (manageUser?.id === banTarget.id) {
        setManageUser({ ...banTarget, banned: r.banned });
      }
      setBanTarget(null);
      load(page);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    }
  };

  const saveLevel = async () => {
    if (!manageUser) return;
    if (!Number.isInteger(levelVal) || levelVal < 1 || levelVal > 10) {
      notify.warning('等级须为 1–10 的整数');
      return;
    }
    setSaving(true);
    try {
      const r = await api.adminSetUserLevel(manageUser.id, levelVal);
      notify.success(r.message);
      await refreshManaged({ level: r.level, exp: r.exp });
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const savePoints = async () => {
    if (!manageUser) return;
    const delta = Number(pointsDelta);
    if (!Number.isFinite(delta) || delta === 0) {
      notify.warning('请输入非零数字（正加负减）');
      return;
    }
    setSaving(true);
    try {
      const r = await api.adminAdjustPoints(manageUser.id, delta, pointsNote.trim() || undefined);
      notify.success(`${r.message}，余额 ${r.points}`);
      setPointsDelta('10');
      setPointsNote('');
      await refreshManaged({ points: r.points });
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const saveBadge = async () => {
    if (!manageUser) return;
    if (!badgeId) {
      notify.warning('请选择要颁发的限定徽章');
      return;
    }
    setSaving(true);
    try {
      const r = await api.adminAwardBadge(manageUser.id, Number(badgeId), false);
      notify.success(r.message);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const kw = keyword.trim();
    setSearch(kw);
    load(1, kw, filter);
  };

  const switchFilter = (f: FilterTab) => {
    setFilter(f);
    setPage(1);
  };

  if (!ready) return null;

  const filters: { key: FilterTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'verified', label: '已认证' },
    { key: 'banned', label: '已禁言' },
    { key: 'admin', label: '站长' },
  ];

  return (
    <div className="admin-page admin-users-page">
      <div className="admin-page-head">
        <h1>用户管理</h1>
        <p>查找成员并管理认证、等级与积分</p>
      </div>

      <div className="admin-users-panel">
        <div className="admin-users-panel-head">
          <form className="admin-users-search" onSubmit={onSearch}>
            <div className="admin-users-search-field">
              <Search size={16} aria-hidden className="admin-users-search-icon" />
              <Input
                value={keyword}
                onChange={e => setKeyword(e.target.value)}
                placeholder="搜索 ID、用户名、昵称或邮箱"
                aria-label="搜索用户"
              />
            </div>
            <Button type="submit" size="sm">搜索</Button>
            {search ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setKeyword('');
                  setSearch('');
                  load(1, '', filter);
                }}
              >
                清除
              </Button>
            ) : null}
          </form>

          <div className="admin-users-filters" role="tablist" aria-label="用户筛选">
            {filters.map(f => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                className={cn('admin-users-filter', filter === f.key && 'active')}
                onClick={() => switchFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Spinner size="lg" /></div>
        ) : users.length === 0 ? (
          <div className="admin-users-empty">
            {search || filter !== 'all' ? '没有符合条件的用户' : '暂无用户'}
          </div>
        ) : (
          <>
            <div className="admin-users-cols" aria-hidden>
              <span className="admin-users-cols-who">成员</span>
              <span>等级</span>
              <span>积分</span>
              <span>最近登录</span>
              <span className="admin-users-cols-action" />
            </div>
            <ul className="admin-users-list" aria-label="用户列表">
              {users.map(u => (
                <li
                  key={u.id}
                  className={cn('admin-users-row', u.banned && 'admin-users-row--banned')}
                >
                  <div className="admin-users-who">
                    <UserAvatar user={u} />
                    <div className="admin-users-who-text">
                      <div className="admin-users-who-line">
                        <button
                          type="button"
                          className="admin-user-nick"
                          onClick={() => nav(`/user/${u.id}`)}
                        >
                          {u.nickname}
                        </button>
                        {u.role === 'admin' && <Badge variant="orange">站长</Badge>}
                        {u.role !== 'admin' && u.verified && <Badge variant="green">认证</Badge>}
                        {u.banned && <Badge variant="destructive">禁言</Badge>}
                      </div>
                      <div className="admin-users-handle">@{u.username}</div>
                      {u.email?.trim() ? (
                        <div className="admin-users-mail" title={u.email}>{u.email}</div>
                      ) : null}
                    </div>
                  </div>

                  <div className="admin-users-metric" data-label="等级">
                    <span className="admin-users-metric-value">Lv.{resolveUserLevel(u)}</span>
                  </div>
                  <div className="admin-users-metric" data-label="积分">
                    <span className="admin-users-metric-value">{u.points ?? 0}</span>
                  </div>
                  <div
                    className="admin-users-metric admin-users-metric--time"
                    data-label="最近登录"
                    title={fmtAbs(u.last_login_at)}
                  >
                    <span className="admin-users-metric-value">{fmtRel(u.last_login_at)}</span>
                  </div>

                  <div className="admin-users-action">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="admin-users-manage-btn"
                          aria-label={`管理 ${u.nickname}`}
                        >
                          管理
                          <MoreHorizontal size={15} aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => openManage(u)}>
                          <UserCog size={14} aria-hidden />
                          账户详情
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => nav(`/user/${u.id}`)}>
                          查看主页
                        </DropdownMenuItem>
                        {u.role !== 'admin' && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => toggleVerify(u)}>
                              <BadgeCheck size={14} aria-hidden />
                              {u.verified ? '取消认证' : '设为认证'}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className={u.banned ? undefined : 'text-destructive focus:text-destructive'}
                              onClick={() => setBanTarget(u)}
                            >
                              <Ban size={14} aria-hidden />
                              {u.banned ? '解除禁言' : '禁言'}
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>

            <div className="admin-users-footer">
              <span className="admin-users-total">{total} 位成员</span>
              {totalPages > 1 && (
                <div className="admin-users-pager">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>
                    上一页
                  </Button>
                  <span>{page} / {totalPages}</span>
                  <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => load(page + 1)}>
                    下一页
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <Dialog open={!!manageUser} onOpenChange={open => { if (!open) setManageUser(null); }}>
        <DialogContent className="admin-user-manage-dialog sm:max-w-md">
          {manageUser && (
            <>
              <DialogHeader>
                <DialogTitle>账户详情</DialogTitle>
                <DialogDescription>
                  @{manageUser.username} · #{manageUser.id}
                </DialogDescription>
              </DialogHeader>

              <div className="admin-user-manage-head">
                <UserAvatar user={manageUser} />
                <div>
                  <div className="admin-user-manage-name">{manageUser.nickname}</div>
                  <div className="admin-user-email">{manageUser.email || '未填写邮箱'}</div>
                  <div className="admin-user-badges mt-1.5">
                    {manageUser.role === 'admin' && <Badge variant="orange">站长</Badge>}
                    {manageUser.role !== 'admin' && manageUser.verified && <Badge variant="green">认证</Badge>}
                    {manageUser.banned && <Badge variant="destructive">禁言</Badge>}
                    {manageUser.role !== 'admin' && !manageUser.verified && !manageUser.banned && (
                      <Badge variant="secondary">普通用户</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-user-manage-section">
                <div className="admin-user-manage-section-title">登录与注册</div>
                <dl className="admin-user-fact-grid">
                  <div>
                    <dt>上次登录</dt>
                    <dd title={fmtAbs(manageUser.last_login_at)}>{fmtRel(manageUser.last_login_at)}</dd>
                  </div>
                  <div>
                    <dt>登录 IP</dt>
                    <dd className="admin-table-mono">{manageUser.last_login_ip || '—'}</dd>
                  </div>
                  <div>
                    <dt>最近访问</dt>
                    <dd title={fmtAbs(manageUser.last_access_at)}>{fmtRel(manageUser.last_access_at)}</dd>
                  </div>
                  <div>
                    <dt>注册时间</dt>
                    <dd title={fmtAbs(manageUser.created_at)}>{fmtRel(manageUser.created_at)}</dd>
                  </div>
                </dl>
              </div>

              {manageUser.role !== 'admin' && (
                <div className="admin-user-manage-section">
                  <div className="admin-user-manage-section-title">
                    <Shield size={14} aria-hidden />
                    权限与状态
                  </div>
                  <div className="admin-user-manage-actions">
                    <Button size="sm" variant="outline" onClick={() => toggleVerify(manageUser)}>
                      <BadgeCheck size={14} aria-hidden />
                      {manageUser.verified ? '取消认证' : '设为认证'}
                    </Button>
                    <Button
                      size="sm"
                      variant={manageUser.banned ? 'outline' : 'destructive'}
                      onClick={() => setBanTarget(manageUser)}
                    >
                      <Ban size={14} aria-hidden />
                      {manageUser.banned ? '解除禁言' : '禁言'}
                    </Button>
                  </div>
                </div>
              )}

              <div className="admin-user-manage-section">
                <div className="admin-user-manage-section-title">
                  等级 · 当前 Lv.{resolveUserLevel(manageUser)}
                </div>
                <div className="admin-user-manage-row">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={levelVal}
                    onChange={e => setLevelVal(Number(e.target.value))}
                    aria-label="等级"
                  />
                  <Button size="sm" loading={saving} onClick={saveLevel}>保存</Button>
                </div>
                <p className="admin-user-manage-hint">经验 {manageUser.exp ?? 0}；调整等级会同步 Exp</p>
              </div>

              <div className="admin-user-manage-section">
                <div className="admin-user-manage-section-title">
                  积分 · 余额 {manageUser.points ?? 0}
                </div>
                <div className="admin-user-manage-row">
                  <Input
                    type="number"
                    value={pointsDelta}
                    onChange={e => setPointsDelta(e.target.value)}
                    placeholder="正加负减"
                    aria-label="积分变动"
                  />
                  <Button size="sm" loading={saving} onClick={savePoints}>调整</Button>
                </div>
                <Input
                  className="mt-2"
                  value={pointsNote}
                  onChange={e => setPointsNote(e.target.value)}
                  placeholder="备注（可选）"
                  aria-label="积分备注"
                />
              </div>

              <div className="admin-user-manage-section">
                <div className="admin-user-manage-section-title">
                  <Award size={14} aria-hidden />
                  限定徽章
                </div>
                {limitedBadges.length === 0 ? (
                  <p className="admin-user-manage-hint">暂无可用限定徽章，请先到「徽章管理」创建</p>
                ) : (
                  <div className="admin-user-manage-row">
                    <select
                      className="admin-user-select"
                      value={badgeId}
                      onChange={e => setBadgeId(e.target.value ? Number(e.target.value) : '')}
                      aria-label="选择徽章"
                    >
                      {limitedBadges.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.name}（{b.code}）
                        </option>
                      ))}
                    </select>
                    <Button size="sm" loading={saving} onClick={saveBadge}>颁发</Button>
                  </div>
                )}
                {badgeId !== '' && limitedBadges.find(b => b.id === badgeId) && (
                  <div className="admin-user-badge-preview">
                    {(() => {
                      const b = limitedBadges.find(x => x.id === badgeId)!;
                      const Icon = badgeIcon(b.icon);
                      return (
                        <>
                          <Icon size={16} aria-hidden />
                          <span>{b.name}</span>
                          <span className="admin-user-manage-hint">{b.description || b.code}</span>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setManageUser(null)}>关闭</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!banTarget} onOpenChange={open => { if (!open) setBanTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {banTarget?.banned ? '解除禁言' : '确认禁言'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {banTarget?.banned
                ? `确定解除对 ${banTarget?.nickname} 的禁言吗？`
                : `确定禁言 ${banTarget?.nickname}？被禁言用户将无法发帖与评论。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBan}>
              {banTarget?.banned ? '解除禁言' : '确认禁言'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
