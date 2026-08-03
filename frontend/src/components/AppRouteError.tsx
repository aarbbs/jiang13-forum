import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { isChunkLoadError, reloadForStaleChunk } from '../utils/chunkLoad';

function errorMessage(error: unknown): string {
  if (isRouteErrorResponse(error)) {
    if (typeof error.data === 'string' && error.data) return error.data;
    if (error.data && typeof error.data === 'object' && 'message' in error.data) {
      const m = (error.data as { message?: unknown }).message;
      if (typeof m === 'string' && m) return m;
    }
    return error.statusText || `错误 ${error.status}`;
  }
  if (error instanceof Error) return error.message;
  return String(error ?? '未知错误');
}

/**
 * React Router 路由级错误页。
 * 发版后动态模块 404 时自动刷新；其它错误给出手动刷新入口。
 */
export default function AppRouteError() {
  const error = useRouteError();
  const chunkMiss = isChunkLoadError(error);

  useEffect(() => {
    if (chunkMiss) reloadForStaleChunk();
  }, [chunkMiss]);

  if (chunkMiss) {
    return (
      <div className="error-page-shell">
        <div className="error-page">
          <div className="error-page__code" aria-hidden>…</div>
          <h1 className="error-page__title">正在更新页面</h1>
          <p className="error-page__desc">检测到程序已更新，正在自动刷新以加载最新版本…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="error-page-shell">
      <div className="error-page">
        <div className="error-page__code" aria-hidden>500</div>
        <h1 className="error-page__title">页面加载出错</h1>
        <p className="error-page__desc">{errorMessage(error)}</p>
        <div className="error-page__actions">
          <Button size="sm" onClick={() => window.location.reload()}>
            刷新页面
          </Button>
          <Button size="sm" variant="outline" onClick={() => { window.location.href = '/'; }}>
            返回首页
          </Button>
        </div>
      </div>
    </div>
  );
}
