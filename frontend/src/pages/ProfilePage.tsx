import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, LayoutDashboard, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';
import { notify } from '@/lib/notify';
import { useAuth } from '../hooks/useAuth';
import { api } from '../api/client';
import { openAdminDashboard } from '../utils/admin';

const nickSchema = z.object({
  nickname: z.string().min(1, '请输入昵称').max(64),
});

const pwdSchema = z.object({
  old_password: z.string().min(1, '请输入当前密码'),
  new_password: z.string().min(6, '新密码至少 6 位'),
  confirm_password: z.string().min(1, '请确认新密码'),
}).refine(d => d.new_password === d.confirm_password, {
  message: '两次输入的新密码不一致',
  path: ['confirm_password'],
});

type NickValues = z.infer<typeof nickSchema>;
type PwdValues = z.infer<typeof pwdSchema>;

export default function ProfilePage() {
  const nav = useNavigate();
  const { user, loading: authLoading, refresh } = useAuth();
  const [nickLoading, setNickLoading] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const nickForm = useForm<NickValues>({
    resolver: zodResolver(nickSchema),
    values: { nickname: user?.nickname ?? '' },
  });

  const pwdForm = useForm<PwdValues>({
    resolver: zodResolver(pwdSchema),
    defaultValues: { old_password: '', new_password: '', confirm_password: '' },
  });

  useEffect(() => {
    if (!authLoading && !user) {
      nav('/login');
    }
  }, [authLoading, user, nav]);

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

  const onAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      notify.error('头像不能超过 2MB');
      return;
    }
    setAvatarLoading(true);
    try {
      await api.uploadAvatar(file);
      await refresh();
      notify.success('头像已更新');
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : '上传失败');
    } finally {
      setAvatarLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="page-wrap">
      <div className="page-inner-wide" style={{ maxWidth: 640 }}>
        <Button variant="ghost" className="mb-3" onClick={() => nav(-1)}>
          <ArrowLeft />
          返回
        </Button>

        <div className="profile-header">
          <div className="profile-avatar-lg">
            {user.avatar ? <img src={user.avatar} alt="" /> : user.nickname[0]}
          </div>
          <div>
            <h1 className="page-title" style={{ marginBottom: 4 }}>{user.nickname}</h1>
            <div style={{ fontSize: 13, color: 'var(--color-text-3)' }}>@{user.username}</div>
            {user.role === 'admin' && <Badge variant="green" className="mt-1.5">管理员</Badge>}
          </div>
        </div>

        {user.role === 'admin' && (
          <div className="section-card admin-entry-card">
            <div className="section-card-title">管理员入口</div>
            <p style={{ fontSize: 13, color: 'var(--color-text-3)', margin: '0 0 12px' }}>
              管理板块、用户、帖子及系统设置
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => nav('/boards')}>
                <Settings />
                管理板块
              </Button>
              <Button onClick={openAdminDashboard}>
                <LayoutDashboard />
                进入系统后台
              </Button>
            </div>
          </div>
        )}

        <div className="section-card">
          <div className="section-card-title">基本资料</div>
          <Form {...nickForm}>
            <form onSubmit={nickForm.handleSubmit(onUpdateNick)} className="space-y-4">
              <FormItem>
                <FormLabel>用户名</FormLabel>
                <FormControl>
                  <Input value={user.username} disabled />
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
              <Button type="submit" loading={nickLoading}>保存昵称</Button>
            </form>
          </Form>
        </div>

        <div className="section-card">
          <div className="section-card-title">头像</div>
          <p style={{ fontSize: 13, color: 'var(--color-text-3)', margin: '0 0 12px' }}>
            支持 JPG、PNG、GIF、WebP，不超过 2MB
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            style={{ display: 'none' }}
            onChange={onAvatarChange}
          />
          <Button variant="outline" loading={avatarLoading} onClick={() => fileRef.current?.click()}>
            选择图片上传
          </Button>
        </div>

        <div className="section-card">
          <div className="section-card-title">修改密码</div>
          <Form {...pwdForm}>
            <form onSubmit={pwdForm.handleSubmit(onUpdatePwd)} className="space-y-4">
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
                      <Input type="password" placeholder="至少 6 位" {...field} />
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
              <Button type="submit" variant="destructive" loading={pwdLoading}>
                修改密码
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
