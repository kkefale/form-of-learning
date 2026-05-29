// ui/src/lib/store.ts
// Zustand session store — single source of truth for the UI.

import { create } from 'zustand';
import type {
  Message,
  GraphData,
  TurnResponse,
  LlmConfig,
  ComplexityMode,
  AgreementState,
  LearnerStrategy,
  OperationType,
  Level,
  SeedMeta,
} from './api';
import {
  streamTurn,
  getGraph,
  getMessages,
  resetSession,
  resetAll,
  listSeeds,
  activateSeed,
  getUserId,
  initDefaultSeeds,
} from './api';

export interface SessionStore {
  // Identity
  userId:         string;

  // Dialogue
  messages:       Message[];
  turnCount:      number;
  streamingText:  string;   // in-flight streamed token accumulator
  isSending:      boolean;
  error:          string | null;

  // Graph
  graph:          GraphData | null;
  zpd:            string[];

  // CT Protocol
  singularity:           boolean;
  operationType:         OperationType;
  level:                 Level;
  agreementState:        AgreementState;
  agreementScore:        number;
  teachbackMode:         boolean;
  learnerStrategy:       LearnerStrategy;
  topicWindow:           string[];
  internalContradiction: boolean;
  protectedClaim:        string | null;

  // Configuration
  llm:            LlmConfig;
  complexityMode: ComplexityMode;
  activeSeed:     string | null;
  seeds:          SeedMeta[];

  // Actions
  sendTurn:       (input: string) => Promise<void>;
  refreshGraph:   () => Promise<void>;
  loadMessages:   () => Promise<void>;
  loadSeeds:      () => Promise<void>;
  selectSeed:     (name: string) => Promise<void>;
  setLlm:         (llm: LlmConfig) => void;
  setComplexity:  (mode: ComplexityMode) => void;
  clearSession:   () => Promise<void>;
  clearAll:       () => Promise<void>;
}

const DEFAULT_LLM: LlmConfig = {
  provider: 'workersai',
  model:    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  apiKey:   '',
};

export const useSession = create<SessionStore>((set, get) => ({
  // ── Initial state ──────────────────────────────────────────────────────────
  userId:                getUserId(),
  messages:              [],
  turnCount:             0,
  streamingText:         '',
  isSending:             false,
  error:                 null,
  graph:                 null,
  zpd:                   [],
  singularity:           false,
  operationType:         'question',
  level:                 'L0',
  agreementState:        'none',
  agreementScore:        0,
  teachbackMode:         false,
  learnerStrategy:       'unknown',
  topicWindow:           [],
  internalContradiction: false,
  protectedClaim:        null,
  llm:                   DEFAULT_LLM,
  complexityMode:        'expert',
  activeSeed:            null,
  seeds:                 [],

  // ── sendTurn — streaming ───────────────────────────────────────────────────
  sendTurn: async (input: string) => {
    const { userId, llm, complexityMode, messages } = get();
    if (!input.trim()) return;

    // Optimistically append user message
    set({
      isSending:    true,
      error:        null,
      streamingText: '',
      messages:     [...messages, { role: 'user', content: input }],
    });

    let fullText   = '';
    let finalState: TurnResponse | null = null;

    try {
      for await (const event of streamTurn(input, userId, llm, complexityMode)) {
        if (event.error) throw new Error(event.error);

        if (event.token) {
          fullText += event.token;
          set({ streamingText: fullText });
        }

        if (event.done && event.state) {
          finalState = event.state;
        }
      }
    } catch (err) {
      set({ isSending: false, error: String(err), streamingText: '' });
      return;
    }

    // Replace streaming placeholder with final persisted message
    if (finalState) {
      applyTurnResponse(set, get, finalState, input);
    } else if (fullText) {
      // Fallback: stream completed but no final state (shouldn't happen)
      set(s => ({
        messages:     [...s.messages.filter(m => !(m.role === 'user' && m.content === input)),
                       { role: 'user', content: input },
                       { role: 'assistant', content: fullText }],
        streamingText: '',
        isSending:    false,
      }));
    }

    // Refresh graph after turn
    get().refreshGraph();
  },

  // ── refreshGraph ──────────────────────────────────────────────────────────
  refreshGraph: async () => {
    try {
      const graph = await getGraph(get().userId);
      set({ graph, zpd: graph.zpd });
    } catch { /* non-critical */ }
  },

  // ── loadMessages (session restore on page load) ────────────────────────────
  loadMessages: async () => {
    try {
      const { messages, turnCount } = await getMessages(get().userId);
      set({ messages, turnCount });
    } catch { /* fresh session */ }
  },

  // ── loadSeeds ────────────────────────────────────────────────────────────
  loadSeeds: async () => {
    try {
      // Ensure defaults are seeded first
      await initDefaultSeeds();
      const seeds = await listSeeds();
      set({ seeds });
    } catch { /* non-critical */ }
  },

  // ── selectSeed ──────────────────────────────────────────────────────────
  selectSeed: async (name: string) => {
    const { userId } = get();
    try {
      await activateSeed(name, userId);
      set({
        activeSeed:   name,
        messages:     [],
        turnCount:    0,
        graph:        null,
        zpd:          [],
        agreementState: 'none',
        agreementScore: 0,
      });
      get().refreshGraph();
    } catch (err) {
      set({ error: `Failed to activate seed: ${String(err)}` });
    }
  },

  // ── setLlm ───────────────────────────────────────────────────────────────
  setLlm: (llm: LlmConfig) => set({ llm }),

  // ── setComplexity ────────────────────────────────────────────────────────
  setComplexity: (mode: ComplexityMode) => set({ complexityMode: mode }),

  // ── clearSession ─────────────────────────────────────────────────────────
  clearSession: async () => {
    await resetSession(get().userId);
    set({
      messages:   [],
      turnCount:  0,
      streamingText: '',
      agreementState: 'none',
      agreementScore: 0,
      learnerStrategy: 'unknown',
      topicWindow: [],
    });
  },

  // ── clearAll ─────────────────────────────────────────────────────────────
  clearAll: async () => {
    await resetAll(get().userId);
    set({
      messages:    [],
      turnCount:   0,
      graph:       null,
      zpd:         [],
      activeSeed:  null,
      streamingText: '',
    });
  },
}));

// ── Helper: apply final turn response to store ────────────────────────────────

function applyTurnResponse(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  set:    (partial: any) => void,
  get:    () => SessionStore,
  state:  TurnResponse,
  input:  string,
): void {
  const prevMessages = get().messages.filter(
    m => !(m.role === 'user' && m.content === input),
  );
  set({
    messages: [
      ...prevMessages,
      { role: 'user',      content: input },
      { role: 'assistant', content: state.response, isSingularity: state.singularity },
    ],
    streamingText:         '',
    isSending:             false,
    turnCount:             state.turnCount,
    zpd:                   state.zpdNodes,
    singularity:           state.singularity,
    operationType:         state.operationType,
    level:                 state.level,
    agreementState:        state.agreementState,
    agreementScore:        state.agreementScore,
    teachbackMode:         state.teachbackMode,
    learnerStrategy:       state.learnerStrategy,
    topicWindow:           state.topicWindow,
    internalContradiction: state.internalContradiction,
    protectedClaim:        state.protectedClaim,
    error:                 null,
  });
}
