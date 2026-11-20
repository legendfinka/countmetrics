import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBatcher } from "./batcher.js";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(options: { maxWeight?: number; flushIntervalMs?: number } = {}) {
  const batches: number[][] = [];
  const flush = vi.fn(async (items: number[]) => {
    batches.push(items);
    return items.map(() => null);
  });
  const batcher = createBatcher<number>({
    maxWeight: options.maxWeight ?? 5,
    flushIntervalMs: options.flushIntervalMs ?? 1000,
    weigh: () => 1,
    flush,
  });
  return { batcher, batches, flush };
}

describe("batcher", () => {
  it("flushes immediately once the batch size is reached", async () => {
    const { batcher, batches } = setup({ maxWeight: 3 });
    await Promise.all([batcher.add(1), batcher.add(2), batcher.add(3)]);
    expect(batches).toEqual([[1, 2, 3]]);
  });

  it("flushes a small batch only after the interval", async () => {
    const { batcher, flush } = setup({ flushIntervalMs: 1000 });
    const done = batcher.add(1);

    await vi.advanceTimersByTimeAsync(999);
    expect(flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(flush).toHaveBeenCalledTimes(1);
  });

  it("counts weight, not items", async () => {
    const batches: string[][] = [];
    const batcher = createBatcher<string>({
      maxWeight: 10,
      flushIntervalMs: 1000,
      weigh: (s) => s.length,
      flush: async (items) => {
        batches.push(items);
        return items.map(() => null);
      },
    });
    await Promise.all([batcher.add("aaaaaa"), batcher.add("bbbbbb")]); // 6 + 6 >= 10
    expect(batches).toEqual([["aaaaaa", "bbbbbb"]]);
  });

  it("flushNow writes the buffer without waiting for the timer", async () => {
    const { batcher, batches } = setup();
    const done = batcher.add(1);
    await batcher.flushNow();
    await done;
    expect(batches).toEqual([[1]]);
  });

  it("does nothing on flushNow with an empty buffer", async () => {
    const { batcher, flush } = setup();
    await batcher.flushNow();
    expect(flush).not.toHaveBeenCalled();
  });

  it("rejects every item when the flush throws", async () => {
    const batcher = createBatcher<number>({
      maxWeight: 2,
      flushIntervalMs: 1000,
      weigh: () => 1,
      flush: async () => {
        throw new Error("db down");
      },
    });
    const results = await Promise.allSettled([batcher.add(1), batcher.add(2)]);
    expect(results.map((r) => r.status)).toEqual(["rejected", "rejected"]);
  });

  it("rejects only the items the flush reports as failed", async () => {
    const batcher = createBatcher<number>({
      maxWeight: 3,
      flushIntervalMs: 1000,
      weigh: () => 1,
      flush: async (items) => items.map((n) => (n === 2 ? new Error("bad item") : null)),
    });
    const results = await Promise.allSettled([batcher.add(1), batcher.add(2), batcher.add(3)]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
  });

  it("writes one batch at a time", async () => {
    let running = 0;
    let maxRunning = 0;
    const batcher = createBatcher<number>({
      maxWeight: 1,
      flushIntervalMs: 1000,
      weigh: () => 1,
      flush: async (items) => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 100));
        running--;
        return items.map(() => null);
      },
    });

    const all = Promise.all([batcher.add(1), batcher.add(2), batcher.add(3)]);
    await vi.advanceTimersByTimeAsync(500);
    await all;
    expect(maxRunning).toBe(1);
  });
});
