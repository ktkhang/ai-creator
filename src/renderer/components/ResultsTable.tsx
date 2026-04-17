import React, { useDeferredValue, useMemo, useState } from 'react';
import type { SongResult } from '../../shared/types';

interface Props {
  results: SongResult[];
  status: string;
  targetCount?: number;
  onOpenLyrics?: (title: string, artist: string) => void;
}

/* ────────────────── Helpers ────────────────── */

function isRenderable(r: any): r is SongResult {
  return r != null && typeof r.id === 'string' &&
    typeof r.title === 'string' && r.title.trim() !== '' &&
    typeof r.author === 'string' && r.author.trim() !== '';
}

function youtubeUrl(title: string, author: string): string {
  const q = encodeURIComponent(`${title} ${author}`);
  return `https://www.youtube.com/results?search_query=${q}`;
}

/** Pleasant deterministic "cover-art" gradient seeded from title hash. */
function coverGradient(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const palettes: Array<[string, string, string]> = [
    ['#a78bfa', '#ec4899', '#f59e0b'],
    ['#60a5fa', '#a78bfa', '#ec4899'],
    ['#34d399', '#60a5fa', '#a78bfa'],
    ['#fbbf24', '#f87171', '#ec4899'],
    ['#22d3ee', '#a78bfa', '#ec4899'],
    ['#f472b6', '#a78bfa', '#60a5fa'],
    ['#fb923c', '#f87171', '#a78bfa'],
  ];
  const [a, b, c] = palettes[Math.abs(h) % palettes.length];
  const angle = (Math.abs(h) % 360);
  return `linear-gradient(${angle}deg, ${a} 0%, ${b} 50%, ${c} 100%)`;
}

function initials(s: string): string {
  return s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

/* ────────────────── Tiny icons ────────────────── */

const ExternalIcon = ({ size = 11 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" style={{ marginLeft: 3 }}>
    <path d="M3.5 1.5H10.5V8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10.5 1.5L1.5 10.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const PlayIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const ListIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <circle cx="4" cy="6" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="4" cy="18" r="1" />
  </svg>
);

const GridIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

const CopyIcon = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const LyricsIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6h11M4 12h11M4 18h7" />
    <path d="M17 17l2 2 4-4" />
  </svg>
);

/* ────────────────── Empty / loading states ────────────────── */

function EmptyIdle() {
  return (
    <div className="animate-fade-up" style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 10, padding: '64px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 18,
        background: 'var(--brand-grad-soft)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: 8, border: '1px solid var(--border-vivid)',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="url(#g)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <defs>
            <linearGradient id="g" x1="0" x2="24" y1="0" y2="24">
              <stop offset="0" stopColor="#a78bfa" />
              <stop offset="1" stopColor="#ec4899" />
            </linearGradient>
          </defs>
          <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
        </svg>
      </div>
      <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Sẵn sàng tìm bài hát</h3>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 360 }}>
        Nhập chủ đề, thể loại hoặc tâm trạng vào ô tìm kiếm phía trên — kết quả chỉ gồm bài đã đăng ký bản quyền VCPMC.
      </p>
    </div>
  );
}

function SkeletonCards({ count }: { count: number }) {
  return (
    <div style={cardsGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-fade-in" style={{ ...cardBase, animationDelay: `${i * 0.04}s` }}>
          <div className="skeleton" style={{ width: 56, height: 56, borderRadius: 12, flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
            <div className="skeleton" style={{ height: 14, width: '70%', borderRadius: 6 }} />
            <div className="skeleton" style={{ height: 11, width: '45%', borderRadius: 6 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────── Song row/card ────────────────── */

function SongCard({ r, idx, view, onOpenLyrics }: { r: SongResult; idx: number; view: 'card' | 'list'; onOpenLyrics?: (title: string, artist: string) => void }) {
  const [copied, setCopied] = useState(false);

  const copy = (e: React.MouseEvent) => {
    e.preventDefault();
    navigator.clipboard?.writeText(`${r.title} — ${r.author}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  const cover = (
    <div
      style={{
        width: view === 'card' ? 56 : 44,
        height: view === 'card' ? 56 : 44,
        flexShrink: 0,
        borderRadius: view === 'card' ? 12 : 10,
        background: coverGradient(r.title + r.author),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(255,255,255,0.85)',
        fontSize: view === 'card' ? 17 : 14, fontWeight: 700, letterSpacing: '0.02em',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), 0 4px 12px rgba(0,0,0,0.3)',
        textShadow: '0 1px 2px rgba(0,0,0,0.4)',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {initials(r.title) || <PlayIcon size={view === 'card' ? 18 : 14} />}
    </div>
  );

  return (
    <div
      className="animate-fade-up ring-grad"
      style={{
        ...cardBase,
        animationDelay: `${Math.min(idx, 20) * 0.03}s`,
        cursor: 'default',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
    >
      <div style={{
        position: 'absolute', top: 8, left: 8,
        fontSize: 10, fontWeight: 600, color: 'var(--text-quaternary)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {String(idx + 1).padStart(2, '0')}
      </div>

      {cover}

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <div style={{
          fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textTransform: 'capitalize',
        }} title={r.title}>
          {r.title.toLowerCase()}
        </div>
        <div style={{
          fontSize: 12.5, color: 'var(--text-secondary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }} title={r.author}>
          {r.author}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {r.genre && <Chip>{r.genre}</Chip>}
          {r.releaseYear && <Chip variant="muted">{r.releaseYear}</Chip>}
          {typeof r.score === 'number' && r.score > 0 && (
            <Chip variant="score">{Math.round(r.score)}/10</Chip>
          )}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        {onOpenLyrics && (
          <button
            onClick={() => onOpenLyrics(r.title, r.author)}
            title="Xem lời bài hát"
            style={iconBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-hover)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
          >
            <LyricsIcon size={14} />
          </button>
        )}
        <a
          href={youtubeUrl(r.title, r.author)}
          target="_blank" rel="noopener noreferrer"
          title="Tìm trên YouTube"
          style={iconBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ff5555'; e.currentTarget.style.background = 'rgba(255,85,85,0.1)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
        >
          <PlayIcon size={14} />
        </a>
        {r.vcpmcLink && (
          <a
            href={r.vcpmcLink}
            target="_blank" rel="noopener noreferrer"
            title="Xem trên VCPMC"
            style={{
              ...iconBtnStyle,
              fontSize: 11, fontWeight: 700, letterSpacing: '0.02em',
              padding: '6px 10px', minWidth: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-hover)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
          >
            VCPMC<ExternalIcon size={9} />
          </a>
        )}
        <button
          onClick={copy}
          title={copied ? 'Đã copy' : 'Copy tiêu đề + tác giả'}
          style={iconBtnStyle}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-soft)'; }}
          onMouseLeave={(e) => {
            if (!copied) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.background = 'transparent'; }
          }}
        >
          {copied
            ? <span style={{ color: 'var(--success)', fontSize: 11, fontWeight: 600 }}>✓</span>
            : <CopyIcon size={13} />}
        </button>
      </div>
    </div>
  );
}

function Chip({ children, variant = 'default' }: { children: React.ReactNode; variant?: 'default' | 'muted' | 'score' }) {
  const palette = {
    default: { bg: 'var(--accent-soft)', fg: 'var(--accent)', bd: 'rgba(167,139,250,0.25)' },
    muted:   { bg: 'rgba(255,255,255,0.05)', fg: 'var(--text-tertiary)', bd: 'var(--border)' },
    score:   { bg: 'rgba(52,211,153,0.1)', fg: 'var(--success)', bd: 'rgba(52,211,153,0.25)' },
  }[variant];
  return (
    <span style={{
      padding: '2px 8px', fontSize: 10, fontWeight: 600, letterSpacing: '0.02em',
      borderRadius: 'var(--r-pill)',
      background: palette.bg, color: palette.fg, border: `1px solid ${palette.bd}`,
    }}>{children}</span>
  );
}

/* ────────────────── Main ────────────────── */

export default function ResultsTable({ results, status, targetCount = 30, onOpenLyrics }: Props) {
  const [view, setView] = useState<'card' | 'list'>('card');
  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter);

  const rows = useMemo(() => results.filter(isRenderable), [results]);

  const filtered = useMemo(() => {
    if (!deferredFilter.trim()) return rows;
    const q = deferredFilter.toLowerCase();
    return rows.filter(
      (r) => r.title.toLowerCase().includes(q) || r.author.toLowerCase().includes(q),
    );
  }, [rows, deferredFilter]);

  const isLoading = status === 'searching' || status === 'checking-vcpmc';

  if (rows.length === 0 && status === 'idle') return <EmptyIdle />;

  return (
    <div className="animate-fade-in" style={{
      flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 12, marginBottom: 14, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>
              {rows.length}
            </strong>
            <span style={{ marginLeft: 4 }}>kết quả</span>
            {isLoading && targetCount > 0 && (
              <span style={{ marginLeft: 6, color: 'var(--text-tertiary)' }}>
                / {targetCount}
              </span>
            )}
          </span>
          {filter.trim() && filtered.length !== rows.length && (
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              (lọc còn {filtered.length})
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {rows.length > 0 && (
            <input
              type="text"
              placeholder="Lọc kết quả…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                width: 180, padding: '7px 12px', fontSize: 12,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-sm)',
                color: 'var(--text-primary)',
              }}
            />
          )}
          <div style={{
            display: 'inline-flex', padding: 3,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-sm)',
          }}>
            <button onClick={() => setView('card')} style={viewBtn(view === 'card')} title="Xem dạng thẻ">
              <GridIcon size={13} />
            </button>
            <button onClick={() => setView('list')} style={viewBtn(view === 'list')} title="Xem dạng danh sách">
              <ListIcon size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{
        flex: 1, overflowY: 'auto', overflowX: 'hidden',
        paddingRight: 4, marginRight: -4,
      }}>
        {filtered.length === 0 && filter.trim() ? (
          <div style={{
            padding: '48px 24px', textAlign: 'center',
            color: 'var(--text-tertiary)', fontSize: 13,
          }}>
            Không có bài nào khớp “{filter}”.
          </div>
        ) : view === 'card' ? (
          <div style={cardsGrid}>
            {filtered.map((r, i) => <SongCard key={r.id} r={r} idx={i} view="card" onOpenLyrics={onOpenLyrics} />)}
            {isLoading && rows.length < targetCount && (
              <SkeletonCards count={Math.min(4, targetCount - rows.length)} />
            )}
          </div>
        ) : (
          <ListView rows={filtered} isLoading={isLoading} pad={Math.min(4, targetCount - rows.length)} onOpenLyrics={onOpenLyrics} />
        )}
      </div>
    </div>
  );
}

/* ────────────────── List view (compact table) ────────────────── */

function ListView({ rows, isLoading, pad, onOpenLyrics }: { rows: SongResult[]; isLoading: boolean; pad: number; onOpenLyrics?: (title: string, artist: string) => void }) {
  return (
    <div style={{
      borderRadius: 'var(--r-md)',
      background: 'var(--bg-surface)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {rows.map((r, i) => (
        <div
          key={r.id}
          className="animate-fade-in"
          style={{
            display: 'grid',
            gridTemplateColumns: '40px 44px 1fr 1fr 80px 60px auto',
            alignItems: 'center', gap: 12,
            padding: '10px 14px',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
            transition: 'background var(--dur-fast)',
            animationDelay: `${Math.min(i, 20) * 0.02}s`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <span style={{ color: 'var(--text-quaternary)', fontSize: 11, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
            {String(i + 1).padStart(2, '0')}
          </span>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: coverGradient(r.title + r.author),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 11, fontWeight: 700,
          }}>
            {initials(r.title) || '♪'}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 500, color: 'var(--text-primary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            textTransform: 'capitalize',
          }} title={r.title}>{r.title.toLowerCase()}</div>
          <div style={{
            fontSize: 12, color: 'var(--text-secondary)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }} title={r.author}>{r.author}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.genre ?? '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textAlign: 'center' }}>{r.releaseYear ?? '—'}</div>
          <div style={{ display: 'flex', gap: 4 }}>
            {onOpenLyrics && (
              <button onClick={() => onOpenLyrics(r.title, r.author)} style={iconBtnStyle} title="Lời bài hát">
                <LyricsIcon size={13} />
              </button>
            )}
            <a href={youtubeUrl(r.title, r.author)} target="_blank" rel="noopener noreferrer" style={iconBtnStyle} title="YouTube">
              <PlayIcon size={13} />
            </a>
            {r.vcpmcLink && (
              <a href={r.vcpmcLink} target="_blank" rel="noopener noreferrer" style={iconBtnStyle} title="VCPMC">
                <ExternalIcon size={11} />
              </a>
            )}
          </div>
        </div>
      ))}
      {isLoading && pad > 0 && Array.from({ length: pad }).map((_, i) => (
        <div key={`sk-${i}`} className="animate-fade-in" style={{
          display: 'grid', gridTemplateColumns: '40px 44px 1fr 1fr 80px 60px auto',
          alignItems: 'center', gap: 12, padding: '10px 14px',
          borderTop: '1px solid var(--border)',
        }}>
          <div className="skeleton" style={{ height: 10, width: 18 }} />
          <div className="skeleton" style={{ width: 36, height: 36, borderRadius: 8 }} />
          <div className="skeleton" style={{ height: 12, width: '60%' }} />
          <div className="skeleton" style={{ height: 11, width: '50%' }} />
          <div className="skeleton" style={{ height: 10, width: '70%' }} />
          <div className="skeleton" style={{ height: 10, width: 30 }} />
          <div className="skeleton" style={{ height: 22, width: 50 }} />
        </div>
      ))}
    </div>
  );
}

/* ────────────────── Inline styles ────────────────── */

const cardsGrid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
  gap: 10,
};

const cardBase: React.CSSProperties = {
  position: 'relative',
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '12px 14px 12px 36px',
  background: 'var(--bg-surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  transition: 'background var(--dur-fast) var(--ease-out)',
  minHeight: 80,
};

const iconBtnStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  minWidth: 32, height: 32, padding: 0,
  background: 'transparent', border: 'none',
  borderRadius: 8,
  color: 'var(--text-secondary)',
  cursor: 'pointer', textDecoration: 'none',
  transition: 'all var(--dur-fast) var(--ease-out)',
};

function viewBtn(active: boolean): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 30, height: 26, padding: 0,
    background: active ? 'var(--accent-soft)' : 'transparent',
    color: active ? 'var(--accent)' : 'var(--text-tertiary)',
    border: 'none', borderRadius: 6,
    cursor: 'pointer',
    transition: 'all var(--dur-fast) var(--ease-out)',
  };
}
