import { Prisma } from "@prisma/client";
import type { LoginInput, PublicUser, RegisterInput } from "@countmetrics/shared";
import type { Config } from "../../config.js";
import { conflict, unauthorized } from "../../lib/errors.js";
import { burnPasswordCheck, hashPassword, verifyPassword } from "../../lib/password.js";
import { generateRefreshToken, hashToken } from "../../lib/tokens.js";
import type { AuthRepository } from "./auth.repository.js";

export interface Session {
  accessToken: string;
  user: PublicUser;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface Deps {
  repo: AuthRepository;
  config: Pick<Config, "REFRESH_TOKEN_TTL_DAYS">;
  signAccessToken: (userId: string) => string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toPublicUser = (u: { id: string; email: string; name: string }): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
});

export function createAuthService({ repo, config, signAccessToken }: Deps) {
  const invalidCredentials = () => unauthorized("INVALID_CREDENTIALS", "Invalid email or password");
  const invalidRefresh = () => unauthorized("INVALID_REFRESH_TOKEN", "Invalid refresh token");

  function newRefreshToken(userId: string) {
    const token = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
    return { token, record: { userId, tokenHash: hashToken(token), expiresAt } };
  }

  async function startSession(user: PublicUser): Promise<Session> {
    const { token, record } = newRefreshToken(user.id);
    await repo.createRefreshToken(record);
    return {
      accessToken: signAccessToken(user.id),
      user,
      refreshToken: token,
      refreshExpiresAt: record.expiresAt,
    };
  }

  return {
    async register(input: RegisterInput): Promise<Session> {
      if (await repo.findUserByEmail(input.email)) {
        throw conflict("EMAIL_TAKEN", "Email is already registered");
      }
      try {
        const user = await repo.createUser({
          email: input.email,
          name: input.name,
          passwordHash: await hashPassword(input.password),
        });
        return await startSession(toPublicUser(user));
      } catch (err) {
        // Two people registered the same email at the same time
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw conflict("EMAIL_TAKEN", "Email is already registered");
        }
        throw err;
      }
    },

    async login(input: LoginInput): Promise<Session> {
      const user = await repo.findUserByEmail(input.email);
      if (!user) {
        await burnPasswordCheck(input.password);
        throw invalidCredentials();
      }
      if (!(await verifyPassword(user.passwordHash, input.password))) throw invalidCredentials();
      return startSession(toPublicUser(user));
    },

    /** Each refresh token works once. Reusing an old one logs the user out everywhere. */
    async refresh(rawToken: string): Promise<Session> {
      const current = await repo.findRefreshTokenByHash(hashToken(rawToken));
      if (!current) throw invalidRefresh();

      if (current.revokedAt) {
        await repo.revokeAllForUser(current.userId);
        throw invalidRefresh();
      }
      if (current.expiresAt <= new Date()) throw invalidRefresh();

      const { token, record } = newRefreshToken(current.userId);
      if (!(await repo.rotateRefreshToken(current.id, record))) {
        await repo.revokeAllForUser(current.userId);
        throw invalidRefresh();
      }
      return {
        accessToken: signAccessToken(current.userId),
        user: toPublicUser(current.user),
        refreshToken: token,
        refreshExpiresAt: record.expiresAt,
      };
    },

    /** Safe to call twice. Unknown or revoked tokens are ignored. */
    async logout(rawToken: string | undefined): Promise<void> {
      if (rawToken) await repo.revokeByHash(hashToken(rawToken));
    },

    async getUser(id: string): Promise<PublicUser> {
      const user = await repo.findUserById(id);
      if (!user) throw unauthorized("INVALID_ACCESS_TOKEN", "User no longer exists");
      return toPublicUser(user);
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
