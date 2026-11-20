import { UnrecoverableError, type Job } from "bullmq";
import { eventsJobSchema } from "@countmetrics/shared";
import type { Batcher } from "./batcher.js";
import type { PendingJob } from "./flush.js";

/**
 * The BullMQ processor. It saves nothing itself. It checks the data, gives the job to the batcher
 * and waits. The job is marked done only after its batch is saved.
 * If the worker crashes before that, the job comes back. ProcessedJob makes that harmless.
 */
export function createProcessor(batcher: Batcher<PendingJob>) {
  return async (job: Job): Promise<void> => {
    const parsed = eventsJobSchema.safeParse(job.data);
    if (!parsed.success) {
      // Retrying can't fix broken data. Fail it right away.
      throw new UnrecoverableError(`Invalid job payload: ${parsed.error.message}`);
    }
    await batcher.add({ id: String(job.id), events: parsed.data.events });
  };
}
