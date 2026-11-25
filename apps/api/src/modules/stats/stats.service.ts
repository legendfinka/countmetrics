import type {
  BreakdownKind,
  BreakdownResponse,
  StatsOverview,
  StatsRange,
  TimeseriesResponse,
} from "@countmetrics/shared";
import { notFound } from "../../lib/errors.js";
import type { SitesRepository } from "../sites/sites.repository.js";
import type { StatsCache } from "./stats-cache.js";
import type { StatsRepository, TimeWindow } from "./stats.repository.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// `step` is the size of one chart slot. `cacheSeconds` is how long results are kept.
const RANGES: Record<StatsRange, { ms: number; step: string; cacheSeconds: number }> = {
  "30m": { ms: 30 * MINUTE_MS, step: "1 minute", cacheSeconds: 10 },
  "24h": { ms: DAY_MS, step: "1 hour", cacheSeconds: 30 },
  "7d": { ms: 7 * DAY_MS, step: "6 hours", cacheSeconds: 30 },
  "30d": { ms: 30 * DAY_MS, step: "1 day", cacheSeconds: 30 },
};

interface Deps {
  sites: Pick<SitesRepository, "findOwned">;
  stats: StatsRepository;
  cache: StatsCache;
  now?: () => Date;
}

export function createStatsService({ sites, stats, cache, now = () => new Date() }: Deps) {
  /** The start is rounded down to the minute, to match the per-minute table. */
  function windowFor(range: StatsRange): TimeWindow {
    const to = now();
    const from = new Date(Math.floor((to.getTime() - RANGES[range].ms) / MINUTE_MS) * MINUTE_MS);
    return { from, to };
  }

  async function assertOwner(userId: string, siteId: string): Promise<void> {
    if (!(await sites.findOwned(userId, siteId))) {
      throw notFound("SITE_NOT_FOUND", "Site not found");
    }
  }

  const cacheKey = (siteId: string, name: string, range: StatsRange, limit?: number) =>
    `cm:stats:${siteId}:${name}:${range}${limit === undefined ? "" : `:${limit}`}`;

  return {
    async overview(userId: string, siteId: string, range: StatsRange): Promise<StatsOverview> {
      await assertOwner(userId, siteId);

      const totals = await cache.wrap(
        cacheKey(siteId, "overview", range),
        RANGES[range].cacheSeconds,
        async () => {
          const window = windowFor(range);
          const [minutes, visitors] = await Promise.all([
            stats.minuteTotals(siteId, window),
            stats.countVisitors(siteId, window),
          ]);
          return { range, pageviews: minutes.pageviews, events: minutes.events, visitors };
        },
      );

      // "Online now" is cheap and should be live, so it is never cached
      const currentVisitors = await stats.countCurrentVisitors(siteId, now().getTime());
      return { ...totals, currentVisitors };
    },

    async timeseries(
      userId: string,
      siteId: string,
      range: StatsRange,
    ): Promise<TimeseriesResponse> {
      await assertOwner(userId, siteId);
      return cache.wrap(
        cacheKey(siteId, "timeseries", range),
        RANGES[range].cacheSeconds,
        async () => ({
          range,
          points: await stats.timeseries(siteId, windowFor(range), RANGES[range].step),
        }),
      );
    },

    async breakdown(
      userId: string,
      siteId: string,
      kind: BreakdownKind,
      range: StatsRange,
      limit: number,
    ): Promise<BreakdownResponse> {
      await assertOwner(userId, siteId);
      return cache.wrap(
        cacheKey(siteId, kind, range, limit),
        RANGES[range].cacheSeconds,
        async () => {
          const window = windowFor(range);
          const rows =
            kind === "actions"
              ? await stats.topEvents(siteId, window, limit)
              : await stats.breakdown(siteId, kind, window, limit);
          return { range, rows };
        },
      );
    },
  };
}

export type StatsService = ReturnType<typeof createStatsService>;
