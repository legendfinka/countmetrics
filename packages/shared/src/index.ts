import { z } from "zod";

export * from "./auth.js";
export * from "./errors.js";
export * from "./events.js";
export * from "./live.js";
export * from "./stats.js";
export * from "./sites.js";

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
