import React, { useEffect, useRef, useState } from 'react';

interface Props {
  onSearch: (theme: string, minResults: number) => void;
  isSearching: boolean;
  currentTheme?: string;
  variant?: 'hero' | 'compact';
}

const SUGGESTIONS = [
  'Nhạc trẻ tình yêu',
  'Bolero quê hương',
  'Nhạc đỏ cách mạng',
  'Indie chill cuối tuần',
  'Nhạc Tết sum vầy',
  'V-pop sôi động',
];

const SearchIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);

const SparkleIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </svg>
);

export default function SearchBar({ onSearch, isSearching, variant = 'hero' }: Props) {
  const [query, setQuery] = useState('');
  const [count, setCount] = useState(30);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount + Cmd/Ctrl+K
  useEffect(() => {
    inputRef.current?.focus();
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const submit = (text?: string) => {
    const q = (text ?? query).trim();
    if (!q || isSearching) return;
    setQuery(q);
    onSearch(q, count);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit();
  };

  const isHero = variant === 'hero';

  return (
    <div
      className="animate-fade-up"
      style={{
        width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: isHero ? 24 : 12,
      }}
    >
      {isHero && (
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <h1 style={{
            margin: 0, fontSize: 44, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05,
          }}>
            Tìm <span className="text-grad">bài hát</span> theo ý bạn
          </h1>
          <p style={{
            margin: '12px 0 0', fontSize: 15, color: 'var(--text-secondary)', maxWidth: 540,
          }}>
            Nhập chủ đề bằng ngôn ngữ tự nhiên — AI sẽ tìm bài hát có bản quyền VCPMC, sẵn sàng cho video của bạn.
          </p>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="ring-grad"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: isHero ? 720 : 960,
          display: 'flex', alignItems: 'center', gap: 0,
          padding: 6,
          background: 'var(--bg-glass-strong)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: var_pill(),
          border: `1px solid ${focused ? 'var(--border-vivid)' : 'var(--border-strong)'}`,
          boxShadow: focused
            ? '0 12px 40px rgba(0,0,0,0.5), 0 0 0 4px var(--accent-ring)'
            : 'var(--shadow-md)',
          transition: 'all var(--dur) var(--ease-out)',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 40, height: 40, color: focused ? 'var(--accent)' : 'var(--text-tertiary)',
          transition: 'color var(--dur)',
        }}>
          <SearchIcon size={18} />
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ví dụ: nhạc trẻ tình yêu, bolero quê hương…"
          disabled={isSearching}
          style={{
            flex: 1, minWidth: 0,
            padding: '10px 6px',
            fontSize: 15,
            background: 'transparent',
            border: 'none', outline: 'none',
            color: 'var(--text-primary)',
          }}
        />

        {/* Count stepper */}
        <CountStepper value={count} onChange={setCount} disabled={isSearching} />

        <button
          type="submit"
          disabled={!query.trim() || isSearching}
          className="btn-primary"
          style={{
            borderRadius: var_pill(),
            padding: '10px 20px',
            fontSize: 14,
            marginLeft: 4,
          }}
        >
          {isSearching ? (
            <>
              <span className="eq" style={{ height: 12 }}>
                <i /><i /><i /><i />
              </span>
              <span>Đang tìm</span>
            </>
          ) : (
            <>
              <SparkleIcon size={14} />
              <span>Tìm</span>
              <kbd style={{
                marginLeft: 4, padding: '2px 6px', borderRadius: 6,
                fontSize: 10, fontWeight: 600,
                background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.9)',
                fontFamily: 'inherit',
              }}>
                ⏎
              </kbd>
            </>
          )}
        </button>
      </form>

      {isHero && (
        <div className="stagger" style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8,
          maxWidth: 720,
        }}>
          {SUGGESTIONS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => { setQuery(s); submit(s); }}
              disabled={isSearching}
              style={{
                padding: '7px 14px',
                fontSize: 12.5, fontWeight: 500,
                color: 'var(--text-secondary)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--r-pill)',
                cursor: isSearching ? 'default' : 'pointer',
                transition: 'all var(--dur-fast) var(--ease-out)',
                animationDelay: `${0.1 + i * 0.04}s`,
              }}
              onMouseEnter={(e) => {
                if (isSearching) return;
                e.currentTarget.style.background = 'var(--accent-soft)';
                e.currentTarget.style.color = 'var(--accent-hover)';
                e.currentTarget.style.borderColor = 'var(--border-vivid)';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--bg-surface)';
                e.currentTarget.style.color = 'var(--text-secondary)';
                e.currentTarget.style.borderColor = 'var(--border-strong)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* Tiny inline -, +, value stepper */
function CountStepper({ value, onChange, disabled }: {
  value: number; onChange: (v: number) => void; disabled: boolean;
}) {
  const clamp = (v: number) => Math.max(5, Math.min(200, v));
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 0,
        marginLeft: 4, marginRight: 4, padding: '4px 6px',
        borderLeft: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 5))}
        disabled={disabled || value <= 5}
        style={stepperBtn}
        aria-label="Giảm số lượng"
      >−</button>
      <div style={{
        minWidth: 56, textAlign: 'center',
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 600, fontSize: 13,
        color: 'var(--text-primary)',
      }}>
        {value} <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>bài</span>
      </div>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 5))}
        disabled={disabled || value >= 200}
        style={stepperBtn}
        aria-label="Tăng số lượng"
      >+</button>
    </div>
  );
}

const stepperBtn: React.CSSProperties = {
  width: 22, height: 22,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 600,
  color: 'var(--text-secondary)',
  background: 'transparent',
  border: 'none', borderRadius: 6,
  cursor: 'pointer',
};

// CSS var helper (avoids stringifying var() inline ad-hoc)
function var_pill() { return 'var(--r-pill)'; }
