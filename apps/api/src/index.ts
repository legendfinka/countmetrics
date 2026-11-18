import { PrismaClient } from "@prisma/client";
import { Redis } from "ioredis";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { preloadGeo } from "./modules/ingest/enrich.js";
import { createBullEventQueue } from "./modules/ingest/event-queue.js";

const config = loadConfig();
const prisma = new PrismaClient();
// Fail fast instead of hanging requests when Redis is down
const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: 2 });
const queue = createBullEventQueue(redis);

preloadGeo();
const app = await buildApp({ config, prisma, redis, queue });
redis.on("error", (err) => app.log.error({ err }, "redis error"));

async function shutdown(signal: string): Promise<void> {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  await queue.close();
  await redis.quit();
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
