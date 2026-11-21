import { z } from "zod";
import { siteUpdateMessageSchema } from "./events.js";

/** Close codes of the live WebSocket (4000-4999 are free to use). */
export const LIVE_CLOSE = {
  /** No login, a bad token, or the token expired. The client should renew it and reconnect. */
  UNAUTHORIZED: 4401,
  /** The site does not exist, or belongs to someone else. Do not reconnect. */
  SITE_NOT_FOUND: 4404,
} as const;

/** The first message of the browser. The token is not in the URL, because URLs end up in logs. */
export const liveClientMessageSchema = z.object({
  type: z.literal("auth"),
  token: z.string().min(1).max(2048),
});

export const liveServerMessageSchema = z.discriminatedUnion("type", [
  /** The login worked and updates will follow. */
  z.object({ type: z.literal("ready") }),
  siteUpdateMessageSchema.extend({ type: z.literal("update") }),
]);

export type LiveClientMessage = z.infer<typeof liveClientMessageSchema>;
export type LiveServerMessage = z.infer<typeof liveServerMessageSchema>;
