// A load test helper. Prints the queue size every second. Press Ctrl+C for a summary.
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { EVENTS_QUEUE } from "@countmetrics/shared";
import { loadConfig } from "./config.js";

const connection = new Redis(loadConfig().REDIS_URL);
const queue = new Queue(EVENTS_QUEUE, { connection });

const startedAt = Date.now();
let peak = 0;
let busySince: number | undefined;
let busyUntil: number | undefined;
let failedAtStart: number | undefined;
let failed = 0;

console.log("second,jobs_in_queue");

const timer = setInterval(() => {
  void queue.getJobCounts("waiting", "active", "delayed", "failed").then((counts) => {
    const depth = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
    failed = counts.failed ?? 0;
    failedAtStart ??= failed;
    peak = Math.max(peak, depth);

    const second = Math.round((Date.now() - startedAt) / 1000);
    if (depth > 0) {
      busySince ??= second;
      busyUntil = second;
    }
    console.log(`${second},${depth}`);
  });
}, 1000);

process.once("SIGINT", () => {
  clearInterval(timer);
  const busy = busySince === undefined ? 0 : (busyUntil ?? busySince) - busySince + 1;
  console.log(`\npeak queue depth: ${peak}`);
  console.log(`queue was busy for: ${busy}s (compare with the test duration)`);
  console.log(`new failed jobs: ${failed - (failedAtStart ?? failed)}`);
  void queue
    .close()
    .then(() => connection.quit())
    .then(() => process.exit(0));
});
