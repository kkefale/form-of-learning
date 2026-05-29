// worker/src/session.do.ts
// Durable Object: one instance per user_id.
// Holds in-memory TeachingState, runs the 5-agent pipeline,
// persists session to DO storage after each turn.
// Replaces: Python global session singleton + Kuzu file lock.

import { runContract }  from './pipeline/contract';
import { runMapper }    from './pipeline/mapper';
import { runDefender }  from './pipeline/defender';
import { runEvaluator } from './pipeline/evaluator';
import { runPerturber, streamPerturber } from './pipeline/perturber';
import { GraphClient }  from './graph/d1';

import type {
  Env,
  TeachingState,
  TurnRequest,
  LlmConfig,
  LlmProvider,
} from './pipeline/types';
import {
  DEFAULT_STATE as DS,
  buildTurnResponse,
  pickPersistable,
} from './pipeline/types';

function makeLlmConfig(state: TeachingState, ai: Ai): LlmConfig {
  return {
    provider: state.llmProvider as LlmProvider,
    model:    state.llmModel,
    apiKey:   state.llmApiKey,
    ai,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export class SessionDO {
  private readonly state: DurableObjectState;
  private readonly env:   Env;
  private session: TeachingState | null = null;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env   = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url    = new URL(request.url);
    const method = request.method;

    if (method === 'POST'   && url.pathname === '/turn')         return this.handleTurn(request, false);
    if (method === 'POST'   && url.pathname === '/turn/stream')  return this.handleTurn(request, true);
    if (method === 'GET'    && url.pathname === '/graph')        return this.handleGraph(url);
    if (method === 'GET'    && url.pathname === '/messages')     return this.handleMessages();
    if (method === 'DELETE' && url.pathname === '/session')      return this.handleSessionReset();
    if (method === 'POST'   && url.pathname === '/reset')        return this.handleFullReset();
    if (method === 'POST'   && url.pathname === '/seed/activate')return this.handleActivateSeed(request);

    return new Response('Not found', { status: 404 });
  }

  // ── Session hydration ───────────────────────────────────────────────────────

  private async ensureSession(userId: string): Promise<TeachingState> {
    if (!this.session) {
      const saved = await this.state.storage.get<Partial<TeachingState>>('session');
      this.session = {
        ...DS,
        userId,
        ...(saved ?? {}),
        // Always reset per-request LLM fields (never load from storage)
        llmProvider: 'workersai',
        llmModel:    DS.llmModel,
        llmApiKey:   '',
      } as TeachingState;
    }
    return this.session;
  }

  private async persistSession(): Promise<void> {
    if (!this.session) return;
    await this.state.storage.put('session', pickPersistable(this.session));
  }

  // ── POST /turn  (regular + streaming) ──────────────────────────────────────

  private async handleTurn(request: Request, streaming: boolean): Promise<Response> {
    const req = await request.json() as TurnRequest;
    const s   = await this.ensureSession(req.userId);

    // Inject per-request fields
    s.studentInput   = req.studentInput?.trim() ?? '';
    s.llmProvider    = req.provider    ?? 'workersai';
    s.llmModel       = req.model       ?? DS.llmModel;
    s.llmApiKey      = req.apiKey      ?? '';
    s.complexityMode = (req.complexityMode === 'novice' || req.complexityMode === 'expert')
                         ? req.complexityMode : 'expert';

    if (!s.studentInput) return jsonResponse({ error: 'studentInput is empty' }, 400);

    const llm = makeLlmConfig(s, this.env.AI);

    // ── Agents 1–4 (always synchronous) ──────────────────────────────────────
    Object.assign(s, await runContract(s, llm));
    Object.assign(s, await runMapper(s, llm, this.env.DB));
    Object.assign(s, await runDefender(s, llm));
    Object.assign(s, await runEvaluator(s, llm));

    // ── Agent 5 — streaming or synchronous ───────────────────────────────────
    if (streaming) {
      return this.streamPerturberResponse(s, llm, req.studentInput);
    }

    Object.assign(s, await runPerturber(s, llm));
    this.finaliseSession(s, req.studentInput);
    await this.persistSession();

    return jsonResponse(buildTurnResponse(s));
  }

  private finaliseSession(s: TeachingState, studentInput: string): void {
    s.messages = [
      ...s.messages,
      { role: 'user',      content: studentInput },
      { role: 'assistant', content: s.perturbedResponse, isSingularity: s.singularityDetected },
    ];
    s.turnCount++;
  }

  private streamPerturberResponse(
    s:            TeachingState,
    llm:          LlmConfig,
    studentInput: string,
  ): Response {
    const encoder = new TextEncoder();
    let   fullResponse = '';
    const self    = this;

    const readable = new ReadableStream({
      async start(controller) {
        try {
          const tokenStream = await streamPerturber(s, llm);
          const reader      = tokenStream.getReader();

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            fullResponse += value;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ token: value })}\n\n`),
            );
          }

          // Finalise state after stream completes
          s.perturbedResponse = fullResponse;
          self.finaliseSession(s, studentInput);
          await self.persistSession();

          // Send final state snapshot so UI can sync
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ done: true, state: buildTurnResponse(s) })}\n\n`,
            ),
          );
        } catch (err) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type':  'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection':    'keep-alive',
      },
    });
  }

  // ── GET /graph ──────────────────────────────────────────────────────────────

  private async handleGraph(url: URL): Promise<Response> {
    // Prefer the user_id query param (always present); fall back to loaded session
    const uid   = url.searchParams.get('user_id') ?? this.session?.userId ?? 'anonymous';
    const graph = new GraphClient(this.env.DB, uid);

    const [concepts, edges, zpd, stats] = await Promise.all([
      graph.getAllConcepts(),
      graph.getAllEdges(),
      graph.getZpd(),
      graph.stats(),
    ]);

    return jsonResponse({ concepts, edges, zpd, stats });
  }

  // ── GET /messages ───────────────────────────────────────────────────────────

  private async handleMessages(): Promise<Response> {
    const saved = await this.state.storage.get<Partial<TeachingState>>('session');
    return jsonResponse({
      messages:  saved?.messages  ?? [],
      turnCount: saved?.turnCount ?? 0,
    });
  }

  // ── DELETE /session ─────────────────────────────────────────────────────────

  private async handleSessionReset(): Promise<Response> {
    const uid  = this.session?.userId ?? 'anonymous';
    const seed = this.session?.seedName ?? '';
    const desc = this.session?.seedDescription ?? '';
    const mode = this.session?.complexityMode ?? 'expert';

    this.session = {
      ...DS,
      userId:          uid,
      seedName:        seed,
      seedDescription: desc,
      complexityMode:  mode,
    } as TeachingState;

    await this.persistSession();
    return jsonResponse({ status: 'session reset' });
  }

  // ── POST /reset ─────────────────────────────────────────────────────────────

  private async handleFullReset(): Promise<Response> {
    const uid = this.session?.userId ?? 'anonymous';

    // Clear this user's graph data
    const graph = new GraphClient(this.env.DB, uid);
    await graph.clear();

    this.session = { ...DS, userId: uid } as TeachingState;
    await this.persistSession();

    return jsonResponse({ status: 'full reset complete' });
  }

  // ── POST /seed/activate ─────────────────────────────────────────────────────

  private async handleActivateSeed(request: Request): Promise<Response> {
    const { name, userId } = await request.json() as { name: string; userId: string };
    const uid = userId ?? this.session?.userId ?? 'anonymous';

    // Fetch seed from D1 seeds table
    const seedRow = await this.env.DB.prepare(
      `SELECT name, description, data FROM seeds WHERE name = ?`,
    ).bind(name).first<{ name: string; description: string; data: string }>();

    if (!seedRow) return jsonResponse({ error: `Seed '${name}' not found` }, 404);

    let seedData: { nodes: unknown[]; edges: unknown[] };
    try {
      seedData = JSON.parse(seedRow.data);
    } catch {
      return jsonResponse({ error: 'Corrupted seed data' }, 500);
    }

    // Clear user graph and load seed
    const graph = new GraphClient(this.env.DB, uid);
    await graph.clear();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { nodesLoaded, edgesLoaded } = await graph.loadSeed(seedData as any);

    // Compute initial ZPD
    const zpd = await graph.getZpd();

    // Reset session with new seed context
    const prevMode = this.session?.complexityMode ?? 'expert';
    this.session = {
      ...DS,
      userId:          uid,
      seedName:        name,
      seedDescription: seedRow.description,
      complexityMode:  prevMode,
      zpdNodes:        zpd,
    } as TeachingState;

    await this.persistSession();

    return jsonResponse({
      status:      'activated',
      seed:        name,
      nodesLoaded,
      edgesLoaded,
      zpd,
    });
  }
}
