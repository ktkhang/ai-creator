import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SongResult, SearchSession, ThinkingStep, LyricsResult } from '../shared/types';
import SearchBar from './components/SearchBar';
import ResultsTable from './components/ResultsTable';
import SettingsPanel from './components/SettingsPanel';
import ThinkingPanel from './components/ThinkingPanel';
import LyricsDrawer from './components/LyricsDrawer';

declare global {
  interface Window {
    api?: {
      search: {
        start: (theme: string, minResults?: number) => void;
        onResult: (cb: (result: SongResult) => void) => () => void;
        onStatus: (cb: (status: { status: string; message: string }) => void) => () => void;
        onComplete: (cb: (session: SearchSession) => void) => () => void;
      };
      settings: { get: () => Promise<any>; set: (s: any) => Promise<any> };
      log: { getPath: () => Promise<string | null> };
      lyrics: { fetch: (title: string, artist: string) => Promise<LyricsResult> };
    };
  }
}

type AppStatus = 'idle' | 'searching' | 'checking-vcpmc' | 'done';

function isValidResult(r: any): r is SongResult {
  return r != null && typeof r === 'object' && typeof r.id === 'string' &&
    typeof r.title === 'string' && r.title.trim() !== '' &&
    typeof r.author === 'string' && r.author.trim() !== '';
}

/** Map a status message to a thinking phase. */
function parseThinkingStep(msg: string, status: string): Omit<ThinkingStep, 'id' | 'ts'> | null {
  const m = msg.toLowerCase();
  if (m.includes('phan tich') || m.includes('tim kiem:')) {
    return { phase: 'criteria', message: msg, status: status === 'done' ? 'done' : 'running' };
  }
  if (m.includes('vcpmc') && (m.includes('vong') || m.includes('tim') || m.includes('thu thap') || m.includes('kiem tra'))) {
    return { phase: 'vcpmc', message: msg, status: 'running' };
  }
  if (m.includes('cham diem') || m.includes('kiem duyet') || m.includes('da co')) {
    return { phase: 'curate', message: msg, status: m.includes('da co') ? 'done' : 'running' };
  }
  if (m.includes('keyword') || m.includes('tu khoa') || m.includes('mo rong')) {
    return { phase: 'expand', message: msg, status: 'running' };
  }
  if (m.includes('hoan thanh')) {
    return { phase: 'curate', message: msg, status: 'done' };
  }
  return null;
}

/* ────────────────── Top bar ────────────────── */

function TopBar({ onOpenSettings, hasApiKey }: { onOpenSettings: () => void; hasApiKey: boolean | null }) {
  return (
    <div className="drag-region" style={{
      height: 48, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px',
      background: 'transparent',
      position: 'relative', zIndex: 10,
    }}>
      <div style={{ width: 70 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Logo />
        <span style={{
          fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
        }}>
          AI <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>· Song Finder</span>
        </span>
      </div>
      <button
        onClick={onOpenSettings}
        className="no-drag"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '6px 12px',
          fontSize: 12, fontWeight: 500,
          color: hasApiKey === false ? 'var(--warning)' : 'var(--text-secondary)',
          background: hasApiKey === false ? 'rgba(251,191,36,0.1)' : 'var(--bg-surface)',
          border: `1px solid ${hasApiKey === false ? 'rgba(251,191,36,0.3)' : 'var(--border-strong)'}`,
          borderRadius: 'var(--r-pill)',
          cursor: 'pointer',
          transition: 'all var(--dur)',
        }}
      >
        <CogIcon />
        Cài đặt
        {hasApiKey === false && <span style={{
          width: 6, height: 6, borderRadius: '50%', background: 'var(--warning)',
          animation: 'pulse-soft 1.6s ease-in-out infinite',
        }} />}
      </button>
    </div>
  );
}

function Logo() {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: 8,
      background: 'var(--brand-grad)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: '0 4px 12px rgba(167,139,250,0.4), inset 0 1px 0 rgba(255,255,255,0.25)',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  );
}

function CogIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/* ────────────────── App ────────────────── */

export default function App() {
  const [results, setResults] = useState<SongResult[]>([]);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [session, setSession] = useState<SearchSession | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('');
  const [targetCount, setTargetCount] = useState(30);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [lyricsFor, setLyricsFor] = useState<{ title: string; artist: string } | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);
  const stepCounterRef = useRef(0);

  // Buffer incoming results & flush at 60fps to avoid render thrash.
  const pendingResultsRef = useRef<SongResult[]>([]);
  const flushHandleRef = useRef<number | null>(null);

  const isElectron = typeof window !== 'undefined' && window.api != null &&
    typeof window.api.search?.start === 'function';

  const checkApiKey = useCallback(() => {
    if (isElectron && window.api) {
      window.api.settings.get().then((s: any) => {
        const hasKey = s.aiProvider === 'gemini' ? !!s.geminiApiKey : !!s.claudeApiKey;
        setHasApiKey(hasKey);
      });
    }
  }, [isElectron]);

  useEffect(() => {
    checkApiKey();
    return () => {
      cleanupRef.current.forEach((fn) => fn());
      if (flushHandleRef.current != null) cancelAnimationFrame(flushHandleRef.current);
    };
  }, [checkApiKey]);

  /** rAF-batched merge of buffered results into state. */
  const scheduleFlush = useCallback(() => {
    if (flushHandleRef.current != null) return;
    flushHandleRef.current = requestAnimationFrame(() => {
      flushHandleRef.current = null;
      const incoming = pendingResultsRef.current;
      if (incoming.length === 0) return;
      pendingResultsRef.current = [];
      setResults((prev) => {
        const map = new Map(prev.map((r) => [r.id, r]));
        for (const r of incoming) map.set(r.id, r);
        return [...map.values()];
      });
    });
  }, []);

  const enqueueResult = useCallback((result: any) => {
    if (!isValidResult(result)) return;
    pendingResultsRef.current.push(result);
    scheduleFlush();
  }, [scheduleFlush]);

  const addThinkingStep = useCallback((msg: string, appStatus: string) => {
    const parsed = parseThinkingStep(msg, appStatus);
    if (!parsed) return;
    const id = `step-${++stepCounterRef.current}`;
    const step: ThinkingStep = { id, ts: Date.now(), ...parsed };
    setThinkingSteps((prev) => {
      const updated = prev.map((s) =>
        s.phase === step.phase && s.status === 'running'
          ? { ...s, status: 'done' as const }
          : s,
      );
      return [...updated, step];
    });
  }, []);

  const handleSearch = useCallback((theme: string, minResults: number) => {
    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];
    stepCounterRef.current = 0;
    pendingResultsRef.current = [];
    if (flushHandleRef.current != null) {
      cancelAnimationFrame(flushHandleRef.current);
      flushHandleRef.current = null;
    }
    setResults([]);
    setStatus('searching');
    setStatusMessage('Đang khởi tạo…');
    setSession(null);
    setCurrentTheme(theme);
    setTargetCount(minResults);
    setThinkingSteps([]);

    if (!isElectron) { runDemoSearch(theme, minResults); return; }

    const unsub1 = window.api!.search.onResult(enqueueResult);
    const unsub2 = window.api!.search.onStatus((s) => {
      setStatus(s.status as AppStatus);
      setStatusMessage(s.message);
      addThinkingStep(s.message, s.status);
    });
    const unsub3 = window.api!.search.onComplete((s) => {
      // Force-flush any buffered results before final state
      if (pendingResultsRef.current.length > 0) {
        const incoming = pendingResultsRef.current;
        pendingResultsRef.current = [];
        setResults((prev) => {
          const map = new Map(prev.map((r) => [r.id, r]));
          for (const r of incoming) map.set(r.id, r);
          return [...map.values()];
        });
      }
      setSession(s);
      setStatus('done');
      setThinkingSteps((prev) =>
        prev.map((step) =>
          step.status === 'running' ? { ...step, status: 'done' as const } : step,
        ),
      );
    });
    cleanupRef.current = [unsub1, unsub2, unsub3];
    window.api!.search.start(theme, minResults);
  }, [isElectron, enqueueResult, addThinkingStep]);

  const runDemoSearch = (theme: string, minResults: number) => {
    const titles = ['Nàng Thơ', 'Diễm Xưa', 'Nơi Này Có Anh', 'Chạy Ngay Đi', 'Có Chắc Yêu Là Đây', 'Lạc Trôi', 'Phai Dấu Cuộc Tình', 'Em Của Ngày Hôm Qua'];
    const authors = ['Hoàng Dũng', 'Trịnh Công Sơn', 'Sơn Tùng M-TP', 'Sơn Tùng M-TP', 'Sơn Tùng M-TP', 'Sơn Tùng M-TP', 'Tuấn Khanh', 'Sơn Tùng M-TP'];
    const genres = ['Indie', 'Trữ tình', 'V-pop', 'V-pop', 'V-pop', 'V-pop', 'Bolero', 'V-pop'];
    const years = [2018, 1965, 2016, 2018, 2020, 2017, 2008, 2014];
    const n = Math.min(minResults, titles.length);
    const songs: SongResult[] = Array.from({ length: n }, (_, i) => ({
      id: String(i + 1), title: titles[i], author: authors[i],
      genre: genres[i], releaseYear: years[i],
      vcpmcStatus: 'verified' as const, vcpmcLink: 'https://www.vcpmc.org/tim-kiem/demo/author.html',
      sources: ['demo'], score: 9 - i * 0.5,
    }));
    let idx = 0;
    const iv = setInterval(() => {
      if (idx >= songs.length) {
        clearInterval(iv);
        setStatus('done');
        setStatusMessage(`Hoàn thành! ${songs.length} bài hát`);
        setSession({ theme, results: songs, status: 'done', stats: { totalCandidates: n, vcpmcVerified: n, vcpmcNotFound: 0, vcpmcPending: 0, elapsedMs: 1500, sources: ['demo'] } });
        return;
      }
      setResults((p) => [...p, songs[idx++]]);
    }, 200);
  };

  const closeSettings = () => {
    setShowSettings(false);
    checkApiKey();
  };

  const isSearching = status === 'searching' || status === 'checking-vcpmc';
  const isIdle = status === 'idle';

  return (
    <>
      {/* Ambient aurora background */}
      <div className="aurora" />

      <div style={{
        position: 'relative', zIndex: 1,
        minHeight: '100vh', height: '100vh',
        display: 'flex', flexDirection: 'column',
      }}>
        <TopBar onOpenSettings={() => setShowSettings(true)} hasApiKey={hasApiKey} />

        {showSettings && (
          <SettingsPanel onClose={closeSettings} isElectron={isElectron} />
        )}

        {/* Main content */}
        <main style={{
          flex: 1, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          padding: isIdle ? '40px 24px 32px' : '12px 24px 24px',
          maxWidth: 1100, width: '100%', margin: '0 auto',
          transition: 'padding var(--dur-slow) var(--ease-out)',
        }}>
          {/* When idle: hero centered. When searching/done: compact at top. */}
          <div style={{
            flexShrink: 0,
            paddingTop: isIdle ? 'clamp(40px, 8vh, 120px)' : 0,
            paddingBottom: isIdle ? 0 : 16,
            transition: 'padding var(--dur-slow) var(--ease-out)',
          }}>
            <SearchBar
              onSearch={handleSearch}
              isSearching={isSearching}
              currentTheme={currentTheme}
              variant={isIdle ? 'hero' : 'compact'}
            />
          </div>

          {/* Progress / results area */}
          {!isIdle && (
            <>
              <ThinkingPanel
                steps={thinkingSteps}
                isRunning={isSearching}
                statusMessage={statusMessage}
                session={session}
                resultCount={results.length}
                targetCount={targetCount}
              />
              <ResultsTable
                results={results}
                status={status}
                targetCount={targetCount}
                onOpenLyrics={(title, artist) => setLyricsFor({ title, artist })}
              />
            </>
          )}

          {/* Footer hint when idle */}
          {isIdle && (
            <div className="animate-fade-in" style={{
              marginTop: 'auto', paddingTop: 32,
              textAlign: 'center', fontSize: 11.5, color: 'var(--text-quaternary)',
            }}>
              <kbd style={{
                padding: '2px 6px', fontSize: 10, fontWeight: 600,
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 4, fontFamily: 'inherit',
                color: 'var(--text-tertiary)',
              }}>⌘K</kbd>
              <span style={{ marginLeft: 6 }}>để focus tìm kiếm · Enter để gửi</span>
            </div>
          )}
        </main>
      </div>

      {/* Lyrics drawer (keeps mounted so slide-out animation works on close) */}
      <LyricsDrawer
        open={lyricsFor != null}
        title={lyricsFor?.title ?? ''}
        artist={lyricsFor?.artist ?? ''}
        onClose={() => setLyricsFor(null)}
      />
    </>
  );
}
