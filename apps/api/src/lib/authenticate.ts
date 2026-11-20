import type { FastifyRequest } from "fastify";
import { unauthorized } from "./errors.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

/** Checks the access token. Sets request.user.sub (the user id). */
export async function authenticate(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw unauthorized("INVALID_ACCESS_TOKEN", "Invalid or expired access token");
  }
}
