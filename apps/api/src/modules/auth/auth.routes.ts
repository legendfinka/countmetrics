import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { loginSchema, registerSchema, type AuthResponse } from "@countmetrics/shared";
import type { Config } from "../../config.js";
import { authenticate } from "../../lib/authenticate.js";
import { unauthorized } from "../../lib/errors.js";
import type { AuthService, Session } from "./auth.service.js";

export const REFRESH_COOKIE = "refresh_token";
const COOKIE_PATH = "/api/auth";

interface Deps {
  service: AuthService;
  config: Pick<Config, "NODE_ENV">;
}

export function authRoutes({ service, config }: Deps): FastifyPluginAsync {
  // Web (Vercel) and API (Render) are different sites in production, so the cookie
  // must be SameSite=None; Secure there. Locally Lax over http is enough.
  const secure = config.NODE_ENV === "production";

  function sendSession(reply: FastifyReply, status: number, session: Session) {
    reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure,
      sameSite: secure ? "none" : "lax",
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    const body: AuthResponse = { accessToken: session.accessToken, user: session.user };
    return reply.code(status).send(body);
  }

  return async (app) => {
    app.post("/register", async (request, reply) => {
      const session = await service.register(registerSchema.parse(request.body));
      return sendSession(reply, 201, session);
    });

    app.post("/login", async (request, reply) => {
      const session = await service.login(loginSchema.parse(request.body));
      return sendSession(reply, 200, session);
    });

    app.post("/refresh", async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      if (!token) throw unauthorized("INVALID_REFRESH_TOKEN", "Missing refresh token");
      return sendSession(reply, 200, await service.refresh(token));
    });

    app.post("/logout", async (request, reply) => {
      await service.logout(request.cookies[REFRESH_COOKIE]);
      reply.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
      return reply.code(204).send();
    });

    app.get("/me", { preHandler: authenticate }, async (request) => {
      return { user: await service.getUser(request.user.sub) };
    });
  };
}
