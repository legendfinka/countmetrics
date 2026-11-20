import { z } from "zod";

export const EVENTS_QUEUE = "events";
export const MAX_EVENTS_PER_REQUEST = 20;

// ---------- Tracker -> API (POST /api/event) ----------

export const siteKeySchema = z.string().regex(/^cm_[A-Za-z0-9_-]{12}$/, "Invalid site key");

const eventFieldsSchema = z.object({
  /** "pageview" or a custom event name */
  type: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[\w .:-]+$/, "Only letters, digits, space and _ . : -"),
  path: z.string().min(1).max(2048),
  referrer: z.string().max(2048).optional(),
});

export const singleEventBodySchema = eventFieldsSchema.extend({ siteKey: siteKeySchema });

export const batchEventBodySchema = z.object({
  siteKey: siteKeySchema,
  events: z.array(eventFieldsSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});

export interface IngestBody {
  siteKey: string;
  events: z.infer<typeof eventFieldsSchema>[];
}

/** Accepts one event or a batch. Always returns a batch. */
export function parseIngestBody(raw: unknown): IngestBody {
  if (typeof raw === "object" && raw !== null && "events" in raw) {
    return batchEventBodySchema.parse(raw);
  }
  const { siteKey, ...event } = singleEventBodySchema.parse(raw);
  return { siteKey, events: [event] };
}

// ---------- API -> Worker (queue job payload) ----------

export const enrichedEventSchema = z.object({
  siteId: z.string().uuid(),
  type: z.string().min(1).max(64),
  /** Without query string or hash */
  path: z.string().max(512),
  /** Hostname only */
  referrer: z.string().max(253).nullable(),
  /** Two-letter country code, or null if unknown */
  country: z.string().length(2).nullable(),
  device: z.enum(["desktop", "mobile", "tablet"]),
  browser: z.string().max(32),
  /** Visitor hash that changes every day. See visitor-hash.ts. */
  visitorHash: z.string().length(32),
  createdAt: z.string().datetime(),
});

export const eventsJobSchema = z.object({
  events: z.array(enrichedEventSchema).min(1).max(MAX_EVENTS_PER_REQUEST),
});

export type EnrichedEvent = z.infer<typeof enrichedEventSchema>;
export type EventsJobData = z.infer<typeof eventsJobSchema>;

// ---------- Worker -> API (Redis pub/sub) ----------

export const siteUpdateChannel = (siteId: string): string => `site:${siteId}:update`;

/** A visitor is "current" if seen within this time. */
export const LIVE_WINDOW_MS = 5 * 60_000;

/** Redis key of the "current visitors" list of a site. The worker writes it, the API reads it. */
export const liveVisitorsKey = (siteId: string): string => `cm:live:${siteId}`;

/** The worker sends this after it saves events of a site. */
export const siteUpdateMessageSchema = z.object({
  siteId: z.string().uuid(),
  /** Visitors seen in the last 5 minutes */
  currentVisitors: z.number().int().nonnegative(),
  /** Events saved in this flush. Not a total. */
  pageviews: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
  at: z.string().datetime(),
});

export type SiteUpdateMessage = z.infer<typeof siteUpdateMessageSchema>;
