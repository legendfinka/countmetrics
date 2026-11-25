import { createHmac } from "node:crypto";
import type { Redis } from "ioredis";
import { AppError } from "../../lib/errors.js";

export interface AuthLimits {
  /** Wrong passwords allowed for one email in 15 minutes */
  failedPerEmail: number;
  /** The IP limits are generous, because many visitors may share one IP (the web proxy) */
  loginsPerIpPerMin: number;
  registersPerIpPerMin: number;
}

export const AUTH_LIMITS: AuthLimits = {
  failedPerEmail: 5,
  loginsPerIpPerMin: 100,
  registersPerIpPerMin: 20,
};

const EMAIL_WINDOW_SECONDS = 15 * 60;
const IP_WINDOW_SECONDS = 60;

function tooManyAttempts(retryAfterSeconds: number): AppError {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return new AppError(
    429,
    "RATE_LIMITED",
    `Too many attempts. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
    undefined,
    { "retry-after": String(retryAfterSeconds) },
  );
}

/** Slows down password guessing and mass sign-ups. */
export function createLoginLimiter(redis: Redis, secret: string, limits: AuthLimits = AUTH_LIMITS) {
  // Redis only gets a keyed hash, never the email or the IP
  const keyFor = (kind: string, value: string) =>
    `cm:rl:auth:${kind}:${createHmac("sha256", secret).update(value).digest("hex").slice(0, 32)}`;

  /** Counts one try, and throws if there were too many. */
  async function count(key: string, limit: number, windowSeconds: number): Promise<void> {
    // One transaction. The window starts with the first try and is not made longer later.
    const results = await redis.multi().set(key, 0, "EX", windowSeconds, "NX").incr(key).ttl(key).exec();
    const failed = results?.find(([err]) => err);
    if (!results || failed) throw failed?.[0] ?? new Error("Login limit check failed");

    if (Number(results[1]?.[1]) > limit) {
      throw tooManyAttempts(Math.max(1, Number(results[2]?.[1])));
    }
  }

  const emailKey = (email: string) => keyFor("email", email);

  return {
    /**
     * Call before checking the password. The try is counted right away,
     * so many requests at the same time can't get around the limit.
     */
    async beforeLogin(ip: string, email: string): Promise<void> {
      await count(keyFor("login-ip", ip), limits.loginsPerIpPerMin, IP_WINDOW_SECONDS);
      await count(emailKey(email), limits.failedPerEmail, EMAIL_WINDOW_SECONDS);
    },

    /** A correct password starts the count for this email again. */
    async loginSucceeded(email: string): Promise<void> {
      await redis.del(emailKey(email));
    },

    beforeRegister: (ip: string) =>
      count(keyFor("register-ip", ip), limits.registersPerIpPerMin, IP_WINDOW_SECONDS),
  };
}

export type LoginLimiter = ReturnType<typeof createLoginLimiter>;
