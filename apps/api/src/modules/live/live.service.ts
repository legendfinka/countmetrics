import { LIVE_CLOSE } from "@countmetrics/shared";
import type { SitesRepository } from "../sites/sites.repository.js";
import type { LiveHub } from "./live-hub.js";

interface TokenPayload {
  sub: string;
  /** Expiry time in seconds */
  exp: number;
}

interface Deps {
  sites: Pick<SitesRepository, "findOwned">;
  hub: LiveHub;
  /** Returns the payload of a valid token, or null */
  verifyToken: (token: string) => TokenPayload | null;
}

export type AuthResult =
  | { ok: true; /** When the token expires (ms) */ expiresAt: number }
  | { ok: false; code: number; reason: string };

export function createLiveService({ sites, hub, verifyToken }: Deps) {
  return {
    /** Checks the token and that the user owns the site. */
    async authorize(token: string, siteId: string): Promise<AuthResult> {
      const payload = verifyToken(token);
      if (!payload) {
        return { ok: false, code: LIVE_CLOSE.UNAUTHORIZED, reason: "Invalid or expired token" };
      }
      if (!(await sites.findOwned(payload.sub, siteId))) {
        return { ok: false, code: LIVE_CLOSE.SITE_NOT_FOUND, reason: "Site not found" };
      }
      return { ok: true, expiresAt: payload.exp * 1000 };
    },

    subscribe: hub.subscribe,
  };
}

export type LiveService = ReturnType<typeof createLiveService>;
