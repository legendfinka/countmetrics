# Load test results

Not run yet. Every number here must come from a real run.

## What is compared

| Run    | Worker setting                | Meaning                      |
| ------ | ----------------------------- | ---------------------------- |
| Before | `WORKER_BATCH_SIZE=1`         | Each job is saved on its own |
| After  | `WORKER_BATCH_SIZE=500` (default) | Events are saved in batches |

This measures batching only. API caching is the same in both runs.
Each request carries one event, so requests per second equals events per second.

## How to run

Start from the project root. Each command in steps 2 to 5 gets its own terminal.

1. `docker compose up -d`
2. API, with the rate limits raised (all test traffic comes from one IP):

   ```bash
   RATE_LIMIT_IP_PER_MIN=10000000 RATE_LIMIT_SITE_PER_MIN=10000000 \
     pnpm --filter api exec tsx --env-file=../../.env src/index.ts
   ```

3. Worker. For "before":

   ```bash
   WORKER_BATCH_SIZE=1 pnpm --filter worker exec tsx --env-file=../../.env src/index.ts
   ```

   For "after", leave out `WORKER_BATCH_SIZE=1`. Check the first log line: it shows the batch size.

4. Queue size: `pnpm --filter worker queue-depth`
5. Reset the demo data, then run the test:

   ```bash
   pnpm --filter api seed
   k6 run -e RATE=500 loadtest/ingest.js
   ```

6. Wait until the queue is back to 0, then press Ctrl+C in the queue terminal.

Repeat steps 3 to 6 with `RATE=500`, `1000` and `2000`, for both "before" and "after".
Start each run with an empty queue. Run `pnpm --filter api seed` at the end to clean up.

## Environment

- Machine (model, CPU, RAM):
- macOS, Node, k6 and Docker versions:
- Everything runs on one machine, so k6 competes with the app for CPU.

## Results

"Sent" is `http_reqs` per second in k6. If k6 shows `dropped_iterations`, it could not keep the target rate.

| Run    | Target req/s | Sent req/s | p95 | p99 | Errors | Dropped | Peak queue | Queue busy (s) | Failed jobs |
| ------ | ------------ | ---------- | --- | --- | ------ | ------- | ---------- | -------------- | ----------- |
| Before | 500          |            |     |     |        |         |            |                |             |
| After  | 500          |            |     |     |        |         |            |                |             |
| Before | 1000         |            |     |     |        |         |            |                |             |
| After  | 1000         |            |     |     |        |         |            |                |             |
| Before | 2000         |            |     |     |        |         |            |                |             |
| After  | 2000         |            |     |     |        |         |            |                |             |

## Notes

Add what you noticed after the runs.
