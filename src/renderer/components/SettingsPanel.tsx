import React, { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
  isElectron: boolean;
}

export default function SettingsPanel({ onClose, isElectron }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [geniusKey, setGeniusKey] = useState('');
  const [lastfmKey, setLastfmKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  useEffect(() => {
    if (isElectron && window.api) {
      window.api.settings.get().then((s: any) => {
        setApiKey(s.geminiApiKey ?? '');
        setGeniusKey(s.geniusApiKey ?? '');
        setLastfmKey(s.lastfmApiKey ?? '');
      });
      window.api.log.getPath().then(setLogPath);
    }
  }, [isElectron]);

  const handleSave = async () => {
    if (isElectron && window.api) {
      await window.api.settings.set({
        geminiApiKey: apiKey, geniusApiKey: geniusKey,
        lastfmApiKey: lastfmKey,
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--bg-primary)', border: '0.5px solid var(--border-strong)',
    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 5,
  };

  const helpStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.5,
  };

  const guideToggleStyle: React.CSSProperties = {
    fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none',
    cursor: 'pointer', padding: 0, marginTop: 4,
  };

  const guideBoxStyle: React.CSSProperties = {
    marginTop: 8, padding: '10px 12px', borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--bg-primary)', border: '0.5px solid var(--border)',
    fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)',
  };

  const stepStyle: React.CSSProperties = {
    display: 'flex', gap: 8, marginBottom: 6,
  };

  const stepNumStyle: React.CSSProperties = {
    flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
    backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)',
    fontSize: 10, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  const linkStyle: React.CSSProperties = {
    color: 'var(--accent)', textDecoration: 'none',
  };

  const toggleGuide = (name: string) => {
    setExpandedGuide(expandedGuide === name ? null : name);
  };

  return (
    <div className="animate-fade-in" style={{
      backgroundColor: 'var(--bg-secondary)', borderBottom: '0.5px solid var(--border)',
      padding: '16px 24px',
    }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Cai dat</h2>
          <button onClick={onClose} style={{
            fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer',
          }}>
            Xong
          </button>
        </div>
        <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '0 0 16px 0' }}>
          Cau hinh o day hoac tao file <code style={{ backgroundColor: 'var(--bg-primary)', padding: '1px 4px', borderRadius: 3 }}>.env</code> trong thu muc goc du an (xem <code style={{ backgroundColor: 'var(--bg-primary)', padding: '1px 4px', borderRadius: 3 }}>.env.example</code>).
        </p>

        {/* ── Gemini ── */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Gemini API Key <span style={{ color: 'var(--danger)', fontWeight: 400 }}>bat buoc</span>
          </label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="AIzaSy..." style={inputStyle} />
          <p style={helpStyle}>Dung de AI sinh danh sach bai hat. Gemini Flash 2.5 rat nhanh va mien phi.</p>
          <button style={guideToggleStyle} onClick={() => toggleGuide('gemini')}>
            {expandedGuide === 'gemini' ? 'An huong dan' : 'Huong dan lay API Key'}
          </button>
          {expandedGuide === 'gemini' && (
            <div style={guideBoxStyle}>
              <div style={stepStyle}>
                <div style={stepNumStyle}>1</div>
                <span>Truy cap <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" style={linkStyle}>aistudio.google.com</a> va dang nhap bang Google.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>2</div>
                <span>Vao menu <strong style={{ color: 'var(--text-primary)' }}>Get API key</strong> tai <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={linkStyle}>aistudio.google.com/app/apikey</a>.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>3</div>
                <span>Nhan <strong style={{ color: 'var(--text-primary)' }}>Create API key</strong>, tao trong mot project moi hoac hien co.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>4</div>
                <span>Copy key (bat dau bang <code style={{ backgroundColor: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>AIzaSy...</code>) va dan vao o phia tren.</span>
              </div>
              <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(48,209,88,0.06)', border: '0.5px solid rgba(48,209,88,0.15)', fontSize: 11, color: 'var(--success)' }}>
                Gemini API mien phi cho hau het cac muc dich su dung ca nhan (toi da 15 req/phut).
              </div>
            </div>
          )}
        </div>

        {/* ── Genius ── */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Genius API Key <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>tuy chon</span>
          </label>
          <input type="password" value={geniusKey} onChange={(e) => setGeniusKey(e.target.value)}
            placeholder="..." style={inputStyle} />
          <p style={helpStyle}>Tim kiem bai hat theo loi nhac tu Genius. Mien phi.</p>
          <button style={guideToggleStyle} onClick={() => toggleGuide('genius')}>
            {expandedGuide === 'genius' ? 'An huong dan' : 'Huong dan lay API Key'}
          </button>
          {expandedGuide === 'genius' && (
            <div style={guideBoxStyle}>
              <div style={stepStyle}>
                <div style={stepNumStyle}>1</div>
                <span>Truy cap <a href="https://genius.com/signup" target="_blank" rel="noopener noreferrer" style={linkStyle}>genius.com</a> va tao tai khoan mien phi.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>2</div>
                <span>Vao trang <a href="https://genius.com/api-clients" target="_blank" rel="noopener noreferrer" style={linkStyle}>genius.com/api-clients</a> va nhan <strong style={{ color: 'var(--text-primary)' }}>New API Client</strong>.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>3</div>
                <span>Dien <strong style={{ color: 'var(--text-primary)' }}>App Name</strong> (ten bat ky, VD: "AI Creator") va <strong style={{ color: 'var(--text-primary)' }}>App Website URL</strong> (bat ky, VD: http://localhost).</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>4</div>
                <span>Sau khi tao xong, nhan <strong style={{ color: 'var(--text-primary)' }}>Generate Access Token</strong>. Copy token va dan vao o phia tren.</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                Genius API hoan toan mien phi, gioi han 150 request/phut.
              </div>
            </div>
          )}
        </div>

        {/* ── Last.fm ── */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Last.fm API Key <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>tuy chon</span>
          </label>
          <input type="password" value={lastfmKey} onChange={(e) => setLastfmKey(e.target.value)}
            placeholder="..." style={inputStyle} />
          <p style={helpStyle}>Tim kiem bai hat theo ten/tag tu Last.fm. Hoan toan mien phi, khong can premium.</p>
          <button style={guideToggleStyle} onClick={() => toggleGuide('lastfm')}>
            {expandedGuide === 'lastfm' ? 'An huong dan' : 'Huong dan lay API Key'}
          </button>
          {expandedGuide === 'lastfm' && (
            <div style={guideBoxStyle}>
              <div style={stepStyle}>
                <div style={stepNumStyle}>1</div>
                <span>Truy cap <a href="https://www.last.fm/join" target="_blank" rel="noopener noreferrer" style={linkStyle}>last.fm/join</a> va tao tai khoan mien phi.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>2</div>
                <span>Vao trang <a href="https://www.last.fm/api/account/create" target="_blank" rel="noopener noreferrer" style={linkStyle}>last.fm/api/account/create</a> de dang ky ung dung API.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>3</div>
                <span>Dien <strong style={{ color: 'var(--text-primary)' }}>Application name</strong> (bat ky, VD: "AI Creator") va <strong style={{ color: 'var(--text-primary)' }}>Application description</strong> (bat ky). Cac truong khac de trong.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>4</div>
                <span>Nhan <strong style={{ color: 'var(--text-primary)' }}>Submit</strong>. Trang tiep theo se hien thi <strong style={{ color: 'var(--text-primary)' }}>API Key</strong>. Copy va dan vao o phia tren.</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-tertiary)' }}>
                Last.fm API hoan toan mien phi, khong gioi han so luong request cho muc dich ca nhan.
              </div>
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 4 }}>
          <button onClick={handleSave} style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 500,
            borderRadius: 'var(--radius-md)', border: 'none', cursor: 'pointer',
            backgroundColor: 'var(--accent)', color: '#fff',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent-hover)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--accent)')}
          >
            Luu thay doi
          </button>
          {saved && <span style={{ fontSize: 12, color: 'var(--success)' }}>Da luu!</span>}
          {!isElectron && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Demo mode</span>}
        </div>

        {/* ── Log path ── */}
        {logPath && (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: '0.5px solid var(--border)' }}>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
              Log file:{' '}
              <code style={{ backgroundColor: 'var(--bg-primary)', padding: '2px 6px', borderRadius: 3, color: 'var(--text-secondary)', fontSize: 10 }}>
                {logPath}
              </code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
