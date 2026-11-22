import type { Redis } from "ioredis";
import { MAX_EVENTS_PER_REQUEST, type SimulationStatus } from "@countmetrics/shared";
import { chunk } from "../../lib/chunk.js";
import { AppError, notFound } from "../../lib/errors.js";
import type { EventQueue } from "../ingest/event-queue.js";
import { createTrafficRun, type Random } from "./traffic-model.js";

export interface SimulatorLimits {
  /** A run lasts this long */
  durationMs: number;
  /** New events are made this often */
  tickMs: number;
  /** One run makes at most this many events */
  maxEvents: number;
  /** After a run, the site has to wait this long */
  cooldownMs: number;
}

export const SIMULATOR_LIMITS: SimulatorLimits = {
  durationMs: 30_000,
  tickMs: 1_000,
  maxEvents: 1_000,
  cooldownMs: 30_000,
};

interface Deps {
  sites: { findOwned: (userId: string, siteId: string) => Promise<unknown> };
  redis: Redis;
  queue: EventQueue;
  /** Tests use short times */
  limits?: Partial<SimulatorLimits>;
  random?: Random;
  now?: () => number;
  log?: { error: (error: unknown, message: string) => void };
}

const defaultLog = { error: (error: unknown, message: string) => console.error(message, error) };

const toSeconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

/**
 * Sends fake visitors into the event queue, like a real tracker would.
 * Nothing is sent over HTTP, and the caller can't choose where events go:
 * the only input is the site id.
 *
 * The rules are kept in Redis, so they hold with several API instances:
 *  - one run at a time per site (the "run" key)
 *  - a pause after each run (the "cooldown" key)
 * Both keys expire by themselves, so a crashed process can't block a site forever.
 */
export function createSimulatorService({
  sites,
  redis,
  queue,
  limits: limitOverrides,
  random = Math.random,
  now = Date.now,
  log = defaultLog,
}: Deps) {
  const limits = { ...SIMULATOR_LIMITS, ...limitOverrides };
  const totalTicks = Math.ceil(limits.durationMs / limits.tickMs);
  const runKey = (siteId: string) => `cm:sim:run:${siteId}`;
  const cooldownKey = (siteId: string) => `cm:sim:cooldown:${siteId}`;

  const active = new Map<string, { cancel: () => void; done: Promise<void> }>();

  async function assertOwner(userId: string, siteId: string): Promise<void> {
    if (!(await sites.findOwned(userId, siteId))) {
      throw notFound("SITE_NOT_FOUND", "Site not found");
    }
  }

  async function runSecondsLeft(siteId: string): Promise<number> {
    const endsAt = Number(await redis.get(runKey(siteId)));
    return toSeconds(endsAt - now());
  }

  /** The cooldown starts before the run ends, so there is never a moment when both are off. */
  async function finish(siteId: string): Promise<void> {
    await redis.set(cooldownKey(siteId), "1", "PX", limits.cooldownMs);
    await redis.del(runKey(siteId));
  }

  function launch(siteId: string): void {
    const run = createTrafficRun({ siteId, totalTicks, maxEvents: limits.maxEvents, random });
    let cancelled = false;
    let timer: NodeJS.Timeout | undefined;
    let wake: () => void = () => undefined;

    const done = (async () => {
      try {
        for (let tick = 0; tick < totalTicks && !cancelled; tick++) {
          // The worker accepts only a few events per job
          for (const events of chunk(run.next(new Date(now())), MAX_EVENTS_PER_REQUEST)) {
            await queue.enqueue(events);
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
            timer = setTimeout(resolve, limits.tickMs);
          });
        }
      } catch (err) {
        log.error(err, "The traffic simulation stopped because of an error");
      } finally {
        await finish(siteId).catch((err: unknown) => log.error(err, "Could not end the simulation"));
        active.delete(siteId);
      }
    })();

    active.set(siteId, {
      cancel: () => {
        cancelled = true;
        clearTimeout(timer);
        wake();
      },
      done,
    });
  }

  return {
    async start(userId: string, siteId: string): Promise<SimulationStatus> {
      await assertOwner(userId, siteId);

      // NX: only one process wins this. The key expires by itself, even if the process dies.
      const endsAt = now() + limits.durationMs;
      const lockSeconds = toSeconds(limits.durationMs) + 5;
      const locked = await redis.set(runKey(siteId), String(endsAt), "EX", lockSeconds, "NX");
      if (!locked) {
        throw new AppError(409, "SIMULATION_RUNNING", "A simulation is already running for this site", {
          secondsLeft: await runSecondsLeft(siteId),
        });
      }

      const cooldownMs = await redis.pttl(cooldownKey(siteId));
      if (cooldownMs > 0) {
        await redis.del(runKey(siteId));
        const secondsLeft = toSeconds(cooldownMs);
        throw new AppError(
          429,
          "SIMULATION_COOLDOWN",
          "Please wait a moment before the next simulation",
          { secondsLeft },
          { "retry-after": String(secondsLeft) },
        );
      }

      launch(siteId);
      return { state: "running", secondsLeft: toSeconds(limits.durationMs) };
    },

    async status(userId: string, siteId: string): Promise<SimulationStatus> {
      await assertOwner(userId, siteId);

      if (await redis.exists(runKey(siteId))) {
        return { state: "running", secondsLeft: await runSecondsLeft(siteId) };
      }
      const cooldownMs = await redis.pttl(cooldownKey(siteId));
      if (cooldownMs > 0) return { state: "cooldown", secondsLeft: toSeconds(cooldownMs) };
      return { state: "idle", secondsLeft: 0 };
    },

    /** Stops all runs of this process. Used when the server shuts down. */
    async close(): Promise<void> {
      const runs = [...active.values()];
      for (const run of runs) run.cancel();
      await Promise.all(runs.map((run) => run.done));
    },
  };
}

export type SimulatorService = ReturnType<typeof createSimulatorService>;
