import { execSync } from "node:child_process";

/** Runs the migrations (they live in apps/api) on the test database. */
export default function setup(): void {
  const testUrl = process.env.DATABASE_URL_TEST;
  const testRedisUrl = process.env.REDIS_URL_TEST;
  if (!testUrl) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  if (!testRedisUrl) throw new Error("REDIS_URL_TEST is not set (see .env.example)");
  // Tests delete data. Never let them touch the dev data.
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
  }
  if (testRedisUrl === process.env.REDIS_URL) {
    throw new Error("REDIS_URL_TEST must differ from REDIS_URL (use a different db number)");
  }
  execSync("pnpm --filter api exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
