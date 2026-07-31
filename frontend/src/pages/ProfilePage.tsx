import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Camera, LayoutDashboard, Settings, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { useForumLimits } from '../hooks/useForumLimits';
import AvatarCropDialog from '../components/AvatarCropDialog';
import { AVATAR_ACCEPT, validateAvatarFile } from '../utils/avatarCrop';
import { loginPath } from '../utils/authRedirect';

const nickSchema = z.object({
  nickname: z.string().min(1, '请输入昵称').max(64),
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
type PwdValues = z.infer<ReturnType<typeof pwdSchema>>;

export default function ProfilePage() {
  const nav = useNavigate();
  const { user, loading: authLoading, refresh } = useAuth();
  const [nickLoading, setNickLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [pendingAvatar, setPendingAvatar] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropFileName, setCropFileName] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const { limits } = useForumLimits();

  const nickForm = useForm<NickValues>({
    resolver: zodResolver(nickSchema),
    values: { nickname: user?.nickname ?? '' },
  });

  const pwdForm = useForm<PwdValues>({
    resolver: zodResolver(pwdSchema(limits.password_min_len)),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  });

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
    const err = validateAvatarFile(file, limits.avatar_max_mb);
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

  const displayAvatar = avatarPreview ?? user.avatar;

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
              <h1 className="profile-display-name">{user.nickname}</h1>
              <div className="profile-username">@{user.username}</div>
              <p className="profile-avatar-tip">点击头像选择图片，或拖拽到此处</p>
              {user.role === 'admin' && <Badge variant="green" className="mt-1.5">管理员</Badge>}
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
        </div>

        <AvatarCropDialog
          open={cropOpen}
          imageSrc={cropImageSrc}
          fileName={cropFileName}
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

        <div className="section-card">
          <div className="section-card-title">基本资料</div>
          <Form {...nickForm}>
            <form onSubmit={nickForm.handleSubmit(onUpdateNick)} className="profile-form">
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
                  支持 JPG、PNG、GIF、WebP，头像不超过 {limits.avatar_max_mb}MB
                </span>
                <Button type="submit" loading={nickLoading}>保存</Button>
              </div>
            </form>
          </Form>
        </div>

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
      </div>
    </div>
  );
}
