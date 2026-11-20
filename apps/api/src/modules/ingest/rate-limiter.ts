import type { Redis } from "ioredis";

const WINDOW_MS = 60_000;

export interface RateLimits {
  ipPerMin: number;
  sitePerMin: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * Counts requests per minute in Redis, per IP and per siteKey.
 * Both counters are updated together, so it is one Redis call per request.
 */
export function createRateLimiter(redis: Redis, limits: RateLimits, now: () => number = Date.now) {
  return {
    async check(ip: string, siteKey: string): Promise<RateLimitResult> {
      const t = now();
      const window = Math.floor(t / WINDOW_MS);
      const ipKey = `cm:rl:ip:${ip}:${window}`;
      const siteKeyKey = `cm:rl:site:${siteKey}:${window}`;

      const results = await redis
        .pipeline()
        .incr(ipKey)
        .expire(ipKey, 120)
        .incr(siteKeyKey)
        .expire(siteKeyKey, 120)
        .exec();

      const failed = results?.find(([err]) => err);
      if (!results || failed) throw failed?.[0] ?? new Error("Rate limit pipeline failed");

      const ipCount = Number(results[0]?.[1]);
      const siteCount = Number(results[2]?.[1]);
      return {
        allowed: ipCount <= limits.ipPerMin && siteCount <= limits.sitePerMin,
        retryAfterSeconds: Math.max(1, Math.ceil(((window + 1) * WINDOW_MS - t) / 1000)),
      };
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
