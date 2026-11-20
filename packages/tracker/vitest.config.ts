import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // A fake browser, so tests can use window, document and history
    environment: "jsdom",
    environmentOptions: { jsdom: { url: "https://shop.example/start" } },
  },
});
