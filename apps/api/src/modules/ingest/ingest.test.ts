import type { Site } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  TEST_IP,
  createSiteFixture,
  createTestContext,
  resetDb,
  type TestContext,
} from "../../../test/helpers.js";

const UA_CHROME =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let ctx: TestContext;
let site: Site;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.prisma);
  await ctx.redis.flushdb();
  ctx.queue.jobs.length = 0;
  site = await createSiteFixture(ctx.prisma);
});

interface PostOptions {
  ip?: string;
  userAgent?: string;
  headers?: Record<string, string>;
}

function post(payload: string | object, opts: PostOptions = {}, app = ctx.app) {
  return app.inject({
    method: "POST",
    url: "/api/event",
    remoteAddress: opts.ip ?? TEST_IP,
    headers: { "user-agent": opts.userAgent ?? UA_CHROME, ...opts.headers },
    payload,
  });
}

const pageview = (extra: object = {}) => ({
  siteKey: site.siteKey,
  type: "pageview",
  path: "/pricing",
  ...extra,
});

describe("accepting events", () => {
  it("responds 202 and enqueues one enriched event", async () => {
    const res = await post(pageview({ referrer: "https://www.Google.com/search?q=secret" }));

    expect(res.statusCode).toBe(202);
    expect(res.body).toBe("");
    expect(ctx.queue.jobs).toHaveLength(1);
    expect(ctx.queue.jobs[0]).toEqual([
      {
        siteId: site.id,
        type: "pageview",
        path: "/pricing",
        referrer: "google.com",
        country: "DE",
        device: "desktop",
        browser: "Chrome",
        visitorHash: expect.stringMatching(/^[0-9a-f]{32}$/),
        createdAt: expect.any(String),
      },
    ]);
  });

  it("never writes to Postgres in the request", async () => {
    await post(pageview());
    expect(await ctx.prisma.event.count()).toBe(0);
  });

  it("accepts a batch as one job", async () => {
    const res = await post({
      siteKey: site.siteKey,
      events: [
        { type: "pageview", path: "/" },
        { type: "signup", path: "/register" },
      ],
    });

    expect(res.statusCode).toBe(202);
    expect(ctx.queue.jobs).toHaveLength(1);
    expect(ctx.queue.jobs[0]?.map((e) => e.type)).toEqual(["pageview", "signup"]);
  });

  it("accepts the text/plain body that navigator.sendBeacon sends", async () => {
    const res = await post(JSON.stringify(pageview()), {
      headers: { "content-type": "text/plain;charset=UTF-8" },
    });
    expect(res.statusCode).toBe(202);
    expect(ctx.queue.jobs).toHaveLength(1);
  });

  it("detects mobile devices and browsers from the user agent", async () => {
    await post(pageview(), { userAgent: UA_IPHONE });
    expect(ctx.queue.jobs[0]?.[0]).toMatchObject({ device: "mobile", browser: "Safari" });
  });

  it("strips query string and hash from the path", async () => {
    await post(pageview({ path: "/search?email=a@b.com#top" }));
    expect(ctx.queue.jobs[0]?.[0]?.path).toBe("/search");
  });

  it("stores null for a missing or invalid referrer", async () => {
    await post(pageview());
    await post(pageview({ referrer: "not a url" }));
    expect(ctx.queue.jobs.map((j) => j[0]?.referrer)).toEqual([null, null]);
  });

  it("stores null country when the IP is unknown", async () => {
    await post(pageview(), { ip: "198.51.100.7" });
    expect(ctx.queue.jobs[0]?.[0]?.country).toBeNull();
  });
});

describe("privacy", () => {
  it("never puts the raw IP into the queue", async () => {
    await post(pageview());
    expect(JSON.stringify(ctx.queue.jobs)).not.toContain(TEST_IP);
  });

  it("gives the same visitor the same hash, and others a different one", async () => {
    await post(pageview());
    await post(pageview());
    await post(pageview(), { userAgent: UA_IPHONE });
    await post(pageview(), { ip: "198.51.100.7" });

    const [same1, same2, otherUa, otherIp] = ctx.queue.jobs.map((j) => j[0]?.visitorHash);
    expect(same1).toBe(same2);
    expect(otherUa).not.toBe(same1);
    expect(otherIp).not.toBe(same1);
  });

  it("gives the same visitor a different hash on different sites", async () => {
    const other = await createSiteFixture(ctx.prisma, "cm_testkey00002");
    await post(pageview());
    await post(pageview({ siteKey: other.siteKey }));
    expect(ctx.queue.jobs[0]?.[0]?.visitorHash).not.toBe(ctx.queue.jobs[1]?.[0]?.visitorHash);
  });
});

describe("validation", () => {
  it("rejects an unknown site key with 404 and enqueues nothing", async () => {
    const res = await post(pageview({ siteKey: "cm_doesnotexist" }));
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("UNKNOWN_SITE_KEY");
    expect(ctx.queue.jobs).toHaveLength(0);
  });

  it.each<[string, () => object]>([
    ["empty object", () => ({})],
    ["malformed site key", () => pageview({ siteKey: "nope" })],
    ["missing path", () => ({ siteKey: site.siteKey, type: "pageview" })],
    ["empty type", () => pageview({ type: "" })],
    ["type with illegal characters", () => pageview({ type: "<script>" })],
    ["empty batch", () => ({ siteKey: site.siteKey, events: [] })],
    [
      "batch over the limit",
      () => ({
        siteKey: site.siteKey,
        events: Array.from({ length: 21 }, () => ({ type: "pageview", path: "/" })),
      }),
    ],
  ])("rejects %s with 400", async (_name, make) => {
    const res = await post(make());
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect(ctx.queue.jobs).toHaveLength(0);
  });

  it("rejects invalid JSON in a text/plain body", async () => {
    const res = await post("{oops", { headers: { "content-type": "text/plain" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("INVALID_JSON");
  });

  it("rejects bodies over 16 KB", async () => {
    const res = await post(pageview({ path: `/${"a".repeat(20_000)}` }));
    expect(res.statusCode).toBe(413);
    expect(ctx.queue.jobs).toHaveLength(0);
  });
});

describe("rate limiting", () => {
  it("returns 429 with Retry-After after too many requests from one IP", async () => {
    const limited = await createTestContext({ RATE_LIMIT_IP_PER_MIN: 3 });
    try {
      for (let i = 0; i < 3; i++) {
        expect((await post(pageview(), {}, limited.app)).statusCode).toBe(202);
      }
      const res = await post(pageview(), {}, limited.app);
      expect(res.statusCode).toBe(429);
      expect(res.json().error.code).toBe("RATE_LIMITED");
      expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
      // Another IP is not blocked
      expect((await post(pageview(), { ip: "198.51.100.7" }, limited.app)).statusCode).toBe(202);
    } finally {
      await limited.close();
    }
  });

  it("limits per siteKey across different IPs, without affecting other sites", async () => {
    const other = await createSiteFixture(ctx.prisma, "cm_testkey00002");
    const limited = await createTestContext({ RATE_LIMIT_SITE_PER_MIN: 2 });
    try {
      expect((await post(pageview(), { ip: "198.51.100.1" }, limited.app)).statusCode).toBe(202);
      expect((await post(pageview(), { ip: "198.51.100.2" }, limited.app)).statusCode).toBe(202);
      expect((await post(pageview(), { ip: "198.51.100.3" }, limited.app)).statusCode).toBe(429);

      const res = await post(pageview({ siteKey: other.siteKey }), { ip: "198.51.100.3" }, limited.app);
      expect(res.statusCode).toBe(202);
    } finally {
      await limited.close();
    }
  });
});

describe("CORS", () => {
  it("allows any origin on the ingestion endpoint, including preflight", async () => {
    const preflight = await ctx.app.inject({
      method: "OPTIONS",
      url: "/api/event",
      headers: {
        origin: "https://customer.example",
        "access-control-request-method": "POST",
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("*");

    const res = await post(pageview(), { headers: { origin: "https://customer.example" } });
    expect(res.headers["access-control-allow-origin"]).toBe("*");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
  });

  it("keeps other routes limited to the dashboard origin", async () => {
    const res = await ctx.app.inject({
      method: "OPTIONS",
      url: "/api/sites",
      headers: {
        origin: "https://customer.example",
        "access-control-request-method": "GET",
      },
    });
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });
});
