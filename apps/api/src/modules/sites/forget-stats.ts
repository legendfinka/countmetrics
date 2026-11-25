import type { Redis } from "ioredis";
import { liveVisitorsKey } from "@countmetrics/shared";

/** Removes a site's live visitors, cached stats and visitor counters from Redis. */
export function createForgetStats(redis: Redis) {
  return async (siteId: string): Promise<void> => {
    const keys = [liveVisitorsKey(siteId)];
    // SCAN reads the keys in small steps, so it doesn't block Redis
    for (const match of [`cm:stats:${siteId}:*`, `cm:hll:${siteId}:*`]) {
      for await (const found of redis.scanStream({ match, count: 500 })) {
        keys.push(...(found as string[]));
      }
    }
    await redis.del(...keys);
  };
}
