import { DEMO_USER_ID, type Site } from "@countmetrics/shared";
import { forbidden, notFound } from "../../lib/errors.js";
import { generateSiteKey } from "../../lib/tokens.js";
import type { SitesRepository } from "./sites.repository.js";

const toSite = (s: { id: string; domain: string; siteKey: string; createdAt: Date }): Site => ({
  id: s.id,
  domain: s.domain,
  siteKey: s.siteKey,
  createdAt: s.createdAt.toISOString(),
});

/** Everybody shares the demo account, so nobody may change its sites. */
function assertNotDemo(userId: string): void {
  if (userId === DEMO_USER_ID) {
    throw forbidden("DEMO_READ_ONLY", "The demo account is read-only. Sign up to add your own sites.");
  }
}

export function createSitesService(
  repo: SitesRepository,
  /** Removes what Redis remembers about a site's visits */
  forgetStats: (siteId: string) => Promise<void>,
) {
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
      assertNotDemo(userId);
      return toSite(await repo.create({ userId, domain, siteKey: generateSiteKey() }));
    },

    async update(userId: string, id: string, domain: string): Promise<Site> {
      assertNotDemo(userId);
      await getOwned(userId, id);
      return toSite(await repo.updateDomain(id, domain));
    },

    async remove(userId: string, id: string): Promise<void> {
      assertNotDemo(userId);
      await getOwned(userId, id);
      await repo.delete(id);
    },

    async clearData(userId: string, id: string): Promise<void> {
      assertNotDemo(userId);
      await getOwned(userId, id);
      await repo.clearData(id);
      await forgetStats(id);
    },
  };
}

export type SitesService = ReturnType<typeof createSitesService>;
