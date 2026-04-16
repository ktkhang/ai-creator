import React, { useState, useEffect } from 'react';

interface Props {
  onClose: () => void;
  isElectron: boolean;
}

export default function SettingsPanel({ onClose, isElectron }: Props) {
  const [apiKey, setApiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [expandedGuide, setExpandedGuide] = useState<string | null>(null);

  useEffect(() => {
    if (isElectron && window.api) {
      window.api.settings.get().then((s: any) => {
        setApiKey(s.claudeApiKey ?? '');
      });
      window.api.log.getPath().then(setLogPath);
    }
  }, [isElectron]);

  const handleSave = async () => {
    if (isElectron && window.api) {
      await window.api.settings.set({ claudeApiKey: apiKey });
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

        {/* ── Claude / TrollLLM ── */}
        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>
            Claude API Key <span style={{ color: 'var(--danger)', fontWeight: 400 }}>bat buoc</span>
          </label>
          <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
            placeholder="TROLLLLM_API_KEY..." style={inputStyle} />
          <p style={helpStyle}>Dung Claude Sonnet de phan tich yeu cau va kiem duyet ket qua. Lien he admin de lay key.</p>
          <button style={guideToggleStyle} onClick={() => toggleGuide('claude')}>
            {expandedGuide === 'claude' ? 'An huong dan' : 'Huong dan dang ky'}
          </button>
          {expandedGuide === 'claude' && (
            <div style={guideBoxStyle}>
              <div style={stepStyle}>
                <div style={stepNumStyle}>1</div>
                <span>Truy cap <a href="https://chat.trollllm.xyz" target="_blank" rel="noopener noreferrer" style={linkStyle}>chat.trollllm.xyz</a> va dang ky tai khoan.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>2</div>
                <span>Vao phan <strong style={{ color: 'var(--text-primary)' }}>API Keys</strong> trong dashboard, tao key moi.</span>
              </div>
              <div style={stepStyle}>
                <div style={stepNumStyle}>3</div>
                <span>Copy API key va dan vao o phia tren. Co the dat vao bien moi truong <code style={{ backgroundColor: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>TROLLLLM_API_KEY</code> trong file <code style={{ backgroundColor: 'var(--bg-tertiary)', padding: '1px 4px', borderRadius: 3 }}>.env</code>.</span>
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
