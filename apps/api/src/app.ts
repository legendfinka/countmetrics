import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import cors, { type FastifyCorsOptions } from "@fastify/cors";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { Redis } from "ioredis";
import type { HealthResponse } from "@countmetrics/shared";
import type { Config } from "./config.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { createAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { lookupCountry as geoipLookupCountry } from "./modules/ingest/enrich.js";
import type { EventQueue } from "./modules/ingest/event-queue.js";
import { createIngestRepository } from "./modules/ingest/ingest.repository.js";
import { ingestRoutes } from "./modules/ingest/ingest.routes.js";
import { createIngestService } from "./modules/ingest/ingest.service.js";
import { createRateLimiter } from "./modules/ingest/rate-limiter.js";
import { createSiteKeyCache } from "./modules/ingest/site-key-cache.js";
import { createSaltProvider } from "./modules/ingest/visitor-hash.js";
import { createStatsCache } from "./modules/stats/stats-cache.js";
import { createStatsRepository } from "./modules/stats/stats.repository.js";
import { statsRoutes } from "./modules/stats/stats.routes.js";
import { createStatsService } from "./modules/stats/stats.service.js";
import { sitesRoutes } from "./modules/sites/sites.routes.js";
import { createSitesRepository } from "./modules/sites/sites.repository.js";
import { createSitesService } from "./modules/sites/sites.service.js";
import { trackerRoutes } from "./modules/tracker/tracker.routes.js";

export interface AppDeps {
  config: Config;
  prisma: PrismaClient;
  redis: Redis;
  queue: EventQueue;
  /** Tests replace this, so they don't load the geoip database. */
  lookupCountry?: (ip: string) => string | null;
  /** Clock for the stats. Tests set a fixed time. */
  now?: () => Date;
  /** The built tracker script. Tests use a temporary file. */
  trackerFile?: string;
}

const INGEST_PATH = "/api/event";
// From apps/api/src (or apps/api/dist) up to the repository root
const DEFAULT_TRACKER_FILE = fileURLToPath(
  new URL("../../../packages/tracker/dist/tracker.js", import.meta.url),
);

/** Builds the app but does not start it. Tests use app.inject(). */
export async function buildApp({
  config,
  prisma,
  redis,
  queue,
  lookupCountry = geoipLookupCountry,
  now,
  trackerFile = DEFAULT_TRACKER_FILE,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    // Trust only the closest N proxies. Then a client can't fake its IP.
    trustProxy:
      config.TRUST_PROXY_HOPS > 0 ? (_address, hop) => hop < config.TRUST_PROXY_HOPS : false,
  });

  registerErrorHandler(app);

  // The tracker runs on any website, so /api/event accepts every origin (no cookies).
  // All other routes only accept the dashboard origin.
  await app.register(cors, () => {
    return (
      request: FastifyRequest,
      callback: (error: Error | null, options?: FastifyCorsOptions) => void,
    ) => {
      callback(
        null,
        request.url.startsWith(INGEST_PATH)
          ? { origin: "*", methods: ["POST", "OPTIONS"], maxAge: 86_400 }
          : {
              origin: config.CORS_ORIGIN,
              credentials: true,
              methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
            },
      );
    };
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.JWT_SECRET });

  const authService = createAuthService({
    repo: createAuthRepository(prisma),
    config,
    signAccessToken: (sub) => app.jwt.sign({ sub }, { expiresIn: config.ACCESS_TOKEN_TTL_SECONDS }),
  });
  const sitesRepository = createSitesRepository(prisma);
  const sitesService = createSitesService(sitesRepository);
  const statsService = createStatsService({
    sites: sitesRepository,
    stats: createStatsRepository(prisma, redis),
    cache: createStatsCache(redis),
    now,
  });
  const ingestService = createIngestService({
    siteKeys: createSiteKeyCache(createIngestRepository(prisma).findSiteIdByKey),
    limiter: createRateLimiter(redis, {
      ipPerMin: config.RATE_LIMIT_IP_PER_MIN,
      sitePerMin: config.RATE_LIMIT_SITE_PER_MIN,
    }),
    salts: createSaltProvider(redis),
    queue,
    lookupCountry,
  });

  app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
  await app.register(authRoutes({ service: authService, config }), { prefix: "/api/auth" });
  await app.register(sitesRoutes({ service: sitesService }), { prefix: "/api/sites" });
  await app.register(ingestRoutes({ service: ingestService }), { prefix: INGEST_PATH });
  await app.register(statsRoutes({ service: statsService }), { prefix: "/api/sites/:id/stats" });
  await app.register(trackerRoutes({ file: trackerFile }));

  return app;
}
