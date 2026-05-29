// worker/src/graph/d1.ts
// Graph client backed by Cloudflare D1 (SQLite).
// Replaces Kuzu. Same semantics, SQL under the hood.
// Each instance is scoped to a single user_id.

import type { NodeState } from '../pipeline/types';

export interface ConceptRow {
  id:         string;
  label:      string;
  state:      NodeState;
  definition: string;
}

export interface EdgeRow {
  src:        string;
  dst:        string;
  relation:   string;
  weight:     number;
  confidence: number;
  is_master:  number;
}

export interface GraphStats {
  total:          number;
  master:         number;
  studentMapped:  number;
  studentEdges:   number;
}

export interface SeedPayload {
  nodes: Array<{ id: string; label: string; state?: string; props?: { definition?: string } }>;
  edges: Array<{ src: string; dst: string; rel?: string; relation?: string; weight?: number }>;
}

export class GraphClient {
  constructor(
    private readonly db:     D1Database,
    private readonly userId: string,
  ) {}

  // ── Write operations ──────────────────────────────────────────────────────

  async upsertConcept(
    id:         string,
    label:      string = id,
    state:      NodeState = 'UNKNOWN',
    definition: string = '',
  ): Promise<void> {
    await this.db.prepare(
      `INSERT INTO concepts (user_id, id, label, state, definition)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET
         label      = excluded.label,
         definition = excluded.definition`,
    ).bind(this.userId, id, label, state, definition).run();
  }

  async setState(id: string, state: NodeState): Promise<void> {
    // Upsert the concept if it doesn't exist, then update its state
    await this.db.prepare(
      `INSERT INTO concepts (user_id, id, label, state)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, id) DO UPDATE SET state = excluded.state`,
    ).bind(this.userId, id, id, state).run();
  }

  async addStudentEdge(
    src:        string,
    dst:        string,
    relation:   string,
    confidence: number = 1.0,
  ): Promise<void> {
    await this.db.prepare(
      `INSERT INTO edges (user_id, src, dst, relation, confidence, is_master)
       VALUES (?, ?, ?, ?, ?, 0)
       ON CONFLICT(user_id, src, dst, relation) DO UPDATE SET confidence = excluded.confidence`,
    ).bind(this.userId, src, dst, relation, confidence).run();
  }

  async addMasterEdge(
    src:    string,
    dst:    string,
    weight: number = 1.0,
    rel:    string = 'ENTAILS',
  ): Promise<void> {
    await this.db.prepare(
      `INSERT OR IGNORE INTO edges (user_id, src, dst, relation, weight, is_master)
       VALUES (?, ?, ?, ?, ?, 1)`,
    ).bind(this.userId, src, dst, rel, weight).run();
  }

  // ── Read operations ───────────────────────────────────────────────────────

  async getZpd(): Promise<string[]> {
    // ZPD: concepts adjacent to (UNDERSTANDS|EXPLORING) nodes that are still MASTER
    const result = await this.db.prepare(`
      SELECT DISTINCT e.dst
      FROM   edges e
      JOIN   concepts known    ON known.user_id = e.user_id    AND known.id    = e.src
      JOIN   concepts frontier ON frontier.user_id = e.user_id AND frontier.id = e.dst
      WHERE  e.user_id  = ?
        AND  known.state    IN ('UNDERSTANDS', 'EXPLORING')
        AND  frontier.state = 'MASTER'
        AND  e.is_master    = 1
      LIMIT  6
    `).bind(this.userId).all<{ dst: string }>();
    return result.results.map(r => r.dst);
  }

  async getTopicWindow(maxTopics = 3): Promise<string[]> {
    return (await this.getZpd()).slice(0, maxTopics);
  }

  async getStudentConcepts(): Promise<ConceptRow[]> {
    const result = await this.db.prepare(
      `SELECT id, label, state, definition FROM concepts
       WHERE  user_id = ? AND state NOT IN ('MASTER', 'UNKNOWN')
       ORDER  BY state`,
    ).bind(this.userId).all<ConceptRow>();
    return result.results;
  }

  async getAllConcepts(): Promise<ConceptRow[]> {
    const result = await this.db.prepare(
      `SELECT id, label, state, definition FROM concepts
       WHERE  user_id = ?`,
    ).bind(this.userId).all<ConceptRow>();
    return result.results;
  }

  async getAllEdges(): Promise<EdgeRow[]> {
    const result = await this.db.prepare(
      `SELECT src, dst, relation, weight, confidence, is_master FROM edges
       WHERE  user_id = ?`,
    ).bind(this.userId).all<EdgeRow>();
    return result.results;
  }

  async getStudentEdges(): Promise<EdgeRow[]> {
    const result = await this.db.prepare(
      `SELECT src, dst, relation, weight, confidence, is_master FROM edges
       WHERE  user_id = ? AND is_master = 0`,
    ).bind(this.userId).all<EdgeRow>();
    return result.results;
  }

  async stats(): Promise<GraphStats> {
    const [total, master, student, edges] = await Promise.all([
      this.db.prepare(`SELECT COUNT(*) as n FROM concepts WHERE user_id = ?`)
             .bind(this.userId).first<{ n: number }>(),
      this.db.prepare(`SELECT COUNT(*) as n FROM concepts WHERE user_id = ? AND state = 'MASTER'`)
             .bind(this.userId).first<{ n: number }>(),
      this.db.prepare(`SELECT COUNT(*) as n FROM concepts WHERE user_id = ? AND state NOT IN ('MASTER','UNKNOWN')`)
             .bind(this.userId).first<{ n: number }>(),
      this.db.prepare(`SELECT COUNT(*) as n FROM edges WHERE user_id = ? AND is_master = 0`)
             .bind(this.userId).first<{ n: number }>(),
    ]);
    return {
      total:         total?.n ?? 0,
      master:        master?.n ?? 0,
      studentMapped: student?.n ?? 0,
      studentEdges:  edges?.n ?? 0,
    };
  }

  // ── Seed operations ───────────────────────────────────────────────────────

  async clear(): Promise<void> {
    await this.db.batch([
      this.db.prepare(`DELETE FROM concepts WHERE user_id = ?`).bind(this.userId),
      this.db.prepare(`DELETE FROM edges    WHERE user_id = ?`).bind(this.userId),
    ]);
  }

  async loadSeed(seed: SeedPayload): Promise<{ nodesLoaded: number; edgesLoaded: number }> {
    let nodesLoaded = 0;
    let edgesLoaded = 0;

    // Batch inserts for performance (D1 batch API)
    const nodeStmts = seed.nodes.map(n =>
      this.db.prepare(
        `INSERT INTO concepts (user_id, id, label, state, definition)
         VALUES (?, ?, ?, 'MASTER', ?)
         ON CONFLICT(user_id, id) DO UPDATE SET label=excluded.label, definition=excluded.definition`,
      ).bind(this.userId, n.id, n.label ?? n.id, n.props?.definition ?? ''),
    );

    const edgeStmts = seed.edges.map(e =>
      this.db.prepare(
        `INSERT OR IGNORE INTO edges (user_id, src, dst, relation, weight, is_master)
         VALUES (?, ?, ?, ?, ?, 1)`,
      ).bind(this.userId, e.src, e.dst, e.rel ?? e.relation ?? 'ENTAILS', e.weight ?? 1.0),
    );

    if (nodeStmts.length) {
      await this.db.batch(nodeStmts);
      nodesLoaded = nodeStmts.length;
    }
    if (edgeStmts.length) {
      await this.db.batch(edgeStmts);
      edgesLoaded = edgeStmts.length;
    }

    return { nodesLoaded, edgesLoaded };
  }
}
