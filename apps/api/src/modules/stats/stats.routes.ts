import type { FastifyPluginAsync } from "fastify";
import {
  BREAKDOWN_KINDS,
  breakdownQuerySchema,
  siteIdParamsSchema,
  statsQuerySchema,
} from "@countmetrics/shared";
import { authenticate } from "../../lib/authenticate.js";
import type { StatsService } from "./stats.service.js";

/** Registered with the prefix /api/sites/:id/stats */
export function statsRoutes({ service }: { service: StatsService }): FastifyPluginAsync {
  return async (app) => {
    // All stats routes need a logged-in user. The service checks who owns the site.
    app.addHook("preHandler", authenticate);

    app.get("/overview", async (request) => {
      const { id } = siteIdParamsSchema.parse(request.params);
      const { range } = statsQuerySchema.parse(request.query);
      return service.overview(request.user.sub, id, range);
    });

    app.get("/timeseries", async (request) => {
      const { id } = siteIdParamsSchema.parse(request.params);
      const { range } = statsQuerySchema.parse(request.query);
      return service.timeseries(request.user.sub, id, range);
    });

    // /pages, /referrers, /countries, /devices, /browsers and /events
    for (const kind of BREAKDOWN_KINDS) {
      app.get(`/${kind}`, async (request) => {
        const { id } = siteIdParamsSchema.parse(request.params);
        const { range, limit } = breakdownQuerySchema.parse(request.query);
        return service.breakdown(request.user.sub, id, kind, range, limit);
      });
    }
  };
}
