import type { FastifyPluginAsync } from "fastify";
import { parseIngestBody } from "@countmetrics/shared";
import { AppError } from "../../lib/errors.js";
import type { IngestService } from "./ingest.service.js";

const BODY_LIMIT_BYTES = 16 * 1024;

export function ingestRoutes({ service }: { service: IngestService }): FastifyPluginAsync {
  return async (app) => {
    // sendBeacon sends text/plain. This avoids a CORS preflight request.
    // So this route reads text/plain bodies as JSON.
    app.removeContentTypeParser("text/plain");
    app.addContentTypeParser("text/plain", { parseAs: "string" }, (_request, body, done) => {
      try {
        done(null, JSON.parse(body as string));
      } catch {
        done(new AppError(400, "INVALID_JSON", "Body is not valid JSON"));
      }
    });

    app.post("/", { bodyLimit: BODY_LIMIT_BYTES }, async (request, reply) => {
      await service.ingest({
        body: parseIngestBody(request.body),
        ip: request.ip,
        userAgent: request.headers["user-agent"] ?? "",
      });
      return reply.code(202).send();
    });
  };
}
