import type { FastifyError, FastifyInstance } from "fastify";
import { ZodError } from "zod";
import type { ErrorResponse } from "@countmetrics/shared";
import { AppError } from "../lib/errors.js";

function body(code: string, message: string, details?: unknown): ErrorResponse {
  return { error: details === undefined ? { code, message } : { code, message, details } };
}

/** One error shape for the whole API: { error: { code, message, details? } } */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler<FastifyError>((err, request, reply) => {
    if (err instanceof AppError) {
      if (err.headers) reply.headers(err.headers);
      return reply.code(err.statusCode).send(body(err.code, err.message, err.details));
    }

    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return reply.code(400).send(body("VALIDATION_ERROR", "Invalid request", details));
    }

    // Fastify's own client errors (malformed JSON, 429 from rate limit, ...)
    if (err.statusCode && err.statusCode >= 400 && err.statusCode < 500) {
      return reply.code(err.statusCode).send(body(err.code ?? "BAD_REQUEST", err.message));
    }

    request.log.error(err);
    return reply.code(500).send(body("INTERNAL_ERROR", "Internal server error"));
  });

  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(body("NOT_FOUND", "Route not found")),
  );
}
