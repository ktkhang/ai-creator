import React from 'react';
import type { SearchSession } from '../../shared/types';

interface Props {
  status: string;
  statusMessage: string;
  session: SearchSession | null;
  currentTheme: string;
}

export default function StatsBar({ status, statusMessage, session }: Props) {
  const isLoading = status === 'searching' || status === 'checking-vcpmc';
  const isDone = status === 'done';

  return (
    <div className="animate-fade-in" style={{
      marginBottom: 14, padding: '8px 14px', borderRadius: 'var(--radius-md)',
      backgroundColor: 'var(--bg-secondary)', border: '0.5px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {isLoading && (
          <>
            <div style={{
              width: 12, height: 12, borderRadius: '50%', border: '1.5px solid var(--border)',
              borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite', flexShrink: 0,
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}
        {isDone && (
          <div style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: 'var(--success)', flexShrink: 0 }} />
        )}
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{statusMessage}</span>
      </div>

      {session && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 12 }}>
          <span style={{ color: 'var(--success)', fontWeight: 500 }}>{session.stats.vcpmcVerified} ket qua</span>
          <span style={{ color: 'var(--text-tertiary)' }}>{(session.stats.elapsedMs / 1000).toFixed(1)}s</span>
        </div>
      )}
    </div>
  );
}
