import { Worker } from "bullmq";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import { EVENTS_QUEUE } from "@countmetrics/shared";
import { createBatcher } from "./batcher.js";
import type { Config } from "./config.js";
import { createFlusher, type Logger, type PendingJob } from "./flush.js";
import { createProcessor } from "./processor.js";

export interface EventWorkerDeps {
  config: Pick<Config, "WORKER_BATCH_SIZE" | "WORKER_FLUSH_INTERVAL_MS" | "WORKER_CONCURRENCY">;
  pool: Pool;
  /** Regular connection for HyperLogLog, live counters and pub/sub */
  redis: Redis;
  /** Connection for BullMQ; must be created with `maxRetriesPerRequest: null` */
  queueConnection: Redis;
  log: Logger;
  /** Called after every flush (useful for metrics and tests) */
  onFlush?: (stats: { jobs: number; events: number; failed: number }) => void;
}

export function createEventWorker(deps: EventWorkerDeps) {
  const flusher = createFlusher({ pool: deps.pool, redis: deps.redis, log: deps.log });

  const batcher = createBatcher<PendingJob>({
    maxWeight: deps.config.WORKER_BATCH_SIZE,
    flushIntervalMs: deps.config.WORKER_FLUSH_INTERVAL_MS,
    weigh: (job) => job.events.length,
    flush: async (jobs) => {
      const results = await flusher(jobs);
      deps.onFlush?.({
        jobs: jobs.length,
        events: jobs.reduce((sum, j) => sum + j.events.length, 0),
        failed: results.filter(Boolean).length,
      });
      return results;
    },
  });

  const worker = new Worker(EVENTS_QUEUE, createProcessor(batcher), {
    connection: deps.queueConnection,
    concurrency: deps.config.WORKER_CONCURRENCY,
  });
  worker.on("failed", (job, err) => {
    deps.log.error(
      `job ${job?.id} failed (attempt ${job?.attemptsMade}/${job?.opts.attempts ?? 1}): ${err.message}`,
    );
  });
  worker.on("error", (err) => deps.log.error("worker error", err));

  return {
    worker,
    batcher,
    /**
     * Graceful shutdown: stop taking new jobs, write whatever is buffered right away
     * (instead of waiting for the timer) and wait for the running jobs to finish.
     */
    async close(): Promise<void> {
      const closing = worker.close();
      await batcher.flushNow();
      await closing;
      await batcher.flushNow();
    },
  };
}
