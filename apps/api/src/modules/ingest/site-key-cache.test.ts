import { describe, expect, it, vi } from "vitest";
import { createSiteKeyCache } from "./site-key-cache.js";

function setup(options: Parameters<typeof createSiteKeyCache>[1] = {}) {
  let time = 0;
  const lookup = vi.fn(async (key: string) => (key === "cm_valid" ? "site-1" : null));
  const cache = createSiteKeyCache(lookup, { ...options, now: () => time });
  return { cache, lookup, advance: (ms: number) => (time += ms) };
}

describe("site key cache", () => {
  it("queries the database once for repeated valid keys", async () => {
    const { cache, lookup } = setup();
    expect(await cache.resolve("cm_valid")).toBe("site-1");
    expect(await cache.resolve("cm_valid")).toBe("site-1");
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("caches unknown keys too, so random keys cannot hammer the database", async () => {
    const { cache, lookup } = setup();
    expect(await cache.resolve("cm_unknown")).toBeNull();
    expect(await cache.resolve("cm_unknown")).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("looks again after the TTL expires", async () => {
    const { cache, lookup, advance } = setup({ ttlMs: 1000, negativeTtlMs: 500 });
    await cache.resolve("cm_valid");
    await cache.resolve("cm_unknown");

    advance(501);
    await cache.resolve("cm_valid");
    await cache.resolve("cm_unknown");
    expect(lookup).toHaveBeenCalledTimes(3); // valid is still cached, unknown expired

    advance(1000);
    await cache.resolve("cm_valid");
    expect(lookup).toHaveBeenCalledTimes(4);
  });

  it("shares one query between concurrent lookups of the same key", async () => {
    const { cache, lookup } = setup();
    const results = await Promise.all(Array.from({ length: 10 }, () => cache.resolve("cm_valid")));
    expect(results.every((r) => r === "site-1")).toBe(true);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it("evicts the oldest entry when full", async () => {
    const { cache, lookup } = setup({ maxEntries: 2 });
    await cache.resolve("cm_a");
    await cache.resolve("cm_b");
    await cache.resolve("cm_c"); // evicts cm_a
    expect(lookup).toHaveBeenCalledTimes(3);

    await cache.resolve("cm_b"); // still cached
    expect(lookup).toHaveBeenCalledTimes(3);
    await cache.resolve("cm_a"); // evicted: looked up again
    expect(lookup).toHaveBeenCalledTimes(4);
  });
});
