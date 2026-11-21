import type { FastifyPluginAsync } from "fastify";
import {
  LIVE_CLOSE,
  liveClientMessageSchema,
  siteIdParamsSchema,
  type LiveClientMessage,
  type LiveServerMessage,
} from "@countmetrics/shared";
import type { LiveService } from "./live.service.js";

interface Deps {
  service: LiveService;
  /** How long the browser has to send its login message */
  authTimeoutMs?: number;
}

function parseLogin(raw: string): LiveClientMessage | null {
  try {
    const result = liveClientMessageSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Registered with the prefix /api/sites/:id/live */
export function liveRoutes({ service, authTimeoutMs = 5000 }: Deps): FastifyPluginAsync {
  return async (app) => {
    app.get("/", { websocket: true }, (socket, request) => {
      const params = siteIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        socket.close(LIVE_CLOSE.SITE_NOT_FOUND, "Site not found");
        return;
      }
      const siteId = params.data.id;

      let closed = false;
      let unsubscribe: (() => Promise<void>) | undefined;
      let expiryTimer: NodeJS.Timeout | undefined;

      const send = (message: LiveServerMessage) => {
        if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
      };

      // The first message must be the login. We wait only a short time for it.
      const authTimer = setTimeout(
        () => socket.close(LIVE_CLOSE.UNAUTHORIZED, "Login timeout"),
        authTimeoutMs,
      );

      // (The plugin already handles socket errors.)
      socket.on("close", () => {
        closed = true;
        clearTimeout(authTimer);
        clearTimeout(expiryTimer);
        void unsubscribe?.();
      });

      async function login(raw: string): Promise<void> {
        const message = parseLogin(raw);
        if (!message) {
          socket.close(LIVE_CLOSE.UNAUTHORIZED, "Send the login message first");
          return;
        }

        const result = await service.authorize(message.token, siteId);
        if (!result.ok) {
          socket.close(result.code, result.reason);
          return;
        }
        if (closed) return;

        const stop = await service.subscribe(siteId, (update) => send({ type: "update", ...update }));
        if (closed) {
          // The viewer left while we were subscribing
          await stop();
          return;
        }
        unsubscribe = stop;

        // The token is checked only once. So we close the socket when it expires.
        // The browser then gets a new token and reconnects.
        expiryTimer = setTimeout(
          () => socket.close(LIVE_CLOSE.UNAUTHORIZED, "Token expired"),
          Math.max(0, result.expiresAt - Date.now()),
        );
        send({ type: "ready" });
      }

      socket.once("message", (data) => {
        clearTimeout(authTimer);
        login(String(data)).catch(() => socket.close(1011, "Server error"));
      });
    });
  };
}
