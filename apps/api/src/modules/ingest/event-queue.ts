import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { EVENTS_QUEUE, type EnrichedEvent, type EventsJobData } from "@countmetrics/shared";

/** What the ingest service needs from a queue (lets tests swap in a fake). */
export interface EventQueue {
  enqueue(events: EnrichedEvent[]): Promise<void>;
  close(): Promise<void>;
}

/** One BullMQ job per HTTP request, holding that request's events. */
export function createBullEventQueue(connection: Redis): EventQueue {
  const queue = new Queue<EventsJobData>(EVENTS_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      // Keep Redis memory bounded; failed jobs stay longer for inspection
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 10_000 },
    },
  });

  return {
    async enqueue(events) {
      // Explicit unique id: the worker uses it to skip jobs it already stored, so it must
      // never repeat (BullMQ's own counter restarts at 1 if Redis is wiped).
      await queue.add("events", { events }, { jobId: randomUUID() });
    },
    close: () => queue.close(),
  };
}
