import { describe, expect, it } from "vitest";
import { enrichedEventSchema } from "@countmetrics/shared";
import {
  createRandom,
  createTrafficRun,
  createVisit,
  pickWeighted,
  visitEvent,
  visitorCurve,
} from "./traffic-model.js";

const SITE_ID = "00000000-0000-4000-8000-0000000000aa";
const NOW = new Date("2026-03-10T12:00:00.000Z");

describe("createRandom", () => {
  it("gives the same numbers for the same seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it("gives different numbers for different seeds", () => {
    expect(createRandom(1)()).not.toBe(createRandom(2)());
  });

  it("stays from 0 up to (not including) 1", () => {
    const random = createRandom(7);
    for (let i = 0; i < 1000; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("pickWeighted", () => {
  it("follows the weights", () => {
    const random = createRandom(1);
    const picks = Array.from({ length: 20_000 }, () =>
      pickWeighted([["common", 75], ["rare", 25]] as const, random),
    );
    const share = picks.filter((pick) => pick === "common").length / picks.length;
    expect(share).toBeGreaterThan(0.72);
    expect(share).toBeLessThan(0.78);
  });

  it("never picks something with weight 0", () => {
    const random = createRandom(1);
    for (let i = 0; i < 500; i++) {
      expect(pickWeighted([["never", 0], ["always", 1]] as const, random)).toBe("always");
    }
  });
});

describe("createVisit", () => {
  const random = createRandom(2026);
  const visits = Array.from({ length: 5000 }, () => createVisit(random));

  it("makes valid visits", () => {
    for (const visit of visits) {
      expect(visit.visitorHash).toMatch(/^[0-9a-f]{32}$/);
      expect(visit.steps.length).toBeGreaterThanOrEqual(1);
      expect(visit.steps.length).toBeLessThanOrEqual(6);
      expect(visit.steps[0]?.type).toBe("pageview");
      for (const step of visit.steps) expect(step.path.startsWith("/")).toBe(true);
    }
  });

  it("looks like real traffic", () => {
    const count = <T>(values: T[]) => {
      const counts = new Map<T, number>();
      for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
      return counts;
    };

    const pages = count(visits.flatMap((v) => v.steps.map((s) => s.path)));
    expect(pages.get("/")).toBeGreaterThan(pages.get("/contact") ?? 0);

    const countries = count(visits.map((v) => v.country));
    const topCountry = [...countries].sort((a, b) => b[1] - a[1])[0]?.[0];
    expect(topCountry).toBe("DE");

    const referrers = count(visits.map((v) => v.referrer));
    expect(referrers.get(null)).toBeGreaterThan(referrers.get("google.com") ?? 0);

    const mobileShare = visits.filter((v) => v.device === "mobile").length / visits.length;
    expect(mobileShare).toBeGreaterThan(0.35);
    expect(mobileShare).toBeLessThan(0.5);
  });

  it("has custom events for a few visitors", () => {
    const share = visits.filter((v) => v.steps.some((s) => s.type !== "pageview")).length / visits.length;
    expect(share).toBeGreaterThan(0.03);
    expect(share).toBeLessThan(0.14);
  });
});

describe("visitEvent", () => {
  const visit = createVisit(createRandom(5));

  it("makes events that the worker accepts", () => {
    for (let step = 0; step < visit.steps.length; step++) {
      expect(enrichedEventSchema.safeParse(visitEvent(visit, step, SITE_ID, NOW)).success).toBe(true);
    }
  });

  it("uses the referrer only for the first step, like the tracker", () => {
    const withReferrer = { ...visit, referrer: "google.com", steps: [...visit.steps, ...visit.steps] };
    expect(visitEvent(withReferrer, 0, SITE_ID, NOW).referrer).toBe("google.com");
    expect(visitEvent(withReferrer, 1, SITE_ID, NOW).referrer).toBeNull();
  });

  it("fails for a step that does not exist", () => {
    expect(() => visitEvent(visit, 99, SITE_ID, NOW)).toThrow();
  });
});

describe("visitorCurve", () => {
  it("stays between 0.2 and 1, and is busiest in the middle", () => {
    for (let p = 0; p <= 1; p += 0.05) {
      expect(visitorCurve(p)).toBeGreaterThanOrEqual(0.2);
      expect(visitorCurve(p)).toBeLessThanOrEqual(1);
    }
    expect(visitorCurve(0.5)).toBeGreaterThan(visitorCurve(0));
    expect(visitorCurve(0.5)).toBeGreaterThan(visitorCurve(1));
  });
});

describe("createTrafficRun", () => {
  function runAll(maxEvents: number, seed = 1) {
    const run = createTrafficRun({ siteId: SITE_ID, totalTicks: 30, maxEvents, random: createRandom(seed) });
    return Array.from({ length: 30 }, () => run.next(NOW));
  }

  it("never makes more events than the cap", () => {
    const ticks = runAll(100);
    const total = ticks.reduce((sum, events) => sum + events.length, 0);
    expect(total).toBe(100);
  });

  it("reports how many events it made", () => {
    const run = createTrafficRun({ siteId: SITE_ID, totalTicks: 30, maxEvents: 1000, random: createRandom(1) });
    const first = run.next(NOW);
    const second = run.next(NOW);
    expect(run.sent).toBe(first.length + second.length);
  });

  it("makes a normal amount of traffic for 30 seconds", () => {
    const total = runAll(1000).reduce((sum, events) => sum + events.length, 0);
    expect(total).toBeGreaterThan(250);
    expect(total).toBeLessThan(900);
  });

  it("only makes valid events for the given site, with the given time", () => {
    for (const event of runAll(1000).flat()) {
      expect(enrichedEventSchema.safeParse(event).success).toBe(true);
      expect(event.siteId).toBe(SITE_ID);
      expect(event.createdAt).toBe(NOW.toISOString());
    }
  });

  it("follows a wave: busier in the middle than at the start", () => {
    const ticks = runAll(1000);
    const sum = (from: number, to: number) =>
      ticks.slice(from, to).reduce((total, events) => total + events.length, 0);
    expect(sum(10, 20)).toBeGreaterThan(sum(0, 10));
  });

  it("makes the same traffic for the same seed", () => {
    expect(runAll(1000, 9)).toEqual(runAll(1000, 9));
  });
});
