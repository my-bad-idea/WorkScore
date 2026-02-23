import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError && this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'system-ui', maxWidth: 640 }}>
          <h2 style={{ color: '#c00' }}>页面出错</h2>
          <pre style={{ background: '#f5f5f5', padding: 16, overflow: 'auto', fontSize: 13 }}>
            {this.state.error.message}
          </pre>
          <p style={{ color: '#666', fontSize: 14 }}>请打开开发者工具 (F12) 查看 Console 获取完整错误信息。</p>
        </div>
      );
    }
    return this.props.children;
  }
}
