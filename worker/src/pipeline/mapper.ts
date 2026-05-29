// worker/src/pipeline/mapper.ts
// Agent 2 — The Ontological Mapper (Second-Order Observer).
// Extracts knowledge triples from student input, updates D1 graph, returns ZPD.
// Never speaks to the student.

import { chat, FAST_MODEL_WORKERSAI } from '../llm/index';
import { GraphClient }                from '../graph/d1';
import type { LlmConfig, TeachingState, Triple, NodeState } from './types';

const SYSTEM = `You are an Ontological Mapper in a cybernetic tutoring system.
Extract structured knowledge triples from a student's message, classify the
speech-act operation type, and detect the language level.

Respond ONLY with valid JSON — no prose, no markdown fences:
{
  "triples": [
    {
      "subject":    "PascalCaseConcept",
      "relation":   "ENTAILS | CONTRADICTS | IS_RELATED_TO | REQUIRES | CAUSES",
      "object":     "PascalCaseConcept",
      "confidence": 0.0
    }
  ],
  "node_states": [
    {"id": "PascalCaseConcept", "state": "UNDERSTANDS | EXPLORING | BELIEVES_INCORRECTLY"}
  ],
  "operation_type": "command | question | explanation | execution",
  "level": "L0 | L1"
}

Operation type rules:
  command:     student directs or asserts intent about a concept.
  question:    student asks or expresses uncertainty.
  explanation: student explains, justifies, or reconstructs a concept.
  execution:   student demonstrates or performs a procedural step.

Level rules:
  L0: procedural — about HOW to recognize, construct, or use the concept.
  L1: explanatory — about WHY the concept relates to or entails others.

Triple rules:
- Use PascalCase for ALL concept IDs (e.g. EnergyTransfer, BoundaryCondition).
- Only extract what the student explicitly expresses — do not infer.
- Return empty arrays if nothing ontological is expressed.
- Keep concept IDs concise: 1–3 words, no spaces, no underscores.`;

interface MapperOutput {
  triples:        Triple[];
  node_states:    Array<{ id: string; state: NodeState }>;
  operation_type: string;
  level:          string;
}

export async function runMapper(
  state:  TeachingState,
  llm:    LlmConfig,
  db:     D1Database,
): Promise<Partial<TeachingState>> {
  const graph = new GraphClient(db, state.userId);

  const fastLlm: LlmConfig = {
    ...llm,
    model: llm.provider === 'workersai' ? FAST_MODEL_WORKERSAI : llm.model,
  };

  let raw: string;
  try {
    raw = await chat(fastLlm, [
      { role: 'system', content: SYSTEM },
      { role: 'user',   content: `Extract triples from: "${state.studentInput}"` },
    ], { formatJson: true, temperature: 0.1 });
  } catch {
    raw = '';
  }

  let triples:       Triple[] = [];
  let operationType: string   = state.operationType;
  let level:         string   = state.level;

  try {
    const extracted = JSON.parse(raw) as Partial<MapperOutput>;

    triples = (extracted.triples ?? []).filter(t => t.subject && t.object);

    // Validate operation_type
    const opType = extracted.operation_type ?? '';
    if (['command','question','explanation','execution'].includes(opType)) {
      operationType = opType;
    }

    // Validate level
    const lvl = extracted.level ?? '';
    if (['L0','L1'].includes(lvl)) {
      level = lvl;
    }

    // Write node states to D1
    const nodeStates = extracted.node_states ?? [];
    for (const ns of nodeStates) {
      if (ns.id && ns.state) {
        await graph.setState(ns.id, ns.state as NodeState);
      }
    }

    // Write student-drawn edges to D1
    for (const t of triples) {
      await graph.upsertConcept(t.subject, t.subject);
      await graph.upsertConcept(t.object,  t.object);
      await graph.addStudentEdge(t.subject, t.object, t.relation, t.confidence);
    }

  } catch {
    // Extraction failed — preserve prior values
  }

  // Recompute ZPD after graph updates
  const zpdNodes = await graph.getZpd();

  return {
    extractedTriples: triples,
    zpdNodes,
    operationType:    operationType as TeachingState['operationType'],
    level:            level as TeachingState['level'],
  };
}
