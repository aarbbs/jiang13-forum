import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
import { useForumLimits } from '../hooks/useForumLimits';
import { loginPath } from '../utils/authRedirect';
import { useSiteBranding } from '../hooks/useSiteBranding';
import { useNoIndexSEO } from '../hooks/usePageSEO';
import SiteBrandMark from '../components/SiteBrandMark';

const schema = (minLen: number, codeLen: number) => z.object({
  email: z.string().min(1, '请输入邮箱').email('请输入有效邮箱'),
  email_code: z.string().regex(new RegExp(`^\\d{${codeLen}}$`), `请输入 ${codeLen} 位数字验证码`),
  new_password: z.string().min(minLen, `密码至少 ${minLen} 位`),
});

type FormValues = z.infer<ReturnType<typeof schema>>;

export default function ForgotPasswordPage() {
  const { limits } = useForumLimits();
  const { branding } = useSiteBranding();
  useNoIndexSEO('找回密码');
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [mailReady, setMailReady] = useState<boolean | null>(null);
  const codeLen = 6;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema(limits.password_min_len, codeLen)),
    defaultValues: { email: '', email_code: '', new_password: '' },
  });

  useEffect(() => {
    api.registerConfig()
      .then((c) => setMailReady(!!c.mail_ready))
      .catch(() => setMailReady(false));
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
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
      const r = await api.sendResetEmailCode(email);
      notify.success(r.message);
      setCountdown(60);
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '发送失败');
    } finally {
      setSendingCode(false);
    }
  };

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const r = await api.resetPassword({
        email: values.email,
        emailCode: values.email_code,
        newPassword: values.new_password,
      });
      notify.success(r.message);
      nav(loginPath());
    } catch (e: unknown) {
      notify.error(e instanceof Error ? e.message : '重置失败');
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
        <h1>找回密码</h1>
        <p className="subtitle">
          {mailReady === false
            ? '邮件服务未配置，请联系站长重置密码'
            : '通过注册邮箱验证码设置新密码'}
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>注册邮箱</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>邮箱验证码</FormLabel>
                  <div className="auth-captcha-row">
                    <FormControl>
                      <Input
                        placeholder={`${codeLen} 位数字`}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={codeLen}
                        className="auth-email-code-input"
                        {...field}
                        onChange={(e) => {
                          const digits = e.target.value.replace(/\D/g, '').slice(0, codeLen);
                          field.onChange(digits);
                        }}
                      />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      className="auth-code-btn"
                      loading={sendingCode}
                      disabled={countdown > 0 || mailReady === false}
                      onClick={() => void sendCode()}
                    >
                      {countdown > 0 ? `${countdown}s` : '获取验证码'}
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="new_password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>新密码</FormLabel>
                  <FormControl>
                    <AuthPasswordInput placeholder="新密码" autoComplete="new-password" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" loading={loading} disabled={mailReady === false}>
              重置密码
            </Button>
          </form>
        </Form>
        <p className="auth-footer">
          想起密码了？<Link to={loginPath()}>返回登录</Link>
        </p>
        <Link to="/" className="auth-back">
          <ArrowLeft size={16} aria-hidden />
          返回论坛
        </Link>
      </div>
    </div>
  );
}
