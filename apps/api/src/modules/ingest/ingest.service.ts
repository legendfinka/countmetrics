import type { EnrichedEvent, IngestBody } from "@countmetrics/shared";
import { notFound, tooManyRequests } from "../../lib/errors.js";
import { normalizePath, normalizeReferrer, parseUserAgent } from "./enrich.js";
import type { EventQueue } from "./event-queue.js";
import type { RateLimiter } from "./rate-limiter.js";
import type { SiteKeyCache } from "./site-key-cache.js";
import { computeVisitorHash, type SaltProvider } from "./visitor-hash.js";

interface Deps {
  siteKeys: SiteKeyCache;
  limiter: RateLimiter;
  salts: SaltProvider;
  queue: EventQueue;
  lookupCountry: (ip: string) => string | null;
  now?: () => Date;
}

export interface IngestRequest {
  body: IngestBody;
  ip: string;
  userAgent: string;
}

const MAX_USER_AGENT_LENGTH = 512;

/**
 * The fast path: check key -> rate limit -> enrich -> queue. No Postgres writes.
 * The IP is only used for the country, the visitor hash and the rate limit.
 */
export function createIngestService(deps: Deps) {
  const now = deps.now ?? (() => new Date());

  return {
    async ingest({ body, ip, userAgent: rawUserAgent }: IngestRequest): Promise<void> {
      const siteId = await deps.siteKeys.resolve(body.siteKey);
      if (!siteId) throw notFound("UNKNOWN_SITE_KEY", "Unknown site key");

      const limit = await deps.limiter.check(ip, body.siteKey);
      if (!limit.allowed) throw tooManyRequests(limit.retryAfterSeconds);

      const at = now();
      const userAgent = rawUserAgent.slice(0, MAX_USER_AGENT_LENGTH);
      const salt = await deps.salts.getSalt(at);
      const visitorHash = computeVisitorHash(salt, body.siteKey, ip, userAgent);
      const { device, browser } = parseUserAgent(userAgent);
      const country = deps.lookupCountry(ip);

      const events: EnrichedEvent[] = body.events.map((e) => ({
        siteId,
        type: e.type,
        path: normalizePath(e.path),
        referrer: normalizeReferrer(e.referrer),
        country,
        device,
        browser,
        visitorHash,
        createdAt: at.toISOString(),
      }));

      await deps.queue.enqueue(events);
    },
  };
}

export type IngestService = ReturnType<typeof createIngestService>;
