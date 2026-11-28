import type { Pool } from "pg";
import type { Logger } from "./flush.js";
import { deleteExpiredRefreshTokens, deleteOldProcessedJobs } from "./repository.js";

/** Deletes rows nobody needs anymore. If one task fails, the others still run. */
export async function runCleanup(pool: Pool, log: Logger): Promise<void> {
  const tasks = [
    { name: "processed job", run: () => deleteOldProcessedJobs(pool) },
    { name: "refresh token", run: () => deleteExpiredRefreshTokens(pool) },
  ];
  await Promise.all(
    tasks.map(({ name, run }) =>
      run().catch((err: unknown) => log.error(`${name} cleanup failed`, err)),
    ),
  );
}
