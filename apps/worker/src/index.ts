import { loadConfig } from "./config.js";

const config = loadConfig();
console.log(
  `worker started (batch=${config.WORKER_BATCH_SIZE}, flush=${config.WORKER_FLUSH_INTERVAL_MS}ms)`,
);
// Queue processing lands in step 4.
