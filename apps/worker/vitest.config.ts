import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./test/global-setup.ts"],
    // All test files share one database and one Redis db, so they must not run in parallel.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
