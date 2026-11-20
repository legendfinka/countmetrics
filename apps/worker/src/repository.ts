import type { Pool, PoolClient } from "pg";
import type { EnrichedEvent } from "@countmetrics/shared";

// Raw SQL on purpose. One statement saves a whole batch (UNNEST), not one row at a time.
// Table and column names are the ones Prisma creates. They need quotes.
// Times are sent with a timezone and converted to UTC.
// Prisma's DateTime columns have no timezone and hold UTC.

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Saves job ids as done. Returns only the ids that were new. */
export async function claimJobs(client: PoolClient, jobIds: string[]): Promise<Set<string>> {
  const { rows } = await client.query<{ jobId: string }>(
    `INSERT INTO "ProcessedJob" ("jobId")
     SELECT unnest($1::text[])
     ON CONFLICT DO NOTHING
     RETURNING "jobId"`,
    [jobIds],
  );
  return new Set(rows.map((r) => r.jobId));
}

export async function insertEvents(client: PoolClient, events: EnrichedEvent[]): Promise<void> {
  await client.query(
    `INSERT INTO "Event"
       ("siteId", "type", "path", "referrer", "country", "device", "browser", "visitorHash", "createdAt")
     SELECT s, t, p, r, c, d, b, v, ts AT TIME ZONE 'UTC'
     FROM unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::text[],
       $6::text[], $7::text[], $8::text[], $9::timestamptz[]
     ) AS u(s, t, p, r, c, d, b, v, ts)`,
    [
      events.map((e) => e.siteId),
      events.map((e) => e.type),
      events.map((e) => e.path),
      events.map((e) => e.referrer),
      events.map((e) => e.country),
      events.map((e) => e.device),
      events.map((e) => e.browser),
      events.map((e) => e.visitorHash),
      events.map((e) => e.createdAt),
    ],
  );
}

export interface MinuteStatsRow {
  siteId: string;
  bucket: Date;
  pageviews: number;
  events: number;
  visitors: number;
}

/**
 * Adds this batch's counts to the minute rows.
 * "visitors" is approximate (HyperLogLog), so we keep the larger value. We don't add it up.
 */
export async function upsertMinuteStats(client: PoolClient, rows: MinuteStatsRow[]): Promise<void> {
  await client.query(
    `INSERT INTO "StatsMinute" ("siteId", "bucket", "pageviews", "visitors", "events")
     SELECT s, b AT TIME ZONE 'UTC', p, v, e
     FROM unnest($1::text[], $2::timestamptz[], $3::int[], $4::int[], $5::int[]) AS u(s, b, p, v, e)
     ON CONFLICT ("siteId", "bucket") DO UPDATE SET
       "pageviews" = "StatsMinute"."pageviews" + EXCLUDED."pageviews",
       "events"    = "StatsMinute"."events"    + EXCLUDED."events",
       "visitors"  = GREATEST("StatsMinute"."visitors", EXCLUDED."visitors")`,
    [
      rows.map((r) => r.siteId),
      rows.map((r) => r.bucket.toISOString()),
      rows.map((r) => r.pageviews),
      rows.map((r) => r.visitors),
      rows.map((r) => r.events),
    ],
  );
}

/** Job ids are only needed while a job can still come back. */
export async function deleteOldProcessedJobs(pool: Pool, olderThanHours = 24): Promise<number> {
  const result = await pool.query(
    `DELETE FROM "ProcessedJob" WHERE "processedAt" < now() - make_interval(hours => $1)`,
    [olderThanHours],
  );
  return result.rowCount ?? 0;
}
