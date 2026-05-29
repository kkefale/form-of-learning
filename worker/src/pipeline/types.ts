// worker/src/pipeline/types.ts
// Canonical types shared across all agents and the Durable Object.

// ── LLM ──────────────────────────────────────────────────────────────────────

export type LlmProvider = 'workersai' | 'gemini';

export interface LlmConfig {
  provider:  LlmProvider;
  model:     string;
  apiKey:    string;            // Gemini only; never persisted
  ai:        Ai;                // Cloudflare AI binding (Workers AI)
}

export interface ChatMessage {
  role:    'system' | 'user' | 'assistant';
  content: string;
}

// ── Graph ─────────────────────────────────────────────────────────────────────

export type NodeState =
  | 'MASTER'
  | 'UNKNOWN'
  | 'EXPLORING'
  | 'UNDERSTANDS'
  | 'BELIEVES_INCORRECTLY'
  | 'INCUBATING';

export interface Triple {
  subject:    string;
  relation:   string;
  object:     string;
  confidence: number;
}

export interface ConversationContract {
  topicIds:        string[];
  operationType:   OperationType;
  level:           Level;
  successCriteria: string;
  triggerTeachback: boolean;
}

export type OperationType = 'command' | 'question' | 'explanation' | 'execution';
export type Level          = 'L0' | 'L1';
export type AgreementState = 'none' | 'partial' | 'stable' | 'conflict';
export type LearnerStrategy = 'serialist' | 'holist' | 'versatile' | 'unknown';
export type ComplexityMode  = 'novice' | 'expert';

// ── Session ───────────────────────────────────────────────────────────────────

export interface Message {
  role:           'user' | 'assistant';
  content:        string;
  isSingularity?: boolean;
}

export interface TeachingState {
  // Identity
  userId:                string;
  seedName:              string;
  seedDescription:       string;
  complexityMode:        ComplexityMode;

  // Dialogue
  studentInput:          string;
  messages:              Message[];
  perturbedResponse:     string;
  turnCount:             number;

  // Ontological map
  zpdNodes:              string[];
  topicWindow:           string[];
  extractedTriples:      Triple[];

  // Conversation Theory protocol
  conversationContract:  ConversationContract;
  operationType:         OperationType;
  level:                 Level;

  // Agreement tracking
  agreementState:        AgreementState;
  agreementScore:        number;

  // Defender analysis
  singularityDetected:   boolean;
  internalContradiction: boolean;
  protectedClaim:        string | null;
  defenderReasoning:     string;

  // Pedagogical policy
  teachbackMode:         boolean;
  learnerStrategy:       LearnerStrategy;
  incubationMode:        boolean;

  // LLM config (per-request; never persisted to DO storage)
  llmProvider:           LlmProvider;
  llmModel:              string;
  llmApiKey:             string;
}

export const DEFAULT_STATE: Omit<TeachingState, 'userId'> = {
  seedName:              '',
  seedDescription:       '',
  complexityMode:        'expert',
  studentInput:          '',
  messages:              [],
  perturbedResponse:     '',
  turnCount:             0,
  zpdNodes:              [],
  topicWindow:           [],
  extractedTriples:      [],
  conversationContract: {
    topicIds:         [],
    operationType:    'question',
    level:            'L0',
    successCriteria:  '',
    triggerTeachback: false,
  },
  operationType:         'question',
  level:                 'L0',
  agreementState:        'none',
  agreementScore:        0,
  singularityDetected:   false,
  internalContradiction: false,
  protectedClaim:        null,
  defenderReasoning:     '',
  teachbackMode:         false,
  learnerStrategy:       'unknown',
  incubationMode:        false,
  // LLM defaults (overridden per-request)
  llmProvider:           'workersai',
  llmModel:              '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  llmApiKey:             '',
};

// Fields that are persisted to DO storage (excludes sensitive LLM fields)
export const PERSIST_KEYS: (keyof TeachingState)[] = [
  'userId', 'seedName', 'seedDescription', 'complexityMode',
  'messages', 'turnCount', 'incubationMode',
  'zpdNodes', 'topicWindow',
  'conversationContract', 'operationType', 'level',
  'agreementState', 'agreementScore',
  'singularityDetected', 'internalContradiction', 'protectedClaim', 'defenderReasoning',
  'teachbackMode', 'learnerStrategy',
];

export function pickPersistable(state: TeachingState): Partial<TeachingState> {
  return Object.fromEntries(
    PERSIST_KEYS.map(k => [k, state[k]])
  ) as Partial<TeachingState>;
}

// ── API contracts ─────────────────────────────────────────────────────────────

export interface TurnRequest {
  userId:         string;
  studentInput:   string;
  provider:       LlmProvider;
  model:          string;
  apiKey:         string;
  complexityMode: ComplexityMode;
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

export function buildTurnResponse(s: TeachingState): TurnResponse {
  return {
    response:              s.perturbedResponse,
    singularity:           s.singularityDetected,
    zpdNodes:              s.zpdNodes,
    turnCount:             s.turnCount,
    extractedTriples:      s.extractedTriples,
    operationType:         s.operationType,
    level:                 s.level,
    agreementState:        s.agreementState,
    agreementScore:        s.agreementScore,
    teachbackMode:         s.teachbackMode,
    learnerStrategy:       s.learnerStrategy,
    topicWindow:           s.topicWindow,
    internalContradiction: s.internalContradiction,
    protectedClaim:        s.protectedClaim,
    complexityMode:        s.complexityMode,
  };
}

// ── Cloudflare env ────────────────────────────────────────────────────────────

export interface Env {
  SESSION_DO:  DurableObjectNamespace;
  DB:          D1Database;
  AI:          Ai;
  CORS_ORIGIN: string;
}
