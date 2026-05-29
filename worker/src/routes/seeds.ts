// worker/src/routes/seeds.ts
// Seed management routes (global — not per-user):
//   GET  /seeds          → list all seeds
//   GET  /seeds/:name    → get a single seed's metadata + data
//   POST /seeds/init     → insert bundled default seeds into D1
//   POST /seeds          → save a new seed (from admin builder)

import { ALL_SEEDS } from '../seeds/defaults';

export async function handleSeeds(request: Request, db: D1Database): Promise<Response> {
  const url    = new URL(request.url);
  const method = request.method;

  // GET /seeds  — list
  if (method === 'GET' && url.pathname === '/seeds') {
    const rows = await db.prepare(
      `SELECT name, description, created_at FROM seeds ORDER BY name`,
    ).all<{ name: string; description: string; created_at: string }>();
    return json({ seeds: rows.results });
  }

  // POST /seeds/init  — insert bundled defaults
  if (method === 'POST' && url.pathname === '/seeds/init') {
    const stmts = ALL_SEEDS.map(s =>
      db.prepare(
        `INSERT OR IGNORE INTO seeds (name, description, data) VALUES (?, ?, ?)`,
      ).bind(s.name, s.description, JSON.stringify({ nodes: s.nodes, edges: s.edges })),
    );
    await db.batch(stmts);
    return json({ status: 'initialized', count: ALL_SEEDS.length });
  }

  // GET /seeds/:name  — single seed
  const nameMatch = url.pathname.match(/^\/seeds\/([a-z0-9_]+)$/);
  if (method === 'GET' && nameMatch) {
    const name = nameMatch[1];
    const row  = await db.prepare(
      `SELECT name, description, data FROM seeds WHERE name = ?`,
    ).bind(name).first<{ name: string; description: string; data: string }>();
    if (!row) return json({ error: 'Not found' }, 404);
    return json({ name: row.name, description: row.description, data: JSON.parse(row.data) });
  }

  // POST /seeds  — save new seed
  if (method === 'POST' && url.pathname === '/seeds') {
    let body: { name: string; description: string; nodes: unknown[]; edges: unknown[] };
    try {
      body = await request.json() as typeof body;
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    if (!body.name || !/^[a-z0-9_]+$/.test(body.name)) {
      return json({ error: 'name must be lowercase alphanumeric + underscores' }, 422);
    }
    if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
      return json({ error: 'nodes and edges must be arrays' }, 422);
    }

    await db.prepare(
      `INSERT INTO seeds (name, description, data) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET description=excluded.description, data=excluded.data`,
    ).bind(body.name, body.description ?? '', JSON.stringify({ nodes: body.nodes, edges: body.edges }))
     .run();

    return json({ status: 'saved', name: body.name });
  }

  return json({ error: 'Not found' }, 404);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
