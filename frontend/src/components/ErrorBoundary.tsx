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
        <div className="error-boundary">
          <h3>页面渲染出错</h3>
          <p className="error-boundary-msg">{this.state.error.message}</p>
          <Button size="sm" onClick={() => { this.setState({ error: null }); window.location.reload(); }}>
            刷新页面
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
