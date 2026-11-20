import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  /** Save when the buffer has this many events... */
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(500),
  /** ...or after this many milliseconds. Whichever comes first. */
  WORKER_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  /** Jobs handled at the same time. A job has 1-20 events.
   *  Keep this well above WORKER_BATCH_SIZE / 20, or the buffer never fills. */
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(200),
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
