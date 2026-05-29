// ui/src/components/SeedDropdown.tsx
// Seed selector — lists available seeds from D1, activates on selection.

import { useEffect, useRef, useState } from 'react';
import { useSession } from '../lib/store';
import { useShallow } from 'zustand/react/shallow';

export default function SeedDropdown() {
  const { seeds, activeSeed, loadSeeds, selectSeed } = useSession(useShallow(s => ({
    seeds:      s.seeds,
    activeSeed: s.activeSeed,
    loadSeeds:  s.loadSeeds,
    selectSeed: s.selectSeed,
  })));

  const [open, setOpen]         = useState(false);
  const [loading, setLoading]   = useState(false);
  const dropdownRef             = useRef<HTMLDivElement>(null);

  // Load seeds on mount
  useEffect(() => { loadSeeds(); }, [loadSeeds]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = async (name: string) => {
    setOpen(false);
    setLoading(true);
    try {
      await selectSeed(name);
    } finally {
      setLoading(false);
    }
  };

  const currentSeed = seeds.find(s => s.name === activeSeed);

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        id="seed-dropdown-btn"
        onClick={() => setOpen(!open)}
        disabled={loading}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 12px',
          background: activeSeed ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${activeSeed ? 'var(--border-glow)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          color: 'var(--text-secondary)',
          fontSize: 12, cursor: 'pointer',
          transition: 'all var(--transition)',
          minWidth: 180,
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.18)'; }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLElement).style.background = activeSeed
            ? 'rgba(99,102,241,0.12)' : 'rgba(255,255,255,0.05)';
        }}
      >
        <span style={{ fontSize: 12 }}>◉</span>
        <span style={{ flex: 1, textAlign: 'left' }}>
          {loading ? 'Activating…' : (
            activeSeed
              ? (currentSeed?.name.replace(/_/g, ' ') ?? activeSeed)
              : 'Select seed…'
          )}
        </span>
        <span style={{ fontSize: 8, opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0,
          minWidth: 280, maxWidth: 360,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 50, overflow: 'hidden',
          animation: 'fadeIn 0.12s ease',
        }}>
          {seeds.length === 0 ? (
            <div style={{
              padding: '20px 16px', textAlign: 'center',
              color: 'var(--text-dim)', fontSize: 12,
            }}>
              No seeds available. Check your connection.
            </div>
          ) : (
            seeds.map(seed => (
              <button
                key={seed.name}
                id={`seed-option-${seed.name}`}
                onClick={() => handleSelect(seed.name)}
                style={{
                  width: '100%', textAlign: 'left', padding: '10px 14px',
                  display: 'flex', flexDirection: 'column', gap: 3,
                  cursor: 'pointer',
                  background: seed.name === activeSeed
                    ? 'rgba(99,102,241,0.14)'
                    : 'transparent',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text-primary)',
                  transition: 'background var(--transition)',
                }}
                onMouseEnter={e => {
                  if (seed.name !== activeSeed)
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = seed.name === activeSeed
                    ? 'rgba(99,102,241,0.14)' : 'transparent';
                }}
              >
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: seed.name === activeSeed ? 'var(--indigo)' : 'var(--text-primary)',
                  textTransform: 'capitalize',
                }}>
                  {seed.name.replace(/_/g, ' ')}
                  {seed.name === activeSeed && <span style={{ marginLeft: 6, fontSize: 10 }}>✓</span>}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                  {seed.description.slice(0, 90)}{seed.description.length > 90 ? '…' : ''}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
