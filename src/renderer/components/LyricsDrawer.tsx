import React, { useEffect, useRef, useState } from 'react';
import type { LyricsResult } from '../../shared/types';

interface Props {
  open: boolean;
  title: string;
  artist: string;
  onClose: () => void;
}

type ViewMode = 'plain' | 'synced';

const DRAWER_WIDTH = 440;

/**
 * Right-side slide-in drawer that fetches lyrics from LRCLIB on open.
 *
 * UX notes:
 * - Mounts immediately but only fetches when `open` flips to true (and again
 *   if the selected song changes mid-session).
 * - Shows skeleton during fetch (perceived latency ~0 when SQLite cache hit).
 * - Offers plain ↔ synced toggle when both are available. Synced view parses
 *   LRC timestamps (`[mm:ss.xx] line`) and renders as a clean list; we do not
 *   attempt real-time karaoke sync (no audio source to sync against).
 * - ESC closes.
 */
export default function LyricsDrawer({ open, title, artist, onClose }: Props) {
  const [result, setResult] = useState<LyricsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<ViewMode>('plain');
  const reqIdRef = useRef(0);

  // Fetch when opened or when song changes
  useEffect(() => {
    if (!open || !title || !artist) return;
    const api: any = (window as any).api;
    if (!api?.lyrics?.fetch) {
      setResult({ status: 'error', source: 'lrclib', error: 'Lyrics API không khả dụng' });
      return;
    }

    const id = ++reqIdRef.current;
    setLoading(true);
    setResult(null);
    setView('plain');

    api.lyrics.fetch(title, artist).then(
      (r: LyricsResult) => {
        if (id !== reqIdRef.current) return; // superseded by newer request
        setResult(r);
        setLoading(false);
        if (r.status === 'ok' && r.syncedLyrics && !r.plainLyrics) setView('synced');
      },
      (err: any) => {
        if (id !== reqIdRef.current) return;
        setResult({ status: 'error', source: 'lrclib', error: err?.message ?? 'Unknown' });
        setLoading(false);
      },
    );
  }, [open, title, artist]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            animation: 'fade-in 0.2s var(--ease-out)',
          }}
        />
      )}

      {/* Drawer */}
      <aside
        aria-hidden={!open}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 95,
          width: DRAWER_WIDTH,
          maxWidth: '92vw',
          transform: open ? 'translateX(0)' : `translateX(${DRAWER_WIDTH + 24}px)`,
          transition: 'transform 0.35s var(--ease-out)',
          background: 'var(--bg-glass-strong)',
          backdropFilter: 'saturate(200%) blur(28px)',
          WebkitBackdropFilter: 'saturate(200%) blur(28px)',
          borderLeft: '1px solid var(--border-strong)',
          boxShadow: '-24px 0 80px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          willChange: 'transform',
        }}
      >
        {/* Header */}
        <header style={{
          padding: '18px 20px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
              color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 6,
            }}>
              Lời bài hát
            </div>
            <h3 style={{
              margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textTransform: 'capitalize',
            }} title={title}>
              {title.toLowerCase()}
            </h3>
            <div style={{
              marginTop: 3, fontSize: 13, color: 'var(--text-secondary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }} title={artist}>
              {artist}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            style={{
              width: 32, height: 32, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
              background: 'var(--bg-surface)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              transition: 'all var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-2)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <CloseIcon />
          </button>
        </header>

        {/* Sub-header: view toggle + meta */}
        <div style={{
          padding: '10px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '1px solid var(--border)',
          minHeight: 44,
        }}>
          {result?.status === 'ok' && result.plainLyrics && result.syncedLyrics ? (
            <div style={{
              display: 'inline-flex', padding: 3,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-strong)',
              borderRadius: 8,
            }}>
              <ViewToggle active={view === 'plain'} onClick={() => setView('plain')}>
                Thường
              </ViewToggle>
              <ViewToggle active={view === 'synced'} onClick={() => setView('synced')}>
                Theo dòng
              </ViewToggle>
            </div>
          ) : <span />}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {result?.source === 'cache' && (
              <span title="Đã lưu cache" style={{
                fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
                padding: '2px 8px', borderRadius: 'var(--r-pill)',
                background: 'rgba(52,211,153,0.1)', color: 'var(--success)',
                border: '1px solid rgba(52,211,153,0.25)',
              }}>
                CACHE
              </span>
            )}
            <span style={{ fontSize: 10, color: 'var(--text-quaternary)' }}>
              LRCLIB
            </span>
          </div>
        </div>

        {/* Body */}
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: '18px 20px 28px',
          fontSize: 14, lineHeight: 1.75,
        }}>
          {loading && <LoadingState />}

          {!loading && result?.status === 'ok' && (
            view === 'synced' && result.syncedLyrics
              ? <SyncedView raw={result.syncedLyrics} />
              : <PlainView text={result.plainLyrics || stripLrc(result.syncedLyrics ?? '')} />
          )}

          {!loading && result?.status === 'instrumental' && (
            <EmptyState
              icon="♪"
              title="Bản nhạc không lời"
              desc="Bài hát này là instrumental — không có lyrics."
            />
          )}

          {!loading && result?.status === 'not-found' && (
            <EmptyState
              icon="—"
              title="Chưa có lời"
              desc="LRCLIB chưa có lời cho bài này. Bạn có thể đóng góp tại lrclib.net."
              actionLabel="Mở LRCLIB"
              actionHref={`https://lrclib.net/search?q=${encodeURIComponent(`${title} ${artist}`)}`}
            />
          )}

          {!loading && result?.status === 'error' && (
            <EmptyState
              icon="!"
              title="Lỗi tải lời"
              desc={result.error ?? 'Không thể kết nối LRCLIB. Vui lòng thử lại.'}
            />
          )}
        </div>
      </aside>
    </>
  );
}

/* ─── Sub-components ──────────────────────────────────────── */

function ViewToggle({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 14px', fontSize: 12,
        fontWeight: active ? 600 : 500,
        color: active ? '#fff' : 'var(--text-secondary)',
        background: active ? 'var(--brand-grad)' : 'transparent',
        border: 'none', borderRadius: 6,
        cursor: 'pointer',
        transition: 'all var(--dur) var(--ease-out)',
      }}
    >
      {children}
    </button>
  );
}

function LoadingState() {
  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[95, 70, 85, 100, 60, 78, 90, 45, 80, 65].map((w, i) => (
        <div
          key={i}
          className="skeleton"
          style={{
            height: 14, width: `${w}%`,
            animationDelay: `${i * 0.06}s`,
          }}
        />
      ))}
    </div>
  );
}

function PlainView({ text }: { text: string }) {
  // Preserve blank-line paragraphs → extra spacing
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return (
    <div className="animate-fade-in" style={{ color: 'var(--text-primary)' }}>
      {paragraphs.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)' }}>(Không có nội dung)</div>
      ) : paragraphs.map((p, i) => (
        <p key={i} style={{
          margin: '0 0 16px',
          whiteSpace: 'pre-wrap',
          fontSize: 14.5,
          letterSpacing: '-0.005em',
        }}>
          {p}
        </p>
      ))}
    </div>
  );
}

function SyncedView({ raw }: { raw: string }) {
  // Parse LRC lines: "[mm:ss.xx] text"
  const LRC_RE = /^\[(\d{1,2}):(\d{2}(?:\.\d+)?)\](.*)$/;
  const lines = raw.split('\n').map((line) => {
    const m = line.match(LRC_RE);
    if (!m) return null;
    const mins = parseInt(m[1], 10);
    const secs = parseFloat(m[2]);
    return { time: mins * 60 + secs, text: m[3].trim() };
  }).filter((x): x is { time: number; text: string } => !!x);

  return (
    <div className="animate-fade-in" style={{ color: 'var(--text-primary)' }}>
      {lines.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)' }}>(Không parse được lời đồng bộ)</div>
      ) : lines.map((l, i) => (
        <div
          key={i}
          style={{
            display: 'flex', gap: 12, alignItems: 'baseline',
            padding: '6px 0',
            borderBottom: i < lines.length - 1 ? '1px solid var(--border)' : 'none',
          }}
        >
          <span style={{
            flexShrink: 0, width: 52,
            fontSize: 10.5, fontVariantNumeric: 'tabular-nums',
            fontWeight: 600,
            color: 'var(--text-quaternary)',
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          }}>
            {formatTime(l.time)}
          </span>
          <span style={{
            fontSize: 14.5,
            color: l.text ? 'var(--text-primary)' : 'var(--text-quaternary)',
            letterSpacing: '-0.005em',
          }}>
            {l.text || '♪'}
          </span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ icon, title, desc, actionLabel, actionHref }: {
  icon: string; title: string; desc: string; actionLabel?: string; actionHref?: string;
}) {
  return (
    <div className="animate-fade-in" style={{
      padding: '48px 24px', textAlign: 'center',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: 16,
        background: 'var(--brand-grad-soft)',
        border: '1px solid var(--border-vivid)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 24, color: 'var(--accent)', marginBottom: 6,
      }}>
        {icon}
      </div>
      <h4 style={{ margin: 0, fontSize: 15, fontWeight: 600 }}>{title}</h4>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-tertiary)', maxWidth: 280 }}>
        {desc}
      </p>
      {actionLabel && actionHref && (
        <a
          href={actionHref} target="_blank" rel="noopener noreferrer"
          className="btn-ghost"
          style={{ marginTop: 8, textDecoration: 'none' }}
        >
          {actionLabel} ↗
        </a>
      )}
    </div>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M3 3l8 8M11 3l-8 8" />
    </svg>
  );
}

/* ─── Helpers ─────────────────────────────────────────────── */

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function stripLrc(lrc: string): string {
  return lrc.replace(/^\[\d{1,2}:\d{2}(?:\.\d+)?\]\s*/gm, '').trim();
}
