import type { FastifyPluginAsync } from "fastify";
import { createSiteSchema, siteIdParamsSchema, updateSiteSchema } from "@countmetrics/shared";
import { authenticate } from "../../lib/authenticate.js";
import type { SitesService } from "./sites.service.js";

export function sitesRoutes({ service }: { service: SitesService }): FastifyPluginAsync {
  return async (app) => {
    // Every site route requires a logged-in user; ownership is checked in the service.
    app.addHook("preHandler", authenticate);

    app.get("/", async (request) => ({ sites: await service.list(request.user.sub) }));

    app.post("/", async (request, reply) => {
      const { domain } = createSiteSchema.parse(request.body);
      const site = await service.create(request.user.sub, domain);
      return reply.code(201).send({ site });
    });

    app.get("/:id", async (request) => {
      const { id } = siteIdParamsSchema.parse(request.params);
      return { site: await service.get(request.user.sub, id) };
    });

    app.patch("/:id", async (request) => {
      const { id } = siteIdParamsSchema.parse(request.params);
      const { domain } = updateSiteSchema.parse(request.body);
      return { site: await service.update(request.user.sub, id, domain) };
    });

    app.delete("/:id", async (request, reply) => {
      const { id } = siteIdParamsSchema.parse(request.params);
      await service.remove(request.user.sub, id);
      return reply.code(204).send();
    });
  };
}
