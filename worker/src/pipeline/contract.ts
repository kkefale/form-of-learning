// worker/src/pipeline/contract.ts
// Agent 1 — Strict Conversation Contract Builder.
// Scopes each turn to a bounded topic set before any graph operations occur.
// Implements Pask's strict conversation constraint.

import { chat, FAST_MODEL_WORKERSAI } from '../llm/index';
import type { LlmConfig, TeachingState, ConversationContract, OperationType, Level } from './types';

const SYSTEM = `You are the Strict Conversation Contract Builder in a cybernetic tutoring system.

Before the machine responds each turn, you define the bounded scope of this conversational cycle.
This prevents open-ended drift and enables agreement measurement.

Given the student's ZPD frontier, current agreement state, turn history, and detected learner strategy,
output a conversation contract as ONLY valid JSON:
{
  "topic_ids":         ["ConceptA", "ConceptB"],
  "operation_type":    "command" | "question" | "explanation" | "execution",
  "level":             "L0" | "L1",
  "success_criteria":  "one sentence: what counts as provisional agreement this turn",
  "trigger_teachback": true | false
}

Rules:
- topic_ids: strict subset of ZPD or the student's current input concepts (max 3).
  If ZPD is empty, pick the 1-2 concepts the student just mentioned.
- L0 = procedural: how to recognize, construct, or maintain a concept.
  L1 = explanatory: why the concept relates to or entails others.
  Always start L0 on any new topic. Shift to L1 only after partial L0 agreement.
- operation_type semantics:
  command:     machine directs student to perform or examine a concept.
  question:    machine probes student understanding with an open question.
  explanation: machine requests student to explain/reconstruct a concept (teachback).
  execution:   machine asks student to demonstrate/apply a concept procedurally.
- trigger_teachback = true when:
  (a) agreement_score < 0.4 after 3+ consecutive turns on the same topic, OR
  (b) turn_count >= 3 and the student still has not reconstructed the concept in their own words.
- When trigger_teachback = true, set operation_type = "explanation".
- Output ONLY the JSON object. No prose, no markdown fences.`;

const DEFAULT_CONTRACT: ConversationContract = {
  topicIds:         [],
  operationType:    'question',
  level:            'L0',
  successCriteria:  'student restates the concept in their own words without internal contradiction',
  triggerTeachback: false,
};

export async function runContract(
  state:  TeachingState,
  llm:    LlmConfig,
): Promise<Partial<TeachingState>> {
  const recentUserTurns = state.messages
    .filter(m => m.role === 'user')
    .slice(-2)
    .map(m => m.content);

  const context = JSON.stringify({
    zpd_nodes:             state.zpdNodes.slice(0, 6),
    agreement_state:       state.agreementState,
    agreement_score:       Math.round(state.agreementScore * 100) / 100,
    current_level:         state.level,
    learner_strategy:      state.learnerStrategy,
    turn_count:            state.turnCount,
    recent_student_turns:  recentUserTurns,
    current_input:         state.studentInput,
  });

  // Use fast model for structured JSON output
  const fastLlm: LlmConfig = {
    ...llm,
    model: llm.provider === 'workersai' ? FAST_MODEL_WORKERSAI : llm.model,
  };

  let raw: string;
  try {
    raw = await chat(fastLlm, [
      { role: 'system', content: SYSTEM },
      { role: 'user',   content: context },
    ], { formatJson: true, temperature: 0.1 });
  } catch {
    raw = '';
  }

  let contract: ConversationContract = { ...DEFAULT_CONTRACT };

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(raw) as any;
    const topicIds = Array.isArray(parsed.topic_ids) ? parsed.topic_ids as string[] : DEFAULT_CONTRACT.topicIds;
    const opType   = (['command','question','explanation','execution'] as OperationType[])
                       .includes(parsed.operation_type) ? parsed.operation_type as OperationType : 'question';
    const level    = (['L0','L1'] as Level[]).includes(parsed.level) ? parsed.level as Level : 'L0';

    contract = {
      topicIds,
      operationType:    opType,
      level,
      successCriteria:  typeof parsed.success_criteria === 'string' ? parsed.success_criteria : DEFAULT_CONTRACT.successCriteria,
      triggerTeachback: Boolean(parsed.trigger_teachback),
    };
  } catch {
    contract = {
      ...DEFAULT_CONTRACT,
      topicIds: state.zpdNodes.slice(0, 2),
    };
  }

  // Guardrail: never force teachback in the opening turns
  if (state.turnCount < 3 && contract.triggerTeachback) {
    contract.triggerTeachback = false;
    if (contract.operationType === 'explanation') contract.operationType = 'question';
  }

  return {
    conversationContract: contract,
    topicWindow:          contract.topicIds,
    operationType:        contract.operationType,
    level:                contract.level,
    teachbackMode:        contract.triggerTeachback,
  };
}
