import React from 'react';
import type { SongResult } from '../../shared/types';

interface Props {
  results: SongResult[];
  status: string;
}

function isRenderable(r: any): r is SongResult {
  return r != null && typeof r.id === 'string' && typeof r.title === 'string' && r.title.trim() !== '' && typeof r.author === 'string' && r.author.trim() !== '';
}

const ExternalIcon = () => (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ display: 'inline', marginLeft: 3, verticalAlign: '-1px', opacity: 0.6 }}>
    <path d="M3.5 1.5H10.5V8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export default function ResultsTable({ results, status }: Props) {
  const rows = results.filter(isRenderable);

  if (rows.length === 0 && status === 'idle') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 15, color: 'var(--text-secondary)' }}>Nhap chu de de bat dau tim kiem</span>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Chi hien thi bai hat co ban quyen VCPMC</span>
      </div>
    );
  }

  if (rows.length === 0 && status !== 'idle') {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)',
          borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite',
        }} />
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Dang tim kiem...</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const thStyle: React.CSSProperties = {
    padding: '10px 14px', fontSize: 11, fontWeight: 500, textTransform: 'uppercase',
    letterSpacing: '0.04em', color: 'var(--text-tertiary)', textAlign: 'left',
    borderBottom: '0.5px solid var(--border-strong)',
    position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', zIndex: 1,
  };

  return (
    <div style={{
      flex: 1, overflow: 'auto', borderRadius: 'var(--radius-lg)',
      backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--border)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...thStyle, width: 42 }}>#</th>
            <th style={thStyle}>Bai hat</th>
            <th style={thStyle}>Tac gia</th>
            <th style={{ ...thStyle, width: 56, textAlign: 'center' }}>Nam</th>
            <th style={{ ...thStyle, width: 120 }}>VCPMC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id}
              className="animate-fade-in"
              style={{ borderBottom: '0.5px solid var(--border)', cursor: 'default' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td style={{ padding: '9px 14px', color: 'var(--text-tertiary)', fontSize: 12 }}>{i + 1}</td>
              <td style={{ padding: '9px 14px', fontWeight: 500, color: 'var(--text-primary)' }}>{r.title}</td>
              <td style={{ padding: '9px 14px', color: 'var(--text-secondary)' }}>{r.author}</td>
              <td style={{ padding: '9px 14px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                {r.yearApprox ?? '—'}
              </td>
              <td style={{ padding: '9px 14px' }}>
                {r.vcpmcLink ? (
                  <a
                    href={r.vcpmcLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      fontSize: 12, color: 'var(--accent)', textDecoration: 'none',
                      display: 'inline-flex', alignItems: 'center',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-hover)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                  >
                    Xem VCPMC<ExternalIcon />
                  </a>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
