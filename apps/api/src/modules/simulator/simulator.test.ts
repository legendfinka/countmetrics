import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Site } from "@countmetrics/shared";
import {
  bearer,
  createTestContext,
  registerUser,
  resetDb,
  waitFor,
  type RegisteredUser,
  type TestContext,
} from "../../../test/helpers.js";

let ctx: TestContext;
let alice: RegisteredUser;
let siteId: string;

beforeAll(async () => {
  // A run lasts 400 ms and the pause after it 400 ms
  ctx = await createTestContext(
    {},
    { simulatorLimits: { durationMs: 400, tickMs: 40, maxEvents: 1000, cooldownMs: 400 } },
  );
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.prisma);
  await ctx.redis.flushdb();
  ctx.queue.jobs.length = 0;

  alice = await registerUser(ctx.app);
  const created = await ctx.app.inject({
    method: "POST",
    url: "/api/sites",
    headers: bearer(alice.accessToken),
    payload: { domain: "example.com" },
  });
  siteId = created.json<{ site: Site }>().site.id;
});

const post = (token = alice.accessToken, id = siteId, payload?: object) =>
  ctx.app.inject({ method: "POST", url: `/api/sites/${id}/simulate`, headers: bearer(token), payload });
const get = (token = alice.accessToken, id = siteId) =>
  ctx.app.inject({ method: "GET", url: `/api/sites/${id}/simulate`, headers: bearer(token) });

const waitUntilIdle = () => waitFor(async () => (await get()).json().state === "idle");

describe("access", () => {
  it("needs a login", async () => {
    const start = await ctx.app.inject({ method: "POST", url: `/api/sites/${siteId}/simulate` });
    const status = await ctx.app.inject({ method: "GET", url: `/api/sites/${siteId}/simulate` });
    expect(start.statusCode).toBe(401);
    expect(status.statusCode).toBe(401);
  });

  it("returns 404 for the site of another user, and sends nothing", async () => {
    const bob = await registerUser(ctx.app, "bob@example.com");

    expect((await post(bob.accessToken)).statusCode).toBe(404);
    expect((await get(bob.accessToken)).statusCode).toBe(404);
    expect(ctx.queue.jobs).toHaveLength(0);
  });

  it("returns 400 for a site id that is not valid", async () => {
    expect((await post(alice.accessToken, "not-a-uuid")).statusCode).toBe(400);
  });
});

describe("starting", () => {
  it("answers 202 and fills the queue with events of the site", async () => {
    const res = await post();

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ state: "running", secondsLeft: 1 });

    await waitFor(() => ctx.queue.jobs.length > 0);
    expect(ctx.queue.jobs.flat().every((event) => event.siteId === siteId)).toBe(true);
    await waitUntilIdle();
  });

  it("answers 409 while it is running", async () => {
    await post();
    const res = await post();

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatchObject({ code: "SIMULATION_RUNNING", details: { secondsLeft: 1 } });
    await waitUntilIdle();
  });

  it("answers 429 with Retry-After during the pause, then allows a new run", async () => {
    await post();
    await waitFor(async () => (await get()).json().state === "cooldown");

    const res = await post();
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe("SIMULATION_COOLDOWN");
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);

    await waitUntilIdle();
    expect((await post()).statusCode).toBe(202);
    await waitUntilIdle();
  });

  it("ignores everything in the request body (no target, no size)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await post(alice.accessToken, siteId, {
      url: "http://evil.example/collect",
      siteId: "00000000-0000-4000-8000-000000000000",
      durationSeconds: 9999,
      events: 1_000_000,
    });

    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ state: "running", secondsLeft: 1 });
    await waitFor(() => ctx.queue.jobs.length > 0);
    expect(ctx.queue.jobs.flat().every((event) => event.siteId === siteId)).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    await waitUntilIdle();
  });
});

describe("status", () => {
  it("goes idle, running, cooldown, idle", async () => {
    expect((await get()).json()).toEqual({ state: "idle", secondsLeft: 0 });

    await post();
    expect((await get()).json().state).toBe("running");

    await waitFor(async () => (await get()).json().state === "cooldown");
    await waitUntilIdle();
  });
});
