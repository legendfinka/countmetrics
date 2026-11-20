import type { Redis } from "ioredis";
import {
  LIVE_WINDOW_MS,
  liveVisitorsKey,
  siteUpdateChannel,
  type EnrichedEvent,
  type SiteUpdateMessage,
} from "@countmetrics/shared";
import { aggregateKey, type MinuteAggregate } from "./aggregate.js";

const LIVE_KEY_TTL_SECONDS = 10 * 60;
const HLL_TTL_SECONDS = 2 * 24 * 60 * 60;

const hllKey = (siteId: string, bucket: Date): string =>
  `cm:hll:${siteId}:${bucket.toISOString().slice(0, 16)}`;

type PipelineResults = [Error | null, unknown][] | null;

function assertNoErrors(results: PipelineResults): [Error | null, unknown][] {
  if (!results) throw new Error("Redis pipeline returned no result");
  for (const [err] of results) if (err) throw err;
  return results;
}

/**
 * Adds visitor hashes to one HyperLogLog per site and minute.
 * Returns the approximate unique count for each. Adding the same hash twice changes nothing,
 * so a retry can't inflate the numbers. The result keys come from aggregateKey().
 */
export async function addToMinuteHll(
  redis: Redis,
  aggregates: MinuteAggregate[],
): Promise<Map<string, number>> {
  const pipeline = redis.pipeline();
  for (const a of aggregates) {
    const key = hllKey(a.siteId, a.bucket);
    pipeline.pfadd(key, ...a.visitorHashes);
    pipeline.expire(key, HLL_TTL_SECONDS);
    pipeline.pfcount(key);
  }
  const results = assertNoErrors(await pipeline.exec());

  const counts = new Map<string, number>();
  aggregates.forEach((a, i) => {
    counts.set(aggregateKey(a.siteId, a.bucket), Number(results[i * 3 + 2]?.[1]));
  });
  return counts;
}

interface SiteDelta {
  pageviews: number;
  events: number;
  /** visitorHash -> latest event time (ms) */
  seen: Map<string, number>;
}

/**
 * Updates the "current visitors" list of each site (visitor hash + last seen time).
 * Then sends a message on site:{id}:update for the dashboards.
 */
export async function updateLive(
  redis: Redis,
  events: EnrichedEvent[],
  nowMs: number,
): Promise<void> {
  const sites = new Map<string, SiteDelta>();
  for (const e of events) {
    let site = sites.get(e.siteId);
    if (!site) {
      site = { pageviews: 0, events: 0, seen: new Map() };
      sites.set(e.siteId, site);
    }
    if (e.type === "pageview") site.pageviews++;
    else site.events++;
    const at = Date.parse(e.createdAt);
    site.seen.set(e.visitorHash, Math.max(at, site.seen.get(e.visitorHash) ?? 0));
  }

  const entries = [...sites.entries()];
  const cutoff = nowMs - LIVE_WINDOW_MS;

  const counting = redis.pipeline();
  for (const [siteId, site] of entries) {
    const key = liveVisitorsKey(siteId);
    const scoreMembers = [...site.seen].flatMap(([hash, at]) => [at, hash]);
    counting.zadd(key, ...scoreMembers);
    counting.zremrangebyscore(key, "-inf", cutoff);
    counting.zcard(key);
    counting.expire(key, LIVE_KEY_TTL_SECONDS);
  }
  const results = assertNoErrors(await counting.exec());

  const publishing = redis.pipeline();
  entries.forEach(([siteId, site], i) => {
    const message: SiteUpdateMessage = {
      siteId,
      currentVisitors: Number(results[i * 4 + 2]?.[1]),
      pageviews: site.pageviews,
      events: site.events,
      at: new Date(nowMs).toISOString(),
    };
    publishing.publish(siteUpdateChannel(siteId), JSON.stringify(message));
  });
  assertNoErrors(await publishing.exec());
}
