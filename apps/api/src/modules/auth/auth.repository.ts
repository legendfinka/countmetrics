import type { PrismaClient } from "@prisma/client";

export interface NewRefreshToken {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export function createAuthRepository(prisma: PrismaClient) {
  return {
    findUserByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

    findUserById: (id: string) => prisma.user.findUnique({ where: { id } }),

    createUser: (data: { email: string; passwordHash: string; name: string }) =>
      prisma.user.create({ data }),

    createRefreshToken: (data: NewRefreshToken) => prisma.refreshToken.create({ data }),

    findRefreshTokenByHash: (tokenHash: string) =>
      prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: true } }),

    /**
     * Revoke the old token and create the new one atomically.
     * Returns false if the old token was already revoked (reuse or a concurrent refresh).
     */
    rotateRefreshToken(oldId: string, next: NewRefreshToken): Promise<boolean> {
      return prisma.$transaction(async (tx) => {
        const revoked = await tx.refreshToken.updateMany({
          where: { id: oldId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        if (revoked.count === 0) return false;
        await tx.refreshToken.create({ data: next });
        return true;
      });
    },

    revokeAllForUser: (userId: string) =>
      prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),

    revokeByHash: (tokenHash: string) =>
      prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
  };
}

export type AuthRepository = ReturnType<typeof createAuthRepository>;
