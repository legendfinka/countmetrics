import { randomUUID } from "node:crypto";
import { PrismaClient, type Site } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import type { AuthResponse, EnrichedEvent } from "@countmetrics/shared";
import { buildApp } from "../src/app.js";
import type { Config } from "../src/config.js";
import type { EventQueue } from "../src/modules/ingest/event-queue.js";

export const dbUrl = process.env.DATABASE_URL_TEST ?? "";
export const redisUrl = process.env.REDIS_URL_TEST ?? "";

export const testConfig: Config = {
  NODE_ENV: "test",
  API_PORT: 0,
  DATABASE_URL: dbUrl,
  REDIS_URL: redisUrl,
  CORS_ORIGIN: "http://localhost:5173",
  JWT_SECRET: "test-secret-test-secret-test-secret-1234",
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
  RATE_LIMIT_IP_PER_MIN: 600,
  RATE_LIMIT_SITE_PER_MIN: 60_000,
  TRUST_PROXY_HOPS: 0,
};

/** In-memory queue: each `enqueue` call (= one HTTP request) is one entry in `jobs`. */
export interface FakeQueue extends EventQueue {
  jobs: EnrichedEvent[][];
}

export function createFakeQueue(): FakeQueue {
  const jobs: EnrichedEvent[][] = [];
  return {
    jobs,
    enqueue: async (events) => {
      jobs.push(events);
    },
    close: async () => {},
  };
}

/** Deterministic country lookup so tests do not load the geoip database. */
export const TEST_IP = "203.0.113.5";
const testLookupCountry = (ip: string): string | null => (ip === TEST_IP ? "DE" : null);

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  redis: Redis;
  queue: FakeQueue;
  close: () => Promise<void>;
}

export async function createTestContext(overrides: Partial<Config> = {}): Promise<TestContext> {
  const prisma = new PrismaClient({ datasourceUrl: dbUrl });
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 2 });
  const queue = createFakeQueue();
  const app = await buildApp({
    config: { ...testConfig, ...overrides },
    prisma,
    redis,
    queue,
    lookupCountry: testLookupCountry,
  });
  return {
    app,
    prisma,
    redis,
    queue,
    close: async () => {
      await app.close();
      await redis.quit();
      await prisma.$disconnect();
    },
  };
}

/** Deleting users cascades to sites, refresh tokens, events and stats. */
export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.user.deleteMany();
}

/** Creates a user with one site that has a known siteKey. */
export async function createSiteFixture(
  prisma: PrismaClient,
  siteKey = "cm_testkey00001",
): Promise<Site> {
  const user = await prisma.user.create({
    data: { email: `${randomUUID()}@example.com`, passwordHash: "x", name: "Fixture" },
  });
  return prisma.site.create({ data: { userId: user.id, domain: "example.com", siteKey } });
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
