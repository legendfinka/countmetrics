# CountMetrics

A privacy-friendly, real-time web analytics platform (a mini Plausible / Google Analytics). Website owners add a tiny tracking script; visitor events are ingested at high volume, aggregated, and shown on a live dashboard.

Portfolio project. It must demonstrate **high-load backend engineering made visible**: fast ingestion, queues, caching, aggregation, real-time updates, and measured performance — wrapped in a dashboard that impresses in a 10-second demo.

## Product scope (MVP)

In scope:

- Auth: register, login, refresh, logout (email + password)
- Sites: a user can add websites; each site gets a public `siteKey` used by the tracker
- Tracker: a tiny JS snippet (`<script>`) that sends `pageview` and custom events (`countmetrics.track("signup")`)
- Ingestion API that accepts events at high volume
- Live dashboard per site:
  - Current visitors (live, updates without refresh)
  - Pageviews and unique visitors over time (last 30 min / 24 h / 7 d / 30 d)
  - Top pages, top referrers, countries, devices/browsers
  - Custom events count
- "Simulate traffic" button on the demo site: generates realistic fake events through the same pipeline so the dashboard comes alive
- Demo account with seeded data and a "Try demo" button
- Load test with k6 and documented results in the README

Out of scope (do NOT build unless asked): funnels, A/B testing, session replay, heatmaps, team accounts, billing, email reports, custom dashboards.

## Privacy (important — this is a selling point for the German market)

- No cookies, no localStorage identifiers in the tracker.
- Never store raw IP addresses.
- Unique visitors are counted with a daily-rotating hash: `hash(dailySalt + siteKey + ip + userAgent)`. The salt rotates every 24 h and old salts are deleted, so visitors cannot be tracked across days.
- Country is derived from the IP at ingestion time (offline lookup, e.g. `geoip-lite`), then the IP is discarded.
- Mention "GDPR-friendly, cookieless" in the README and explain the approach.

## Tech stack

Monorepo with pnpm workspaces:

```
countmetrics/
├── apps/
│   ├── web/         # React + Vite + TypeScript dashboard
│   ├── api/         # Fastify + TypeScript: auth, sites, ingestion, stats, WebSocket
│   └── worker/      # BullMQ worker: processes event batches, writes to DB, updates aggregates
├── packages/
│   ├── shared/      # Zod schemas + types shared across apps
│   └── tracker/     # The embeddable JS snippet (no dependencies, < 2 KB gzipped)
├── loadtest/        # k6 scripts + results
├── docker-compose.yml
└── .github/workflows/ci.yml
```

- **Frontend:** React, TypeScript (strict), Vite, TanStack Query, React Router, Tailwind CSS + shadcn/ui, Recharts for charts, a simple world map component for countries
- **API:** Fastify (chosen over Express for throughput and built-in schema validation — be ready to explain this), TypeScript (strict), Zod
- **Worker:** BullMQ on Redis
- **Database:** PostgreSQL with Prisma (for app data) and raw SQL where performance matters (batch inserts, aggregation queries)
- **Redis:** queue (BullMQ), live counters, HyperLogLog for approximate unique counts, pub/sub for pushing live updates
- **Real-time:** WebSocket (`@fastify/websocket` or Socket.IO) pushing dashboard updates
- **Auth:** short-lived JWT access token + rotating refresh token in an httpOnly cookie; refresh tokens stored hashed
- **Testing:** Vitest + Supertest/`fastify.inject` (API, worker), Vitest + Testing Library (web)
- **Load testing:** k6
- **Deployment:** web on Vercel; API + worker on Render or Railway; Postgres on Neon; Redis on Upstash or Railway

## Data flow

```
Tracker (browser)
  → POST /api/event (navigator.sendBeacon, fallback fetch keepalive)
    → API: validate, enrich (country, device, visitor hash), drop IP
    → push to Redis queue (respond 202 immediately — never write to Postgres in the request)
      → Worker: pull events in batches (e.g. 500 or every 1 s)
        → bulk insert raw events into Postgres
        → update minute-level aggregate rows (upsert)
        → update Redis live counters
        → publish "site:{id}:update" on Redis pub/sub
          → API WebSocket layer pushes the update to connected dashboards
```

The ingestion endpoint must stay fast under load: validation + enrichment + enqueue only.

## Data model

- `User`: id, email (unique), passwordHash, name, createdAt
- `Site`: id, userId, domain, siteKey (unique, public), createdAt
- `RefreshToken`: id, userId, tokenHash, expiresAt, revokedAt?
- `Event` (raw, append-only): id, siteId, type (`pageview` | custom name), path, referrer, country, device, browser, visitorHash, createdAt — indexed on (siteId, createdAt)
- `StatsMinute` (aggregates): siteId, bucket (timestamp truncated to minute), pageviews, visitors (approx), events — unique(siteId, bucket)
- Breakdown aggregates (top pages, referrers, countries, devices) may be computed from raw events with indexed queries for MVP; add aggregate tables only if load tests show it is needed. Document the decision.

## Architecture rules

### API

- Feature modules: `src/modules/{auth,sites,ingest,stats,live}/` with `routes → service → repository` layering. No business logic in route handlers.
- Validate every request with Zod schemas from `packages/shared` (or Fastify JSON schema generated from them).
- `POST /api/event`:
  - Public, CORS-enabled, accepts single events or small batches
  - Validates `siteKey`; unknown keys are rejected cheaply (cache valid site keys in Redis/in-memory)
  - Rate limited per IP and per siteKey
  - Responds `202 Accepted` after enqueueing
- Stats endpoints read from aggregates and use short-lived Redis caching (e.g. 10–30 s) for heavier queries.
- Every site-scoped endpoint verifies the current user owns the site.
- Centralized error handling with a consistent shape `{ error: { code, message, details? } }`.
- Config via environment variables validated with Zod at startup. Provide `.env.example`.

### Worker

- Batch processing with configurable batch size / flush interval.
- Idempotent writes where possible; failed jobs retry with backoff; poison messages go to a failed queue, never block the pipeline.
- Graceful shutdown: finish the current batch before exiting.

### Traffic simulator

- Lives in the API (or worker) as an internal job, triggered by an authenticated endpoint for the user's own site, or a public endpoint for the demo site only.
- It enqueues generated events **directly into the internal pipeline**. It must never accept a target URL or send HTTP traffic to any external host.
- Hard caps: max duration (e.g. 30 s), max events per run, one active simulation per site, cooldown between runs.
- Generated data should look realistic: weighted page paths, referrers, countries, devices, and a visitor-count curve.

### Tracker (`packages/tracker`)

- Zero dependencies, < 2 KB gzipped, ES2015 output (all modern browsers).
- Auto-tracks pageviews, including SPA navigation (history API).
- Exposes `window.countmetrics.track(name, props?)` for custom events.
- Uses `navigator.sendBeacon`, falls back to `fetch` with `keepalive`.
- Respects `navigator.doNotTrack` (documented behavior).

### Web

- Feature folders: `src/features/{auth,sites,dashboard,live}/`
- Server state via TanStack Query; live updates via WebSocket merged into query cache.
- The dashboard must look polished: clean cards, smooth chart updates, loading and empty states.
- "Simulate traffic" button with a visible running state and countdown.

### General

- TypeScript strict mode everywhere, no `any` without an explanatory comment.
- Conventional Commits, small focused commits.
- Tests alongside features: auth, site ownership checks, ingestion validation and rate limiting, visitor hashing, worker batching/aggregation, simulator caps.

## Load testing

- k6 script in `loadtest/ingest.js` hitting `POST /api/event` with realistic payloads.
- Measure: requests/sec sustained, p95/p99 latency, error rate, worker lag (queue depth over time).
- Record results in `loadtest/RESULTS.md` and summarize in the README, including the machine/environment used.
- Run once before optimizations and once after (batching, caching), and show the before/after numbers. Never invent numbers.

## Commands (keep this section up to date)

- `pnpm install` — install dependencies
- `docker compose up -d` — start Postgres + Redis
- `pnpm --filter @countmetrics/tracker build` — build the tracker (the API serves it at `/tracker.js`)
- `pnpm dev` — run web, api and worker in dev mode
- `pnpm lint` / `pnpm typecheck` / `pnpm test` — must all pass before committing
- `pnpm --filter api prisma migrate dev` — run migrations
- `pnpm --filter api seed` — seed demo user, demo site and historical demo data
- `k6 run loadtest/ingest.js` — run the load test (setup steps are in `loadtest/RESULTS.md`)
- `pnpm --filter worker queue-depth` — print the queue size during a load test

## CI

GitHub Actions on push and PR: install → lint → typecheck → test (with Postgres and Redis service containers) → build tracker and check its gzipped size stays under the limit.

## Implementation plan

Work in this order. Finish and verify each step (lint, typecheck, tests) before starting the next.

1. Monorepo setup, Docker Compose (Postgres + Redis), Prisma schema + first migration, ESLint/Prettier, CI with lint + typecheck
2. Auth (register, login, refresh with rotation, logout) + Sites CRUD with ownership checks, tests
3. Ingestion endpoint: validation, enrichment (country, device, visitor hash), rate limiting, enqueue; tests
4. Worker: batch processing, bulk insert, minute aggregates, live counters, pub/sub; tests
5. Stats API: overview, time series, top pages/referrers/countries/devices, with caching
6. Tracker package: pageviews, SPA navigation, custom events, size check in CI
7. Web: auth pages, site list, "add site" flow showing the snippet to copy
8. Dashboard: charts, breakdowns, live visitors via WebSocket
9. Traffic simulator with hard caps + demo account + seed script + "Try demo" button
10. Load test (before/after), deployment, README with GIF, architecture diagram (Mermaid), privacy section, "Key decisions" and "Performance" sections

## Working style

- Before writing code for a step, briefly state the plan and the files you will touch.
- After each step, explain the key design decisions in 3–5 bullet points so the developer can defend them in a technical interview (e.g. why a queue instead of writing directly to Postgres, why HyperLogLog, why Fastify, how the visitor hash protects privacy).
- Prefer simple, readable solutions over clever ones. No unnecessary dependencies.
