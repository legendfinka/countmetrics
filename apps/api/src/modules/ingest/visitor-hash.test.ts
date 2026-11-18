import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { redisUrl } from "../../../test/helpers.js";
import { computeVisitorHash, createSaltProvider } from "./visitor-hash.js";

describe("computeVisitorHash", () => {
  const base = ["salt", "cm_abc", "203.0.113.5", "Mozilla/5.0"] as const;

  it("is deterministic and 32 hex characters", () => {
    const hash = computeVisitorHash(...base);
    expect(hash).toBe(computeVisitorHash(...base));
    expect(hash).toMatch(/^[0-9a-f]{32}$/);
  });

  it("changes when any input changes", () => {
    const hash = computeVisitorHash(...base);
    expect(computeVisitorHash("other-salt", base[1], base[2], base[3])).not.toBe(hash);
    expect(computeVisitorHash(base[0], "cm_other", base[2], base[3])).not.toBe(hash);
    expect(computeVisitorHash(base[0], base[1], "203.0.113.6", base[3])).not.toBe(hash);
    expect(computeVisitorHash(base[0], base[1], base[2], "Other UA")).not.toBe(hash);
  });

  it("does not contain the IP", () => {
    expect(computeVisitorHash(...base)).not.toContain("203.0.113.5");
  });
});

describe("daily salt", () => {
  let redis: Redis;
  const day1 = new Date("2026-03-10T10:00:00Z");
  const sameDay = new Date("2026-03-10T23:59:59Z");
  const day2 = new Date("2026-03-11T00:00:01Z");

  beforeAll(() => {
    redis = new Redis(redisUrl);
  });
  afterAll(() => redis.quit());
  beforeEach(() => redis.flushdb());

  it("is stable during a day and shared between API instances", async () => {
    const a = createSaltProvider(redis);
    const b = createSaltProvider(redis);
    const salt = await a.getSalt(day1);
    expect(await a.getSalt(sameDay)).toBe(salt);
    expect(await b.getSalt(sameDay)).toBe(salt);
  });

  it("rotates every UTC day, so the same visitor gets a different hash", async () => {
    const provider = createSaltProvider(redis);
    const salt1 = await provider.getSalt(day1);
    const salt2 = await provider.getSalt(day2);
    expect(salt2).not.toBe(salt1);

    const args = ["cm_abc", "203.0.113.5", "Mozilla/5.0"] as const;
    expect(computeVisitorHash(salt1, ...args)).not.toBe(computeVisitorHash(salt2, ...args));
  });

  it("expires in Redis so old salts are deleted", async () => {
    await createSaltProvider(redis).getSalt(day1);
    const ttl = await redis.ttl("cm:salt:2026-03-10");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(36 * 60 * 60);
  });

  it("creates the salt only once when instances race", async () => {
    const salts = await Promise.all(
      Array.from({ length: 5 }, () => createSaltProvider(redis).getSalt(day1)),
    );
    expect(new Set(salts).size).toBe(1);
  });
});
