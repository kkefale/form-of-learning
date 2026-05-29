// ui/src/App.tsx
// Root layout: top bar + TheRiver + TheConstellation, with TheFog and LlmPanel overlays.

import React, { useEffect, useState, useCallback } from 'react';
import TheRiver         from './components/TheRiver';
import TheConstellation from './components/TheConstellation';
import TheFog           from './components/TheFog';
import LlmPanel         from './components/LlmPanel';
import SeedDropdown     from './components/SeedDropdown';
import { useSession }   from './lib/store';
import { useShallow }   from 'zustand/react/shallow';

// ── Top bar ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  onFogOpen:  () => void;
  onLlmOpen:  () => void;
  onClear:    () => void;
}

function TopBar({ onFogOpen, onLlmOpen, onClear }: TopBarProps) {
  const { llm, turnCount, userId, complexityMode } = useSession(useShallow(s => ({
    llm:           s.llm,
    turnCount:     s.turnCount,
    userId:        s.userId,
    complexityMode:s.complexityMode,
  })));

  const shortId = userId.slice(0, 8);

  const btnStyle = (accent = false): React.CSSProperties => ({
    padding: '5px 10px',
    background: accent ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.05)',
    border: `1px solid ${accent ? 'var(--border-glow)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)', fontSize: 11,
    cursor: 'pointer', fontFamily: 'var(--font-sans)',
    transition: 'all var(--transition)',
    display: 'flex', alignItems: 'center', gap: 5,
  });

  return (
    <header style={{
      height: 44, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--bg-elevated)',
    }}>
      {/* Left: logo + seed selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{
          fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          color: 'var(--text-secondary)', textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
        }}>
          ◉ Form
        </span>
        <SeedDropdown />
      </div>

      {/* Right: controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* Turns counter */}
        {turnCount > 0 && (
          <span style={{
            fontSize: 10, color: 'var(--text-dim)',
            padding: '2px 8px', background: 'rgba(255,255,255,0.04)',
            borderRadius: 10, border: '1px solid var(--border)',
          }}>
            {turnCount} turns
          </span>
        )}

        {/* Complexity badge */}
        <span style={{
          fontSize: 10, padding: '2px 8px',
          background: 'rgba(34,211,238,0.08)',
          borderRadius: 10, border: '1px solid var(--border-cyan)',
          color: 'var(--text-dim)',
        }}>
          {complexityMode}
        </span>

        {/* Provider badge */}
        <span style={{
          fontSize: 10, padding: '2px 8px',
          background: llm.provider === 'gemini' ? 'rgba(99,102,241,0.08)' : 'rgba(255,255,255,0.04)',
          borderRadius: 10, border: '1px solid var(--border)',
          color: 'var(--text-dim)',
        }}>
          {llm.provider === 'gemini' ? '✦ gemini' : '⚡ workers ai'}
        </span>

        {/* TheFog button */}
        <button id="fog-btn" style={btnStyle()} onClick={onFogOpen}>
          ≡ fog
        </button>

        {/* LLM config button */}
        <button id="llm-config-btn" style={btnStyle()} onClick={onLlmOpen}>
          ⚙ llm
        </button>

        {/* Clear session */}
        <button
          id="clear-session-btn"
          style={{ ...btnStyle(), color: 'rgba(239,68,68,0.6)' }}
          onClick={onClear}
          title="Clear this conversation (keeps graph)"
        >
          ↺ reset
        </button>

        {/* User ID */}
        <span style={{
          fontSize: 9, color: 'var(--text-dim)', padding: '2px 6px',
          background: 'rgba(255,255,255,0.03)', borderRadius: 4,
          border: '1px solid var(--border)',
          fontFamily: 'var(--font-mono)',
        }}>
          {shortId}
        </span>
      </div>
    </header>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────

export default function App() {
  const [fogOpen, setFogOpen]   = useState(false);
  const [llmOpen, setLlmOpen]   = useState(false);
  const { loadMessages, refreshGraph } = useSession(useShallow(s => ({
    loadMessages:  s.loadMessages,
    refreshGraph:  s.refreshGraph,
  })));
  const clearSession = useSession(s => s.clearSession);

  // Restore session on mount
  useEffect(() => {
    loadMessages();
    refreshGraph();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClear = useCallback(async () => {
    if (window.confirm('Clear this conversation? Your graph knowledge map is preserved.')) {
      await clearSession();
    }
  }, [clearSession]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100vh', overflow: 'hidden',
      background: 'var(--bg-void)',
    }}>
      <TopBar
        onFogOpen={() => setFogOpen(true)}
        onLlmOpen={() => setLlmOpen(true)}
        onClear={handleClear}
      />

      {/* Main panel */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: The River (dialogue) */}
        <TheRiver />

        {/* Right: The Constellation (graph) */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <TheConstellation />
        </div>
      </div>

      {/* Overlays */}
      <TheFog isOpen={fogOpen} onClose={() => setFogOpen(false)} />
      <LlmPanel isOpen={llmOpen} onClose={() => setLlmOpen(false)} />
    </div>
  );
}
