import type { FastifyPluginAsync } from "fastify";
import { siteIdParamsSchema } from "@countmetrics/shared";
import { authenticate } from "../../lib/authenticate.js";
import type { SimulatorService } from "./simulator.service.js";

/**
 * Registered with the prefix /api/sites/:id/simulate
 * There is no request body on purpose: the caller can't choose a target or a size.
 */
export function simulatorRoutes({ service }: { service: SimulatorService }): FastifyPluginAsync {
  return async (app) => {
    // A simulation needs a logged-in user. The service checks who owns the site.
    app.addHook("preHandler", authenticate);

    app.post("/", async (request, reply) => {
      const { id } = siteIdParamsSchema.parse(request.params);
      return reply.code(202).send(await service.start(request.user.sub, id));
    });

    app.get("/", async (request) => {
      const { id } = siteIdParamsSchema.parse(request.params);
      return service.status(request.user.sub, id);
    });
  };
}
