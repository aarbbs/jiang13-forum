/** 构造带回跳的登录路径 */
export function loginPath(from?: string): string {
  const path = sanitizeReturnPath(from ?? currentPath());
  if (!path) return '/login';
  return `/login?from=${encodeURIComponent(path)}`;
}

/** 构造带回跳的注册路径 */
export function registerPath(from?: string): string {
  const path = sanitizeReturnPath(from ?? currentPath());
  if (!path) return '/register';
  return `/register?from=${encodeURIComponent(path)}`;
}

/** 从查询参数解析登录/注册成功后的回跳地址 */
export function resolveAuthRedirect(search: string | URLSearchParams, fallback = '/'): string {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  return sanitizeReturnPath(params.get('from') ?? '') || fallback;
}

/** OAuth/OIDC 协议路径需整页跳转，不能走 React Router */
export function isProtocolReturnPath(path: string): boolean {
  return path.startsWith('/oauth/') || path.startsWith('/.well-known/');
}

/** 登录/注册成功后回跳（协议路径用 location 整页导航） */
export function navigateAfterAuth(
  nav: (to: string, opts?: { replace?: boolean }) => void,
  redirectTo: string,
): void {
  if (isProtocolReturnPath(redirectTo)) {
    window.location.assign(redirectTo);
    return;
  }
  nav(redirectTo, { replace: true });
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** 仅允许站内相对路径，避免开放重定向 */
function sanitizeReturnPath(raw: string): string {
  const path = raw.trim();
  if (!path.startsWith('/') || path.startsWith('//')) return '';
  if (path.startsWith('/login') || path.startsWith('/register')) return '';
  return path;
}
