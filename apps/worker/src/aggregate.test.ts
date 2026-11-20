import { describe, expect, it } from "vitest";
import type { EnrichedEvent } from "@countmetrics/shared";
import { aggregateByMinute, truncateToMinute } from "./aggregate.js";

const SITE_A = "00000000-0000-4000-8000-00000000000a";
const SITE_B = "00000000-0000-4000-8000-00000000000b";

const event = (siteId: string, createdAt: string, overrides: Partial<EnrichedEvent> = {}) =>
  ({
    siteId,
    type: "pageview",
    path: "/",
    referrer: null,
    country: null,
    device: "desktop",
    browser: "Chrome",
    visitorHash: "0".repeat(32),
    createdAt,
    ...overrides,
  }) satisfies EnrichedEvent;

describe("truncateToMinute", () => {
  it("drops seconds and milliseconds", () => {
    expect(truncateToMinute("2026-03-10T12:34:56.789Z").toISOString()).toBe(
      "2026-03-10T12:34:00.000Z",
    );
  });

  it("keeps an exact minute", () => {
    expect(truncateToMinute("2026-03-10T12:34:00.000Z").toISOString()).toBe(
      "2026-03-10T12:34:00.000Z",
    );
  });
});

describe("aggregateByMinute", () => {
  it("counts pageviews and custom events separately", () => {
    const [row] = aggregateByMinute([
      event(SITE_A, "2026-03-10T12:00:01Z"),
      event(SITE_A, "2026-03-10T12:00:30Z"),
      event(SITE_A, "2026-03-10T12:00:59Z", { type: "signup" }),
    ]);
    expect(row).toMatchObject({ pageviews: 2, events: 1 });
  });

  it("collects unique visitor hashes", () => {
    const [row] = aggregateByMinute([
      event(SITE_A, "2026-03-10T12:00:01Z", { visitorHash: "a".repeat(32) }),
      event(SITE_A, "2026-03-10T12:00:02Z", { visitorHash: "a".repeat(32) }),
      event(SITE_A, "2026-03-10T12:00:03Z", { visitorHash: "b".repeat(32) }),
    ]);
    expect(row?.visitorHashes.size).toBe(2);
  });

  it("splits by minute and by site, sorted by site then minute", () => {
    const rows = aggregateByMinute([
      event(SITE_B, "2026-03-10T12:00:10Z"),
      event(SITE_A, "2026-03-10T12:01:10Z"),
      event(SITE_A, "2026-03-10T12:00:10Z"),
    ]);
    expect(rows.map((r) => [r.siteId, r.bucket.toISOString()])).toEqual([
      [SITE_A, "2026-03-10T12:00:00.000Z"],
      [SITE_A, "2026-03-10T12:01:00.000Z"],
      [SITE_B, "2026-03-10T12:00:00.000Z"],
    ]);
  });

  it("returns nothing for no events", () => {
    expect(aggregateByMinute([])).toEqual([]);
  });
});
