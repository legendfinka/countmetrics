import { UnrecoverableError, type Job } from "bullmq";
import { eventsJobSchema } from "@countmetrics/shared";
import type { Batcher } from "./batcher.js";
import type { PendingJob } from "./flush.js";

/**
 * BullMQ processor. It does not write anything itself: it validates the payload, hands the job
 * to the batcher and waits. The job is acknowledged only after its batch is stored, so a crash
 * before that redelivers it (at-least-once; ProcessedJob makes the redelivery harmless).
 */
export function createProcessor(batcher: Batcher<PendingJob>) {
  return async (job: Job): Promise<void> => {
    const parsed = eventsJobSchema.safeParse(job.data);
    if (!parsed.success) {
      // Retrying cannot fix a malformed payload: fail it right away
      throw new UnrecoverableError(`Invalid job payload: ${parsed.error.message}`);
    }
    await batcher.add({ id: String(job.id), events: parsed.data.events });
  };
}
