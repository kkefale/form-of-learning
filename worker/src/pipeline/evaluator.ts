// worker/src/pipeline/evaluator.ts
// Agent 4 — Agreement Convergence Scorer.
// Measures how well the student's expressed understanding converges toward
// agreed conceptual relations within the current strict conversation contract.
// Also infers the learner strategy (serialist / holist / versatile).

import { chat, FAST_MODEL_WORKERSAI } from '../llm/index';
import type { LlmConfig, TeachingState, AgreementState, LearnerStrategy } from './types';

const SYSTEM = `You are the Agreement Evaluator in a cybernetic tutoring pipeline.

Measure how well the student's expressed understanding converges toward
agreed conceptual relations within the bounded topic set of the active contract.

You receive: the student's input, extracted triples, the active contract,
the prior agreement state and score, the learner's strategy, and recent history.

Output ONLY valid JSON:
{
  "agreement_state":   "none" | "partial" | "stable" | "conflict",
  "agreement_score":   0.0,
  "learner_strategy":  "serialist" | "holist" | "versatile" | "unknown",
  "convergence_note":  "one sentence: what the student demonstrated or still needs"
}

Scoring guide:
  none    (0.00–0.20): no relevant claims about the contracted topics.
  partial (0.20–0.70): relevant claims but incomplete, imprecise, or one-sided.
  stable  (0.70–1.00): entailment relations demonstrated at both L0 and L1; no contradiction.
  conflict (any score): student's claim contradicts their OWN prior stated beliefs.

Learner strategy inference:
  serialist:  progresses step-by-step, cites specific definitions, dislikes conceptual leaps.
  holist:     grasps global structure first, comfortable with relational jumps.
  versatile:  moves fluidly between procedural and structural modes.
  unknown:    insufficient interaction data to classify yet.

CRITICAL RULE: never penalise a student for contradicting mainstream consensus.
Only classify 'conflict' for internal contradictions within their own stated framework.
Output ONLY the JSON object. No prose, no markdown fences.`;

export async function runEvaluator(
  state: TeachingState,
  llm:   LlmConfig,
): Promise<Partial<TeachingState>> {
  const recentHistory = state.messages.slice(-6).map(m => ({
    role:    m.role,
    content: m.content.slice(0, 150),
  }));

  const context = JSON.stringify({
    student_input:      state.studentInput,
    extracted_triples:  state.extractedTriples.slice(0, 10),
    contract:           state.conversationContract,
    prior_agreement:    { state: state.agreementState, score: state.agreementScore },
    learner_strategy:   state.learnerStrategy,
    recent_history:     recentHistory,
  });

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

  const VALID_STATES: AgreementState[]   = ['none', 'partial', 'stable', 'conflict'];
  const VALID_STRATEGIES: LearnerStrategy[] = ['serialist', 'holist', 'versatile', 'unknown'];

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = JSON.parse(raw) as any;

    const agreementState = VALID_STATES.includes(result.agreement_state)
      ? result.agreement_state as AgreementState
      : state.agreementState;

    const agreementScore = typeof result.agreement_score === 'number'
      ? Math.min(1.0, Math.max(0.0, result.agreement_score))
      : state.agreementScore;

    const learnerStrategy = VALID_STRATEGIES.includes(result.learner_strategy)
      ? result.learner_strategy as LearnerStrategy
      : state.learnerStrategy;

    return { agreementState, agreementScore, learnerStrategy };
  } catch {
    return {
      agreementState:  state.agreementState,
      agreementScore:  state.agreementScore,
      learnerStrategy: state.learnerStrategy,
    };
  }
}
