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
import { useForumLimits } from '../hooks/useForumLimits';
import { useAuth } from '../hooks/useAuth';

const schema = (minLen: number) => z.object({
  username: z.string().min(1, '请输入用户名'),
  nickname: z.string().optional(),
  password: z.string().min(minLen, `密码至少 ${minLen} 位`),
});

type FormValues = z.infer<ReturnType<typeof schema>>;

export default function RegisterPage() {
  const { limits } = useForumLimits();
  const nav = useNavigate();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema(limits.password_min_len)),
    defaultValues: { username: '', nickname: '', password: '' },
  });

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      await api.register(values.username, values.password, values.nickname || values.username);
      await refresh();
      notify.success('注册成功');
      nav('/', { replace: true });
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-box">
        <div className="logo-mark">姜</div>
        <h1>注册账号</h1>
        <p className="subtitle">首个注册用户自动成为管理员</p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="username"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>用户名</FormLabel>
                  <FormControl>
                    <Input placeholder="3-32 位字母数字下划线" autoComplete="username" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="nickname"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>昵称</FormLabel>
                  <FormControl>
                    <Input placeholder="显示名称（可选）" autoComplete="nickname" {...field} />
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
                    <Input type="password" placeholder={`至少 ${limits.password_min_len} 位`} autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" loading={loading}>
              注册
            </Button>
          </form>
        </Form>
        <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: 'var(--color-text-3)' }}>
          已有账号？<Link to="/login">登录</Link>
        </p>
      </div>
    </div>
  );
}
