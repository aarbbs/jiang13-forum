import { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
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
import { resolveAuthRedirect, loginPath, navigateAfterAuth } from '../utils/authRedirect';
import type { RegisterConfig } from '../api/types';
import { useSiteBranding } from '../hooks/useSiteBranding';
import SiteBrandMark from '../components/SiteBrandMark';

const schema = (minLen: number) => z.object({
  username: z.string().min(2, '用户名至少 2 位').max(32, '用户名最多 32 位'),
  nickname: z.string().optional(),
  email: z.string().min(1, '请输入邮箱').email('请输入有效邮箱'),
  password: z.string().min(minLen, `密码至少 ${minLen} 位`),
  email_code: z.string().optional(),
});

type FormValues = z.infer<ReturnType<typeof schema>>;

export default function RegisterPage() {
  const { limits } = useForumLimits();
  const { branding } = useSiteBranding();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAuth();
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [regConfig, setRegConfig] = useState<RegisterConfig | null>(null);
  const redirectTo = resolveAuthRedirect(searchParams);
  const requireCode = !!regConfig?.require_email_code;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema(limits.password_min_len)),
    defaultValues: { username: '', nickname: '', email: '', password: '', email_code: '' },
  });

  useEffect(() => {
    api.registerConfig()
      .then(setRegConfig)
      .catch(() => setRegConfig({
        is_first_user: false,
        mail_ready: false,
        require_email_code: false,
        register_open: false,
      }));
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [countdown]);

  const sendCode = async () => {
    const email = form.getValues('email');
    const parsed = z.string().email().safeParse(email);
    if (!parsed.success) {
      form.setError('email', { message: '请先填写有效邮箱' });
      return;
    }
    setSendingCode(true);
    try {
      const r = await api.sendRegisterEmailCode(email);
      notify.success(r.message);
      setCountdown(60);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSendingCode(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    if (regConfig && !regConfig.register_open) {
      notify.error('论坛暂未开放注册，请联系管理员配置邮件服务');
      return;
    }
    if (requireCode && !values.email_code?.trim()) {
      form.setError('email_code', { message: '请输入邮箱验证码' });
      return;
    }
    setLoading(true);
    try {
      await api.register({
        username: values.username,
        password: values.password,
        nickname: values.nickname || values.username,
        email: values.email,
        emailCode: values.email_code,
      });
      await refresh();
      notify.success('注册成功');
      navigateAfterAuth(nav, redirectTo);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const subtitle = (() => {
    if (!regConfig) return branding.slogan || '欢迎加入';
    if (regConfig.is_first_user) return '首个注册用户自动成为管理员';
    if (!regConfig.register_open) return '注册暂未开放，请等待管理员配置邮件服务';
    return branding.slogan || '欢迎加入';
  })();

  return (
    <div className="auth-page">
      <div className="auth-box">
        <SiteBrandMark branding={branding} className="logo-mark" />
        <h1>注册账号</h1>
        <p className="subtitle">{subtitle}</p>
        {regConfig && !regConfig.register_open ? (
          <p className="auth-footer">
            已有账号？<Link to={loginPath(redirectTo === '/' ? undefined : redirectTo)}>登录</Link>
          </p>
        ) : (
          <>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>用户名</FormLabel>
                      <FormControl>
                        <Input placeholder="2-32 位，支持中文" autoComplete="username" {...field} />
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
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>邮箱</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="用于接收验证码" autoComplete="email" {...field} />
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
                {requireCode && (
                  <FormField
                    control={form.control}
                    name="email_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>邮箱验证码</FormLabel>
                        <div className="auth-captcha-row">
                          <FormControl>
                            <Input
                              placeholder="6 位数字验证码"
                              autoComplete="one-time-code"
                              inputMode="numeric"
                              {...field}
                            />
                          </FormControl>
                          <Button
                            type="button"
                            variant="outline"
                            className="auth-code-btn"
                            loading={sendingCode}
                            disabled={countdown > 0}
                            onClick={() => void sendCode()}
                          >
                            {countdown > 0 ? `${countdown}s` : '发送验证码'}
                          </Button>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                {regConfig?.is_first_user && !regConfig.mail_ready && (
                  <p className="auth-hint">首次注册无需邮箱验证码，请注册后到后台配置 SMTP。</p>
                )}
                <Button type="submit" className="w-full" loading={loading}>
                  注册
                </Button>
              </form>
            </Form>
            <p className="auth-footer">
              已有账号？<Link to={loginPath(redirectTo === '/' ? undefined : redirectTo)}>登录</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
