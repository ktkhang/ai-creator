import React from 'react';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => { this.setState({ hasError: false, error: null }); };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--bg-primary)', padding: 32,
        }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <div style={{ fontSize: 32, marginBottom: 16, color: 'var(--danger)' }}>!</div>
            <h2 style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Da xay ra loi</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
              {this.state.error?.message ?? 'Loi khong xac dinh'}
            </p>
            <button onClick={this.handleReset} style={{
              padding: '8px 20px', fontSize: 13, fontWeight: 500, borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--accent)', color: '#fff', border: 'none', cursor: 'pointer',
            }}>
              Thu lai
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
