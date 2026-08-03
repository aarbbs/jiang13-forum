import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Props = ComponentProps<typeof Input>;

/** 带显示/隐藏切换的密码输入 */
export default function AuthPasswordInput({ className, ...props }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="auth-password-field">
      <Input
        {...props}
        type={visible ? 'text' : 'password'}
        className={cn('auth-password-field__input', className)}
      />
      <button
        type="button"
        className="auth-password-field__toggle"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? '隐藏密码' : '显示密码'}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      </button>
    </div>
  );
}
