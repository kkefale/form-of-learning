# The Form of Learning — Cloudflare Native

> A cybernetic teaching machine based on Pask's Conversation Theory.
> Built ground-up for Cloudflare Workers, Durable Objects, D1, and Workers AI.

---

## Stack

| Layer | Technology |
|---|---|
| Runtime | Cloudflare Workers (TypeScript) |
| Session state | Durable Objects (1 DO per user) |
| Graph database | Cloudflare D1 (SQLite) |
| LLM | Workers AI (default) + Gemini API (BYOK) |
| Frontend | Vite + React 19 on Cloudflare Pages |
| Graph UI | React Flow (@xyflow/react) |
| State | Zustand |
| CI/CD | GitHub Actions → wrangler deploy + pages deploy |

**Cost: $0/month** for most usage (Cloudflare free tiers).

---

## Local Development

### Prerequisites

- [Node.js 22+](https://nodejs.org)
- [pnpm](https://pnpm.io): `npm install -g pnpm`
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/): installed as dev dependency
- A Cloudflare account (free) — needed for `wrangler login`

### 1. Install dependencies

```bash
cd form-of-learning
pnpm install
```

### 2. Create the D1 database

```bash
cd worker
pnpm db:create
```

Copy the `database_id` from the output and paste it into `worker/wrangler.toml`:

```toml
[[d1_databases]]
database_id = "your-actual-id-here"
```

### 3. Run migrations

```bash
# Local (for dev):
pnpm db:migrate:local

# Remote (for prod):
pnpm db:migrate
```

### 4. Initialize default seeds

After migrations, seed the D1 database with the default ontologies:

```bash
# Worker must be running first (wrangler dev), then:
curl -X POST http://localhost:8787/seeds/init
```

### 5. Start the Worker

```bash
# In terminal 1:
cd worker
pnpm dev
# → http://localhost:8787
```

### 6. Start the UI

```bash
# In terminal 2:
cd ui
pnpm dev
# → http://localhost:3000
```

Open http://localhost:3000, select the **Laws of Form** seed, and begin.

---

## Deployment

### One-time setup

1. **Cloudflare dashboard**: Create a Pages project named `form-of-learning`
2. **GitHub secrets** (Settings → Secrets → Actions):
   - `CF_API_TOKEN` — Cloudflare API token with Workers + Pages + D1 permissions
   - `CF_ACCOUNT_ID` — your Cloudflare account ID

3. **Set Pages environment variable**:
   In Cloudflare Dashboard → Pages → form-of-learning → Settings → Environment Variables:
   ```
   VITE_API_URL = https://form-of-learning.workers.dev
   ```

4. **Create D1 database** and update `wrangler.toml` with the `database_id`.

5. **After first deploy**, run once to initialize seeds:
   ```bash
   curl -X POST https://form-of-learning.workers.dev/seeds/init
   ```

### Deploy

```bash
git push origin main
# GitHub Actions deploys Worker → then UI automatically
```

Or manually:

```bash
# Deploy Worker:
cd worker && pnpm deploy

# Deploy UI:
cd ui && VITE_API_URL=https://form-of-learning.workers.dev pnpm build
wrangler pages deploy dist --project-name=form-of-learning
```

---

## Architecture

```
Browser (React 19 SPA on Cloudflare Pages)
    │ fetch()
    ▼
Cloudflare Worker (API gateway, TypeScript)
    │ DO stub.get(userId)
    ▼
Durable Object: SessionDO (1 per user)
    │ reads/writes
    ├── D1 Database (concepts, edges, seeds)
    └── Workers AI / Gemini API (LLM)
```

### The 5-Agent Pipeline

Each turn runs sequentially inside the Durable Object:

1. **Contract** — scopes the turn to a bounded topic set (Pask's strict conversation constraint)
2. **Mapper** — extracts ontological triples from student input, updates D1 graph
3. **Defender** — detects singularity events (genuine novel frameworks) vs. internal contradictions
4. **Evaluator** — scores agreement convergence (none/partial/stable/conflict), infers learner strategy
5. **Perturber** — generates the Socratic perturbation (streams tokens to client)

### User Identity

Each browser auto-generates a UUID stored in `localStorage` at key `form-of-learning:user_id`.
This maps to a Durable Object instance — fully isolated session state per user.
No authentication required (Cloudflare Access can be added later).

---

## Adding New Seeds

### Via API

```bash
curl -X POST https://form-of-learning.workers.dev/seeds \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my_topic",
    "description": "Short description of this knowledge domain",
    "nodes": [
      {"id": "CoreConcept", "label": "Core Concept", "props": {"definition": "..."}}
    ],
    "edges": [
      {"src": "CoreConcept", "dst": "RelatedConcept", "rel": "ENTAILS", "weight": 1.0}
    ]
  }'
```

### Via the Admin Extractor

`POST /admin/extract` accepts document text and streams a concept graph extraction using the LLM:

```bash
curl -X POST https://form-of-learning.workers.dev/admin/extract \
  -H "Content-Type: application/json" \
  -d '{"text": "Your document text here...", "provider": "workersai"}' \
  --no-buffer
```

---

## Project Structure

```
form-of-learning/
├── worker/                   ← Cloudflare Worker + Durable Object
│   ├── src/
│   │   ├── index.ts          ← API gateway
│   │   ├── session.do.ts     ← SessionDO (5-agent pipeline orchestrator)
│   │   ├── pipeline/
│   │   │   ├── types.ts      ← TeachingState and API types
│   │   │   ├── contract.ts   ← Agent 1
│   │   │   ├── mapper.ts     ← Agent 2
│   │   │   ├── defender.ts   ← Agent 3
│   │   │   ├── evaluator.ts  ← Agent 4
│   │   │   └── perturber.ts  ← Agent 5 (streaming)
│   │   ├── graph/
│   │   │   └── d1.ts         ← D1 graph client (replaces Kuzu)
│   │   ├── llm/
│   │   │   └── index.ts      ← Workers AI + Gemini unified interface
│   │   ├── routes/
│   │   │   ├── seeds.ts      ← Seed management
│   │   │   └── admin.ts      ← Ontology extraction
│   │   └── seeds/
│   │       └── defaults.ts   ← Bundled seed ontologies
│   ├── wrangler.toml
│   └── package.json
│
├── ui/                       ← React 19 SPA
│   ├── src/
│   │   ├── App.tsx           ← Root layout
│   │   ├── main.tsx          ← Entry point
│   │   ├── globals.css       ← Design system
│   │   ├── components/
│   │   │   ├── TheRiver.tsx       ← Dialogue stream
│   │   │   ├── TheConstellation.tsx ← Graph visualisation
│   │   │   ├── TheFog.tsx         ← Private scratchpad
│   │   │   ├── SeedDropdown.tsx   ← Seed selector
│   │   │   └── LlmPanel.tsx       ← LLM config
│   │   └── lib/
│   │       ├── api.ts        ← API client (SSE streaming)
│   │       └── store.ts      ← Zustand store
│   └── package.json
│
├── migrations/
│   └── 0001_schema.sql       ← D1 schema
├── .github/workflows/
│   └── deploy.yml            ← CI/CD
└── pnpm-workspace.yaml
```

---

## API Reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/models?provider=workersai` | List available models |
| `POST` | `/api/turn` | Run a turn (returns full JSON) |
| `POST` | `/api/turn/stream` | Run a turn (streams SSE tokens) |
| `GET` | `/api/graph?user_id=…` | Get full knowledge graph |
| `GET` | `/api/messages?user_id=…` | Get session messages |
| `DELETE` | `/api/session?user_id=…` | Clear conversation (keep graph) |
| `POST` | `/api/reset` | Full reset (clear graph + session) |
| `POST` | `/api/seed/activate` | Activate a seed for a user |
| `GET` | `/seeds` | List all seeds |
| `GET` | `/seeds/:name` | Get seed detail |
| `POST` | `/seeds` | Save a new seed |
| `POST` | `/seeds/init` | Insert bundled default seeds |
| `POST` | `/admin/extract` | Extract concept graph from text (SSE) |
