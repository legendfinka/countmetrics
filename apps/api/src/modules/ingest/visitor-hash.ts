import { createHmac, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

// Longer than 24 h so the salt of "today" never expires early, short enough that
// yesterday's salt is gone from Redis soon after rotation. Redis deletes it for us.
const SALT_TTL_SECONDS = 36 * 60 * 60;

/**
 * Unique-visitor identifier without cookies: HMAC(dailySalt, siteKey + ip + userAgent).
 * The salt changes every UTC day and old salts are deleted, so the same person gets a
 * different hash tomorrow and cannot be tracked across days (or across sites).
 */
export function computeVisitorHash(
  salt: string,
  siteKey: string,
  ip: string,
  userAgent: string,
): string {
  return createHmac("sha256", salt).update(`${siteKey}\n${ip}\n${userAgent}`).digest("hex").slice(0, 32);
}

/** Random salt per UTC day, shared by all API instances through Redis. */
export function createSaltProvider(redis: Redis) {
  // Only the current day is kept in memory; yesterday's salt is dropped on rotation.
  let cached: { day: string; salt: string } | undefined;

  return {
    async getSalt(now: Date): Promise<string> {
      const day = now.toISOString().slice(0, 10);
      if (cached?.day === day) return cached.salt;

      const key = `cm:salt:${day}`;
      // NX: the first instance to arrive creates the salt, everyone else reads it.
      await redis.set(key, randomBytes(32).toString("hex"), "EX", SALT_TTL_SECONDS, "NX");
      const salt = await redis.get(key);
      if (!salt) throw new Error("Daily salt is unavailable");

      cached = { day, salt };
      return salt;
    },
  };
}

export type SaltProvider = ReturnType<typeof createSaltProvider>;
