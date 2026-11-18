import type { PrismaClient } from "@prisma/client";

export function createIngestRepository(prisma: PrismaClient) {
  return {
    async findSiteIdByKey(siteKey: string): Promise<string | null> {
      const site = await prisma.site.findUnique({ where: { siteKey }, select: { id: true } });
      return site?.id ?? null;
    },
  };
}

export type IngestRepository = ReturnType<typeof createIngestRepository>;
