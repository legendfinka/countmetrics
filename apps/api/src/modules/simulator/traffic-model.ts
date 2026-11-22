import type { EnrichedEvent } from "@countmetrics/shared";

// How fake visitors look. The simulator and the demo seed both use this file.
// Weights say how common something is. A weight of 30 is twice as common as 15.

/** A random number from 0 up to (but not including) 1. */
export type Random = () => number;

/** A small random generator with a seed. The same seed always gives the same numbers. */
export function createRandom(seed: number): Random {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Weighted<T> = readonly (readonly [T, number])[];

export function pickWeighted<T>(choices: Weighted<T>, random: Random): T {
  const total = choices.reduce((sum, [, weight]) => sum + weight, 0);
  let point = random() * total;
  for (const [value, weight] of choices) {
    point -= weight;
    if (point < 0) return value;
  }
  // Only reached by rounding errors
  return choices[choices.length - 1]![0];
}

const PAGES: Weighted<string> = [
  ["/", 30],
  ["/pricing", 14],
  ["/blog", 12],
  ["/docs", 10],
  ["/blog/how-we-built-it", 8],
  ["/signup", 7],
  ["/blog/privacy-first-analytics", 6],
  ["/about", 5],
  ["/docs/getting-started", 5],
  ["/contact", 3],
];

/** null means the visitor came directly, without a referrer. */
const REFERRERS: Weighted<string | null> = [
  [null, 34],
  ["google.com", 28],
  ["x.com", 8],
  ["news.ycombinator.com", 7],
  ["github.com", 6],
  ["linkedin.com", 6],
  ["reddit.com", 5],
  ["duckduckgo.com", 4],
  ["bing.com", 2],
];

const COUNTRIES: Weighted<string | null> = [
  ["DE", 24],
  ["US", 18],
  ["GB", 8],
  ["FR", 7],
  ["NL", 6],
  ["AT", 5],
  ["CH", 5],
  ["PL", 4],
  ["ES", 4],
  ["IT", 4],
  ["SE", 3],
  ["CA", 3],
  [null, 2],
];

type Device = EnrichedEvent["device"];

const DEVICES: Weighted<Device> = [
  ["desktop", 52],
  ["mobile", 42],
  ["tablet", 6],
];

const BROWSERS: Record<Device, Weighted<string>> = {
  desktop: [
    ["Chrome", 58],
    ["Safari", 14],
    ["Firefox", 14],
    ["Edge", 12],
    ["Other", 2],
  ],
  mobile: [
    ["Chrome", 52],
    ["Safari", 42],
    ["Samsung Internet", 4],
    ["Other", 2],
  ],
  tablet: [
    ["Safari", 60],
    ["Chrome", 40],
  ],
};

/** How many pages one visitor looks at. Most look at one or two. */
const PAGE_COUNTS: Weighted<number> = [
  [1, 45],
  [2, 28],
  [3, 15],
  [4, 8],
  [5, 4],
];

const CUSTOM_EVENTS: Weighted<string> = [
  ["signup", 40],
  ["click_cta", 35],
  ["download", 15],
  ["newsletter", 10],
];

/** Chance that a visitor also does a custom event, like "signup" */
const CUSTOM_EVENT_CHANCE = 0.08;

export interface VisitStep {
  /** "pageview" or the name of a custom event */
  type: string;
  path: string;
}

/** One visitor, and what they do on the site. */
export interface Visit {
  visitorHash: string;
  country: string | null;
  device: Device;
  browser: string;
  referrer: string | null;
  steps: VisitStep[];
}

const HEX = "0123456789abcdef";

function randomHash(random: Random): string {
  let hash = "";
  for (let i = 0; i < 32; i++) hash += HEX.charAt(Math.floor(random() * 16));
  return hash;
}

export function createVisit(random: Random): Visit {
  const device = pickWeighted(DEVICES, random);

  const steps: VisitStep[] = [];
  const pageCount = pickWeighted(PAGE_COUNTS, random);
  for (let i = 0; i < pageCount; i++) {
    let path = pickWeighted(PAGES, random);
    // A visitor rarely opens the same page twice in a row
    if (path === steps[steps.length - 1]?.path) path = pickWeighted(PAGES, random);
    steps.push({ type: "pageview", path });
  }
  if (random() < CUSTOM_EVENT_CHANCE) {
    steps.push({ type: pickWeighted(CUSTOM_EVENTS, random), path: steps[steps.length - 1]!.path });
  }

  return {
    visitorHash: randomHash(random),
    country: pickWeighted(COUNTRIES, random),
    device,
    browser: pickWeighted(BROWSERS[device], random),
    referrer: pickWeighted(REFERRERS, random),
    steps,
  };
}

/** The event for one step of a visit. Like the tracker, only the first step has a referrer. */
export function visitEvent(visit: Visit, step: number, siteId: string, at: Date): EnrichedEvent {
  const current = visit.steps[step];
  if (!current) throw new Error(`The visit has no step ${step}`);

  return {
    siteId,
    type: current.type,
    path: current.path,
    referrer: step === 0 ? visit.referrer : null,
    country: visit.country,
    device: visit.device,
    browser: visit.browser,
    visitorHash: visit.visitorHash,
    createdAt: at.toISOString(),
  };
}

/**
 * How busy the site is during a run. Progress goes from 0 (start) to 1 (end).
 * It starts quiet, gets busiest in the middle, and calms down again.
 * The result is between 0.2 and 1.
 */
export function visitorCurve(progress: number): number {
  return 0.2 + 0.8 * Math.sin(Math.PI * progress);
}

interface RunOptions {
  siteId: string;
  /** How many times next() will be called */
  totalTicks: number;
  /** The run never makes more events than this */
  maxEvents: number;
  random?: Random;
  /** New visitors in the busiest tick */
  peakVisitsPerTick?: number;
}

/** Makes the fake events of one simulation, one tick (one second) at a time. */
export function createTrafficRun({
  siteId,
  totalTicks,
  maxEvents,
  random = Math.random,
  peakVisitsPerTick = 12,
}: RunOptions) {
  // Visitors who still have steps left. A visitor takes a few ticks between steps.
  let waiting: { visit: Visit; step: number; dueTick: number }[] = [];
  let tick = 0;
  let sent = 0;

  return {
    get sent(): number {
      return sent;
    },

    /** The events of the next tick. In total, never more than maxEvents. */
    next(now: Date): EnrichedEvent[] {
      const progress = totalTicks <= 1 ? 0.5 : tick / (totalTicks - 1);
      const newVisits = Math.round(peakVisitsPerTick * visitorCurve(progress) * (0.85 + random() * 0.3));
      for (let i = 0; i < newVisits; i++) {
        waiting.push({ visit: createVisit(random), step: 0, dueTick: tick });
      }

      const events: EnrichedEvent[] = [];
      const stillWaiting: typeof waiting = [];
      for (const item of waiting) {
        // The budget is used up. The remaining visitors just leave.
        if (sent + events.length >= maxEvents) break;

        if (item.dueTick > tick) {
          stillWaiting.push(item);
          continue;
        }
        events.push(visitEvent(item.visit, item.step, siteId, now));
        item.step++;
        if (item.step < item.visit.steps.length) {
          item.dueTick = tick + 1 + Math.floor(random() * 4);
          stillWaiting.push(item);
        }
      }

      waiting = stillWaiting;
      sent += events.length;
      tick++;
      return events;
    },
  };
}
