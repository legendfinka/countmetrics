import { UnrecoverableError } from "bullmq";
import type { Redis } from "ioredis";
import type { Pool } from "pg";
import type { EnrichedEvent } from "@countmetrics/shared";
import { aggregateByMinute, aggregateKey } from "./aggregate.js";
import { addToMinuteHll, updateLive } from "./live.js";
import { claimJobs, insertEvents, upsertMinuteStats, withTransaction } from "./repository.js";

export interface PendingJob {
  /** BullMQ job id (a UUID made by the API) */
  id: string;
  events: EnrichedEvent[];
}

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export interface FlushDeps {
  pool: Pool;
  redis: Redis;
  log: Logger;
  now?: () => number;
  /** Tests can replace this */
  live?: typeof updateLive;
}

/**
 * Saves a batch of jobs in 3 steps:
 *  1. HyperLogLog. Safe to repeat on retry.
 *  2. One Postgres transaction: mark jobs as done, insert events, update minute stats.
 *     Jobs that were already done (sent again after a crash) are skipped.
 *  3. Live counters and pub/sub. If this fails, we only log it. The data is already saved.
 */
export async function flushJobs(deps: FlushDeps, jobs: PendingJob[]): Promise<void> {
  const now = deps.now ?? Date.now;
  const hllCounts = await addToMinuteHll(
    deps.redis,
    aggregateByMinute(jobs.flatMap((j) => j.events)),
  );

  const stored = await withTransaction(deps.pool, async (client) => {
    const fresh = await claimJobs(
      client,
      jobs.map((j) => j.id),
    );
    const events = jobs.filter((j) => fresh.has(j.id)).flatMap((j) => j.events);
    if (events.length === 0) return events;

    await insertEvents(client, events);
    await upsertMinuteStats(
      client,
      aggregateByMinute(events).map((a) => ({
        siteId: a.siteId,
        bucket: a.bucket,
        pageviews: a.pageviews,
        events: a.events,
        visitors: hllCounts.get(aggregateKey(a.siteId, a.bucket)) ?? a.visitorHashes.size,
      })),
    );
    return events;
  });

  if (stored.length === 0) return;
  try {
    await (deps.live ?? updateLive)(deps.redis, stored, now());
  } catch (err) {
    deps.log.warn("live update failed (events are stored)", err);
  }
}

/** Postgres error codes 22 (bad data) and 23 (broken rule, like a deleted site). */
function isDataError(err: unknown): boolean {
  const code = typeof err === "object" && err !== null && "code" in err ? err.code : undefined;
  return typeof code === "string" && /^2[23]/.test(code);
}

const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

/**
 * The save function for the batcher. It handles bad jobs safely:
 *  - success: all jobs are done
 *  - server problem (DB or Redis down): all jobs fail. BullMQ tries them again later.
 *  - bad data: try each job alone, so one bad job can't block the others.
 *    A job that still fails goes straight to the failed list. It is not retried.
 */
export function createFlusher(deps: FlushDeps) {
  return async (jobs: PendingJob[]): Promise<(Error | null)[]> => {
    try {
      await flushJobs(deps, jobs);
      return jobs.map(() => null);
    } catch (err) {
      if (!isDataError(err)) return jobs.map(() => asError(err));

      deps.log.warn(
        `batch of ${jobs.length} jobs failed with a data error, retrying one by one`,
        err,
      );
      const results: (Error | null)[] = [];
      for (const job of jobs) {
        try {
          await flushJobs(deps, [job]);
          results.push(null);
        } catch (jobErr) {
          results.push(
            isDataError(jobErr)
              ? new UnrecoverableError(`Invalid data in job ${job.id}: ${asError(jobErr).message}`)
              : asError(jobErr),
          );
        }
      }
      return results;
    }
  };
}
