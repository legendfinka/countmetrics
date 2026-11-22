import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { enrichedEventSchema } from "@countmetrics/shared";
import { AppError } from "../../lib/errors.js";
import { createFakeQueue, redisUrl, waitFor, type FakeQueue } from "../../../test/helpers.js";
import {
  SIMULATOR_LIMITS,
  createSimulatorService,
  type SimulatorLimits,
} from "./simulator.service.js";

const OWNER = "owner";
const SITE = randomUUID();
const OTHER_SITE = randomUUID();

let redis: Redis;
let queue: FakeQueue;
let services: ReturnType<typeof createSimulatorService>[] = [];

beforeAll(() => {
  redis = new Redis(redisUrl);
});
afterAll(() => redis.quit());
beforeEach(async () => {
  await redis.flushdb();
  queue = createFakeQueue();
});
afterEach(async () => {
  // Stops runs that are still going, so they can't leak into the next test
  await Promise.all(services.map((service) => service.close()));
  services = [];
});

/** Short times for tests: a run lasts 200 ms and makes events every 20 ms. */
function setup(limits: Partial<SimulatorLimits> = {}, overrides: { queue?: FakeQueue; log?: () => void } = {}) {
  const service = createSimulatorService({
    // The owner owns both sites
    sites: { findOwned: async (userId) => (userId === OWNER ? {} : null) },
    redis,
    queue: overrides.queue ?? queue,
    limits: { durationMs: 200, tickMs: 20, maxEvents: 1000, cooldownMs: 100, ...limits },
    log: { error: overrides.log ?? (() => undefined) },
  });
  services.push(service);
  return service;
}

const isRunning = async (siteId: string) => (await redis.exists(`cm:sim:run:${siteId}`)) === 1;
const waitUntilFinished = (siteId: string) => waitFor(async () => !(await isRunning(siteId)));

const failure = async (promise: Promise<unknown>) => {
  const error = await promise.catch((err: unknown) => err);
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
};

describe("the events", () => {
  it("puts realistic events straight into the queue", async () => {
    const service = setup();
    await service.start(OWNER, SITE);
    await waitUntilFinished(SITE);

    const events = queue.jobs.flat();
    expect(events.length).toBeGreaterThan(20);
    for (const event of events) {
      expect(enrichedEventSchema.safeParse(event).success).toBe(true);
      expect(event.siteId).toBe(SITE);
    }
    expect(events.some((event) => event.type === "pageview")).toBe(true);
    expect(new Set(events.map((event) => event.visitorHash)).size).toBeGreaterThan(5);
  });

  it("makes jobs the worker accepts (at most 20 events each)", async () => {
    const service = setup();
    await service.start(OWNER, SITE);
    await waitUntilFinished(SITE);

    expect(queue.jobs.length).toBeGreaterThan(0);
    for (const job of queue.jobs) {
      expect(job.length).toBeGreaterThanOrEqual(1);
      expect(job.length).toBeLessThanOrEqual(20);
    }
  });

  it("never makes more events than the cap", async () => {
    const service = setup({ maxEvents: 50 });
    await service.start(OWNER, SITE);
    await waitUntilFinished(SITE);

    expect(queue.jobs.flat()).toHaveLength(50);
  });

  it("does not use the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const service = setup();
    await service.start(OWNER, SITE);
    await waitUntilFinished(SITE);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("the duration", () => {
  it("stops after the set time", async () => {
    const service = setup({ durationMs: 300, tickMs: 20 });
    const started = Date.now();
    await service.start(OWNER, SITE);
    await waitUntilFinished(SITE);

    const elapsed = Date.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(280);
    expect(elapsed).toBeLessThan(2000);
  });

  it("uses 30 seconds, 1000 events and a 30 second pause by default", () => {
    expect(SIMULATOR_LIMITS).toEqual({ durationMs: 30_000, tickMs: 1_000, maxEvents: 1_000, cooldownMs: 30_000 });
  });

  it("lets the run lock expire by itself, so a crashed process can't block the site", async () => {
    const service = setup({ durationMs: 5000 });
    await service.start(OWNER, SITE);

    const ttl = await redis.ttl(`cm:sim:run:${SITE}`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(10); // 5 seconds of run + 5 seconds of safety
  });
});

describe("status", () => {
  it("is idle at first", async () => {
    expect(await setup().status(OWNER, SITE)).toEqual({ state: "idle", secondsLeft: 0 });
  });

  it("shows running with the seconds left", async () => {
    const service = setup({ durationMs: 5000 });

    expect(await service.start(OWNER, SITE)).toEqual({ state: "running", secondsLeft: 5 });

    const status = await service.status(OWNER, SITE);
    expect(status.state).toBe("running");
    expect(status.secondsLeft).toBeGreaterThanOrEqual(4);
    expect(status.secondsLeft).toBeLessThanOrEqual(5);
  });

  it("goes from running to cooldown to idle", async () => {
    const service = setup({ durationMs: 100, cooldownMs: 300 });
    await service.start(OWNER, SITE);

    await waitFor(async () => (await service.status(OWNER, SITE)).state === "cooldown");
    expect((await service.status(OWNER, SITE)).secondsLeft).toBe(1);

    await waitFor(async () => (await service.status(OWNER, SITE)).state === "idle");
  });
});

describe("one run at a time", () => {
  it("rejects a second start while a run is going", async () => {
    const service = setup({ durationMs: 5000 });
    await service.start(OWNER, SITE);

    const error = await failure(service.start(OWNER, SITE));

    expect(error).toMatchObject({ statusCode: 409, code: "SIMULATION_RUNNING" });
    expect(error.details).toMatchObject({ secondsLeft: expect.any(Number) });
  });

  it("lets only one of two simultaneous starts win", async () => {
    const service = setup({ durationMs: 5000 });
    const results = await Promise.allSettled([service.start(OWNER, SITE), service.start(OWNER, SITE)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("lets only one of two API processes win (they share Redis)", async () => {
    const first = setup({ durationMs: 5000 });
    const second = setup({ durationMs: 5000 });
    const results = await Promise.allSettled([first.start(OWNER, SITE), second.start(OWNER, SITE)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  });

  it("keeps different sites apart", async () => {
    const service = setup({ durationMs: 5000 });
    await service.start(OWNER, SITE);
    await expect(service.start(OWNER, OTHER_SITE)).resolves.toMatchObject({ state: "running" });
  });
});

describe("the pause between runs", () => {
  it("rejects a start during the pause, and says how long to wait", async () => {
    const service = setup({ durationMs: 100, cooldownMs: 5000 });
    await service.start(OWNER, SITE);
    await waitUntilFinished(SITE);

    const error = await failure(service.start(OWNER, SITE));

    expect(error).toMatchObject({ statusCode: 429, code: "SIMULATION_COOLDOWN" });
    expect(error.details).toEqual({ secondsLeft: 5 });
    expect(error.headers).toEqual({ "retry-after": "5" });
    // The failed start must not leave a lock behind
    expect(await isRunning(SITE)).toBe(false);
  });

  it("allows the next run after the pause", async () => {
    const service = setup({ durationMs: 100, cooldownMs: 200 });
    await service.start(OWNER, SITE);
    await waitFor(async () => (await service.status(OWNER, SITE)).state === "idle");

    await expect(service.start(OWNER, SITE)).resolves.toMatchObject({ state: "running" });
  });

  it("has no moment between the run and the pause where a start is allowed", async () => {
    const service = setup({ durationMs: 100, cooldownMs: 1000 });
    await service.start(OWNER, SITE);

    // Try to start again many times while the run ends
    const attempts: unknown[] = [];
    for (let i = 0; i < 40; i++) {
      attempts.push(await service.start(OWNER, SITE).catch((err: unknown) => err));
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    expect(attempts.every((attempt) => attempt instanceof AppError)).toBe(true);
  });
});

describe("who may start it", () => {
  it("only lets the owner start and see the status", async () => {
    const service = setup();

    expect(await failure(service.start("someone-else", SITE))).toMatchObject({ statusCode: 404, code: "SITE_NOT_FOUND" });
    expect(await failure(service.status("someone-else", SITE))).toMatchObject({ statusCode: 404 });
    expect(await isRunning(SITE)).toBe(false);
    expect(queue.jobs).toHaveLength(0);
  });
});

describe("shutdown and errors", () => {
  it("stops the run when the server shuts down, and starts the pause", async () => {
    const service = setup({ durationMs: 10_000, cooldownMs: 5000 });
    await service.start(OWNER, SITE);
    await waitFor(() => queue.jobs.length > 0);

    await service.close();
    const jobsAtClose = queue.jobs.length;

    expect(await isRunning(SITE)).toBe(false);
    expect(await redis.exists(`cm:sim:cooldown:${SITE}`)).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(queue.jobs.length).toBe(jobsAtClose);
  });

  it("ends the run safely when the queue fails", async () => {
    const log = vi.fn();
    const brokenQueue: FakeQueue = {
      ...createFakeQueue(),
      enqueue: async () => {
        throw new Error("redis is down");
      },
    };
    const service = setup({ cooldownMs: 5000 }, { queue: brokenQueue, log });
    await service.start(OWNER, SITE);

    await waitUntilFinished(SITE);

    expect(log).toHaveBeenCalledWith(expect.any(Error), expect.stringContaining("stopped"));
    expect(await redis.exists(`cm:sim:cooldown:${SITE}`)).toBe(1);
  });
});
