import { Spinner } from '@/components/ui/spinner';

/** 登录/注册懒加载占位：保持 auth 页氛围，避免整屏空白转圈 */
export default function AuthPageFallback() {
  return (
    <div className="auth-page" aria-busy="true" aria-label="加载中">
      <div className="auth-box auth-box--loading">
        <Spinner size="lg" />
      </div>
    </div>
  );
}
