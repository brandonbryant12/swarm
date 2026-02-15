# Swarm Fraud Monitor

Swarm is a monorepo for collecting fraud signal data from Reddit, indexing it in Postgres, and interacting with it through a web console that supports authenticated AI-assisted analysis.

This repository currently includes:

1. A production-oriented scraper MVP (`apps/cli`) for submissions + comments.
2. A backend API (`apps/server`) using Hono, oRPC, Better Auth, and Effect-based logic.
3. A frontend app (`apps/web`) using TanStack Router with streaming chat UI via AI SDK.

## What Works Today

1. Reddit scraping into raw object storage (MinIO/S3 API compatible).
2. Normalized Postgres storage with deduplication.
3. Full-text keyword search using Postgres `tsvector` + GIN index.
4. Auth-protected oRPC endpoints (email/password via Better Auth).
5. Streaming agent chat endpoint with tools for indexed search + Postgres operational stats.

## Architecture

```text
Reddit JSON -> CLI Scraper -> MinIO (raw JSON)
                       -> Postgres (scraped_items, documents, search_vector)

Web (TanStack Router)
  -> Better Auth (session cookie)
  -> oRPC procedures
      -> Effect-based backend logic
      -> AI SDK streamText + tool registry
           -> searchIndexedData tool (Postgres FTS)
           -> getPostgresStats tool (DB metrics)
```

## Monorepo Layout

```text
apps/
  cli/       Reddit ingestion + keyword search CLI
  server/    Hono + Better Auth + oRPC API
  web/       TanStack Router frontend + streaming chat UI

packages/
  backend/   Effect-based business logic + AI tool registry
  db/        SQL schema + repository for scraper pipeline
  scraper/   Reddit scraper + S3/MinIO writer + retry logic
  types/     Shared data contracts used by scraper pipeline
```

## Tech Stack

1. Frontend: React 19, TanStack Router, Vite.
2. Server: Hono, oRPC, Better Auth.
3. Backend logic: Effect TS.
4. LLM interface: AI SDK (`ai`, `@ai-sdk/openai`, `@ai-sdk/react`).
5. Data: PostgreSQL 16, MinIO.
6. Monorepo tooling: pnpm workspaces + Turborepo + TypeScript.

## Prerequisites

1. Node.js 22+.
2. pnpm 10+.
3. Docker + Docker Compose.
4. Optional for chat: OpenAI API key.
5. Optional for publishing: GitHub CLI (`gh`) authenticated.

## Environment

Copy env file:

```bash
cp .env.example .env
```

Variables:

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql://swarm:swarm_dev_password@localhost:55432/swarm` | Shared DB for scraper + server |
| `S3_ENDPOINT` | `http://localhost:9000` | MinIO/S3 endpoint |
| `S3_REGION` | `us-east-1` | S3 region |
| `S3_ACCESS_KEY` | `minioadmin` | S3 access key |
| `S3_SECRET_KEY` | `minioadmin` | S3 secret key |
| `S3_BUCKET_RAW` | `swarm-raw` | Raw JSON storage bucket |
| `S3_FORCE_PATH_STYLE` | `true` | Required for MinIO local mode |
| `REDDIT_USER_AGENT` | `swarm-fraud-monitor/0.1.0 (contact: security@example.com)` | Reddit request user-agent |
| `SCRAPE_RATE_LIMIT_MS` | `1200` | Delay between Reddit requests |
| `SCRAPE_MAX_RETRY_ATTEMPTS` | `5` | Retry attempts for transient failures |
| `SCRAPE_RETRY_BASE_DELAY_MS` | `1000` | Retry backoff base |
| `SERVER_PORT` | `3000` | Hono/oRPC server port |
| `WEB_ORIGIN` | `http://localhost:5173` | Allowed frontend origin |
| `BETTER_AUTH_URL` | `http://localhost:3000` | Server base URL for Better Auth |
| `BETTER_AUTH_SECRET` | `dev-secret-change-me-for-production` | Better Auth signing secret |
| `AI_MODEL` | `gpt-4o-mini` | AI SDK model id |
| `OPENAI_API_KEY` | empty | Required for chat endpoint |

## Local Development

### 1. Start infra

```bash
docker compose up -d
```

Services:

1. Postgres on `localhost:55432`.
2. MinIO API on `localhost:9000`.
3. MinIO console on `localhost:9001`.

### 2. Install deps

```bash
pnpm install
```

### 3. Initialize schema and buckets

```bash
pnpm --filter @swarm/cli dev -- init
```

### 4. Seed fraud data from Reddit

```bash
pnpm --filter @swarm/cli dev -- scrape --subreddit scams --limit 200 --include-comments
pnpm --filter @swarm/cli dev -- scrape --subreddit phishing --limit 200 --include-comments
pnpm --filter @swarm/cli dev -- scrape --subreddit IdentityTheft --limit 200 --include-comments
```

### 5. Start web + server together (Turbo)

```bash
pnpm dev
```

This runs:

1. `@swarm/server` on `http://localhost:3000`
2. `@swarm/web` on `http://localhost:5173`

Optional: run services separately with `pnpm dev:server` and `pnpm dev:web`.

Health check:

```bash
curl http://localhost:3000/health
```

### 6. Sign in and use app

1. Create account (email/password) in UI.
2. Open `Ops` page to confirm protected stats endpoint.
3. Use `Chat` page for tool-backed analysis.

## CLI Commands

### `init`

Ensures Postgres schema/triggers/indexes and raw storage bucket exist.

```bash
pnpm --filter @swarm/cli dev -- init
```

### `scrape`

Scrapes subreddit submissions and comments; writes raw payloads and normalized rows.

```bash
pnpm --filter @swarm/cli dev -- scrape --subreddit scams --limit 100 --include-comments --max-comments-per-post 100
```

### `search`

Runs Postgres full-text search over indexed documents.

```bash
pnpm --filter @swarm/cli dev -- search "phishing email" --limit 20
```

## Backend API Surface

Auth endpoints (Better Auth):

1. `POST /api/auth/sign-up/email`
2. `POST /api/auth/sign-in/email`
3. `GET /api/auth/get-session`
4. Additional Better Auth endpoints under `/api/auth/*`

Protected oRPC procedures under `/rpc`:

1. `auth.me`
2. `search.indexed`
3. `stats.overview`
4. `ai.chat` (streaming, requires `OPENAI_API_KEY`)

## Streaming Chat + Tools

The agent is configured with a scalable tool registry in `packages/backend/src/tools`.

Current tools:

1. `searchIndexedData`: full-text search over indexed fraud corpus.
2. `getPostgresStats`: document/scrape totals, type distribution, top subreddits, duplicate estimate.

To add a new tool:

1. Create `packages/backend/src/tools/<tool-name>.ts` exporting a `ToolFactory`.
2. Register it in `packages/backend/src/agent.ts` registry list.
3. Rebuild and the chat stream will include it automatically.

## Dev Quality Commands

```bash
pnpm typecheck
pnpm build
```

## Initial Dev Test Results

Snapshot from local validation (February 15, 2026):

1. `pnpm typecheck`: pass across all packages.
2. `pnpm build`: pass across all packages (including web Vite build).
3. Scrape smoke test (`r/scams`, limit 3):
   - `scannedSubmissions=3`
   - `scannedComments=23`
   - `insertedItems=26`
   - `insertedDocuments=26`
   - `errors=0`
4. Idempotency rerun (same command):
   - `insertedItems=0`
   - `updatedItems=26`
   - `insertedDocuments=0`
   - `duplicateDocuments=26`
5. Protected API behavior:
   - unauthenticated `stats.overview` returns `401`
   - authenticated `stats.overview` returns `200` with metrics
6. Auth flow:
   - signup + `get-session` verified via API
7. Chat endpoint:
   - returns explicit `500` if `OPENAI_API_KEY` is missing (expected)

## Next Stages

### Stage 1: Security and Auth Persistence

1. Move Better Auth storage from in-memory to Postgres tables.
2. Add CSRF, session hardening, and production cookie configuration.
3. Add role-based authorization for admin-only ops endpoints.

### Stage 2: Tooling Expansion

1. Add tools for trend windows (7d/30d delta).
2. Add entity aggregation tools (domains, wallets, emails, phones).
3. Add source-level drilldown tool for subreddit/post/comment traces.

### Stage 3: Reliability and Observability

1. Structured logging with request and run IDs.
2. Metrics export for scrape duration, tool latency, query latency, error rates.
3. Add retry telemetry and dead-letter strategy for scrape failures.

### Stage 4: Data and Search Quality

1. Introduce query evaluation harness (nDCG and precision checks).
2. Add synonym dictionaries and query normalization.
3. Optionally split hot/cold partitions for large corpus scaling.

### Stage 5: Productionization

1. Add CI workflow for typecheck/build/test.
2. Add Dockerfiles for web/server.
3. Add deployment manifests and environment-specific secrets management.

## Known Limitations

1. Better Auth currently uses default in-memory store.
2. Tool registry typing uses a permissive internal cast in agent wiring to smooth SDK type variance.
3. No comprehensive automated test suite yet (only smoke and build/type checks).

## Troubleshooting

1. Port conflicts:
   - Postgres host port defaults to `55432`.
   - Server defaults to `3000`.
   - Web defaults to `5173`.
2. Chat fails with `OPENAI_API_KEY is required`:
   - Add `OPENAI_API_KEY` to `.env` and restart `pnpm dev:server`.
3. Reddit throttling:
   - Increase `SCRAPE_RATE_LIMIT_MS` and retry.

## License

No license file has been added yet. Add one before public distribution if needed.
