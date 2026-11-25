import { Prisma, type PrismaClient } from "@prisma/client";
import type { Redis } from "ioredis";
import {
  LIVE_WINDOW_MS,
  liveVisitorsKey,
  type BreakdownKind,
  type BreakdownRow,
  type TimeseriesPoint,
} from "@countmetrics/shared";

export interface TimeWindow {
  from: Date;
  to: Date;
}

// Prisma's DateTime columns hold UTC without a timezone.
// So we send times as ISO strings and convert them the same way.
const ts = (date: Date) => Prisma.sql`(${date.toISOString()}::timestamptz AT TIME ZONE 'UTC')`;

// Column names come from this fixed list, never from user input.
const COLUMN: Record<Exclude<BreakdownKind, "actions">, Prisma.Sql> = {
  pages: Prisma.sql`"path"`,
  referrers: Prisma.sql`"referrer"`,
  countries: Prisma.sql`"country"`,
  devices: Prisma.sql`"device"`,
  browsers: Prisma.sql`"browser"`,
};

// What to show when the value is missing
const FALLBACK: Record<Exclude<BreakdownKind, "actions">, string> = {
  pages: "Unknown",
  referrers: "Direct",
  countries: "Unknown",
  devices: "Unknown",
  browsers: "Unknown",
};

export function createStatsRepository(prisma: PrismaClient, redis: Redis) {
  return {
    /** Pageview and custom event totals. Uses the small per-minute table. */
    async minuteTotals(siteId: string, { from, to }: TimeWindow) {
      const [row] = await prisma.$queryRaw<{ pageviews: number; events: number }[]>`
        SELECT COALESCE(SUM("pageviews"), 0)::int AS pageviews,
               COALESCE(SUM("events"), 0)::int AS events
        FROM "StatsMinute"
        WHERE "siteId" = ${siteId} AND "bucket" >= ${ts(from)} AND "bucket" <= ${ts(to)}`;
      return row ?? { pageviews: 0, events: 0 };
    },

    /** Exact unique visitors. Needs the raw events, because minute rows can't be added up. */
    async countVisitors(siteId: string, { from, to }: TimeWindow): Promise<number> {
      const [row] = await prisma.$queryRaw<{ visitors: number }[]>`
        SELECT COUNT(DISTINCT "visitorHash")::int AS visitors
        FROM "Event"
        WHERE "siteId" = ${siteId} AND "createdAt" >= ${ts(from)} AND "createdAt" <= ${ts(to)}`;
      return row?.visitors ?? 0;
    },

    /**
     * One point per time slot, with zeros for empty slots.
     * `step` is a Postgres interval like "1 hour".
     */
    timeseries(siteId: string, { from, to }: TimeWindow, step: string): Promise<TimeseriesPoint[]> {
      return prisma.$queryRaw<TimeseriesPoint[]>`
        WITH slots AS (
          SELECT generate_series(
            date_bin(${step}::interval, ${ts(from)}, TIMESTAMP '2000-01-01'),
            date_bin(${step}::interval, ${ts(to)}, TIMESTAMP '2000-01-01'),
            ${step}::interval
          ) AS slot
        ),
        pageviews AS (
          SELECT date_bin(${step}::interval, "bucket", TIMESTAMP '2000-01-01') AS slot,
                 SUM("pageviews")::int AS total
          FROM "StatsMinute"
          WHERE "siteId" = ${siteId} AND "bucket" >= ${ts(from)} AND "bucket" <= ${ts(to)}
          GROUP BY 1
        ),
        visitors AS (
          SELECT date_bin(${step}::interval, "createdAt", TIMESTAMP '2000-01-01') AS slot,
                 COUNT(DISTINCT "visitorHash")::int AS total
          FROM "Event"
          WHERE "siteId" = ${siteId} AND "createdAt" >= ${ts(from)} AND "createdAt" <= ${ts(to)}
          GROUP BY 1
        )
        SELECT to_char(slots.slot, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "time",
               COALESCE(pageviews.total, 0) AS pageviews,
               COALESCE(visitors.total, 0) AS visitors
        FROM slots
        LEFT JOIN pageviews ON pageviews.slot = slots.slot
        LEFT JOIN visitors ON visitors.slot = slots.slot
        ORDER BY slots.slot`;
    },

    /** Top pages, referrers, countries, devices or browsers. Pageviews only. */
    breakdown(
      siteId: string,
      kind: Exclude<BreakdownKind, "actions">,
      { from, to }: TimeWindow,
      limit: number,
    ): Promise<BreakdownRow[]> {
      return prisma.$queryRaw<BreakdownRow[]>`
        SELECT COALESCE(${COLUMN[kind]}, ${FALLBACK[kind]}::text) AS name,
               COUNT(*)::int AS count,
               COUNT(DISTINCT "visitorHash")::int AS visitors
        FROM "Event"
        WHERE "siteId" = ${siteId} AND "type" = 'pageview'
          AND "createdAt" >= ${ts(from)} AND "createdAt" <= ${ts(to)}
        GROUP BY 1
        ORDER BY count DESC, name ASC
        LIMIT ${limit}`;
    },

    /** Top custom events (everything except pageviews). */
    topEvents(siteId: string, { from, to }: TimeWindow, limit: number): Promise<BreakdownRow[]> {
      return prisma.$queryRaw<BreakdownRow[]>`
        SELECT "type" AS name,
               COUNT(*)::int AS count,
               COUNT(DISTINCT "visitorHash")::int AS visitors
        FROM "Event"
        WHERE "siteId" = ${siteId} AND "type" <> 'pageview'
          AND "createdAt" >= ${ts(from)} AND "createdAt" <= ${ts(to)}
        GROUP BY 1
        ORDER BY count DESC, name ASC
        LIMIT ${limit}`;
    },

    /** Visitors seen in the last 5 minutes. The worker keeps this list in Redis. */
    async countCurrentVisitors(siteId: string, nowMs: number): Promise<number> {
      const key = liveVisitorsKey(siteId);
      try {
        const results = await redis
          .pipeline()
          .zremrangebyscore(key, "-inf", nowMs - LIVE_WINDOW_MS)
          .zcard(key)
          .exec();
        const [error, count] = results?.[1] ?? [];
        if (error) throw error;
        return Number(count ?? 0);
      } catch {
        // The dashboard should still work if Redis has a problem
        return 0;
      }
    },
  };
}

export type StatsRepository = ReturnType<typeof createStatsRepository>;
