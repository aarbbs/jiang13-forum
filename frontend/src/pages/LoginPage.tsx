import { useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import AuthPasswordInput from '@/components/AuthPasswordInput';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { resolveAuthRedirect, registerPath, navigateAfterAuth } from '../utils/authRedirect';
import { useSiteBranding } from '../hooks/useSiteBranding';
import { useNoIndexSEO } from '../hooks/usePageSEO';
import SiteBrandMark from '../components/SiteBrandMark';

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const { branding } = useSiteBranding();
  useNoIndexSEO('登录');
  const [loading, setLoading] = useState(false);
  const redirectTo = resolveAuthRedirect(searchParams);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await api.login(values.username, values.password);
      await refresh();
      notify.success('登录成功');
      navigateAfterAuth(nav, redirectTo);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <Link to="/" className="auth-brand-link" aria-label={`返回${branding.name}`}>
          <SiteBrandMark branding={branding} className="logo-mark" />
        </Link>
        <h1>登录{branding.name}</h1>
        <p className="subtitle">{branding.slogan || '欢迎回来'}</p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl>
                    <Input placeholder="用户名" autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>密码</FormLabel>
                  <FormControl>
                    <AuthPasswordInput placeholder="密码" autoComplete="current-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" loading={loading}>
              登录
            </Button>
          </form>
        </Form>
        <p className="auth-footer">
          没有账号？<Link to={registerPath(redirectTo === '/' ? undefined : redirectTo)}>注册</Link>
        </p>
        <Link to="/" className="auth-back">
          <ArrowLeft size={16} aria-hidden />
          返回论坛
        </Link>
      </div>
    </div>
  );
}
