# Fraud Intelligence Swarm - Revised Execution Plan

## 1. Objective

Build a production-credible system that ingests public fraud reports (starting with Reddit), stores raw + normalized records, and makes them searchable for keyword and pattern analysis with source-backed evidence.

## 2. Problems in the Prior Plan (Critique)

1. The plan is architecture-heavy but execution-light.
2. It optimizes for future flexibility before proving core value.
3. Success metrics are missing (quality, latency, ingest volume, cost).
4. Legal/compliance requirements for scraping and data handling are under-specified.
5. The roadmap does not define strict phase exit criteria.
6. Too much early surface area (many packages/services/roles) increases delivery risk.
7. Agent/swarm complexity is introduced before baseline retrieval quality is validated.
8. Reliability and observability are mentioned but not planned as concrete deliverables.

## 3. Planning Principles for the New Version

1. Deliver one vertical slice first: ingest -> normalize -> search -> analyst output.
2. Defer LLM features until after MVP ingestion and search are reliable.
3. Keep interfaces, but defer non-essential abstractions.
4. Every phase has measurable exit criteria.
5. Compliance, PII hygiene, and operability are first-class requirements.

## 4. Scope

### In Scope (MVP)

1. Reddit ingestion from selected fraud-related subreddits.
2. Raw payload retention plus normalized document storage.
3. Postgres full-text search with filters and ranking.
4. Deterministic analyst report generation from cited results.
5. Basic monitoring, retry behavior, and idempotent re-runs.
6. Data model and schema prepared for easy keyword indexing and expansion.

### Out of Scope (for MVP)

1. Multi-agent coordinator/swarm orchestration.
2. Multi-platform ingestion (Twitter/forums/news) beyond Reddit.
3. Real-time streaming ingestion.
4. Elasticsearch/OpenSearch migration.
5. LLM-based analyst execution.
6. Automated enforcement actions (blocking, account controls).

## 5. Success Metrics (Must Be Measured)

1. Ingestion throughput: >= 5,000 posts+comments/hour on dev hardware.
2. Idempotency: duplicate insert rate < 1% on rerun of same window.
3. Search latency: p95 < 300 ms for top 50 results on 100k docs.
4. Search quality: nDCG@10 >= 0.70 on a labeled test set.
5. Analyst report quality: 100% claims tied to at least one cited document ID.
6. Coverage: each ingested record has raw object reference + normalized searchable document.

## 6. Target Architecture (Simplified)

### Keep

1. TypeScript + Effect for typed errors and dependency wiring.
2. Postgres + tsvector/GIN for search.
3. S3-compatible raw storage (MinIO in dev, S3 in prod).
4. Interface-first boundaries (`DocumentRepo`, `SearchIndex`, `ObjectStore`, `WebScraper`).

### Defer

1. `AgentFactory`, role-specialized swarm execution, and LLM tool orchestration.
2. Additional package splits that do not reduce immediate delivery risk.

## 7. Delivery Plan With Exit Criteria

### Phase 0 - Alignment and Risk Lockdown (0.5-1 day)

### Deliverables

1. Finalized subreddit list and ingestion cadence.
2. Data policy: what is stored, indefinite retention for now, and redaction rules.
3. Compliance note for Reddit API/TOS constraints.
4. Final MVP acceptance criteria approved (no LLM requirement).

### Exit Criteria

1. Written decisions checked into repo (`docs/decisions.md`).
2. No unresolved compliance blocker for ingestion approach.
3. Starter subreddit set confirmed:
   `r/Scams`, `r/phishing`, `r/IdentityTheft`.

### Phase 1 - Data Pipeline Vertical Slice (2-4 days)

### Deliverables

1. Monorepo scaffold with minimal packages:
   `packages/types`, `packages/db`, `packages/scraper`, `apps/cli`.
2. Docker services: Postgres + MinIO.
3. Reddit ingestion command:
   pull submissions and comments for configured subreddits, store raw JSON in object storage, and normalize into `scraped_items` and `documents`.
4. Deduplication via content hash and source identifiers.
5. Retry/backoff + rate-limit handling.

### Exit Criteria

1. `swarm scrape --subreddit scams --limit 1000` completes successfully.
2. Re-running the same command adds <= 1% new docs.
3. Raw object key exists for every inserted normalized item.

### Phase 2 - Search and Analyst Baseline (2-3 days)

### Deliverables

1. Postgres FTS trigger + weighted `search_vector` index.
2. Search CLI with filters:
   text query, subreddit, date range, and fraud type tag (if present).
3. Deterministic analysis command:
   top terms, recurring entities (URLs/domains/wallets/phones/emails), and trend delta by week.
4. Evaluation harness with small labeled set (50-100 queries/docs).

### Exit Criteria

1. p95 latency and nDCG target met on local benchmark dataset.
2. `swarm analyze --deterministic` outputs reproducible results.
3. Search and analysis commands include traceable source IDs.

### Phase 3 - Hardening and Operability (2-4 days)

### Deliverables

1. Test suite:
   unit tests for parsing/dedup/ranking query builder and integration tests for DB migrations + scraper path.
2. Observability:
   structured logs with run IDs, ingest/search latency metrics, and error counters by class.
3. CI:
   typecheck, lint, unit tests, and integration tests (service containers).
4. Runbooks:
   local setup, backfill procedure, and incident triage for scraper failures.

### Exit Criteria

1. CI green on main branch.
2. Backfill of at least 100k docs succeeds without manual repair.
3. On-call runbook supports recovery from failed scrape runs.
4. Keyword search performance and quality targets remain green after backfill.

### Post-MVP Phase 4 - Optional LLM Analyst (Future)

### Deliverables

1. LLM command (`swarm analyze --llm`) using retrieval tools only.
2. Structured output that requires source citations.
3. Safety checks that reject uncited claims.

### Exit Criteria

1. LLM findings are fully source-cited.
2. LLM mode does not degrade baseline deterministic workflow.

## 8. Data Model and Storage Guidance

1. Keep `documents` as normalized searchable unit.
2. Keep `scraped_items` as source-of-truth linkage to raw payload.
3. Store extraction artifacts (entities, fraud indicators) in explicit columns where queried often; avoid overusing JSONB for hot paths.
4. Add indexes only after query plans show need (`EXPLAIN ANALYZE`), except mandatory FTS index.

## 9. Risks and Mitigations

1. Reddit access/rate policy changes.
   Mitigation: adapter boundary + backoff + source health checks.
2. Search quality too weak for analyst use.
   Mitigation: labeled eval set before LLM rollout; tune weights/synonyms.
3. LLM hallucination.
   Mitigation: retrieval-only tools, strict citation schema, uncited-claim rejection.
4. PII handling and retention risk.
   Mitigation: redact sensitive fields, retention controls, documented policy.
5. Overengineering slows delivery.
   Mitigation: defer swarm roles until Phase 4+ and KPI validation.

## 10. Milestones and Decision Gates

1. Gate A (after Phase 1): Is ingestion stable and idempotent?
2. Gate B (after Phase 2): Is retrieval quality good enough for analyst use?
3. Gate C (after Phase 3): Is system operationally ready for sustained backfills?
4. Gate D (post-MVP): Is LLM mode worth adding, and is system ready for additional platforms?

## 11. Immediate Next Tasks (First 48 Hours)

1. Create repo scaffold and package boundaries (minimal set only).
2. Stand up Postgres/MinIO via docker compose.
3. Implement Reddit ingest command with raw+normalized writes.
4. Add dedup keys and migration for core tables.
5. Seed with initial subreddit backfill and validate idempotency.
6. Implement first search CLI command and benchmark script.
7. Add deterministic keyword-trend report command.

## 12. Open Questions (Need Owner Decisions)

1. Confirm starter subreddit set:
   `r/Scams`, `r/phishing`, `r/IdentityTheft`.
2. Do we want to include `r/personalfinance` as a secondary source in MVP, or keep it out for noise control?
