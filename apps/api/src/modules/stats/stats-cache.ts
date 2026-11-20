import type { Redis } from "ioredis";

/** Keeps results in Redis for a few seconds, so repeated dashboard requests are cheap. */
export function createStatsCache(redis: Redis) {
  return {
    async wrap<T>(key: string, ttlSeconds: number, load: () => Promise<T>): Promise<T> {
      try {
        const hit = await redis.get(key);
        // We saved this JSON ourselves, so we trust its shape
        if (hit) return JSON.parse(hit) as T;
      } catch {
        // If Redis fails, just load the data without the cache
      }

      const value = await load();
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds).catch(() => undefined);
      return value;
    },
  };
}

export type StatsCache = ReturnType<typeof createStatsCache>;
