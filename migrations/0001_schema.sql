-- migrations/0001_schema.sql
-- Form of Learning — Cloudflare D1 Schema
-- Run: wrangler d1 migrations apply form-of-learning

-- ── Concepts ──────────────────────────────────────────────────────────────────
-- Stores master seed concepts AND student-engaged concept states per user.
-- Each user gets their own rows (keyed by user_id) when they activate a seed.
CREATE TABLE IF NOT EXISTS concepts (
  user_id    TEXT NOT NULL,
  id         TEXT NOT NULL,
  label      TEXT NOT NULL DEFAULT '',
  state      TEXT NOT NULL DEFAULT 'MASTER',
  definition TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, id)
);

-- ── Edges ─────────────────────────────────────────────────────────────────────
-- Stores both seed (master) edges and student-drawn edges.
-- is_master=1 → seed edge (used for ZPD traversal)
-- is_master=0 → student-drawn edge
CREATE TABLE IF NOT EXISTS edges (
  user_id    TEXT    NOT NULL,
  src        TEXT    NOT NULL,
  dst        TEXT    NOT NULL,
  relation   TEXT    NOT NULL DEFAULT 'ENTAILS',
  weight     REAL    NOT NULL DEFAULT 1.0,
  confidence REAL    NOT NULL DEFAULT 1.0,
  is_master  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, src, dst, relation)
);

-- ── Seeds ─────────────────────────────────────────────────────────────────────
-- Stores seed ontology definitions as JSON blobs.
-- Shared across all users (not scoped by user_id).
CREATE TABLE IF NOT EXISTS seeds (
  name        TEXT PRIMARY KEY,
  description TEXT NOT NULL DEFAULT '',
  data        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_concepts_user_state ON concepts (user_id, state);
CREATE INDEX IF NOT EXISTS idx_edges_user_src       ON edges (user_id, src);
CREATE INDEX IF NOT EXISTS idx_edges_user_dst       ON edges (user_id, dst);
CREATE INDEX IF NOT EXISTS idx_edges_user_master    ON edges (user_id, is_master);
