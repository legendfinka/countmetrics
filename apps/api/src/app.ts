import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import Fastify, { type FastifyInstance } from "fastify";
import type { HealthResponse } from "@countmetrics/shared";
import type { Config } from "./config.js";
import { registerErrorHandler } from "./plugins/error-handler.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { createAuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthService } from "./modules/auth/auth.service.js";
import { sitesRoutes } from "./modules/sites/sites.routes.js";
import { createSitesRepository } from "./modules/sites/sites.repository.js";
import { createSitesService } from "./modules/sites/sites.service.js";

export interface AppDeps {
  config: Config;
  prisma: PrismaClient;
}

/** Builds the app without starting it, so tests can use `app.inject()`. */
export async function buildApp({ config, prisma }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: config.NODE_ENV !== "test" });

  registerErrorHandler(app);

  await app.register(cors, { origin: config.CORS_ORIGIN, credentials: true });
  await app.register(cookie);
  await app.register(jwt, { secret: config.JWT_SECRET });

  const authService = createAuthService({
    repo: createAuthRepository(prisma),
    config,
    signAccessToken: (sub) =>
      app.jwt.sign({ sub }, { expiresIn: config.ACCESS_TOKEN_TTL_SECONDS }),
  });
  const sitesService = createSitesService(createSitesRepository(prisma));

  app.get("/health", async (): Promise<HealthResponse> => ({ status: "ok" }));
  await app.register(authRoutes({ service: authService, config }), { prefix: "/api/auth" });
  await app.register(sitesRoutes({ service: sitesService }), { prefix: "/api/sites" });

  return app;
}
