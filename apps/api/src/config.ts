import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  CORS_ORIGIN: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_IP_PER_MIN: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_SITE_PER_MIN: z.coerce.number().int().positive().default(60_000),
  /** Number of reverse proxies in front of the API (0 = none). Needed for the real client IP. */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
});

export type Config = z.infer<typeof envSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
