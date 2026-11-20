import type { PrismaClient } from "@prisma/client";

export function createSitesRepository(prisma: PrismaClient) {
  return {
    listByUser: (userId: string) =>
      prisma.site.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),

    /** The owner check is in the query. Another user's site is just "not found". */
    findOwned: (userId: string, id: string) => prisma.site.findFirst({ where: { id, userId } }),

    create: (data: { userId: string; domain: string; siteKey: string }) =>
      prisma.site.create({ data }),

    updateDomain: (id: string, domain: string) =>
      prisma.site.update({ where: { id }, data: { domain } }),

    delete: (id: string) => prisma.site.delete({ where: { id } }),
  };
}

export type SitesRepository = ReturnType<typeof createSitesRepository>;
