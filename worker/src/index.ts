// worker/src/index.ts
// Cloudflare Worker entry point — API gateway + DO routing.
// All session logic lives in SessionDO; this file is pure routing.

import { SessionDO } from './session.do';
import { handleSeeds } from './routes/seeds';
import { handleAdminExtract } from './routes/admin';
import { WORKERSAI_MODELS, GEMINI_MODELS } from './llm/index';
import type { Env } from './pipeline/types';

// Re-export Durable Object class (required by Cloudflare runtime)
export { SessionDO };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url    = new URL(request.url);
    const method = request.method;

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env) });
    }

    // ── API routes — add CORS and handle inline ─────────────────────────────
    if (isApiPath(url.pathname)) {
      let response: Response;
      try {
        response = await route(request, url, method, env);
      } catch (err) {
        response = new Response(
          JSON.stringify({ error: String(err) }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        );
      }
      const headers = new Headers(response.headers);
      for (const [k, v] of Object.entries(corsHeaders(env))) {
        headers.set(k, v);
      }
      return new Response(response.body, { status: response.status, headers });
    }

    // ── Everything else — serve the static SPA ──────────────────────────────
    return env.ASSETS.fetch(request);
  },
};

// ── API path guard ───────────────────────────────────────────────────────────

function isApiPath(pathname: string): boolean {
  return pathname === '/health'
    || pathname === '/models'
    || pathname.startsWith('/seeds')
    || pathname.startsWith('/admin/')
    || pathname.startsWith('/api/');
}

// ── Router ──────────────────────────────────────────────────────────────────

async function route(
  request: Request,
  url:     URL,
  method:  string,
  env:     Env,
): Promise<Response> {

  // ── Health ─────────────────────────────────────────────────────────────────
  if (method === 'GET' && url.pathname === '/health') {
    return json({ status: 'ok', timestamp: new Date().toISOString() });
  }

  // ── Models list (no DO needed — static data + Gemini API probe) ────────────
  if (method === 'GET' && url.pathname === '/models') {
    const provider = url.searchParams.get('provider') ?? 'workersai';
    if (provider === 'workersai') return json({ models: WORKERSAI_MODELS });
    if (provider === 'gemini')    return json({ models: GEMINI_MODELS });
    return json({ error: 'Unknown provider' }, 400);
  }

  // ── Seeds (global, not per-user) ───────────────────────────────────────────
  if (url.pathname.startsWith('/seeds')) {
    return handleSeeds(request, env.DB);
  }

  // ── Admin routes ───────────────────────────────────────────────────────────
  if (url.pathname === '/admin/extract') {
    return handleAdminExtract(request, env);
  }

  // ── Session / turn routes — delegate to Durable Object ────────────────────
  if (url.pathname.startsWith('/api/')) {
    const userId = await extractUserId(request, url);
    const doId   = env.SESSION_DO.idFromName(userId);
    const stub   = env.SESSION_DO.get(doId);

    // Strip /api prefix before forwarding to DO
    const doUrl      = new URL(request.url);
    doUrl.pathname   = url.pathname.slice(4); // remove '/api'
    const doRequest  = new Request(doUrl.toString(), {
      method:  request.method,
      headers: request.headers,
      body:    request.body,
    });

    return stub.fetch(doRequest);
  }

  return json({ error: 'Not found' }, 404);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function corsHeaders(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  env.CORS_ORIGIN ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

async function extractUserId(request: Request, url: URL): Promise<string> {
  // 1. Try query param
  const qp = url.searchParams.get('user_id');
  if (qp) return qp;

  // 2. Try JSON body (only for POST/DELETE — clone to avoid consuming)
  if (request.method === 'POST' || request.method === 'DELETE') {
    try {
      const clone = request.clone();
      const body  = await clone.json() as { userId?: string; user_id?: string };
      const uid   = body?.userId ?? body?.user_id;
      if (uid) return uid;
    } catch { /* not JSON or already consumed */ }
  }

  return 'anonymous';
}
