// worker/src/pipeline/perturber.ts
// Agent 5 — The Socratic Perturber (The Voice of the Machine).
// The only agent the student encounters. Uses quality model with streaming.

import { chat, streamChat, QUALITY_MODEL_WORKERSAI } from '../llm/index';
import type { LlmConfig, TeachingState } from './types';

const LEVEL_DESC: Record<string, string> = {
  L0: 'procedural — ask HOW to recognise, construct, or maintain the concept',
  L1: 'explanatory — ask WHY/RELATES-TO: how the concept entails or is entailed',
};

function buildSystem(state: TeachingState): string {
  const zpd       = state.zpdNodes.length
    ? state.zpdNodes.slice(0, 6).join(', ')
    : 'no prior map yet — follow the student\'s curiosity freely';

  const topics    = state.topicWindow.length
    ? state.topicWindow.join(', ')
    : zpd;

  const strategy  = state.learnerStrategy !== 'unknown'
    ? state.learnerStrategy
    : 'not yet determined — follow the student\'s framing closely';

  const seedName  = state.seedName  || 'active_seed';
  const seedDesc  = state.seedDescription
    || 'A connected conceptual landscape. Stay high-level and avoid revealing explicit answer paths.';

  let system = `You are the Socratic Perturber — an agent of calibrated intellectual friction.

Domain: Current active ontology
Active seed: ${seedName}
Seed orientation: ${seedDesc}
Turn index: ${state.turnCount}
Complexity mode: ${state.complexityMode}

Current strict conversation contract:
  Topics in scope:    ${topics}
  Operation level:    ${state.level} — ${LEVEL_DESC[state.level] ?? state.level}
  Learner strategy:   ${strategy}

Zone of Proximal Development (your Socratic target): ${zpd}

Your rules:
1. NEVER give the direct answer or name the target concept explicitly.
2. Begin by acknowledging the internal logic of the student's current position.
3. Introduce exactly ONE perturbation: an edge case, a paradox, or a cross-domain analogy.
4. Maximum 4 sentences. End with one direct question that forces a boundary redraw.
5. You are a mirror, not a teacher. Reflect — do not lecture.
6. If turn_count == 0, open with a brief welcome grounded in the Seed orientation.
   Keep it high-level and intriguing: do not reveal hidden targets or staged steps.

Complexity rules:
  novice:
    - Write for a curious beginner. Plain language, one idea at a time.
    - Maximum 2-3 short sentences. Prefer concrete examples.
  expert:
    - Maintain full depth and abstraction. Technical terms without simplification.

Level calibration:
  L0 (procedural): ask HOW questions — how to recognise, construct, or maintain the concept.
  L1 (explanatory): ask WHY/RELATES-TO questions — how the concept entails or is entailed.

Learner strategy calibration:
  serialist:  one grounded, precise, sequential step; avoid sweeping analogies.
  holist:     lead with the structural/relational picture; invite pattern recognition.
  versatile:  use judgment freely.
  unknown:    follow the student's own framing closely.`;

  if (state.teachbackMode) {
    const related = state.topicWindow[1] ?? state.topicWindow[0] ?? 'adjacent concepts';
    system = `You are the Socratic Perturber in TEACHBACK mode.

Domain: Current active ontology
Active seed: ${seedName}
Seed orientation: ${seedDesc}
Complexity mode: ${state.complexityMode}

The student has not yet demonstrated stable convergence on: ${topics}

Teachback protocol: understanding is only verified when a student
can reconstruct and re-teach a concept entirely in their own words.

Your task:
1. Invite the student to explain ONE specific concept to an imagined peer
   (a curious non-expert friend — not a professor).
2. Make clear they should use their OWN model — not reproduce a textbook definition.
3. Specify the concept and the level:
   ${state.level}: ${state.level === 'L0' ? `how they would SHOW someone what the concept is / how to use it` : `how they would EXPLAIN why it connects to ${related}`}.
4. Keep your prompt to 2–3 sentences.
5. End with: "Take your time — describe it in a way that would make sense to someone encountering this idea for the very first time."`;
  }

  if (state.singularityDetected) {
    system += `

CRITICAL OVERRIDE — Singularity Event detected.
The student may be constructing a genuine novel paradigm.
Do NOT steer them toward mainstream consensus.
Instead, stress-test their OWN framework from within: find edge cases or
internal gaps in their model. Help them build it stronger — not abandon it.`;
  }

  return system;
}

// ── Synchronous (non-streaming) ───────────────────────────────────────────────

export async function runPerturber(
  state: TeachingState,
  llm:   LlmConfig,
): Promise<Partial<TeachingState>> {
  const system = buildSystem(state);

  // Always use the quality model for the Perturber
  const qualityLlm: LlmConfig = {
    ...llm,
    model: llm.provider === 'workersai' ? QUALITY_MODEL_WORKERSAI : llm.model,
  };

  const llmMessages = [
    { role: 'system' as const, content: system },
    ...state.messages.slice(-6).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: state.studentInput },
  ];

  let response = '';
  try {
    response = await chat(qualityLlm, llmMessages, { temperature: 0.72 });
  } catch (err) {
    response = `I encountered a difficulty generating a response. Please try again. (${String(err)})`;
  }

  return { perturbedResponse: response };
}

// ── Streaming variant ─────────────────────────────────────────────────────────

export async function streamPerturber(
  state: TeachingState,
  llm:   LlmConfig,
): Promise<ReadableStream<string>> {
  const system = buildSystem(state);

  const qualityLlm: LlmConfig = {
    ...llm,
    model: llm.provider === 'workersai' ? QUALITY_MODEL_WORKERSAI : llm.model,
  };

  const llmMessages = [
    { role: 'system' as const, content: system },
    ...state.messages.slice(-6).map(m => ({
      role:    m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: state.studentInput },
  ];

  return streamChat(qualityLlm, llmMessages, { temperature: 0.72 });
}
