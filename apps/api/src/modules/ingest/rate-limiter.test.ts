import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { redisUrl } from "../../../test/helpers.js";
import { createRateLimiter } from "./rate-limiter.js";

let redis: Redis;
let clock = Date.UTC(2026, 2, 10, 12, 0, 10); // 12:00:10

beforeAll(() => {
  redis = new Redis(redisUrl);
});
afterAll(() => redis.quit());
beforeEach(async () => {
  await redis.flushdb();
  clock = Date.UTC(2026, 2, 10, 12, 0, 10);
});

const limiter = (ipPerMin: number, sitePerMin: number) =>
  createRateLimiter(redis, { ipPerMin, sitePerMin }, () => clock);

describe("rate limiter", () => {
  it("allows up to the IP limit, then blocks", async () => {
    const rl = limiter(2, 100);
    expect((await rl.check("1.1.1.1", "cm_a")).allowed).toBe(true);
    expect((await rl.check("1.1.1.1", "cm_a")).allowed).toBe(true);
    expect((await rl.check("1.1.1.1", "cm_a")).allowed).toBe(false);
    expect((await rl.check("2.2.2.2", "cm_a")).allowed).toBe(true);
  });

  it("blocks per siteKey regardless of the IP", async () => {
    const rl = limiter(100, 2);
    expect((await rl.check("1.1.1.1", "cm_a")).allowed).toBe(true);
    expect((await rl.check("2.2.2.2", "cm_a")).allowed).toBe(true);
    expect((await rl.check("3.3.3.3", "cm_a")).allowed).toBe(false);
    expect((await rl.check("3.3.3.3", "cm_b")).allowed).toBe(true);
  });

  it("reports how long until the window resets", async () => {
    const rl = limiter(1, 100);
    await rl.check("1.1.1.1", "cm_a");
    const blocked = await rl.check("1.1.1.1", "cm_a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(50); // 12:00:10 -> next minute
  });

  it("starts a fresh window every minute", async () => {
    const rl = limiter(1, 100);
    await rl.check("1.1.1.1", "cm_a");
    expect((await rl.check("1.1.1.1", "cm_a")).allowed).toBe(false);

    clock += 60_000;
    expect((await rl.check("1.1.1.1", "cm_a")).allowed).toBe(true);
  });
});
