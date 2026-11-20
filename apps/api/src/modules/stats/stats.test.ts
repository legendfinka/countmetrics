import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  liveVisitorsKey,
  type BreakdownResponse,
  type BreakdownRow,
  type Site,
  type StatsOverview,
  type TimeseriesResponse,
} from "@countmetrics/shared";
import {
  bearer,
  createSiteFixture,
  createTestContext,
  registerUser,
  resetDb,
  type RegisteredUser,
  type TestContext,
} from "../../../test/helpers.js";

// The "current time" of all tests
const NOW = new Date("2026-03-10T12:00:30.000Z");

let ctx: TestContext;
let alice: RegisteredUser;
let siteId: string;

beforeAll(async () => {
  ctx = await createTestContext({}, { now: () => NOW });
});
afterAll(() => ctx.close());

interface EventFields {
  type: string;
  path: string;
  referrer: string | null;
  country: string | null;
  device: string;
  browser: string;
}

/** A desktop Chrome pageview. Each test event only sets what is different. */
const event = (overrides: Partial<EventFields>): EventFields => ({
  type: "pageview",
  path: "/",
  referrer: null,
  country: null,
  device: "desktop",
  browser: "Chrome",
  ...overrides,
});

beforeEach(async () => {
  await resetDb(ctx.prisma);
  await ctx.redis.flushdb();

  alice = await registerUser(ctx.app);
  const created = await ctx.app.inject({
    method: "POST",
    url: "/api/sites",
    headers: bearer(alice.accessToken),
    payload: { domain: "example.com" },
  });
  siteId = created.json<{ site: Site }>().site.id;

  // Another user's site. Its data must never show up in Alice's numbers.
  const noise = await createSiteFixture(ctx.prisma);

  await ctx.prisma.event.createMany({
    data: [
      {
        ...event({ path: "/pricing", referrer: "google.com", country: "DE" }),
        siteId,
        visitorHash: "v1",
        createdAt: new Date("2026-03-10T11:59:10Z"),
      },
      {
        ...event({ path: "/pricing", referrer: "google.com", country: "DE" }),
        siteId,
        visitorHash: "v1",
        createdAt: new Date("2026-03-10T11:58:00Z"),
      },
      {
        ...event({ path: "/blog", country: "US", device: "mobile", browser: "Safari" }),
        siteId,
        visitorHash: "v2",
        createdAt: new Date("2026-03-10T11:50:00Z"),
      },
      {
        ...event({ path: "/pricing", device: "mobile", browser: "Safari" }),
        siteId,
        visitorHash: "v3",
        createdAt: new Date("2026-03-10T09:00:00Z"),
      },
      {
        ...event({ type: "signup", path: "/register", country: "DE" }),
        siteId,
        visitorHash: "v1",
        createdAt: new Date("2026-03-10T11:59:20Z"),
      },
      {
        ...event({ path: "/old", country: "DE" }),
        siteId,
        visitorHash: "v4",
        createdAt: new Date("2026-03-05T12:00:00Z"),
      },
      {
        ...event({ path: "/noise" }),
        siteId: noise.id,
        visitorHash: "v9",
        createdAt: new Date("2026-03-10T11:59:00Z"),
      },
    ],
  });
  await ctx.prisma.statsMinute.createMany({
    data: [
      { siteId, bucket: new Date("2026-03-10T11:59:00Z"), pageviews: 1, events: 1, visitors: 1 },
      { siteId, bucket: new Date("2026-03-10T11:58:00Z"), pageviews: 1, events: 0, visitors: 1 },
      { siteId, bucket: new Date("2026-03-10T11:50:00Z"), pageviews: 1, events: 0, visitors: 1 },
      { siteId, bucket: new Date("2026-03-10T09:00:00Z"), pageviews: 1, events: 0, visitors: 1 },
      { siteId, bucket: new Date("2026-03-05T12:00:00Z"), pageviews: 1, events: 0, visitors: 1 },
      {
        siteId: noise.id,
        bucket: new Date("2026-03-10T11:59:00Z"),
        pageviews: 5,
        events: 0,
        visitors: 1,
      },
    ],
  });
});

const get = (path: string, token = alice.accessToken) =>
  ctx.app.inject({
    method: "GET",
    url: `/api/sites/${siteId}/stats/${path}`,
    headers: bearer(token),
  });

/** { DE: 2, US: 1 } instead of an ordered list, for lists where ties have no fixed order. */
const countsByName = (rows: BreakdownRow[]) =>
  Object.fromEntries(rows.map((r) => [r.name, r.count]));

describe("access", () => {
  it("needs a login", async () => {
    const res = await ctx.app.inject({ method: "GET", url: `/api/sites/${siteId}/stats/overview` });
    expect(res.statusCode).toBe(401);
  });

  it("returns 404 for a site of another user", async () => {
    const bob = await registerUser(ctx.app, "bob@example.com");
    for (const path of ["overview", "timeseries", "pages", "events"]) {
      const res = await get(path, bob.accessToken);
      expect(res.statusCode, path).toBe(404);
      expect(res.json().error.code).toBe("SITE_NOT_FOUND");
    }
  });

  it.each(["overview?range=1y", "pages?limit=0", "pages?limit=51", "pages?limit=abc"])(
    "rejects bad input: %s",
    async (path) => {
      const res = await get(path);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    },
  );
});

describe("overview", () => {
  it("uses 24h by default and ignores other sites", async () => {
    const res = await get("overview");
    expect(res.statusCode).toBe(200);
    expect(res.json<StatsOverview>()).toEqual({
      range: "24h",
      pageviews: 4,
      events: 1,
      visitors: 3,
      currentVisitors: 0,
    });
  });

  it.each([
    ["30m", { pageviews: 3, events: 1, visitors: 2 }],
    ["24h", { pageviews: 4, events: 1, visitors: 3 }],
    ["7d", { pageviews: 5, events: 1, visitors: 4 }],
    ["30d", { pageviews: 5, events: 1, visitors: 4 }],
  ])("only counts the last %s", async (range, expected) => {
    const res = await get(`overview?range=${range}`);
    expect(res.json<StatsOverview>()).toMatchObject({ range, ...expected });
  });

  it("shows the visitors of the last 5 minutes, live (not cached)", async () => {
    const live = liveVisitorsKey(siteId);
    const ago = (minutes: number) => NOW.getTime() - minutes * 60_000;
    await ctx.redis.zadd(live, ago(1), "a", ago(2), "b", ago(10), "too-old");

    const first = (await get("overview")).json<StatsOverview>();
    expect(first.currentVisitors).toBe(2);

    await ctx.redis.zadd(live, ago(0), "c");
    const second = (await get("overview")).json<StatsOverview>();
    expect(second.currentVisitors).toBe(3);
    expect(second.pageviews).toBe(first.pageviews);
  });
});

describe("timeseries", () => {
  it("has one point per minute for 30m, with zeros for empty minutes", async () => {
    const { points } = (await get("timeseries?range=30m")).json<TimeseriesResponse>();

    expect(points).toHaveLength(31);
    expect(points[0]?.time).toBe("2026-03-10T11:30:00Z");
    expect(points.at(-1)).toEqual({ time: "2026-03-10T12:00:00Z", pageviews: 0, visitors: 0 });
    expect(points.find((p) => p.time === "2026-03-10T11:59:00Z")).toMatchObject({
      pageviews: 1,
      visitors: 1,
    });
    expect(points.find((p) => p.time === "2026-03-10T11:58:00Z")).toMatchObject({
      pageviews: 1,
      visitors: 1,
    });
    expect(points.find((p) => p.time === "2026-03-10T11:40:00Z")).toMatchObject({
      pageviews: 0,
      visitors: 0,
    });
  });

  it("has one point per hour for 24h", async () => {
    const { points } = (await get("timeseries?range=24h")).json<TimeseriesResponse>();

    expect(points).toHaveLength(25);
    expect(points.reduce((sum, p) => sum + p.pageviews, 0)).toBe(4);
    // 11:59, 11:58 and 11:50 are in the 11:00 slot. Visitors v1 and v2 are counted once each.
    expect(points.find((p) => p.time === "2026-03-10T11:00:00Z")).toMatchObject({
      pageviews: 3,
      visitors: 2,
    });
    expect(points.find((p) => p.time === "2026-03-10T09:00:00Z")).toMatchObject({
      pageviews: 1,
      visitors: 1,
    });
  });

  it("has one point per 6 hours for 7d", async () => {
    const { points } = (await get("timeseries?range=7d")).json<TimeseriesResponse>();

    expect(points).toHaveLength(29);
    expect(points.reduce((sum, p) => sum + p.pageviews, 0)).toBe(5);
    expect(points.find((p) => p.time === "2026-03-05T12:00:00Z")).toMatchObject({
      pageviews: 1,
      visitors: 1,
    });
  });
});

describe("top lists", () => {
  it("lists pages, most visited first, pageviews only", async () => {
    const { rows } = (await get("pages")).json<BreakdownResponse>();
    expect(rows).toEqual([
      { name: "/pricing", count: 3, visitors: 2 },
      { name: "/blog", count: 1, visitors: 1 },
    ]);
  });

  it("respects the limit", async () => {
    const { rows } = (await get("pages?limit=1")).json<BreakdownResponse>();
    expect(rows).toEqual([{ name: "/pricing", count: 3, visitors: 2 }]);
  });

  it("shows a missing referrer as Direct", async () => {
    const { rows } = (await get("referrers")).json<BreakdownResponse>();
    expect(countsByName(rows)).toEqual({ "google.com": 2, Direct: 2 });
    expect(rows.find((r) => r.name === "google.com")?.visitors).toBe(1);
    expect(rows.find((r) => r.name === "Direct")?.visitors).toBe(2);
  });

  it("shows a missing country as Unknown, biggest first", async () => {
    const { rows } = (await get("countries")).json<BreakdownResponse>();
    expect(rows[0]).toEqual({ name: "DE", count: 2, visitors: 1 });
    expect(countsByName(rows)).toEqual({ DE: 2, US: 1, Unknown: 1 });
  });

  it("lists devices and browsers", async () => {
    const devices = (await get("devices")).json<BreakdownResponse>();
    const browsers = (await get("browsers")).json<BreakdownResponse>();
    expect(countsByName(devices.rows)).toEqual({ desktop: 2, mobile: 2 });
    expect(countsByName(browsers.rows)).toEqual({ Chrome: 2, Safari: 2 });
  });

  it("lists custom events without pageviews", async () => {
    const { rows } = (await get("events")).json<BreakdownResponse>();
    expect(rows).toEqual([{ name: "signup", count: 1, visitors: 1 }]);
  });

  it("only counts the chosen range", async () => {
    const day = (await get("pages?range=24h")).json<BreakdownResponse>();
    const week = (await get("pages?range=7d")).json<BreakdownResponse>();
    expect(day.rows.map((r) => r.name)).not.toContain("/old");
    expect(week.rows.map((r) => r.name)).toContain("/old");
  });
});

describe("cache", () => {
  it("serves the second request from Redis", async () => {
    const before = (await get("pages")).json<BreakdownResponse>();
    expect(before.rows).toHaveLength(2);

    await ctx.prisma.event.deleteMany();
    const cached = (await get("pages")).json<BreakdownResponse>();
    expect(cached).toEqual(before);

    await ctx.redis.flushdb();
    const fresh = (await get("pages")).json<BreakdownResponse>();
    expect(fresh.rows).toEqual([]);
  });

  it("keeps a separate result for each range and limit", async () => {
    const day = (await get("pages?range=24h&limit=10")).json<BreakdownResponse>();
    const week = (await get("pages?range=7d&limit=10")).json<BreakdownResponse>();
    const one = (await get("pages?range=24h&limit=1")).json<BreakdownResponse>();
    expect(week.rows.length).toBeGreaterThan(day.rows.length);
    expect(one.rows).toHaveLength(1);
  });

  it("keeps data in Redis for a short time only", async () => {
    await get("overview");
    const keys = await ctx.redis.keys("cm:stats:*");
    expect(keys).toHaveLength(1);
    const ttl = await ctx.redis.ttl(keys[0] ?? "");
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
  });
});
