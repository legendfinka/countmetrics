import { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { AuthResponse } from "@countmetrics/shared";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";

const dbUrl = process.env.DATABASE_URL_TEST ?? "";

export const testConfig: Config = {
  NODE_ENV: "test",
  API_PORT: 0,
  DATABASE_URL: dbUrl,
  REDIS_URL: "redis://localhost:6379",
  CORS_ORIGIN: "http://localhost:5173",
  JWT_SECRET: "test-secret-test-secret-test-secret-1234",
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
};

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  close: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const prisma = new PrismaClient({ datasourceUrl: dbUrl });
  const app = await buildApp({ config: testConfig, prisma });
  return {
    app,
    prisma,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

/** Deleting users cascades to sites, refresh tokens, events and stats. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.user.deleteMany();
}

export interface RegisteredUser extends AuthResponse {
  refreshToken: string;
}

export async function registerUser(
  app: FastifyInstance,
  email = "alice@example.com",
): Promise<RegisteredUser> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, password: "password123", name: "Test User" },
  });
  if (res.statusCode !== 201) throw new Error(`register failed: ${res.body}`);
  const cookie = res.cookies.find((c) => c.name === "refresh_token");
  if (!cookie) throw new Error("refresh cookie missing");
  return { ...res.json<AuthResponse>(), refreshToken: cookie.value };
}

export const bearer = (accessToken: string) => ({ authorization: `Bearer ${accessToken}` });
