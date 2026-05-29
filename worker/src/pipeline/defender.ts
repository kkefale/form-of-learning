// worker/src/pipeline/defender.ts
// Agent 3 — The Anomaly Protector.
// Detects singularity events and internal contradictions.
// Protects genuine novel frameworks from normalisation pressure.

import { chat, FAST_MODEL_WORKERSAI } from '../llm/index';
import type { LlmConfig, TeachingState } from './types';

const SYSTEM = `You are the Anomaly Detector in a cybernetic tutoring system.

Analyse the student's current input and conversation history to detect:
1. SINGULARITY EVENT: the student is constructing a genuinely novel theoretical framework
   that diverges from mainstream consensus — NOT a simple error.
2. INTERNAL CONTRADICTION: the student contradicts something they explicitly stated earlier.
3. PROTECTED CLAIM: the specific claim to protect if a singularity is detected.

The distinction is critical:
  Error/misconception → standard Socratic perturbation.
  Genuine novel framework → PROTECT and stress-test from within.
  Internal contradiction → surface gently.

Output ONLY valid JSON:
{
  "singularity_detected":    true | false,
  "internal_contradiction":  true | false,
  "protected_claim":         "quoted claim string or null",
  "reasoning":               "one sentence: why you classified this way"
}

Rules:
- singularity_detected = true ONLY if the student is building a coherent but unconventional model,
  not simply misremembering a fact.
- internal_contradiction = true ONLY for contradictions with their OWN prior stated beliefs.
  Never penalise for contradicting mainstream consensus.
- Both can be false simultaneously (most turns).
- Output ONLY the JSON object. No prose, no markdown fences.`;

export async function runDefender(
  state: TeachingState,
  llm:   LlmConfig,
): Promise<Partial<TeachingState>> {
  const recentHistory = state.messages.slice(-8).map(m => ({
    role:    m.role,
    content: m.content.slice(0, 200),
  }));

  const context = JSON.stringify({
    current_input:     state.studentInput,
    extracted_triples: state.extractedTriples.slice(0, 8),
    recent_history:    recentHistory,
    zpd_nodes:         state.zpdNodes.slice(0, 4),
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

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = JSON.parse(raw) as any;
    return {
      singularityDetected:   Boolean(result.singularity_detected),
      internalContradiction: Boolean(result.internal_contradiction),
      protectedClaim:        typeof result.protected_claim === 'string' ? result.protected_claim : null,
      defenderReasoning:     typeof result.reasoning === 'string' ? result.reasoning : '',
    };
  } catch {
    return {
      singularityDetected:   false,
      internalContradiction: false,
      protectedClaim:        null,
      defenderReasoning:     '',
    };
  }
}
