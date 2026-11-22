import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_DOMAIN,
  DEMO_EMAIL,
  DEMO_SITE_ID,
  DEMO_SITE_KEY,
  DEMO_USER_ID,
  type AuthResponse,
  type Site,
} from "@countmetrics/shared";
import {
  bearer,
  createTestContext,
  registerUser,
  resetDb,
  waitFor,
  type TestContext,
} from "../../../test/helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext({}, { simulatorLimits: { durationMs: 200, tickMs: 20, cooldownMs: 200 } });
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.prisma);
  await ctx.redis.flushdb();
});

/** A small demo account. The real one is made by the seed command. */
async function createDemoAccount() {
  await ctx.prisma.user.create({
    data: { id: DEMO_USER_ID, email: DEMO_EMAIL, name: "Demo User", passwordHash: "not-a-real-hash" },
  });
  await ctx.prisma.site.create({
    data: { id: DEMO_SITE_ID, userId: DEMO_USER_ID, domain: DEMO_DOMAIN, siteKey: DEMO_SITE_KEY },
  });
}

const demoLogin = (remoteAddress = "203.0.113.10") =>
  ctx.app.inject({ method: "POST", url: "/api/auth/demo", remoteAddress });

async function loginAsDemo(): Promise<AuthResponse> {
  const res = await demoLogin();
  expect(res.statusCode).toBe(200);
  return res.json<AuthResponse>();
}

describe("Try demo", () => {
  it("logs in as the demo user without a password", async () => {
    await createDemoAccount();

    const res = await demoLogin();

    expect(res.statusCode).toBe(200);
    expect(res.json<AuthResponse>().user).toEqual({ id: DEMO_USER_ID, email: DEMO_EMAIL, name: "Demo User" });
    expect(res.json<AuthResponse>().accessToken).toEqual(expect.any(String));
    expect(res.cookies.find((cookie) => cookie.name === "refresh_token")?.httpOnly).toBe(true);
  });

  it("gives a session that works like a normal one (me, refresh)", async () => {
    await createDemoAccount();
    const res = await demoLogin();
    const { accessToken } = res.json<AuthResponse>();
    const refreshToken = res.cookies.find((cookie) => cookie.name === "refresh_token")?.value;

    const me = await ctx.app.inject({ method: "GET", url: "/api/auth/me", headers: bearer(accessToken) });
    const refresh = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/refresh",
      cookies: { refresh_token: refreshToken ?? "" },
    });

    expect(me.json().user.id).toBe(DEMO_USER_ID);
    expect(refresh.statusCode).toBe(200);
  });

  it("answers 404 with a hint when the demo was not set up", async () => {
    const res = await demoLogin();

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("DEMO_NOT_AVAILABLE");
  });

  it("allows 10 logins per minute for one IP, then answers 429", async () => {
    await createDemoAccount();

    for (let i = 0; i < 10; i++) expect((await demoLogin("203.0.113.20")).statusCode).toBe(200);
    const blocked = await demoLogin("203.0.113.20");

    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    // Another IP is not blocked
    expect((await demoLogin("203.0.113.21")).statusCode).toBe(200);
  });

  it("does not use the same counters as the event ingestion", async () => {
    await createDemoAccount();
    await demoLogin("203.0.113.30");

    expect(await ctx.redis.keys("cm:rl:ip:*")).toEqual([]);
    expect((await ctx.redis.keys("cm:rl:demo:*")).length).toBeGreaterThan(0);
  });
});

describe("the demo account is read-only", () => {
  it("can see its site and its stats", async () => {
    await createDemoAccount();
    const { accessToken } = await loginAsDemo();

    const list = await ctx.app.inject({ method: "GET", url: "/api/sites", headers: bearer(accessToken) });
    const stats = await ctx.app.inject({
      method: "GET",
      url: `/api/sites/${DEMO_SITE_ID}/stats/overview`,
      headers: bearer(accessToken),
    });

    expect(list.json<{ sites: Site[] }>().sites.map((site) => site.id)).toEqual([DEMO_SITE_ID]);
    expect(stats.statusCode).toBe(200);
  });

  it("can not add, rename or delete sites", async () => {
    await createDemoAccount();
    const { accessToken } = await loginAsDemo();
    const headers = bearer(accessToken);

    const add = await ctx.app.inject({ method: "POST", url: "/api/sites", headers, payload: { domain: "mine.com" } });
    const rename = await ctx.app.inject({
      method: "PATCH",
      url: `/api/sites/${DEMO_SITE_ID}`,
      headers,
      payload: { domain: "mine.com" },
    });
    const remove = await ctx.app.inject({ method: "DELETE", url: `/api/sites/${DEMO_SITE_ID}`, headers });

    for (const res of [add, rename, remove]) {
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("DEMO_READ_ONLY");
    }
    const site = await ctx.prisma.site.findUniqueOrThrow({ where: { id: DEMO_SITE_ID } });
    expect(site.domain).toBe(DEMO_DOMAIN);
    expect(await ctx.prisma.site.count()).toBe(1);
  });

  it("can still use Simulate traffic on the demo site", async () => {
    await createDemoAccount();
    const { accessToken } = await loginAsDemo();

    const res = await ctx.app.inject({
      method: "POST",
      url: `/api/sites/${DEMO_SITE_ID}/simulate`,
      headers: bearer(accessToken),
    });

    expect(res.statusCode).toBe(202);
    await waitFor(() => ctx.queue.jobs.length > 0);
    expect(ctx.queue.jobs.flat().every((event) => event.siteId === DEMO_SITE_ID)).toBe(true);
    await waitFor(async () => (await ctx.redis.exists(`cm:sim:run:${DEMO_SITE_ID}`)) === 0);
  });

  it("does not limit other users", async () => {
    await createDemoAccount();
    const alice = await registerUser(ctx.app);

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/sites",
      headers: bearer(alice.accessToken),
      payload: { domain: "alice.com" },
    });

    expect(res.statusCode).toBe(201);
  });
});
