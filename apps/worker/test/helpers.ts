import { randomUUID } from "node:crypto";
import { Redis, type RedisOptions } from "ioredis";
import pg from "pg";
import type { EnrichedEvent } from "@countmetrics/shared";
import type { Logger } from "../src/flush.js";

export const dbUrl = process.env.DATABASE_URL_TEST ?? "";
export const redisUrl = process.env.REDIS_URL_TEST ?? "";

export const silentLog: Logger = { info() {}, warn() {}, error() {} };

export const createPool = (): pg.Pool => new pg.Pool({ connectionString: dbUrl, max: 5 });
export const createRedis = (options?: RedisOptions): Redis => new Redis(redisUrl, options ?? {});

/** Deleting users cascades to sites, events and stats. */
export async function resetAll(pool: pg.Pool, redis: Redis): Promise<void> {
  await pool.query(`DELETE FROM "User"`);
  await pool.query(`DELETE FROM "ProcessedJob"`);
  await redis.flushdb();
}

/** Inserts a user and a site with raw SQL (Prisma generates ids in the client, not the DB). */
export async function createSite(pool: pg.Pool): Promise<string> {
  const userId = randomUUID();
  const siteId = randomUUID();
  await pool.query(
    `INSERT INTO "User" ("id", "email", "passwordHash", "name") VALUES ($1, $2, 'x', 'Fixture')`,
    [userId, `${userId}@example.com`],
  );
  await pool.query(
    `INSERT INTO "Site" ("id", "userId", "domain", "siteKey") VALUES ($1, $2, 'example.com', $3)`,
    [siteId, userId, `cm_${siteId.slice(0, 12)}`],
  );
  return siteId;
}

/** A 32-character visitor hash for visitor number n. */
export const visitor = (n: number): string => String(n).padStart(32, "0");

export function makeEvent(siteId: string, overrides: Partial<EnrichedEvent> = {}): EnrichedEvent {
  return {
    siteId,
    type: "pageview",
    path: "/",
    referrer: null,
    country: "DE",
    device: "desktop",
    browser: "Chrome",
    visitorHash: visitor(1),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

export async function waitFor(check: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  while (!(await check())) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

export async function countRows(pool: pg.Pool, table: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`SELECT count(*) AS n FROM "${table}"`);
  return Number(rows[0]?.n);
}
