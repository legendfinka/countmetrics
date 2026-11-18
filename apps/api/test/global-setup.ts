import { execSync } from "node:child_process";

/** Applies migrations to the test database once before all tests. */
export default function setup(): void {
  const testUrl = process.env.DATABASE_URL_TEST;
  if (!testUrl) throw new Error("DATABASE_URL_TEST is not set (see .env.example)");
  // Tests wipe tables; never let them touch the dev database.
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
  }
  execSync("pnpm exec prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
}
