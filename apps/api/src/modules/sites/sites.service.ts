import type { Site } from "@countmetrics/shared";
import { notFound } from "../../lib/errors.js";
import { generateSiteKey } from "../../lib/tokens.js";
import type { SitesRepository } from "./sites.repository.js";

const toSite = (s: { id: string; domain: string; siteKey: string; createdAt: Date }): Site => ({
  id: s.id,
  domain: s.domain,
  siteKey: s.siteKey,
  createdAt: s.createdAt.toISOString(),
});

export function createSitesService(repo: SitesRepository) {
  async function getOwned(userId: string, id: string) {
    const site = await repo.findOwned(userId, id);
    if (!site) throw notFound("SITE_NOT_FOUND", "Site not found");
    return site;
  }

  return {
    async list(userId: string): Promise<Site[]> {
      return (await repo.listByUser(userId)).map(toSite);
    },

    async get(userId: string, id: string): Promise<Site> {
      return toSite(await getOwned(userId, id));
    },

    async create(userId: string, domain: string): Promise<Site> {
      return toSite(await repo.create({ userId, domain, siteKey: generateSiteKey() }));
    },

    async update(userId: string, id: string, domain: string): Promise<Site> {
      await getOwned(userId, id);
      return toSite(await repo.updateDomain(id, domain));
    },

    async remove(userId: string, id: string): Promise<void> {
      await getOwned(userId, id);
      await repo.delete(id);
    },
  };
}

export type SitesService = ReturnType<typeof createSitesService>;
