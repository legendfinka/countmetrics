# Load test results

**Batching lets the worker keep up with traffic.**
At 1000 events per second, the longest queue dropped from 36,185 to 527.

## Results

Each test ran for 60 seconds. No run had errors or failed jobs.

| Events/s | Batching | API p95 | API p99  | Longest queue | Queue busy |
| -------- | -------- | ------- | -------- | ------------- | ---------- |
| 500      | off      | 1.47 ms | 9.06 ms  | 4,688         | 69 s       |
| 500      | on       | 1.96 ms | 11.28 ms | 359           | 61 s       |
| 1000     | off      | 1.47 ms | 11.53 ms | 36,185        | 132 s      |
| 1000     | on       | 4.08 ms | 13.66 ms | 527           | 61 s       |

- **API p95 / p99:** 95% / 99% of requests were answered within this time.
- **Queue:** events waiting for the worker.
- **Queue busy:** how long the queue had something in it. About 60 s means the worker kept up.

The API was fast in every run, because it only adds events to the queue.
Each test ran once, so treat small time differences with care.

## Test setup

- MacBook Air, Apple M1, 16 GB RAM
- Node v24.22.3, k6 v2.4.0, Postgres and Redis in Docker (OrbStack)
- Everything ran on one machine, in development mode
- One event per request
- Batching off: `WORKER_BATCH_SIZE=1`. On: `500` (default)
- Both used `WORKER_CONCURRENCY=500`. API caching was not compared.

## Run it yourself

Stop `pnpm dev`, then run `docker compose up -d`. Use one terminal for each step:

1. **API** (higher rate limits, because all test traffic comes from one IP):

   ```bash
   RATE_LIMIT_IP_PER_MIN=10000000 RATE_LIMIT_SITE_PER_MIN=10000000 pnpm --filter api dev
   ```

2. **Worker** (remove `WORKER_BATCH_SIZE=1` to turn batching on):

   ```bash
   WORKER_BATCH_SIZE=1 pnpm --filter worker dev
   ```

3. **Queue size:**

   ```bash
   pnpm --filter worker queue-depth
   ```

4. **Test:**

   ```bash
   pnpm --filter api seed
   k6 run -e RATE=500 loadtest/ingest.js
   ```

When the queue is back to 0, press `Ctrl+C` in terminal 3.
Run `pnpm --filter api seed` again at the end to remove the test events.
