import React from 'react';
import type { SongResult } from '../../shared/types';

interface Props {
  results: SongResult[];
  status: string;
}

function isRenderable(r: any): r is SongResult {
  return r != null && typeof r.id === 'string' &&
    typeof r.title === 'string' && r.title.trim() !== '' &&
    typeof r.author === 'string' && r.author.trim() !== '';
}

const ExternalIcon = ({ size = 10 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none"
    style={{ display: 'inline', marginLeft: 3, verticalAlign: '-1px', opacity: 0.6 }}>
    <path d="M3.5 1.5H10.5V8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

/** Build a YouTube search URL for a song */
function youtubeUrl(title: string, author: string): string {
  const q = encodeURIComponent(`${title} ${author}`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

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

  const th: React.CSSProperties = {
    padding: '10px 12px', fontSize: 11, fontWeight: 500,
    textTransform: 'uppercase', letterSpacing: '0.04em',
    color: 'var(--text-tertiary)', textAlign: 'left',
    borderBottom: '0.5px solid var(--border-strong)',
    position: 'sticky', top: 0, backgroundColor: 'var(--bg-secondary)', zIndex: 1,
    whiteSpace: 'nowrap',
  };

  const linkStyle: React.CSSProperties = {
    fontSize: 11, textDecoration: 'none', display: 'inline-flex',
    alignItems: 'center', whiteSpace: 'nowrap',
  };

  return (
    <div style={{
      flex: 1, overflow: 'auto', borderRadius: 'var(--radius-lg)',
      backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--border)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 38 }}>#</th>
            <th style={th}>Bai hat</th>
            <th style={th}>Tac gia</th>
            <th style={{ ...th, width: 120 }}>The loai</th>
            <th style={{ ...th, width: 50, textAlign: 'center' }}>Nam</th>
            <th style={{ ...th, width: 170 }}>Lien ket</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id}
              className="animate-fade-in"
              style={{ borderBottom: '0.5px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--bg-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)', fontSize: 12 }}>
                {i + 1}
              </td>
              <td style={{ padding: '9px 12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                {r.title}
              </td>
              <td style={{ padding: '9px 12px', color: 'var(--text-secondary)', fontSize: 12 }}>
                {r.author}
              </td>
              <td style={{ padding: '9px 12px', color: 'var(--text-tertiary)', fontSize: 11 }}>
                {r.genre ?? '—'}
              </td>
              <td style={{ padding: '9px 12px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>
                {r.releaseYear ?? '—'}
              </td>
              <td style={{ padding: '9px 12px' }}>
                <div style={{ display: 'flex', gap: 10 }}>
                  {/* VCPMC link – searches by song title */}
                  {r.vcpmcLink && (
                    <a
                      href={r.vcpmcLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ ...linkStyle, color: 'var(--accent)' }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--accent)')}
                      title="Xem tren VCPMC"
                    >
                      VCPMC<ExternalIcon />
                    </a>
                  )}

                  {/* YouTube search link */}
                  <a
                    href={youtubeUrl(r.title, r.author)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...linkStyle, color: '#ff4444' }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                    title="Tim tren YouTube"
                  >
                    YT<ExternalIcon />
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
