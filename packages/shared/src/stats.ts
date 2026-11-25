import { z } from "zod";

export const statsRangeSchema = z.enum(["30m", "24h", "7d", "30d"]);
export type StatsRange = z.infer<typeof statsRangeSchema>;

/** The top lists the dashboard can ask for. */
export const BREAKDOWN_KINDS = [
  "pages",
  "referrers",
  "countries",
  "devices",
  "browsers",
  // Custom events. Not named "events", because ad blockers block ".../stats/events".
  "actions",
] as const;
export const breakdownKindSchema = z.enum(BREAKDOWN_KINDS);
export type BreakdownKind = z.infer<typeof breakdownKindSchema>;

// ---------- Query strings ----------

export const statsQuerySchema = z.object({
  range: statsRangeSchema.default("24h"),
});

export const breakdownQuerySchema = statsQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// ---------- Responses ----------

export const overviewSchema = z.object({
  range: statsRangeSchema,
  pageviews: z.number().int(),
  /** Custom events (not pageviews) */
  events: z.number().int(),
  /** Unique visitors. The hash changes daily, so one person on two days counts twice. */
  visitors: z.number().int(),
  /** Visitors seen in the last 5 minutes */
  currentVisitors: z.number().int(),
});

export const timeseriesPointSchema = z.object({
  /** Start of the time slot (ISO, UTC) */
  time: z.string(),
  pageviews: z.number().int(),
  visitors: z.number().int(),
});

export const timeseriesSchema = z.object({
  range: statsRangeSchema,
  points: z.array(timeseriesPointSchema),
});

export const breakdownRowSchema = z.object({
  name: z.string(),
  /** Number of events (pageviews, or custom events for the "actions" list) */
  count: z.number().int(),
  visitors: z.number().int(),
});

export const breakdownSchema = z.object({
  range: statsRangeSchema,
  rows: z.array(breakdownRowSchema),
});

export type StatsOverview = z.infer<typeof overviewSchema>;
export type TimeseriesPoint = z.infer<typeof timeseriesPointSchema>;
export type TimeseriesResponse = z.infer<typeof timeseriesSchema>;
export type BreakdownRow = z.infer<typeof breakdownRowSchema>;
export type BreakdownResponse = z.infer<typeof breakdownSchema>;
