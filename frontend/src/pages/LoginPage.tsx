import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { notify } from '@/lib/notify';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';

const schema = z.object({
  username: z.string().min(1, '请输入用户名'),
  password: z.string().min(1, '请输入密码'),
});

type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
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
      nav('/', { replace: true });
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="logo-mark">姜</div>
        <h1>登录姜十三论坛</h1>
        <p className="subtitle">拾三一隅，自在交流</p>
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
                    <Input type="password" placeholder="密码" autoComplete="current-password" {...field} />
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
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--color-text-3)' }}>
          没有账号？<Link to="/register">注册</Link>
        </p>
      </div>
    </div>
  );
}
