import { defineConfig } from "vitest/config";

// Separate from vite.config.ts. Tests don't need the Tailwind or React plugins.
export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
