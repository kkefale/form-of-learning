// ui/src/components/LlmPanel.tsx
// LLM configuration panel: switch provider, pick model, enter BYOK API key.

import React, { useEffect, useState } from 'react';
import { useSession } from '../lib/store';
import { useShallow } from 'zustand/react/shallow';
import { listModels, type LlmProvider, type ModelOption } from '../lib/api';

interface Props {
  isOpen:  boolean;
  onClose: () => void;
}

export default function LlmPanel({ isOpen, onClose }: Props) {
  const { llm, setLlm, complexityMode, setComplexity } = useSession(useShallow(s => ({
    llm:          s.llm,
    setLlm:       s.setLlm,
    complexityMode: s.complexityMode,
    setComplexity:  s.setComplexity,
  })));

  const [models, setModels]   = useState<ModelOption[]>([]);
  const [apiKey, setApiKey]   = useState(llm.apiKey);
  const [loading, setLoading] = useState(false);

  // Load models when provider changes or panel opens
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    listModels(llm.provider)
      .then(m => { setModels(m); setLoading(false); })
      .catch(() => setLoading(false));
  }, [llm.provider, isOpen]);

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  if (!isOpen) return null;

  const handleProvider = (provider: LlmProvider) => {
    const defaultModel = provider === 'workersai'
      ? '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
      : 'gemini-2.0-flash';
    setLlm({ provider, model: defaultModel, apiKey: provider === 'workersai' ? '' : apiKey });
  };

  const handleModel = (model: string) => setLlm({ ...llm, model });
  const handleApiKey = (key: string) => {
    setApiKey(key);
    setLlm({ ...llm, apiKey: key });
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
    color: 'var(--text-dim)', textTransform: 'uppercase',
    marginBottom: 6, display: 'block',
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: 18,
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end',
      padding: 16, pointerEvents: 'none',
    }}>
      {/* Backdrop */}
      <div
        style={{
          position: 'fixed', inset: 0, background: 'rgba(5,5,8,0.5)',
          pointerEvents: 'auto',
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          position: 'relative', zIndex: 1, pointerEvents: 'auto',
          width: 280, marginTop: 40,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          padding: '16px',
          animation: 'fadeIn 0.15s ease',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 16,
        }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
            LLM Configuration
          </span>
          <button
            onClick={onClose}
            style={{ fontSize: 16, color: 'var(--text-dim)', cursor: 'pointer' }}
          >×</button>
        </div>

        {/* Provider selector */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Provider</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['workersai', 'gemini'] as LlmProvider[]).map(p => (
              <button
                key={p}
                id={`provider-${p}`}
                onClick={() => handleProvider(p)}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  background: llm.provider === p ? 'var(--indigo)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${llm.provider === p ? 'var(--indigo)' : 'var(--border)'}`,
                  color: llm.provider === p ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all var(--transition)',
                }}
              >
                {p === 'workersai' ? '⚡ Workers AI' : '✦ Gemini'}
              </button>
            ))}
          </div>
          {llm.provider === 'workersai' && (
            <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
              Built-in. No API key needed. Free tier included.
            </p>
          )}
        </div>

        {/* Model selector */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Model</label>
          {loading ? (
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>Loading models…</div>
          ) : (
            <select
              id="model-select"
              value={llm.model}
              onChange={e => handleModel(e.target.value)}
              style={{
                width: '100%', padding: '7px 10px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)', fontSize: 11,
              }}
            >
              {models.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          )}
        </div>

        {/* Gemini API key */}
        {llm.provider === 'gemini' && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Gemini API Key</label>
            <input
              id="gemini-api-key"
              type="password"
              value={apiKey}
              onChange={e => handleApiKey(e.target.value)}
              placeholder="AIza…"
              style={{
                width: '100%', padding: '7px 10px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)', fontSize: 11,
              }}
            />
            <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
              Your key stays in the browser. Never stored server-side.
            </p>
          </div>
        )}

        {/* Complexity mode */}
        <div style={sectionStyle}>
          <label style={labelStyle}>Complexity Mode</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['novice', 'expert'] as const).map(m => (
              <button
                key={m}
                id={`complexity-${m}`}
                onClick={() => setComplexity(m)}
                style={{
                  flex: 1, padding: '6px 10px', fontSize: 11, fontWeight: 600,
                  borderRadius: 'var(--radius-sm)',
                  background: complexityMode === m ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${complexityMode === m ? 'var(--border-cyan)' : 'var(--border)'}`,
                  color: complexityMode === m ? 'var(--cyan)' : 'var(--text-secondary)',
                  cursor: 'pointer', transition: 'all var(--transition)',
                }}
              >
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <p style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 6 }}>
            {complexityMode === 'novice'
              ? 'Plain language. Concrete examples. Gentle perturbations.'
              : 'Full depth. Technical terms. Rigorous cross-examination.'}
          </p>
        </div>
      </div>
    </div>
  );
}
