import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  Camera,
  Check,
  Copy,
  FileText,
  Hash,
  Heart,
  LayoutDashboard,
  MessageCircle,
  PenLine,
  Settings,
  Star,
  Upload,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import type { PostItem, UserActivityStats } from '../api/types';
import { useForumLimits } from '../hooks/useForumLimits';
import AvatarCropDialog from '../components/AvatarCropDialog';
import PostListItem from '../components/PostListItem';
import FeedPagination from '../components/FeedPagination';
import { AVATAR_ACCEPT, validateAvatarFile } from '../utils/avatarCrop';
import { loginPath } from '../utils/authRedirect';
import { openForumPost } from '../utils/openPost';
import { formatDateTime } from '../utils/content';
import { userPath } from '../utils/userPath';

const nickSchema = z.object({
  nickname: z.string().min(1, '请输入昵称').max(64),
});

const sigSchema = (maxLen: number) => z.object({
  signature: z.string().max(maxLen > 0 ? maxLen : 512, `签名不能超过 ${maxLen || 512} 字`),
});

const pwdSchema = (minLen: number) => z.object({
  old_password: z.string().min(1, '请输入当前密码'),
  new_password: z.string().min(minLen, `新密码至少 ${minLen} 位`),
  confirm_password: z.string().min(1, '请确认新密码'),
}).refine(d => d.new_password === d.confirm_password, {
  message: '两次输入的新密码不一致',
  path: ['confirm_password'],
});

type NickValues = z.infer<typeof nickSchema>;
type SigValues = z.infer<ReturnType<typeof sigSchema>>;
type PwdValues = z.infer<ReturnType<typeof pwdSchema>>;
type ProfileTab = 'posts' | 'settings' | 'security';

function parseTab(raw: string | null): ProfileTab {
  if (raw === 'settings' || raw === 'security' || raw === 'posts') return raw;
  return 'posts';
}

export default function ProfilePage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = parseTab(params.get('tab'));
  const { user, loading: authLoading, refresh } = useAuth();
  const [nickLoading, setNickLoading] = useState(false);
  const [sigLoading, setSigLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [idCopied, setIdCopied] = useState(false);
  const [stats, setStats] = useState<UserActivityStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [postPage, setPostPage] = useState(1);
  const [postTotal, setPostTotal] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>();

  const { limits } = useForumLimits();
  const pageSize = limits.page_size_default > 0 ? limits.page_size_default : 20;
  const totalPages = Math.max(1, Math.ceil(postTotal / pageSize));

  const nickForm = useForm<NickValues>({
    resolver: zodResolver(nickSchema),
    values: { nickname: user?.nickname ?? '' },
  });

  const sigMax = limits.signature_max > 0 ? limits.signature_max : 200;
  const sigForm = useForm<SigValues>({
    resolver: zodResolver(sigSchema(sigMax)),
    values: { signature: user?.signature ?? '' },
  });

  const pwdForm = useForm<PwdValues>({
    resolver: zodResolver(pwdSchema(limits.password_min_len)),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  });

  const setTab = (next: ProfileTab) => {
    const nextParams = new URLSearchParams(params);
    if (next === 'posts') nextParams.delete('tab');
    else nextParams.set('tab', next);
    setParams(nextParams, { replace: true });
  };

  useEffect(() => {
    if (!authLoading && !user) {
      nav(loginPath('/profile'));
    }
  }, [authLoading, user, nav]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    return () => {
      if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    };
  }, [cropImageSrc]);

  useEffect(() => () => {
    if (copyTimer.current) clearTimeout(copyTimer.current);
  }, []);

  const loadStats = useCallback(() => {
    setStatsLoading(true);
    api.profileStats()
      .then(d => setStats(d.stats))
      .catch(() => setStats(null))
      .finally(() => setStatsLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadStats();
  }, [user, loadStats]);

  useEffect(() => {
    if (!user || tab !== 'posts') return;
    let cancelled = false;
    setPostsLoading(true);
    api.posts({ user_id: user.id, page: postPage, size: pageSize, sort: 'latest' })
      .then(d => {
        if (cancelled) return;
        setPosts(Array.isArray(d.posts) ? d.posts : []);
        setPostTotal(d.total ?? 0);
      })
      .catch(e => {
        if (!cancelled) notify.error(e instanceof Error ? e.message : '加载帖子失败');
      })
      .finally(() => {
        if (!cancelled) setPostsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user, tab, postPage, pageSize]);

  const closeCropDialog = useCallback((open: boolean) => {
    if (!open) {
      setCropOpen(false);
      setCropImageSrc(prev => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setCropFileName('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, []);

  if (authLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>;
  }

  if (!user) return null;

  const onUpdateNick = async (values: NickValues) => {
    setNickLoading(true);
    try {
      await api.updateNickname(values.nickname);
      await refresh();
      notify.success('昵称已更新');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '更新失败');
    } finally {
      setNickLoading(false);
    }
  };

  const onUpdateSig = async (values: SigValues) => {
    setSigLoading(true);
    try {
      await api.updateSignature(values.signature);
      await refresh();
      notify.success('签名已更新');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '更新失败');
    } finally {
      setSigLoading(false);
    }
  };

  const onUpdatePwd = async (values: PwdValues) => {
    setPwdLoading(true);
    try {
      await api.updatePassword(values.old_password, values.new_password);
      notify.success('密码已修改，请重新登录');
      pwdForm.reset();
      await api.logout();
      nav('/login');
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '修改失败');
    } finally {
      setPwdLoading(false);
    }
  };

  const clearPendingAvatar = () => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setPendingAvatar(null);
    setAvatarPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const openCropForFile = (file: File) => {
    const err = validateAvatarFile(file);
    if (err) {
      notify.error(err);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (cropImageSrc) URL.revokeObjectURL(cropImageSrc);
    setCropFileName(file.name);
    setCropImageSrc(URL.createObjectURL(file));
    setCropOpen(true);
  };

  const onAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) openCropForFile(file);
  };

  const onCropConfirm = (file: File) => {
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setPendingAvatar(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const onSaveAvatar = async () => {
    if (!pendingAvatar) return;
    setAvatarLoading(true);
    try {
      await api.uploadAvatar(pendingAvatar);
      await refresh();
      clearPendingAvatar();
      notify.success('头像已更新');
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setAvatarLoading(false);
    }
  };

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.types.includes('Files')) {
      setDragOver(true);
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      setDragOver(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setDragOver(false);
    if (avatarLoading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) openCropForFile(file);
  };

  const copyUserId = async () => {
    try {
      await navigator.clipboard.writeText(String(user.id));
      setIdCopied(true);
      notify.success('已复制用户 ID');
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setIdCopied(false), 1600);
    } catch {
      notify.error('复制失败，请手动选择');
    }
  };

  const displayAvatar = avatarPreview ?? user.avatar;
  const joinedAt = user.created_at ? formatDateTime(user.created_at) : '';

  const tabs: { key: ProfileTab; label: string; count?: number }[] = [
    { key: 'posts', label: '我的帖子', count: stats?.post_count },
    { key: 'settings', label: '资料设置' },
    { key: 'security', label: '安全设置' },
  ];

  return (
    <div className="page-wrap">
      <div className="page-inner-wide page-inner-wide--profile">
        <Button variant="ghost" className="mb-3" onClick={() => nav(-1)}>
          <ArrowLeft />
          返回
        </Button>
        <h1 className="page-title mb-4">个人中心</h1>

        <div
          className={`profile-header-card${dragOver ? ' profile-header-card--dragover' : ''}`}
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
        >
          {dragOver && (
            <div className="profile-drop-overlay">
              <Upload size={28} strokeWidth={1.5} />
              <span>松开以上传头像</span>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept={AVATAR_ACCEPT}
            className="sr-only"
            onChange={onAvatarSelect}
          />
          <button
            type="button"
            className="profile-avatar-btn"
            title="点击或拖拽图片到此处更换头像"
            disabled={avatarLoading}
            onClick={() => fileRef.current?.click()}
          >
            <div className={`profile-avatar-lg${pendingAvatar ? ' profile-avatar-lg--pending' : ''}`}>
              {displayAvatar
                ? <img src={displayAvatar} alt="" loading="lazy" decoding="async" />
                : user.nickname[0]}
              <span className="profile-avatar-overlay">
                {avatarLoading
                  ? <Spinner size="sm" className="text-white" />
                  : <Camera size={22} strokeWidth={1.75} />}
              </span>
            </div>
          </button>

          <div className="profile-header-info">
            <div className="profile-header-main">
              <div className="profile-name-row">
                <h2 className="profile-display-name">{user.nickname}</h2>
                {user.role === 'admin' && <Badge variant="green">管理员</Badge>}
              </div>
              <div className="profile-username">@{user.username}</div>
              <div className="profile-id-row">
                <span className="profile-id-chip" title="用户 ID">
                  <Hash size={13} aria-hidden />
                  UID {user.id}
                </span>
                <button
                  type="button"
                  className="profile-id-copy"
                  onClick={copyUserId}
                  aria-label="复制用户 ID"
                >
                  {idCopied ? <Check size={14} /> : <Copy size={14} />}
                  {idCopied ? '已复制' : '复制'}
                </button>
                <button
                  type="button"
                  className="profile-id-copy"
                  onClick={() => nav(userPath(user.id))}
                >
                  公开主页
                </button>
              </div>
              {user.signature?.trim() ? (
                <p className="profile-signature">{user.signature}</p>
              ) : (
                <p className="profile-signature profile-signature--empty">尚未设置签名</p>
              )}
              <dl className="profile-meta-list">
                <div>
                  <dt>用户名</dt>
                  <dd>{user.username}</dd>
                </div>
                <div>
                  <dt>邮箱</dt>
                  <dd>{user.email || '未设置'}</dd>
                </div>
                {joinedAt && (
                  <div>
                    <dt>注册时间</dt>
                    <dd>{joinedAt}</dd>
                  </div>
                )}
              </dl>
              <p className="profile-avatar-tip">点击头像选择图片，或拖拽到此处更换</p>
            </div>
            {pendingAvatar && (
              <div className="profile-avatar-actions">
                <span className="profile-avatar-hint">已裁剪，待保存</span>
                <Button size="sm" loading={avatarLoading} onClick={onSaveAvatar}>
                  保存头像
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={avatarLoading}
                  onClick={clearPendingAvatar}
                  aria-label="取消"
                >
                  <X size={16} />
                </Button>
              </div>
            )}
          </div>

          <div className="profile-stat-grid" aria-label="活动统计">
            <button type="button" className="profile-stat" onClick={() => setTab('posts')}>
              <FileText size={16} aria-hidden />
              <strong>{statsLoading ? '—' : (stats?.post_count ?? 0)}</strong>
              <span>帖子</span>
            </button>
            <div className="profile-stat">
              <MessageCircle size={16} aria-hidden />
              <strong>{statsLoading ? '—' : (stats?.comment_count ?? 0)}</strong>
              <span>评论</span>
            </div>
            <button type="button" className="profile-stat" onClick={() => nav('/favorites')}>
              <Star size={16} aria-hidden />
              <strong>{statsLoading ? '—' : (stats?.favorite_count ?? 0)}</strong>
              <span>收藏</span>
            </button>
            <div className="profile-stat">
              <Heart size={16} aria-hidden />
              <strong>{statsLoading ? '—' : (stats?.like_received ?? 0)}</strong>
              <span>获赞</span>
            </div>
          </div>
        </div>

        <AvatarCropDialog
          open={cropOpen}
          imageSrc={cropImageSrc}
          fileName={cropFileName}
          maxMb={limits.avatar_max_mb}
          onOpenChange={closeCropDialog}
          onConfirm={onCropConfirm}
        />

        {user.role === 'admin' && (
          <div className="section-card admin-entry-card">
            <div className="section-card-title">管理员入口</div>
            <p className="admin-entry-desc">
              管理板块、用户、帖子及系统设置
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => nav('/admin/boards')}>
                <Settings />
                管理板块
              </Button>
              <Button onClick={() => nav('/admin/dashboard')}>
                <LayoutDashboard />
                进入系统后台
              </Button>
            </div>
          </div>
        )}

        <div className="profile-tabs" role="tablist" aria-label="个人中心分区">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              className={`profile-tab${tab === t.key ? ' active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {typeof t.count === 'number' && (
                <span className="profile-tab-count">{t.count}</span>
              )}
            </button>
          ))}
        </div>

        {tab === 'posts' && (
          <div className="profile-panel">
            {postsLoading ? (
              <div className="flex justify-center py-12"><Spinner size="lg" /></div>
            ) : posts.length === 0 ? (
              <div className="empty-state">
                <PenLine className="empty-state-icon" aria-hidden size={36} strokeWidth={1.5} />
                <p>还没有发布过帖子</p>
                <Button onClick={() => nav('/compose')}>去发帖</Button>
              </div>
            ) : (
              <>
                <div className="content-surface">
                  {posts.map(post => (
                    <PostListItem
                      key={post.id}
                      post={post}
                      onSelect={(id) => openForumPost(nav, id, limits.open_posts_in_new_tab)}
                    />
                  ))}
                </div>
                {totalPages > 1 && (
                  <FeedPagination
                    page={postPage}
                    totalPages={totalPages}
                    postTotal={postTotal}
                    loading={postsLoading}
                    onPageChange={setPostPage}
                  />
                )}
              </>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="section-card">
            <div className="section-card-title">基本资料</div>
            <Form {...nickForm}>
              <form onSubmit={nickForm.handleSubmit(onUpdateNick)} className="profile-form">
                <FormItem>
                  <FormLabel>用户 ID</FormLabel>
                  <FormControl>
                    <Input value={String(user.id)} disabled />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl>
                    <Input value={user.username} disabled />
                  </FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>邮箱</FormLabel>
                  <FormControl>
                    <Input value={user.email || '未设置'} disabled />
                  </FormControl>
                </FormItem>
                <FormField
                  control={nickForm.control}
                  name="nickname"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>昵称</FormLabel>
                      <FormControl>
                        <Input maxLength={64} placeholder="显示名称" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="profile-form-footer">
                  <span className="profile-form-hint">
                    用户名与 ID 不可修改；头像支持 JPG / PNG / GIF / WebP，裁剪后不超过 {limits.avatar_max_mb}MB
                  </span>
                  <Button type="submit" loading={nickLoading}>保存昵称</Button>
                </div>
              </form>
            </Form>

            <div className="profile-form-divider" />

            <Form {...sigForm}>
              <form onSubmit={sigForm.handleSubmit(onUpdateSig)} className="profile-form">
                <FormField
                  control={sigForm.control}
                  name="signature"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>个人签名</FormLabel>
                      <FormControl>
                        <Textarea
                          rows={3}
                          maxLength={sigMax}
                          placeholder="写一句介绍自己的话，会显示在公开主页"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="profile-form-footer">
                  <span className="profile-form-hint">
                    {(sigForm.watch('signature') || '').length}/{sigMax}
                  </span>
                  <Button type="submit" loading={sigLoading}>保存签名</Button>
                </div>
              </form>
            </Form>
          </div>
        )}

        {tab === 'security' && (
          <div className="section-card">
            <div className="section-card-title">修改密码</div>
            <Form {...pwdForm}>
              <form onSubmit={pwdForm.handleSubmit(onUpdatePwd)} className="profile-form">
                <FormField
                  control={pwdForm.control}
                  name="old_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>当前密码</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="输入当前密码" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pwdForm.control}
                  name="new_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>新密码</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder={`至少 ${limits.password_min_len} 位`} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={pwdForm.control}
                  name="confirm_password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>确认新密码</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="再次输入新密码" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="profile-form-footer profile-form-footer--end">
                  <Button type="submit" variant="destructive" loading={pwdLoading}>
                    修改密码
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        )}
      </div>
    </div>
  );
}
