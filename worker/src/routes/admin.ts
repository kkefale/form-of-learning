// worker/src/routes/admin.ts
// Admin routes for the Ontological Seed Builder.
//   POST /admin/extract  → stream-extract a concept graph from text using LLM

import { streamChat, QUALITY_MODEL_WORKERSAI } from '../llm/index';
import type { Env, LlmConfig, LlmProvider } from '../pipeline/types';

const SEED_MAPPER_SYSTEM = `You are a Second-Order Observer — an ontological mapper.

Extract a structured concept graph from the provided document or notes.

Output ONLY valid JSON:
{
  "nodes": [
    {"id": "PascalCaseConcept", "label": "Human Readable Label", "definition": "one sentence precise definition"}
  ],
  "edges": [
    {"src": "ConceptA", "dst": "ConceptB", "rel": "ENTAILS", "weight": 1.0}
  ]
}

Rules:
- Maximum 25 nodes, 30 edges.
- Use PascalCase for all node ids (e.g. EnergyTransfer, SystemBoundary).
- Relations: ENTAILS | REQUIRES | CAUSES | IS_RELATED_TO | CONTRADICTS
- Weight 0.5–1.0 based on conceptual dependency strength.
- Definitions: one sentence, precise, no circular references.
- Only extract concepts explicitly present or strongly implied in the text.
- Output ONLY the JSON object. No prose, no markdown fences.`;

export async function handleAdminExtract(request: Request, env: Env): Promise<Response> {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body: { text: string; provider?: string; model?: string; apiKey?: string };
  try {
    body = await request.json() as typeof body;
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const text = (body.text ?? '').trim();
  if (!text) {
    return sseError('No document text provided.');
  }

  const wordCount = text.split(/\s+/).length;
  const llm: LlmConfig = {
    provider: (body.provider as LlmProvider) ?? 'workersai',
    model:    body.model ?? QUALITY_MODEL_WORKERSAI,
    apiKey:   body.apiKey ?? '',
    ai:       env.AI,
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ type: 'info', message: `Scanning ${wordCount.toLocaleString()} words…` });

        const tokenStream = await streamChat(llm, [
          { role: 'system', content: SEED_MAPPER_SYSTEM },
          { role: 'user',   content: `Extract the concept graph from:\n\n${text.slice(0, 12000)}` },
        ]);

        let fullJson = '';
        const reader = tokenStream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fullJson += value;
        }

        // Parse and stream individual nodes/edges as events
        let parsed: { nodes?: unknown[]; edges?: unknown[] };
        try {
          // Sometimes the model wraps in ```json ``` — strip it
          const clean = fullJson.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
          parsed = JSON.parse(clean);
        } catch {
          send({ type: 'error', message: 'LLM output was not valid JSON. Try a shorter document.' });
          controller.close();
          return;
        }

        const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
        const edges = Array.isArray(parsed.edges) ? parsed.edges : [];

        for (const node of nodes) {
          send({ type: 'node', data: node });
        }
        for (const edge of edges) {
          send({ type: 'edge', data: edge });
        }

        send({ type: 'done', stats: { nodes: nodes.length, edges: edges.length } });
      } catch (err) {
        send({ type: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream',
      'Cache-Control':   'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}

function sseError(message: string): Response {
  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    start(c) {
      c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', message })}\n\n`));
      c.close();
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
}
