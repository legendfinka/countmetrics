import { Redis } from "ioredis";
import pg from "pg";
import { loadConfig } from "./config.js";
import { deleteOldProcessedJobs } from "./repository.js";
import { createEventWorker } from "./worker.js";

const config = loadConfig();
const log = console;

const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 5 });
pool.on("error", (err) => log.error("postgres pool error", err));
const redis = new Redis(config.REDIS_URL);
// BullMQ's worker blocks on this connection, so it needs unlimited retries per request
const queueConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
redis.on("error", (err) => log.error("redis error", err));

const eventWorker = createEventWorker({
  config,
  pool,
  redis,
  queueConnection,
  log,
  onFlush: ({ jobs, events, failed }) =>
    log.info(`flushed ${events} events from ${jobs} jobs${failed ? ` (${failed} failed)` : ""}`),
});

const cleanup = setInterval(
  () => {
    deleteOldProcessedJobs(pool).catch((err) => log.error("processed job cleanup failed", err));
  },
  60 * 60 * 1000,
);
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
  await eventWorker.close();
  await Promise.all([queueConnection.quit(), redis.quit(), pool.end()]);
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
