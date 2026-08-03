import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { isChunkLoadError, reloadForStaleChunk } from '../utils/chunkLoad';

interface Props { children: ReactNode }
interface State { error: Error | null; reloading: boolean }

/** 捕获渲染异常；发版 chunk 失效时自动刷新 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, reloading: false };

  static getDerivedStateFromError(error: Error) {
    if (isChunkLoadError(error) && reloadForStaleChunk()) {
      return { error, reloading: true };
    }
    return { error, reloading: false };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Jiang13Forum]', error, info.componentStack);
  }

  render() {
    if (this.state.reloading) {
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

    if (this.state.error) {
      return (
        <div className="error-page-shell">
          <div className="error-page">
            <div className="error-page__code" aria-hidden>500</div>
            <h1 className="error-page__title">页面渲染出错</h1>
            <p className="error-page__desc">{this.state.error.message || '发生了意外错误，请尝试刷新页面。'}</p>
            <div className="error-page__actions">
              <Button size="sm" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>
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
    return this.props.children;
  }
}
