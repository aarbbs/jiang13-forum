import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface Props { children: ReactNode }
interface State { error: Error | null }

/** 捕获渲染异常，避免整页白屏 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Jiang13Forum]', error, info.componentStack);
  }

  render() {
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
