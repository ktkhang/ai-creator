import React, { useEffect, useState } from 'react';
import type { AiProvider } from '../../shared/types';
import { AI_MODELS } from '../../shared/types';

interface Props {
  onClose: () => void;
  isElectron: boolean;
}

export default function SettingsPanel({ onClose, isElectron }: Props) {
  const [provider, setProvider] = useState<AiProvider>('claude');
  const [model, setModel] = useState('claude-sonnet-4.6');
  const [claudeKey, setClaudeKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [revealKey, setRevealKey] = useState(false);

  useEffect(() => {
    if (isElectron && window.api) {
      window.api.settings.get().then((s: any) => {
        setProvider(s.aiProvider ?? 'claude');
        setModel(s.aiModel ?? 'claude-sonnet-4.6');
        setClaudeKey(s.claudeApiKey ?? '');
        setGeminiKey(s.geminiApiKey ?? '');
      });
      window.api.log.getPath().then(setLogPath);
    }
    // ESC to close
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isElectron, onClose]);

  const handleProviderChange = (p: AiProvider) => {
    setProvider(p);
    setModel(AI_MODELS[p][0].id);
  };

  const handleSave = async () => {
    if (isElectron && window.api) {
      await window.api.settings.set({
        aiProvider: provider, aiModel: model,
        claudeApiKey: claudeKey, geminiApiKey: geminiKey,
      });
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const models = AI_MODELS[provider];
  const currentKey = provider === 'claude' ? claudeKey : geminiKey;
  const setCurrentKey = provider === 'claude' ? setClaudeKey : setGeminiKey;

  return (
    <div
      className="animate-fade-in"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="animate-scale-in glass-strong"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          maxHeight: '85vh', overflowY: 'auto',
          borderRadius: 'var(--r-lg)',
          padding: 0,
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>Cài đặt</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
              Cấu hình AI provider và API key
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost" style={{ padding: '6px 12px' }}>
            Xong
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Provider segmented */}
          <Field label="AI Provider">
            <div style={{
              display: 'inline-flex', padding: 3,
              background: 'var(--bg-surface)', border: '1px solid var(--border-strong)',
              borderRadius: 'var(--r-sm)',
            }}>
              {(['claude', 'gemini'] as AiProvider[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handleProviderChange(p)}
                  style={{
                    padding: '7px 22px', fontSize: 13,
                    fontWeight: provider === p ? 600 : 500,
                    color: provider === p ? '#fff' : 'var(--text-secondary)',
                    background: provider === p ? 'var(--brand-grad)' : 'transparent',
                    border: 'none', borderRadius: 7,
                    cursor: 'pointer',
                    transition: 'all var(--dur)',
                    boxShadow: provider === p ? 'var(--shadow-sm)' : 'none',
                  }}
                >
                  {p === 'claude' ? 'Claude' : 'Gemini'}
                </button>
              ))}
            </div>
          </Field>

          {/* Model select */}
          <Field label="Model">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={{
                ...inputStyle,
                cursor: 'pointer',
                appearance: 'none',
                paddingRight: 32,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23a78bfa' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 12px center',
              }}
            >
              {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </Field>

          {/* API key */}
          <Field
            label={provider === 'claude' ? 'Claude API Key' : 'Gemini API Key'}
            required
            help={
              provider === 'claude' ? (
                <>
                  Lấy tại{' '}
                  <a href="https://chat.trollllm.xyz" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    chat.trollllm.xyz
                  </a>{' '}
                  hoặc đặt biến môi trường <Code>TROLLLLM_API_KEY</Code>.
                </>
              ) : (
                <>
                  Lấy miễn phí tại{' '}
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={linkStyle}>
                    aistudio.google.com
                  </a>{' '}
                  hoặc đặt biến <Code>GEMINI_API_KEY</Code>.
                </>
              )
            }
          >
            <div style={{ position: 'relative' }}>
              <input
                type={revealKey ? 'text' : 'password'}
                value={currentKey}
                onChange={(e) => setCurrentKey(e.target.value)}
                placeholder={provider === 'claude' ? 'sk-trollllm-…' : 'AIzaSy…'}
                style={{ ...inputStyle, paddingRight: 64 }}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setRevealKey((v) => !v)}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  padding: '4px 10px', fontSize: 11, fontWeight: 500,
                  color: 'var(--text-tertiary)', background: 'var(--bg-surface-2)',
                  border: '1px solid var(--border)', borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                {revealKey ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            {provider === 'claude' && (
              <button
                style={{
                  marginTop: 8, fontSize: 11, color: 'var(--accent)',
                  background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                }}
                onClick={() => setShowGuide(!showGuide)}
              >
                {showGuide ? '↑ Ẩn hướng dẫn' : '↓ Hướng dẫn lấy API key'}
              </button>
            )}
            {provider === 'claude' && showGuide && (
              <div className="animate-fade-up" style={{
                marginTop: 10, padding: '12px 14px',
                background: 'var(--bg-surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)', fontSize: 12, lineHeight: 1.7,
                color: 'var(--text-secondary)',
              }}>
                {[
                  'Truy cập chat.trollllm.xyz và đăng ký tài khoản.',
                  'Vào Dashboard → API Keys → Create new key.',
                  'Copy key và dán vào ô phía trên.',
                ].map((t, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 4, alignItems: 'flex-start' }}>
                    <span style={{
                      flexShrink: 0, width: 18, height: 18, borderRadius: '50%',
                      background: 'var(--accent-soft)', color: 'var(--accent)',
                      fontSize: 10, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>{i + 1}</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            )}
          </Field>

          {/* Save action */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            paddingTop: 4,
          }}>
            <button onClick={handleSave} className="btn-primary" style={{ flex: 1 }}>
              Lưu thay đổi
            </button>
            {saved && (
              <span className="animate-fade-in" style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: 'var(--success)', fontWeight: 600,
              }}>
                <span>✓</span> Đã lưu
              </span>
            )}
            {!isElectron && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Demo mode</span>
            )}
          </div>

          {/* Log path */}
          {logPath && (
            <div style={{
              paddingTop: 14, borderTop: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-tertiary)',
            }}>
              <span style={{ marginRight: 6 }}>Log file:</span>
              <Code small>{logPath}</Code>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, help, children }: {
  label: string; required?: boolean; help?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div>
      <label style={{
        display: 'block', fontSize: 11, fontWeight: 600,
        color: 'var(--text-tertiary)', marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {label}
        {required && <span style={{ marginLeft: 6, color: 'var(--danger)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>bắt buộc</span>}
      </label>
      {children}
      {help && (
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
          {help}
        </p>
      )}
    </div>
  );
}

function Code({ children, small = false }: { children: React.ReactNode; small?: boolean }) {
  return (
    <code style={{
      padding: small ? '1px 5px' : '2px 6px',
      fontSize: small ? 10 : 11,
      background: 'var(--bg-surface)', border: '1px solid var(--border)',
      borderRadius: 4, color: 'var(--text-secondary)',
      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    }}>{children}</code>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 14px', fontSize: 13.5,
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text-primary)', outline: 'none',
  transition: 'all var(--dur)',
};

const linkStyle: React.CSSProperties = {
  color: 'var(--accent)', textDecoration: 'none', fontWeight: 500,
};
