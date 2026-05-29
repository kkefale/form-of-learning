// ui/src/components/AdminPanel.tsx
// Seed Builder — extract a concept graph from any text via LLM, then save as a seed.

import { useState, useEffect, useRef, useCallback } from 'react';
import { extractSeed, saveSeed, type ExtractEvent } from '../lib/api';
import { useSession } from '../lib/store';

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

interface NodePreview  { id: string; label: string; definition?: string }
interface EdgePreview  { src: string; dst: string; rel: string; weight?: number }

export default function AdminPanel({ isOpen, onClose }: Props) {
  const llm = useSession(s => s.llm);

  const [text,        setText]        = useState('');
  const [seedName,    setSeedName]    = useState('');
  const [seedDesc,    setSeedDesc]    = useState('');
  const [busy,        setBusy]        = useState(false);
  const [log,         setLog]         = useState<string[]>([]);
  const [nodes,       setNodes]       = useState<NodePreview[]>([]);
  const [edges,       setEdges]       = useState<EdgePreview[]>([]);
  const [saved,       setSaved]       = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const loadSeeds = useSession(s => s.loadSeeds);

  // Scroll log to bottom
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const reset = () => {
    setLog([]); setNodes([]); setEdges([]);
    setError(null); setSaved(false);
  };

  const handleExtract = useCallback(async () => {
    if (!text.trim() || busy) return;
    reset();
    setBusy(true);
    try {
      for await (const ev of extractSeed(text, llm.provider, llm.model, llm.apiKey)) {
        handleEvent(ev);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }, [text, llm, busy]);

  function handleEvent(ev: ExtractEvent) {
    if (ev.type === 'info')  setLog(l => [...l, `ℹ ${ev.message ?? ''}`]);
    if (ev.type === 'error') setError(ev.message ?? 'Unknown error');
    if (ev.type === 'node') {
      const d = ev.data as unknown as NodePreview;
      setNodes(n => [...n, d]);
      setLog(l => [...l, `+ node  ${d.label ?? d.id}`]);
    }
    if (ev.type === 'edge') {
      const d = ev.data as unknown as EdgePreview;
      setEdges(e => [...e, d]);
      setLog(l => [...l, `→ edge  ${d.src} —[${d.rel}]→ ${d.dst}`]);
    }
    if (ev.type === 'done') {
      setLog(l => [...l, `✓ Done  ${ev.stats?.nodes ?? 0} nodes · ${ev.stats?.edges ?? 0} edges`]);
    }
  }

  const handleSave = useCallback(async () => {
    const name = seedName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!name || nodes.length === 0) return;
    try {
      await saveSeed(name, seedDesc.trim(), nodes, edges);
      setSaved(true);
      await loadSeeds();
      setLog(l => [...l, `✓ Saved seed "${name}"`]);
    } catch (err) {
      setError(String(err));
    }
  }, [seedName, seedDesc, nodes, edges, loadSeeds]);

  if (!isOpen) return null;

  const canExtract = text.trim().length > 0 && !busy;
  const canSave    = nodes.length > 0 && seedName.trim().length > 0 && !busy && !saved;

  // ── Styles ─────────────────────────────────────────────────────────────────
  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(5,5,8,0.85)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    animation: 'fadeIn 0.15s ease',
  };
  const panel: React.CSSProperties = {
    width: 760, maxWidth: 'calc(100vw - 32px)',
    maxHeight: 'calc(100vh - 48px)',
    display: 'flex', flexDirection: 'column',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
  };
  const header: React.CSSProperties = {
    flexShrink: 0, display: 'flex', alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px', borderBottom: '1px solid var(--border)',
  };
  const body: React.CSSProperties = {
    flex: 1, overflow: 'auto', padding: 16,
    display: 'flex', flexDirection: 'column', gap: 12,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
    color: 'var(--text-dim)', textTransform: 'uppercase', marginBottom: 4,
    display: 'block',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '8px 10px',
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)', fontSize: 13,
    fontFamily: 'var(--font-sans)', outline: 'none',
  };
  const btnBase: React.CSSProperties = {
    padding: '7px 14px', borderRadius: 'var(--radius-sm)',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
    transition: 'all var(--transition)',
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panel}>
        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
            color: 'var(--text-secondary)', textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)' }}>
            ⬡ Seed Builder
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', color: 'var(--text-dim)',
            fontSize: 18, cursor: 'pointer', lineHeight: 1,
          }}>×</button>
        </div>

        <div style={body}>
          {/* Source text */}
          <div>
            <label style={labelStyle}>Source material</label>
            <textarea
              value={text}
              onChange={e => { setText(e.target.value); reset(); }}
              placeholder="Paste a textbook excerpt, article, lecture notes… The LLM will extract a concept graph."
              rows={7}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* Extract button */}
          <button
            onClick={handleExtract}
            disabled={!canExtract}
            style={{
              ...btnBase,
              background: canExtract ? 'var(--indigo)' : 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.4)',
              color: canExtract ? '#fff' : 'rgba(255,255,255,0.3)',
              alignSelf: 'flex-start',
            }}
          >
            {busy ? '◌ Extracting…' : '⬡ Extract concept graph'}
          </button>

          {/* Log */}
          {log.length > 0 && (
            <div ref={logRef} style={{
              background: 'var(--bg-void)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: '8px 10px',
              maxHeight: 120, overflowY: 'auto',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--text-dim)', lineHeight: 1.8,
            }}>
              {log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              padding: '8px 10px',
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--red)',
            }}>
              {error}
            </div>
          )}

          {/* Preview grid */}
          {nodes.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Nodes */}
              <div>
                <label style={labelStyle}>{nodes.length} nodes</label>
                <div style={{
                  background: 'var(--bg-void)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '6px 10px',
                  maxHeight: 160, overflowY: 'auto',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-secondary)', lineHeight: 1.9,
                }}>
                  {nodes.map((n, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ color: 'var(--cyan)', flexShrink: 0 }}>⬡</span>
                      <span>{n.label ?? n.id}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Edges */}
              <div>
                <label style={labelStyle}>{edges.length} edges</label>
                <div style={{
                  background: 'var(--bg-void)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)', padding: '6px 10px',
                  maxHeight: 160, overflowY: 'auto',
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-secondary)', lineHeight: 1.9,
                }}>
                  {edges.map((e, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>
                        {e.src} → {e.dst}
                      </span>
                      <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>[{e.rel}]</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Save form */}
          {nodes.length > 0 && (
            <div style={{
              borderTop: '1px solid var(--border)', paddingTop: 12,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <label style={labelStyle}>Save as seed</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 4 }}>Name (slug)</label>
                  <input
                    value={seedName}
                    onChange={e => { setSeedName(e.target.value); setSaved(false); }}
                    placeholder="e.g. thermodynamics"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 4 }}>Description</label>
                  <input
                    value={seedDesc}
                    onChange={e => setSeedDesc(e.target.value)}
                    placeholder="One-line description of this seed"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  style={{
                    ...btnBase,
                    background: saved ? 'rgba(16,185,129,0.2)' : (canSave ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)'),
                    border: `1px solid ${saved ? 'rgba(16,185,129,0.5)' : (canSave ? 'rgba(16,185,129,0.3)' : 'var(--border)')}`,
                    color: canSave || saved ? 'var(--green)' : 'var(--text-dim)',
                    cursor: canSave ? 'pointer' : 'not-allowed',
                  }}
                >
                  {saved ? '✓ Saved' : '↓ Save seed'}
                </button>
                {saved && (
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    Seed is now available in the selector.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
