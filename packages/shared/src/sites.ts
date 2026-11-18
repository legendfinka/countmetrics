import { z } from "zod";

// Hostname only (no scheme, path or port). "localhost" is allowed for local testing.
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(HOSTNAME, "Must be a hostname like example.com (no http://, path or port)");

export const createSiteSchema = z.object({ domain: domainSchema });
export const updateSiteSchema = z.object({ domain: domainSchema });
export const siteIdParamsSchema = z.object({ id: z.string().uuid() });

export const siteSchema = z.object({
  id: z.string().uuid(),
  domain: z.string(),
  siteKey: z.string(),
  createdAt: z.string(),
});

export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type Site = z.infer<typeof siteSchema>;
