import { Redis } from "ioredis";
import pg from "pg";
import { loadConfig } from "./config.js";
import { runCleanup } from "./cleanup.js";
import { createEventWorker } from "./worker.js";

const config = loadConfig();
const log = console;

const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
pool.on("error", (err) => log.error("postgres pool error", err));
const redis = new Redis(config.REDIS_URL);
// The BullMQ worker waits on this connection, so it needs maxRetriesPerRequest: null
const queueConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => log.error("redis error", err));

// Printing every save would slow the worker down, so we print totals now and then
const saved = { batches: 0, events: 0, failed: 0 };
const report = setInterval(() => {
  if (saved.batches === 0) return;
  log.info(
    `saved ${saved.events} events in ${saved.batches} batches${saved.failed ? ` (${saved.failed} jobs failed)` : ""}`,
  );
  Object.assign(saved, { batches: 0, events: 0, failed: 0 });
}, 5000);
report.unref();

const eventWorker = createEventWorker({
  config,
  pool,
  redis,
  queueConnection,
  log,
  onFlush: ({ events, failed }) => {
    saved.batches++;
    saved.events += events;
    saved.failed += failed;
  },
});

// Also at startup: a free server sleeps often and may never reach the first hour.
// The latest run is kept, so shutdown can wait for it before closing the database.
let cleaning = runCleanup(pool, log);
const cleanup = setInterval(() => {
  cleaning = runCleanup(pool, log);
}, 60 * 60 * 1000);
cleanup.unref();

log.info(
  `worker started (batch=${config.WORKER_BATCH_SIZE}, flush=${config.WORKER_FLUSH_INTERVAL_MS}ms, concurrency=${config.WORKER_CONCURRENCY})`,
);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`${signal} received, finishing the current batch`);
  clearInterval(cleanup);
  clearInterval(report);
  // runCleanup never throws, so this only waits
  await Promise.all([eventWorker.close(), cleaning]);
  await Promise.all([queueConnection.quit(), redis.quit(), pool.end()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
