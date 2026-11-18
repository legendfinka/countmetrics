import type { FastifyRequest } from "fastify";
import { unauthorized } from "./errors.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

/** preHandler: verifies the access token and sets `request.user.sub` (the user id). */
export async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized("INVALID_ACCESS_TOKEN", "Invalid or expired access token");
  }
}
