// ui/src/lib/api.ts
// All fetch() calls to the Worker API live here.
// BASE URL is driven by an env var — no hardcoded localhost.

const rawBase = import.meta.env.VITE_API_URL ?? '';
const BASE = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
// Empty string = same origin (uses Vite proxy in dev, Pages URL in prod)

export type LlmProvider   = 'workersai' | 'gemini';
export type ComplexityMode = 'novice' | 'expert';
export type OperationType  = 'command' | 'question' | 'explanation' | 'execution';
export type Level          = 'L0' | 'L1';
export type AgreementState = 'none' | 'partial' | 'stable' | 'conflict';
export type LearnerStrategy = 'serialist' | 'holist' | 'versatile' | 'unknown';

export interface Triple {
  subject:    string;
  relation:   string;
  object:     string;
  confidence: number;
}

export interface Message {
  role:           'user' | 'assistant';
  content:        string;
  isSingularity?: boolean;
}

export interface LlmConfig {
  provider: LlmProvider;
  model:    string;
  apiKey:   string;
}

export interface TurnResponse {
  response:              string;
  singularity:           boolean;
  zpdNodes:              string[];
  turnCount:             number;
  extractedTriples:      Triple[];
  operationType:         OperationType;
  level:                 Level;
  agreementState:        AgreementState;
  agreementScore:        number;
  teachbackMode:         boolean;
  learnerStrategy:       LearnerStrategy;
  topicWindow:           string[];
  internalContradiction: boolean;
  protectedClaim:        string | null;
  complexityMode:        ComplexityMode;
}

export interface GraphData {
  concepts: Array<{ id: string; label: string; state: string; definition: string }>;
  edges:    Array<{ src: string; dst: string; relation: string; weight: number; confidence: number; is_master: number }>;
  zpd:      string[];
  stats:    { total: number; master: number; studentMapped: number; studentEdges: number };
}

export interface SeedMeta {
  name:        string;
  description: string;
  created_at:  string;
}

export interface ModelOption {
  id:    string;
  label: string;
}

// ── Turn (synchronous) ───────────────────────────────────────────────────────

export async function postTurn(
  studentInput:   string,
  userId:         string,
  llm:            LlmConfig,
  complexityMode: ComplexityMode = 'expert',
): Promise<TurnResponse> {
  const r = await fetch(`${BASE}/api/turn`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      userId,
      studentInput,
      provider:       llm.provider,
      model:          llm.model,
      apiKey:         llm.apiKey,
      complexityMode,
    }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<TurnResponse>;
}

// ── Turn (streaming) ─────────────────────────────────────────────────────────

export async function* streamTurn(
  studentInput:   string,
  userId:         string,
  llm:            LlmConfig,
  complexityMode: ComplexityMode = 'expert',
): AsyncGenerator<{ token?: string; done?: boolean; state?: TurnResponse; error?: string }> {
  const r = await fetch(`${BASE}/api/turn/stream`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      userId,
      studentInput,
      provider:       llm.provider,
      model:          llm.model,
      apiKey:         llm.apiKey,
      complexityMode,
    }),
  });

  if (!r.ok || !r.body) throw new Error(`Stream error: ${r.status}`);

  const reader  = r.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      try {
        yield JSON.parse(line.slice(6));
      } catch { /* skip malformed */ }
    }
  }
}

// ── Graph ────────────────────────────────────────────────────────────────────

export async function getGraph(userId: string): Promise<GraphData> {
  const r = await fetch(`${BASE}/api/graph?user_id=${encodeURIComponent(userId)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<GraphData>;
}

// ── Messages ─────────────────────────────────────────────────────────────────

export async function getMessages(
  userId: string,
): Promise<{ messages: Message[]; turnCount: number }> {
  const r = await fetch(`${BASE}/api/messages?user_id=${encodeURIComponent(userId)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<{ messages: Message[]; turnCount: number }>;
}

// ── Session lifecycle ────────────────────────────────────────────────────────

export async function resetSession(userId: string): Promise<void> {
  await fetch(`${BASE}/api/session?user_id=${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId }),
  });
}

export async function resetAll(userId: string): Promise<void> {
  await fetch(`${BASE}/api/reset`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ userId }),
  });
}

// ── Seeds ────────────────────────────────────────────────────────────────────

export async function listSeeds(): Promise<SeedMeta[]> {
  const r = await fetch(`${BASE}/seeds`);
  if (!r.ok) return [];
  const data = await r.json() as { seeds: SeedMeta[] };
  return data.seeds;
}

export async function activateSeed(name: string, userId: string): Promise<void> {
  const r = await fetch(`${BASE}/api/seed/activate`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, userId }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function initDefaultSeeds(): Promise<void> {
  await fetch(`${BASE}/seeds/init`, { method: 'POST' });
}

export async function saveSeed(
  name:        string,
  description: string,
  nodes:       unknown[],
  edges:       unknown[],
): Promise<void> {
  const r = await fetch(`${BASE}/seeds`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ name, description, nodes, edges }),
  });
  if (!r.ok) throw new Error(await r.text());
}

export interface ExtractEvent {
  type:    'info' | 'node' | 'edge' | 'done' | 'error';
  message?: string;
  data?:   Record<string, unknown>;
  stats?:  { nodes: number; edges: number };
}

export async function* extractSeed(
  text:      string,
  provider?: string,
  model?:    string,
  apiKey?:   string,
): AsyncGenerator<ExtractEvent> {
  const r = await fetch(`${BASE}/admin/extract`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text, provider, model, apiKey }),
  });

  if (!r.ok || !r.body) throw new Error(`Extract error: ${r.status}`);

  const reader  = r.body.getReader();
  const decoder = new TextDecoder();
  let   buffer  = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data: ')) continue;
      try { yield JSON.parse(line.slice(6)) as ExtractEvent; }
      catch { /* skip malformed */ }
    }
  }
}

// ── Models ───────────────────────────────────────────────────────────────────

export async function listModels(provider: LlmProvider): Promise<ModelOption[]> {
  const r = await fetch(`${BASE}/models?provider=${provider}`);
  if (!r.ok) return [];
  const data = await r.json() as { models: ModelOption[] };
  return data.models;
}

export function getUserId(): string {
  const key = 'form-of-learning:user_id';
  let id: string | null = null;
  try {
    id = localStorage.getItem(key);
  } catch (e) {
    console.warn('localStorage is not available:', e);
  }
  if (!id) {
    // Robust UUID generator fallback for non-secure contexts or older browsers
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    try {
      localStorage.setItem(key, id);
    } catch (e) {
      console.warn('Failed to save userId to localStorage:', e);
    }
  }
  return id;
}
