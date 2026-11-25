import { z } from "zod";

// Hostname only (no scheme, path or port). "localhost" is allowed for local testing.
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

/** Turns a pasted address like "https://example.com:80/page" into "example.com". */
const toHostname = (input: string) =>
  input
    .replace(/^https?:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "");

export const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform(toHostname)
  .pipe(z.string().max(253).regex(HOSTNAME, "Must be an address like example.com"));

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
