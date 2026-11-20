import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import type { Redis } from "ioredis";
import { EVENTS_QUEUE, type EnrichedEvent, type EventsJobData } from "@countmetrics/shared";

/** What the ingest service needs from a queue. Tests use a fake one. */
export interface EventQueue {
  enqueue(events: EnrichedEvent[]): Promise<void>;
  close(): Promise<void>;
}

/** One BullMQ job per HTTP request. It holds the events of that request. */
export function createBullEventQueue(connection: Redis): EventQueue {
  const queue = new Queue<EventsJobData>(EVENTS_QUEUE, {
    connection,
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 1000 },
      // Limits Redis memory. Failed jobs stay longer so you can look at them.
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 10_000 },
    },
  });

  return {
    async enqueue(events) {
      // Our own unique id. The worker uses it to skip jobs it already saved.
      // BullMQ's own counter starts again at 1 if Redis is wiped.
      await queue.add("events", { events }, { jobId: randomUUID() });
    },
    close: () => queue.close(),
  };
}
