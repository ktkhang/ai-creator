import React, { useState, useCallback, useEffect, useRef } from 'react';
import type { SongResult, SearchSession } from '../shared/types';
import SearchBar from './components/SearchBar';
import ResultsTable from './components/ResultsTable';
import SettingsPanel from './components/SettingsPanel';
import StatsBar from './components/StatsBar';

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
    };
  }
}

type AppStatus = 'idle' | 'searching' | 'checking-vcpmc' | 'done';

function isValidResult(r: any): r is SongResult {
  return r != null && typeof r === 'object' && typeof r.id === 'string' &&
    typeof r.title === 'string' && r.title.trim() !== '' &&
    typeof r.author === 'string' && r.author.trim() !== '';
}

export default function App() {
  const [results, setResults] = useState<SongResult[]>([]);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [session, setSession] = useState<SearchSession | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentTheme, setCurrentTheme] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const cleanupRef = useRef<(() => void)[]>([]);

  const isElectron = typeof window !== 'undefined' && window.api != null &&
    typeof window.api.search?.start === 'function';

  useEffect(() => {
            if (isElectron && window.api) {
              window.api.settings.get().then((s: any) => setHasApiKey(!!s.geminiApiKey));
            }
    return () => { cleanupRef.current.forEach((fn) => fn()); };
  }, [isElectron]);

  const upsertResult = useCallback((result: any) => {
    if (!isValidResult(result)) return;
    setResults((prev) => {
      const idx = prev.findIndex((r) => r.id === result.id);
      if (idx >= 0) { const u = [...prev]; u[idx] = result; return u; }
      return [...prev, result];
    });
  }, []);

  const handleSearch = useCallback((theme: string, minResults: number) => {
    cleanupRef.current.forEach((fn) => fn());
    cleanupRef.current = [];
    setResults([]); setStatus('searching'); setStatusMessage('Dang tim kiem...'); setSession(null); setCurrentTheme(theme);

    if (!isElectron) { runDemoSearch(theme, minResults); return; }

    const unsub1 = window.api!.search.onResult(upsertResult);
    const unsub2 = window.api!.search.onStatus((s) => { setStatus(s.status as AppStatus); setStatusMessage(s.message); });
    const unsub3 = window.api!.search.onComplete((s) => { setSession(s); setStatus('done'); });
    cleanupRef.current = [unsub1, unsub2, unsub3];
    window.api!.search.start(theme, minResults);
  }, [isElectron, upsertResult]);

  const runDemoSearch = (theme: string, minResults: number) => {
    const titles = ['Noi Nay Co Anh','Diem Xua','Bong Dung Muon Khoc','Chay Ngay Di','Co Gai M52','Lac Troi','Phai Dau Cuoc Tinh','Em Cua Ngay Hom Qua'];
    const authors = ['Son Tung MTP','Trinh Cong Son','Duc Tri','Son Tung MTP','Huy','Son Tung MTP','Tuan Khanh','Son Tung MTP'];
    const years = [2017,1965,2008,2018,2017,2017,1990,2014];
    const n = Math.min(minResults, titles.length);
    const songs: SongResult[] = Array.from({length: n}, (_,i) => ({
      id: String(i+1), title: titles[i], author: authors[i], yearApprox: years[i],
      vcpmcStatus: 'verified' as const, vcpmcLink: 'https://www.vcpmc.org/tim-kiem/demo/author.html',
      sources: ['llm'], score: 80 - i * 5,
    }));
    let idx = 0;
    const iv = setInterval(() => {
      if (idx >= songs.length) {
        clearInterval(iv); setStatus('done'); setStatusMessage(`Hoan thanh! ${songs.length} bai hat`);
        setSession({ theme, results: songs, status: 'done', stats: { totalCandidates: n, vcpmcVerified: n, vcpmcNotFound: 0, vcpmcPending: 0, elapsedMs: 1500, sources: ['llm'] } });
        return;
      }
      const s = songs[idx]; idx++; setResults((p) => [...p, s]);
    }, 150);
  };

  const closeSettings = () => {
    setShowSettings(false);
    if (isElectron && window.api) window.api.settings.get().then((s: any) => setHasApiKey(!!s.geminiApiKey));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-primary)' }}>
      {/* Title bar */}
      <div className="drag-region" style={{
        height: 46, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', backgroundColor: 'var(--bg-secondary)', borderBottom: '0.5px solid var(--border)',
      }}>
        <div style={{ width: 70 }} /> {/* macOS traffic lights spacer */}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.01em' }}>
          AI Creator
        </span>
        <button onClick={() => setShowSettings(!showSettings)} style={{
          fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer',
          padding: '4px 8px', borderRadius: 'var(--radius-sm)',
        }}>
          {showSettings ? 'Xong' : 'Cai dat'}
        </button>
      </div>

      {showSettings && <SettingsPanel onClose={closeSettings} isElectron={isElectron} />}

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px 24px', maxWidth: 960, width: '100%', margin: '0 auto' }}>

        {/* API key warning */}
        {hasApiKey === false && !showSettings && (
          <div className="animate-fade-in" style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(255, 214, 10, 0.08)', border: '0.5px solid rgba(255, 214, 10, 0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: 12, color: 'var(--warning)' }}>
              Chua cau hinh Gemini API Key. Vui long vao Cai dat de thiet lap.
            </span>
            <button onClick={() => setShowSettings(true)} style={{
              fontSize: 12, fontWeight: 500, color: 'var(--warning)', background: 'rgba(255,214,10,0.12)',
              border: 'none', borderRadius: 'var(--radius-sm)', padding: '4px 10px', cursor: 'pointer',
            }}>
              Cai dat
            </button>
          </div>
        )}

        <SearchBar onSearch={handleSearch} isSearching={status === 'searching' || status === 'checking-vcpmc'} />

        {status !== 'idle' && (
          <StatsBar status={status} statusMessage={statusMessage} session={session} currentTheme={currentTheme} />
        )}

        <ResultsTable results={results} status={status} />
      </div>
    </div>
  );
}
