import Fastify from "fastify";
import type { HealthResponse } from "@countmetrics/shared";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = Fastify({ logger: true });

app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));

try {
  await app.listen({ port: config.API_PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
