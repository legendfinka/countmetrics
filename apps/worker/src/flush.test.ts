import { UnrecoverableError } from "bullmq";
import type { Redis } from "ioredis";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { siteUpdateChannel, siteUpdateMessageSchema } from "@countmetrics/shared";
import {
  countRows,
  createPool,
  createRedis,
  createSite,
  makeEvent,
  resetAll,
  silentLog,
  visitor,
} from "../test/helpers.js";
import { createFlusher, flushJobs, type FlushDeps, type PendingJob } from "./flush.js";
import { deleteOldProcessedJobs } from "./repository.js";

const NOW = Date.parse("2026-03-10T12:01:00.000Z");
const T1 = "2026-03-10T12:00:10.000Z"; // minute 12:00
const T2 = "2026-03-10T12:00:40.000Z"; // minute 12:00
const T3 = "2026-03-10T12:01:05.000Z"; // minute 12:01

let pool: pg.Pool;
let redis: Redis;
let siteId: string;

beforeAll(() => {
  pool = createPool();
  redis = createRedis();
});
afterAll(async () => {
  await redis.quit();
  await pool.end();
});
beforeEach(async () => {
  await resetAll(pool, redis);
  siteId = await createSite(pool);
});

const deps = (overrides: Partial<FlushDeps> = {}): FlushDeps => ({
  pool,
  redis,
  log: silentLog,
  now: () => NOW,
  ...overrides,
});
const job = (events: PendingJob["events"]): PendingJob => ({ id: randomUUID(), events });

async function minuteRows() {
  const { rows } = await pool.query<{
    bucket: string;
    pageviews: number;
    events: number;
    visitors: number;
  }>(
    `SELECT to_char("bucket", 'HH24:MI') AS bucket, "pageviews", "events", "visitors"
     FROM "StatsMinute" WHERE "siteId" = $1 ORDER BY "bucket"`,
    [siteId],
  );
  return rows;
}

describe("raw events", () => {
  it("bulk inserts every event of every job with the right values", async () => {
    await flushJobs(deps(), [
      job([
        makeEvent(siteId, { createdAt: T1, path: "/pricing", referrer: "google.com" }),
        makeEvent(siteId, {
          createdAt: T2,
          type: "signup",
          country: null,
          visitorHash: visitor(2),
        }),
      ]),
      job([makeEvent(siteId, { createdAt: T3, device: "mobile", browser: "Safari" })]),
    ]);

    expect(await countRows(pool, "Event")).toBe(3);
    const { rows } = await pool.query(
      `SELECT "type", "path", "referrer", "country", "device", "browser", "visitorHash",
              to_char("createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created
       FROM "Event" WHERE "siteId" = $1 ORDER BY "createdAt"`,
      [siteId],
    );
    expect(rows[0]).toEqual({
      type: "pageview",
      path: "/pricing",
      referrer: "google.com",
      country: "DE",
      device: "desktop",
      browser: "Chrome",
      visitorHash: visitor(1),
      created: "2026-03-10T12:00:10.000Z", // saved as UTC, no timezone shift
    });
    expect(rows[1]).toMatchObject({ type: "signup", referrer: null, country: null });
    expect(rows[2]).toMatchObject({ device: "mobile", browser: "Safari" });
  });
});

describe("minute aggregates", () => {
  it("counts pageviews, custom events and unique visitors per minute", async () => {
    await flushJobs(deps(), [
      job([
        makeEvent(siteId, { createdAt: T1, visitorHash: visitor(1) }),
        makeEvent(siteId, { createdAt: T2, visitorHash: visitor(1) }),
        makeEvent(siteId, { createdAt: T2, visitorHash: visitor(2) }),
        makeEvent(siteId, { createdAt: T2, visitorHash: visitor(2), type: "signup" }),
        makeEvent(siteId, { createdAt: T3, visitorHash: visitor(3) }),
      ]),
    ]);

    expect(await minuteRows()).toEqual([
      { bucket: "12:00", pageviews: 3, events: 1, visitors: 2 },
      { bucket: "12:01", pageviews: 1, events: 0, visitors: 1 },
    ]);
  });

  it("accumulates across batches and counts a returning visitor once", async () => {
    await flushJobs(deps(), [
      job([
        makeEvent(siteId, { createdAt: T1, visitorHash: visitor(1) }),
        makeEvent(siteId, { createdAt: T1, visitorHash: visitor(2) }),
      ]),
    ]);
    await flushJobs(deps(), [
      job([
        makeEvent(siteId, { createdAt: T2, visitorHash: visitor(1) }),
        makeEvent(siteId, { createdAt: T2, visitorHash: visitor(3), type: "signup" }),
      ]),
    ]);

    expect(await minuteRows()).toEqual([{ bucket: "12:00", pageviews: 3, events: 1, visitors: 3 }]);
  });

  it("keeps sites apart", async () => {
    const other = await createSite(pool);
    await flushJobs(deps(), [
      job([makeEvent(siteId, { createdAt: T1 }), makeEvent(other, { createdAt: T1 })]),
    ]);
    expect(await countRows(pool, "StatsMinute")).toBe(2);
    expect(await minuteRows()).toHaveLength(1);
  });
});

describe("idempotency", () => {
  it("skips a job that was already stored (redelivery)", async () => {
    const delivered = job([makeEvent(siteId, { createdAt: T1 })]);
    await flushJobs(deps(), [delivered]);
    await flushJobs(deps(), [delivered]);

    expect(await countRows(pool, "Event")).toBe(1);
    expect(await minuteRows()).toEqual([{ bucket: "12:00", pageviews: 1, events: 0, visitors: 1 }]);
  });

  it("stores the new jobs of a batch that also contains a redelivered one", async () => {
    const old = job([makeEvent(siteId, { createdAt: T1 })]);
    await flushJobs(deps(), [old]);
    await flushJobs(deps(), [old, job([makeEvent(siteId, { createdAt: T2 })])]);

    expect(await countRows(pool, "Event")).toBe(2);
  });

  it("deletes only old processed job ids", async () => {
    await pool.query(
      `INSERT INTO "ProcessedJob" ("jobId", "processedAt") VALUES ('old', now() - interval '25 hours'), ('new', now())`,
    );
    expect(await deleteOldProcessedJobs(pool, 24)).toBe(1);
    const { rows } = await pool.query(`SELECT "jobId" FROM "ProcessedJob"`);
    expect(rows).toEqual([{ jobId: "new" }]);
  });
});

describe("live counters and pub/sub", () => {
  it("publishes an update with the current visitors", async () => {
    const sub = createRedis();
    try {
      await sub.subscribe(siteUpdateChannel(siteId));
      const received = new Promise<string>((resolve) => sub.once("message", (_c, m) => resolve(m)));

      await flushJobs(deps(), [
        job([
          makeEvent(siteId, { createdAt: T1, visitorHash: visitor(1) }),
          makeEvent(siteId, { createdAt: T2, visitorHash: visitor(2) }),
          makeEvent(siteId, { createdAt: T2, visitorHash: visitor(2), type: "signup" }),
        ]),
      ]);

      const message = siteUpdateMessageSchema.parse(JSON.parse(await received));
      expect(message).toMatchObject({ siteId, currentVisitors: 2, pageviews: 2, events: 1 });
    } finally {
      await sub.quit();
    }
  });

  it("does not count visitors outside the 5 minute window", async () => {
    const sub = createRedis();
    try {
      await sub.subscribe(siteUpdateChannel(siteId));
      const received = new Promise<string>((resolve) => sub.once("message", (_c, m) => resolve(m)));

      await flushJobs(deps(), [
        job([
          makeEvent(siteId, { createdAt: "2026-03-10T11:50:00Z", visitorHash: visitor(1) }),
          makeEvent(siteId, { createdAt: T2, visitorHash: visitor(2) }),
        ]),
      ]);

      expect(siteUpdateMessageSchema.parse(JSON.parse(await received)).currentVisitors).toBe(1);
    } finally {
      await sub.quit();
    }
  });

  it("does not fail the job when the live update fails", async () => {
    const live = vi.fn().mockRejectedValue(new Error("redis down"));
    await flushJobs(deps({ live }), [job([makeEvent(siteId, { createdAt: T1 })])]);

    expect(live).toHaveBeenCalledTimes(1);
    expect(await countRows(pool, "Event")).toBe(1);
  });

  it("does not publish for redelivered jobs", async () => {
    const delivered = job([makeEvent(siteId, { createdAt: T1 })]);
    const live = vi.fn().mockResolvedValue(undefined);
    await flushJobs(deps({ live }), [delivered]);
    await flushJobs(deps({ live }), [delivered]);
    expect(live).toHaveBeenCalledTimes(1);
  });
});

describe("failure isolation (createFlusher)", () => {
  it("stores the good jobs and marks only the poison job as unrecoverable", async () => {
    const good1 = job([makeEvent(siteId, { createdAt: T1 })]);
    const poison = job([makeEvent(randomUUID(), { createdAt: T1 })]); // site does not exist
    const good2 = job([makeEvent(siteId, { createdAt: T2 })]);

    const results = await createFlusher(deps())([good1, poison, good2]);

    expect(results[0]).toBeNull();
    expect(results[1]).toBeInstanceOf(UnrecoverableError);
    expect(results[2]).toBeNull();
    expect(await countRows(pool, "Event")).toBe(2);
    // The bad job was rolled back, so it is not marked as done
    const { rows } = await pool.query(`SELECT "jobId" FROM "ProcessedJob" WHERE "jobId" = $1`, [
      poison.id,
    ]);
    expect(rows).toHaveLength(0);
  });

  it("fails every job with a retryable error, without splitting, when the database is down", async () => {
    const connect = vi.fn().mockRejectedValue(new Error("connection refused"));
    const brokenPool = { connect } as unknown as pg.Pool;

    const results = await createFlusher(deps({ pool: brokenPool }))([
      job([makeEvent(siteId)]),
      job([makeEvent(siteId)]),
    ]);

    expect(results.every((r) => r instanceof Error && !(r instanceof UnrecoverableError))).toBe(
      true,
    );
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
