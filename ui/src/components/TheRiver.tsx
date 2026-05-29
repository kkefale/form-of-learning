// ui/src/components/TheRiver.tsx
// The main dialogue stream — conversation history with streaming support.

import React, { useRef, useEffect, useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { useSession } from '../lib/store';
import { useShallow } from 'zustand/react/shallow';

// ── Metadata pill ─────────────────────────────────────────────────────────────

interface PillProps { label: string; value: string; color?: string }
function Pill({ label, value, color = 'rgba(255,255,255,0.1)' }: PillProps) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: color, borderRadius: 20, padding: '2px 8px',
      fontSize: 10, fontWeight: 500, letterSpacing: '0.04em',
      color: 'var(--text-secondary)',
    }}>
      <span style={{ color: 'var(--text-dim)', fontWeight: 400 }}>{label}</span>
      {value}
    </span>
  );
}

// ── Agreement bar ─────────────────────────────────────────────────────────────

function AgreementBar({ score, state }: { score: number; state: string }) {
  const color = state === 'stable'   ? 'var(--green)'
              : state === 'conflict' ? 'var(--red)'
              : state === 'partial'  ? 'var(--cyan)'
              : 'rgba(255,255,255,0.15)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 60, height: 3, background: 'rgba(255,255,255,0.08)',
        borderRadius: 2, overflow: 'hidden',
      }}>
        <div style={{
          width: `${Math.round(score * 100)}%`, height: '100%',
          background: color, borderRadius: 2,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>
        {Math.round(score * 100)}%
      </span>
    </div>
  );
}

// ── Individual message ────────────────────────────────────────────────────────

interface MessageBubbleProps {
  role:          'user' | 'assistant';
  content:       string;
  isSingularity?: boolean;
  isStreaming?:  boolean;
}

function MessageBubble({ role, content, isSingularity, isStreaming }: MessageBubbleProps) {
  const isUser = role === 'user';
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 16, animation: 'fadeIn 0.2s ease',
    }}>
      <div style={{
        maxWidth: '78%',
        background: isUser ? 'rgba(99,102,241,0.14)' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isUser
          ? 'rgba(99,102,241,0.25)'
          : isSingularity ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
        borderRadius: isUser
          ? 'var(--radius) var(--radius) 4px var(--radius)'
          : 'var(--radius) var(--radius) var(--radius) 4px',
        padding: '10px 14px',
        fontSize: 14, lineHeight: 1.65,
        color: isUser ? 'var(--text-primary)' : 'var(--text-primary)',
        boxShadow: isSingularity ? '0 0 16px rgba(245,158,11,0.1)' : 'none',
      }}>
        {isSingularity && (
          <div style={{
            fontSize: 10, fontWeight: 600, color: 'var(--amber)',
            letterSpacing: '0.08em', marginBottom: 6,
            textTransform: 'uppercase',
          }}>
            ⚡ Singularity Event
          </div>
        )}
        <div className="message-body">
          {isUser ? (
            <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{content}</p>
          ) : (
            <ReactMarkdown>{content}</ReactMarkdown>
          )}
          {isStreaming && (
            <span style={{
              display: 'inline-block', width: 7, height: 14,
              background: 'var(--cyan)', borderRadius: 1, marginLeft: 2,
              animation: 'pulse 0.7s infinite',
              verticalAlign: 'text-bottom',
            }} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status bar ────────────────────────────────────────────────────────────────

function StatusBar() {
  const {
    level, operationType, agreementState, agreementScore,
    learnerStrategy,    teachbackMode, topicWindow, turnCount,
  } = useSession(useShallow(s => ({
    level:          s.level,
    operationType:  s.operationType,
    agreementState: s.agreementState,
    agreementScore: s.agreementScore,
    learnerStrategy:s.learnerStrategy,
    teachbackMode:  s.teachbackMode,
    topicWindow:    s.topicWindow,
    turnCount:      s.turnCount,
  })));

  if (turnCount === 0) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      padding: '6px 16px', borderTop: '1px solid var(--border)',
      background: 'var(--bg-elevated)',
      flexShrink: 0,
    }}>
      <Pill label="level" value={level} color="rgba(34,211,238,0.1)" />
      <Pill label="op" value={operationType} />
      <AgreementBar score={agreementScore} state={agreementState} />
      {learnerStrategy !== 'unknown' && (
        <Pill label="strategy" value={learnerStrategy} />
      )}
      {teachbackMode && (
        <Pill label="" value="teachback" color="rgba(245,158,11,0.15)" />
      )}
      {topicWindow.length > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 4 }}>
          ▸ {topicWindow.join(' · ')}
        </span>
      )}
    </div>
  );
}

// ── Input area ────────────────────────────────────────────────────────────────

function InputArea() {
  const [text, setText] = useState('');
  const { sendTurn, isSending, activeSeed, error } = useSession(useShallow(s => ({
    sendTurn:   s.sendTurn,
    isSending:  s.isSending,
    activeSeed: s.activeSeed,
    error:      s.error,
  })));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;
    sendTurn(trimmed);
    setText('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }, [text, isSending, sendTurn]);

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    // Auto-resize
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  };

  const placeholder = !activeSeed
    ? 'Select a seed from the top bar to begin…'
    : isSending
      ? 'Perturbing…'
      : 'Type your thought. Press Enter to send. Shift+Enter for newline.';

  return (
    <div style={{
      flexShrink: 0,
      padding: '12px 16px',
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-elevated)',
    }}>
      {error && (
        <div style={{
          marginBottom: 8, padding: '6px 10px',
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--red)',
        }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKey}
          placeholder={placeholder}
          disabled={isSending || !activeSeed}
          rows={1}
          style={{
            flex: 1, resize: 'none', minHeight: 40,
            padding: '10px 12px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 14, lineHeight: 1.5,
            fontFamily: 'var(--font-sans)',
            transition: 'border-color var(--transition)',
            outline: 'none',
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--border-glow)'; }}
          onBlur={e => { e.target.style.borderColor = 'var(--border)'; }}
        />
        <button
          id="send-turn-btn"
          onClick={submit}
          disabled={isSending || !text.trim() || !activeSeed}
          style={{
            height: 40, minWidth: 40, padding: '0 16px',
            background: isSending ? 'rgba(99,102,241,0.3)' : 'var(--indigo)',
            borderRadius: 'var(--radius-sm)',
            color: '#fff', fontSize: 13, fontWeight: 600,
            transition: 'all var(--transition)',
            opacity: (!text.trim() || !activeSeed) ? 0.4 : 1,
            cursor: isSending || !text.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {isSending ? (
            <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>◌</span>
          ) : '↑'}
        </button>
      </div>
    </div>
  );
}

// ── TheRiver ──────────────────────────────────────────────────────────────────

export default function TheRiver() {
  const { messages, streamingText, isSending, activeSeed, singularity } = useSession(useShallow(s => ({
    messages:      s.messages,
    streamingText: s.streamingText,
    isSending:     s.isSending,
    activeSeed:    s.activeSeed,
    singularity:   s.singularity,
  })));

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      width: '55%', minWidth: 340,
      borderRight: '1px solid var(--border)',
      overflow: 'hidden', position: 'relative',
    }}>
      {/* Singularity glow overlay */}
      {singularity && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          background: 'radial-gradient(ellipse at 50% 0%, rgba(245,158,11,0.05) 0%, transparent 70%)',
          zIndex: 0,
        }} />
      )}

      {/* Message list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: '20px 16px',
        display: 'flex', flexDirection: 'column',
        position: 'relative', zIndex: 1,
      }}>
        {messages.length === 0 && !isSending ? (
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', textAlign: 'center',
            gap: 12, padding: '40px 20px',
            animation: 'fadeIn 0.4s ease',
          }}>
            <div style={{ fontSize: 32, marginBottom: 4 }}>◉</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>
              THE FORM OF LEARNING
            </div>
            <div style={{ fontSize: 12, maxWidth: 280, lineHeight: 1.7 }}>
              {activeSeed
                ? `Seed "${activeSeed}" is active. Begin the dialogue.`
                : 'Select a seed ontology above to begin. The machine perturbs — you reorganise.'}
            </div>
          </div>
        ) : (
          <>
            {messages.filter(m => !(m.role === 'user' && m.content === (
              // Filter out the optimistic user message if we have a streaming response
              streamingText ? messages[messages.length - 1]?.content : ''
            ))).map((msg, i) => (
              <MessageBubble
                key={i}
                role={msg.role}
                content={msg.content}
                isSingularity={msg.isSingularity}
              />
            ))}
            {/* Streaming assistant response */}
            {streamingText && (
              <MessageBubble
                role="assistant"
                content={streamingText}
                isStreaming={true}
              />
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Status bar */}
      <StatusBar />

      {/* Input */}
      <InputArea />
    </div>
  );
}
