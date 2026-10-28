import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** 渲染层最后一道防线：Android WebView 上出现意外异常时，至少能给出恢复入口而不是白屏。 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[kotoba] render crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app">
        <main className="content">
          <div className="card" style={{ marginTop: 40, borderColor: 'var(--warn)' }}>
            <div className="section-title" style={{ marginTop: 0 }}>
              页面遇到了一点问题
            </div>
            <div style={{ fontSize: 15 }}>
              学习进度仍保存在本机，不会因为这次异常丢失。可以先重试，或重新打开应用。
            </div>
            <pre className="tiny" style={{ whiteSpace: 'pre-wrap', overflow: 'auto', marginTop: 10 }}>
              {this.state.error.message}
            </pre>
            <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
              <button className="btn primary" type="button" onClick={() => this.setState({ error: null })}>
                重试
              </button>
              <button className="btn" type="button" onClick={() => window.location.reload()}>
                重新打开
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }
}
