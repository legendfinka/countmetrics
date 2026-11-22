import { randomBytes } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  DEMO_DOMAIN,
  DEMO_EMAIL,
  DEMO_SITE_ID,
  DEMO_SITE_KEY,
  DEMO_USER_ID,
  type EnrichedEvent,
} from "@countmetrics/shared";
import { chunk } from "../lib/chunk.js";
import { hashPassword } from "../lib/password.js";
import {
  createRandom,
  createVisit,
  pickWeighted,
  visitEvent,
  type Random,
  type Weighted,
} from "../modules/simulator/traffic-model.js";

const DAYS = 30;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const CHUNK_SIZE = 1000;

/** How busy each hour of the day (UTC) is. The site is quiet at night and busy at work hours. */
const HOURS: Weighted<number> = [1, 1, 1, 1, 1, 2, 4, 8, 12, 14, 15, 15, 13, 14, 15, 14, 12, 9, 7, 6, 5, 4, 3, 2].map(
  (weight, hour) => [hour, weight] as const,
);

/** Visitors on an average weekday and weekend day. Traffic also grows a little over the month. */
const WEEKDAY_VISITS = 90;
const WEEKEND_VISITS = 55;

/** All fake events of the last 30 days, oldest first. Nothing is in the future. */
function buildHistory(now: Date, random: Random): EnrichedEvent[] {
  const startOfToday = Math.floor(now.getTime() / DAY_MS) * DAY_MS;
  const events: EnrichedEvent[] = [];

  for (let daysAgo = DAYS - 1; daysAgo >= 0; daysAgo--) {
    const dayStart = startOfToday - daysAgo * DAY_MS;
    const dayOfWeek = new Date(dayStart).getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const growth = 0.8 + 0.4 * ((DAYS - 1 - daysAgo) / (DAYS - 1));
    const visits = Math.round(
      (isWeekend ? WEEKEND_VISITS : WEEKDAY_VISITS) * growth * (0.8 + random() * 0.4),
    );

    for (let i = 0; i < visits; i++) {
      const hour = pickWeighted(HOURS, random);
      let at = dayStart + hour * HOUR_MS + Math.floor(random() * HOUR_MS);
      const visit = createVisit(random);

      for (let step = 0; step < visit.steps.length; step++) {
        if (at > now.getTime()) break;
        events.push(visitEvent(visit, step, DEMO_SITE_ID, new Date(at)));
        // The visitor takes between 20 seconds and 3 minutes for the next page
        at += (20 + Math.floor(random() * 160)) * 1000;
      }
    }
  }

  return events.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Totals per minute, like the worker makes them. */
function buildMinuteStats(events: EnrichedEvent[]): Prisma.StatsMinuteCreateManyInput[] {
  const minutes = new Map<number, { pageviews: number; events: number; visitors: Set<string> }>();

  for (const event of events) {
    const time = Date.parse(event.createdAt);
    const minute = time - (time % MINUTE_MS);
    let totals = minutes.get(minute);
    if (!totals) {
      totals = { pageviews: 0, events: 0, visitors: new Set() };
      minutes.set(minute, totals);
    }
    if (event.type === "pageview") totals.pageviews++;
    else totals.events++;
    totals.visitors.add(event.visitorHash);
  }

  return [...minutes].map(([minute, totals]) => ({
    siteId: DEMO_SITE_ID,
    bucket: new Date(minute),
    pageviews: totals.pageviews,
    events: totals.events,
    visitors: totals.visitors.size,
  }));
}

interface SeedOptions {
  /** "Today" for the history. Tests use a fixed time. */
  now?: Date;
  /** The same seed gives the same fake data. */
  seed?: number;
}

/**
 * Makes the demo user, the demo site and 30 days of fake history.
 * Safe to run again: the old demo data is replaced, and other users are not touched.
 */
export async function seedDemo(
  prisma: PrismaClient,
  { now = new Date(), seed = 20260101 }: SeedOptions = {},
): Promise<{ events: number; minutes: number }> {
  const events = buildHistory(now, createRandom(seed));
  const minutes = buildMinuteStats(events);
  // Nobody knows this password, so nobody can log in with it. The demo uses "Try demo".
  const passwordHash = await hashPassword(randomBytes(32).toString("hex"));

  await prisma.$transaction(
    async (tx) => {
      await tx.user.upsert({
        where: { id: DEMO_USER_ID },
        create: { id: DEMO_USER_ID, email: DEMO_EMAIL, name: "Demo User", passwordHash },
        update: {},
      });
      await tx.site.upsert({
        where: { id: DEMO_SITE_ID },
        create: { id: DEMO_SITE_ID, userId: DEMO_USER_ID, domain: DEMO_DOMAIN, siteKey: DEMO_SITE_KEY },
        update: {},
      });

      await tx.event.deleteMany({ where: { siteId: DEMO_SITE_ID } });
      await tx.statsMinute.deleteMany({ where: { siteId: DEMO_SITE_ID } });

      for (const part of chunk(events, CHUNK_SIZE)) {
        await tx.event.createMany({
          data: part.map((event) => ({ ...event, createdAt: new Date(event.createdAt) })),
        });
      }
      for (const part of chunk(minutes, CHUNK_SIZE)) {
        await tx.statsMinute.createMany({ data: part });
      }
    },
    { timeout: 60_000 },
  );

  return { events: events.length, minutes: minutes.length };
}
