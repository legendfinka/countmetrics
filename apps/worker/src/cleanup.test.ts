import { randomUUID } from "node:crypto";
import type pg from "pg";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPool, createRedis, createSite, resetAll, silentLog } from "../test/helpers.js";
import { runCleanup } from "./cleanup.js";

let pool: pg.Pool;
let redis: Redis;
let userId: string;

beforeAll(() => {
  pool = createPool();
  redis = createRedis();
});
afterAll(async () => {
  await redis.quit();
  await pool.end();
});
beforeEach(async () => {
  await resetAll(pool, redis);
  const siteId = await createSite(pool);
  const { rows } = await pool.query<{ userId: string }>(
    `SELECT "userId" FROM "Site" WHERE "id" = $1`,
    [siteId],
  );
  userId = rows[0]!.userId;
});

const MINUTE_MS = 60_000;

/** Saves a token the way Prisma does: UTC time without a timezone. */
async function addToken(name: string, expiresInMs: number, revoked = false) {
  await pool.query(
    `INSERT INTO "RefreshToken" ("id", "userId", "tokenHash", "expiresAt", "revokedAt")
     VALUES ($1, $2, $3, $4::timestamptz AT TIME ZONE 'UTC',
             CASE WHEN $5 THEN now() AT TIME ZONE 'UTC' END)`,
    [randomUUID(), userId, name, new Date(Date.now() + expiresInMs).toISOString(), revoked],
  );
}

async function tokenNames() {
  const { rows } = await pool.query<{ tokenHash: string }>(
    `SELECT "tokenHash" FROM "RefreshToken" ORDER BY "tokenHash"`,
  );
  return rows.map((row) => row.tokenHash);
}

describe("cleanup", () => {
  it("deletes only expired tokens, and keeps used ones that have not expired", async () => {
    // One minute on each side, so a timezone mistake would show
    await addToken("expired", -MINUTE_MS);
    await addToken("expired-and-used", -MINUTE_MS, true);
    await addToken("still-valid", MINUTE_MS);
    await addToken("used-but-not-expired", MINUTE_MS, true);

    await runCleanup(pool, silentLog);

    expect(await tokenNames()).toEqual(["still-valid", "used-but-not-expired"]);
  });

  it("runs the other cleanup when one fails", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("ProcessedJob")) throw new Error("broken");
      return { rowCount: 0 };
    });
    const error = vi.fn();

    await runCleanup({ query } as unknown as pg.Pool, { ...silentLog, error });

    expect(query).toHaveBeenCalledTimes(2);
    expect(error).toHaveBeenCalledWith("processed job cleanup failed", expect.any(Error));
  });
});
