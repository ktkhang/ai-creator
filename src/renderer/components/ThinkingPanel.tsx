import React, { useEffect, useRef, useState } from 'react';
import type { ThinkingStep, SearchSession } from '../../shared/types';

interface Props {
  steps: ThinkingStep[];
  isRunning: boolean;
  statusMessage: string;
  session: SearchSession | null;
  resultCount: number;
  targetCount: number;
}

const PHASES: Array<{ key: ThinkingStep['phase']; label: string; icon: React.ReactNode }> = [
  { key: 'criteria', label: 'Phân tích',  icon: <DotIcon /> },
  { key: 'vcpmc',    label: 'VCPMC',      icon: <DiscIcon /> },
  { key: 'curate',   label: 'Kiểm duyệt', icon: <CheckIcon /> },
  { key: 'expand',   label: 'Mở rộng',    icon: <RefreshIcon /> },
];

function DotIcon() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><circle cx="5.5" cy="5.5" r="3" /></svg>;
}
function DiscIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="5.5" cy="5.5" r="4" /><circle cx="5.5" cy="5.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 6l2.5 2.5L9 3" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 4a4 4 0 1 0 1 3" /><polyline points="9 1 9 4 6 4" />
    </svg>
  );
}

export default function ThinkingPanel({
  steps, isRunning, statusMessage, session, resultCount, targetCount,
}: Props) {
  // Aggregate latest status per phase
  const phaseState = new Map<ThinkingStep['phase'], ThinkingStep>();
  for (const s of steps) phaseState.set(s.phase, s);

  // Live elapsed timer (only while running)
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  useEffect(() => {
    if (isRunning) {
      if (startRef.current == null) startRef.current = Date.now();
      const iv = setInterval(() => {
        if (startRef.current) setElapsed(Math.round((Date.now() - startRef.current) / 100) / 10);
      }, 100);
      return () => clearInterval(iv);
    }
    startRef.current = null;
    setElapsed(0);
    return undefined;
  }, [isRunning]);

  // Compute progress %
  const phasesDone = PHASES.filter((p) => phaseState.get(p.key)?.status === 'done').length;
  const phasesActive = PHASES.filter((p) => phaseState.get(p.key)?.status === 'running').length;
  // Blend phase progress (60%) with result-collection progress (40%)
  const phasePct = (phasesDone + phasesActive * 0.5) / PHASES.length;
  const resultPct = targetCount > 0 ? Math.min(1, resultCount / targetCount) : 0;
  const progressPct = isRunning
    ? Math.max(2, Math.round((phasePct * 0.6 + resultPct * 0.4) * 100))
    : (session ? 100 : 0);

  if (!isRunning && !session) return null;

  const elapsedDisplay = session
    ? (session.stats.elapsedMs / 1000).toFixed(1)
    : elapsed.toFixed(1);

  return (
    <div
      className="animate-fade-up glass"
      style={{
        padding: '14px 18px',
        borderRadius: 'var(--r-lg)',
        marginBottom: 16,
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top progress bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: 'rgba(255,255,255,0.05)',
      }}>
        <div
          style={{
            height: '100%',
            width: `${progressPct}%`,
            background: session && !isRunning ? 'var(--success)' : 'var(--brand-grad)',
            transition: 'width 0.5s var(--ease-out)',
            boxShadow: '0 0 12px rgba(167,139,250,0.6)',
          }}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        {/* Phase chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
          {PHASES.map((p, i) => {
            const st = phaseState.get(p.key);
            const status = st?.status ?? (isRunning && i === 0 ? 'running' : 'pending');
            return (
              <React.Fragment key={p.key}>
                <PhasePill phase={p} status={status} />
                {i < PHASES.length - 1 && (
                  <span style={{
                    width: 14, height: 1,
                    background: 'var(--border-strong)',
                    flexShrink: 0,
                  }} />
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, flexShrink: 0 }}>
          <Stat label="Đã tìm" value={`${resultCount}/${targetCount}`} highlight={session != null} />
          <span style={{ width: 1, height: 14, background: 'var(--border-strong)' }} />
          <Stat label="Thời gian" value={`${elapsedDisplay}s`} />
        </div>
      </div>

      {/* Live message (only while running) */}
      {isRunning && statusMessage && (
        <div style={{
          marginTop: 10, paddingTop: 10,
          borderTop: '1px dashed var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 12, color: 'var(--text-secondary)',
        }}>
          <span className="eq" style={{ color: 'var(--accent)' }}>
            <i /><i /><i /><i />
          </span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {statusMessage}
          </span>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4 }}>
      <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{label}</span>
      <span style={{
        color: highlight ? 'var(--success)' : 'var(--text-primary)',
        fontWeight: 600, fontVariantNumeric: 'tabular-nums',
      }}>{value}</span>
    </span>
  );
}

function PhasePill({
  phase, status,
}: { phase: typeof PHASES[number]; status: ThinkingStep['status'] | 'pending' }) {
  const palette = {
    pending: { bg: 'transparent',                   bd: 'var(--border)',          fg: 'var(--text-quaternary)' },
    running: { bg: 'var(--accent-soft)',            bd: 'var(--border-vivid)',    fg: 'var(--accent)' },
    done:    { bg: 'rgba(52,211,153,0.10)',         bd: 'rgba(52,211,153,0.35)',  fg: 'var(--success)' },
    error:   { bg: 'rgba(248,113,113,0.10)',        bd: 'rgba(248,113,113,0.35)', fg: 'var(--danger)' },
  }[status];

  return (
    <div
      className={status === 'running' ? 'animate-glow' : undefined}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '5px 10px',
        borderRadius: 'var(--r-pill)',
        background: palette.bg,
        border: `1px solid ${palette.bd}`,
        color: palette.fg,
        fontSize: 11.5, fontWeight: 600, letterSpacing: '0.01em',
        transition: 'all var(--dur)',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14,
      }}>
        {status === 'done' ? <CheckIcon /> : status === 'running' ? <Spinner /> : phase.icon}
      </span>
      <span>{phase.label}</span>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" className="animate-spin">
      <circle cx="5.5" cy="5.5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 12" strokeLinecap="round" />
    </svg>
  );
}
