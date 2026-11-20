import { createHmac, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

// Longer than 24 hours, so today's salt never expires early.
// Short enough that yesterday's salt is deleted soon after. Redis does the deleting.
const SALT_TTL_SECONDS = 36 * 60 * 60;

/**
 * Makes a visitor ID without cookies: HMAC(dailySalt, siteKey + ip + userAgent).
 * The salt changes every day (UTC) and old salts are deleted.
 * So the same person gets a new ID tomorrow. They can't be tracked across days or sites.
 */
export function computeVisitorHash(
  salt: string,
  siteKey: string,
  ip: string,
  userAgent: string,
): string {
  return createHmac("sha256", salt).update(`${siteKey}\n${ip}\n${userAgent}`).digest("hex").slice(0, 32);
}

/** One random salt per day (UTC). All API instances share it through Redis. */
export function createSaltProvider(redis: Redis) {
  // Only today's salt is kept in memory.
  let cached: { day: string; salt: string } | undefined;

  return {
    async getSalt(now: Date): Promise<string> {
      const day = now.toISOString().slice(0, 10);
      if (cached?.day === day) return cached.salt;

      const key = `cm:salt:${day}`;
      // NX: the first instance creates the salt. The others just read it.
      await redis.set(key, randomBytes(32).toString("hex"), "EX", SALT_TTL_SECONDS, "NX");
      const salt = await redis.get(key);
      if (!salt) throw new Error("Daily salt is unavailable");

      cached = { day, salt };
      return salt;
    },
  };
}

export type SaltProvider = ReturnType<typeof createSaltProvider>;
