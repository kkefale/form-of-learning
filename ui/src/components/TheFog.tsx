// ui/src/components/TheFog.tsx
// Ambient scratchpad — persisted to localStorage.
// A place to think alongside the machine without the machine watching.

import { useState, useEffect, useRef } from 'react';

const STORAGE_KEY = 'form-of-learning:fog';

interface Props {
  isOpen:    boolean;
  onClose:   () => void;
}

export default function TheFog({ isOpen, onClose }: Props) {
  const [text, setText] = useState('');
  const textareaRef     = useRef<HTMLTextAreaElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setText(saved);
    } catch (e) {
      console.warn('Failed to load scratchpad from localStorage:', e);
    }
  }, []);

  // Auto-save on change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, text);
    } catch (e) {
      console.warn('Failed to auto-save scratchpad to localStorage:', e);
    }
  }, [text]);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const charCount = text.length;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'flex-end',
      animation: 'fadeIn 0.15s ease',
    }}>
      {/* Backdrop */}
      <div
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(5,5,8,0.7)',
          backdropFilter: 'blur(4px)',
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxHeight: '50vh',
        background: 'var(--bg-elevated)',
        borderTop: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp 0.2s ease',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px 0',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: '0.12em',
              color: 'var(--text-dim)', textTransform: 'uppercase',
            }}>
              The Fog — Private Scratchpad
            </span>
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {wordCount} words · {charCount} chars
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={() => {
                setText('');
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch (e) {
                  console.warn('Failed to remove scratchpad from localStorage:', e);
                }
              }}
              style={{
                fontSize: 10, color: 'var(--red)', padding: '2px 8px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer', transition: 'all var(--transition)',
              }}
            >
              Clear
            </button>
            <button
              id="fog-close-btn"
              onClick={onClose}
              style={{
                fontSize: 16, color: 'var(--text-dim)', lineHeight: 1,
                width: 24, height: 24, display: 'flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: 4,
                cursor: 'pointer', transition: 'color var(--transition)',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.color = 'var(--text-dim)'; }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={
`This space is yours. The machine doesn't see what you write here.

Use it to:
— Think through what you actually believe
— Draft your teachback explanation
— Note what confused you
— Map your own counter-framework

Saved automatically to this browser. Press Esc to close.`
          }
          style={{
            flex: 1, resize: 'none',
            padding: '12px 16px',
            background: 'transparent',
            border: 'none', outline: 'none',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 13, lineHeight: 1.75,
            minHeight: 120,
          }}
        />

        {/* Footer note */}
        <div style={{
          padding: '6px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 10, color: 'var(--text-dim)',
          flexShrink: 0,
        }}>
          Stored in browser localStorage only. Not sent to any server.
        </div>
      </div>
    </div>
  );
}
