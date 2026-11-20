import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import type pg from "pg";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EVENTS_QUEUE, type EnrichedEvent } from "@countmetrics/shared";
import {
  countRows,
  createPool,
  createRedis,
  createSite,
  makeEvent,
  resetAll,
  silentLog,
  visitor,
  waitFor,
} from "../test/helpers.js";
import { createEventWorker } from "./worker.js";

// End-to-end test: real queue -> worker -> batcher -> Postgres.

let pool: pg.Pool;
let redis: Redis;
let queueConnection: Redis;
let queue: Queue;
let siteId: string;

beforeAll(() => {
  pool = createPool();
  redis = createRedis();
  queueConnection = createRedis({ maxRetriesPerRequest: null });
  queue = new Queue(EVENTS_QUEUE, { connection: queueConnection });
});
afterAll(async () => {
  await queue.close();
  await queueConnection.quit();
  await redis.quit();
  await pool.end();
});
beforeEach(async () => {
  await resetAll(pool, redis);
  siteId = await createSite(pool);
});

function startWorker(config: { batch: number; intervalMs: number }) {
  const flushedEvents: number[] = [];
  const workerConnection = createRedis({ maxRetriesPerRequest: null });
  const eventWorker = createEventWorker({
    config: {
      WORKER_BATCH_SIZE: config.batch,
      WORKER_FLUSH_INTERVAL_MS: config.intervalMs,
      WORKER_CONCURRENCY: 50,
    },
    pool,
    redis,
    queueConnection: workerConnection,
    log: silentLog,
    onFlush: (stats) => flushedEvents.push(stats.events),
  });
  return {
    flushedEvents,
    async close() {
      await eventWorker.close();
      await workerConnection.quit();
    },
  };
}

const addJob = (events: EnrichedEvent[]) =>
  queue.add(
    "events",
    { events },
    { jobId: randomUUID(), attempts: 3, backoff: { type: "fixed", delay: 50 } },
  );

describe("worker end to end", () => {
  it("writes many small jobs in a few batches", async () => {
    const worker = startWorker({ batch: 5, intervalMs: 50 });
    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        addJob([makeEvent(siteId, { visitorHash: visitor(i) })]),
      ),
    );

    await waitFor(async () => (await countRows(pool, "Event")) === 12);
    await worker.close();

    expect(worker.flushedEvents.reduce((a, b) => a + b, 0)).toBe(12);
    expect(worker.flushedEvents.length).toBeLessThan(12); // batched, not one write per job
    expect(await queue.getCompletedCount()).toBe(12);
  });

  it("fails a malformed job once, without retries, and keeps processing", async () => {
    const worker = startWorker({ batch: 5, intervalMs: 50 });
    await queue.add("events", { events: "not an array" }, { jobId: randomUUID(), attempts: 3 });
    await Promise.all([addJob([makeEvent(siteId)]), addJob([makeEvent(siteId)])]);

    await waitFor(async () => (await countRows(pool, "Event")) === 2);
    await waitFor(async () => (await queue.getFailedCount()) === 1);
    await worker.close();

    const [failed] = await queue.getFailed();
    expect(failed?.failedReason).toMatch(/Invalid job payload/);
    expect(failed?.attemptsMade).toBe(1);
  });

  it("sends a job for a deleted site to the failed set without blocking the others", async () => {
    const worker = startWorker({ batch: 50, intervalMs: 100 });
    await Promise.all([
      addJob([makeEvent(siteId)]),
      addJob([makeEvent(randomUUID())]), // site does not exist
      addJob([makeEvent(siteId)]),
    ]);

    await waitFor(async () => (await queue.getFailedCount()) === 1);
    await worker.close();

    expect(await countRows(pool, "Event")).toBe(2);
    const [failed] = await queue.getFailed();
    expect(failed?.failedReason).toMatch(/Invalid data/);
  });

  it("flushes the buffer on graceful shutdown instead of waiting for the timer", async () => {
    const worker = startWorker({ batch: 1000, intervalMs: 60_000 });
    await Promise.all([
      addJob([makeEvent(siteId)]),
      addJob([makeEvent(siteId)]),
      addJob([makeEvent(siteId)]),
    ]);
    await waitFor(async () => (await queue.getActiveCount()) === 3); // picked up, waiting in the buffer
    expect(await countRows(pool, "Event")).toBe(0);

    await worker.close();

    expect(await countRows(pool, "Event")).toBe(3);
    expect(await queue.getCompletedCount()).toBe(3);
  });
});
