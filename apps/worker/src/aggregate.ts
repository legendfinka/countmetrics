import type { EnrichedEvent } from "@countmetrics/shared";

export interface MinuteAggregate {
  siteId: string;
  /** Start of the minute (UTC) */
  bucket: Date;
  pageviews: number;
  /** Custom events (everything that is not a pageview) */
  events: number;
  visitorHashes: Set<string>;
}

const MINUTE_MS = 60_000;

export function truncateToMinute(iso: string): Date {
  const t = Date.parse(iso);
  return new Date(t - (t % MINUTE_MS));
}

export const aggregateKey = (siteId: string, bucket: Date): string =>
  `${siteId}|${bucket.getTime()}`;

/**
 * Groups events by site and minute. The result is sorted.
 * So every worker updates rows in the same order, and they can't block each other.
 */
export function aggregateByMinute(events: EnrichedEvent[]): MinuteAggregate[] {
  const groups = new Map<string, MinuteAggregate>();

  for (const event of events) {
    const bucket = truncateToMinute(event.createdAt);
    const key = aggregateKey(event.siteId, bucket);
    let group = groups.get(key);
    if (!group) {
      group = { siteId: event.siteId, bucket, pageviews: 0, events: 0, visitorHashes: new Set() };
      groups.set(key, group);
    }
    if (event.type === "pageview") group.pageviews++;
    else group.events++;
    group.visitorHashes.add(event.visitorHash);
  }

  return [...groups.values()].sort(
    (a, b) => a.siteId.localeCompare(b.siteId) || a.bucket.getTime() - b.bucket.getTime(),
  );
}
