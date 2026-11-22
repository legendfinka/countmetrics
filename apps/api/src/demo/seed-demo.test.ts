import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DEMO_DOMAIN,
  DEMO_EMAIL,
  DEMO_SITE_ID,
  DEMO_SITE_KEY,
  DEMO_USER_ID,
  enrichedEventSchema,
} from "@countmetrics/shared";
import { createSiteFixture, dbUrl, resetDb } from "../../test/helpers.js";
import { seedDemo } from "./seed-demo.js";

const NOW = new Date("2026-03-10T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

let prisma: PrismaClient;

beforeAll(() => {
  prisma = new PrismaClient({ datasourceUrl: dbUrl });
});
afterAll(() => prisma.$disconnect());
beforeEach(() => resetDb(prisma));

const demoEvents = () => prisma.event.findMany({ where: { siteId: DEMO_SITE_ID } });

describe("seedDemo", () => {
  it("makes the demo user and site with the fixed ids", async () => {
    await seedDemo(prisma, { now: NOW });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: DEMO_USER_ID } });
    const site = await prisma.site.findUniqueOrThrow({ where: { id: DEMO_SITE_ID } });
    expect(user.email).toBe(DEMO_EMAIL);
    expect(site).toMatchObject({ userId: DEMO_USER_ID, domain: DEMO_DOMAIN, siteKey: DEMO_SITE_KEY });
  });

  it("makes a few thousand events in the last 30 days, and none in the future", async () => {
    const { events: count } = await seedDemo(prisma, { now: NOW });
    const events = await demoEvents();

    expect(count).toBeGreaterThan(3500);
    expect(count).toBeLessThan(6500);
    expect(events).toHaveLength(count);
    for (const event of events) {
      expect(event.createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(event.createdAt.getTime()).toBeGreaterThanOrEqual(NOW.getTime() - 30 * DAY_MS);
    }
  });

  it("makes valid events with a mix of pages, countries and custom events", async () => {
    await seedDemo(prisma, { now: NOW });
    const events = await demoEvents();

    for (const event of events) {
      const result = enrichedEventSchema.safeParse({ ...event, createdAt: event.createdAt.toISOString() });
      expect(result.success).toBe(true);
    }
    expect(new Set(events.map((event) => event.path)).size).toBeGreaterThan(5);
    expect(new Set(events.map((event) => event.country)).size).toBeGreaterThan(5);
    expect(events.some((event) => event.type !== "pageview")).toBe(true);
  });

  it("has more traffic on weekdays than on weekends", async () => {
    await seedDemo(prisma, { now: NOW });
    const perDay = new Map<string, number>();
    for (const event of await demoEvents()) {
      const day = event.createdAt.toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) ?? 0) + 1);
    }

    const average = (weekend: boolean) => {
      const counts = [...perDay]
        .filter(([day]) => [0, 6].includes(new Date(day).getUTCDay()) === weekend)
        .map(([, count]) => count);
      return counts.reduce((sum, count) => sum + count, 0) / counts.length;
    };
    expect(average(false)).toBeGreaterThan(average(true));
  });

  it("makes minute totals that match the events", async () => {
    await seedDemo(prisma, { now: NOW });
    const events = await demoEvents();
    const rows = await prisma.statsMinute.findMany({ where: { siteId: DEMO_SITE_ID } });

    const expected = new Map<number, { pageviews: number; events: number; visitors: Set<string> }>();
    for (const event of events) {
      const minute = Math.floor(event.createdAt.getTime() / 60_000) * 60_000;
      const totals = expected.get(minute) ?? { pageviews: 0, events: 0, visitors: new Set<string>() };
      if (event.type === "pageview") totals.pageviews++;
      else totals.events++;
      totals.visitors.add(event.visitorHash);
      expected.set(minute, totals);
    }

    expect(rows).toHaveLength(expected.size);
    for (const row of rows) {
      const totals = expected.get(row.bucket.getTime());
      expect(totals).toBeDefined();
      expect(row).toMatchObject({
        pageviews: totals?.pageviews,
        events: totals?.events,
        visitors: totals?.visitors.size,
      });
    }
  });

  it("can run again: the same data, no copies", async () => {
    const first = await seedDemo(prisma, { now: NOW });
    const second = await seedDemo(prisma, { now: NOW });

    expect(second).toEqual(first);
    expect(await prisma.event.count({ where: { siteId: DEMO_SITE_ID } })).toBe(first.events);
    expect(await prisma.statsMinute.count({ where: { siteId: DEMO_SITE_ID } })).toBe(first.minutes);
    expect(await prisma.user.count({ where: { id: DEMO_USER_ID } })).toBe(1);
    expect(await prisma.site.count({ where: { id: DEMO_SITE_ID } })).toBe(1);
  });

  it("does not touch the data of other users", async () => {
    const other = await createSiteFixture(prisma);
    await prisma.event.create({
      data: { siteId: other.id, type: "pageview", path: "/", visitorHash: "x".repeat(32), createdAt: NOW },
    });

    await seedDemo(prisma, { now: NOW });

    expect(await prisma.site.count({ where: { id: other.id } })).toBe(1);
    expect(await prisma.event.count({ where: { siteId: other.id } })).toBe(1);
  });

  it("makes a user that nobody can log in as with a password", async () => {
    await seedDemo(prisma, { now: NOW });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: DEMO_USER_ID } });

    expect(user.passwordHash.startsWith("$argon2")).toBe(true);
  });
});
