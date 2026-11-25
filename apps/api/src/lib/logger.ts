import type { FastifyRequest } from "fastify";

/** Fastify logs the visitor's IP by default. We log only what was asked for. */
export const loggerOptions = {
  serializers: {
    req: (request: FastifyRequest) => ({ method: request.method, url: request.url }),
  },
};
