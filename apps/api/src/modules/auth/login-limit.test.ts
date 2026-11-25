import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestContext, registerUser, resetDb, type TestContext } from "../../../test/helpers.js";
import { AUTH_LIMITS } from "./login-limiter.js";

let ctx: TestContext;

beforeAll(async () => {
  // The real email limit, and small IP limits so the tests stay quick
  ctx = await createTestContext(
    {},
    { authLimits: { ...AUTH_LIMITS, loginsPerIpPerMin: 8, registersPerIpPerMin: 3 } },
  );
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.prisma);
  await ctx.redis.flushdb();
});

const login = (email: string, password = "wrong-password", remoteAddress = "203.0.113.10") =>
  ctx.app.inject({
    method: "POST",
    url: "/api/auth/login",
    remoteAddress,
    payload: { email, password },
  });

async function failTimes(times: number, email: string) {
  for (let i = 0; i < times; i++) expect((await login(email)).statusCode).toBe(401);
}

describe("login limit", () => {
  it("blocks an email after 5 wrong passwords, even with the right one and another IP", async () => {
    await registerUser(ctx.app);
    await failTimes(5, "alice@example.com");

    const res = await login("alice@example.com", "password123", "198.51.100.1");

    expect(res.statusCode).toBe(429);
    expect(res.json().error).toMatchObject({
      code: "RATE_LIMITED",
      message: "Too many attempts. Try again in 15 minutes.",
    });
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
  });

  it("treats an unknown email the same way", async () => {
    await failTimes(5, "nobody@example.com");
    expect((await login("nobody@example.com")).statusCode).toBe(429);
  });

  it("does not block other emails", async () => {
    await failTimes(5, "nobody@example.com");
    expect((await login("someone@example.com")).statusCode).toBe(401);
  });

  it("starts again after a correct password", async () => {
    await registerUser(ctx.app);
    await failTimes(4, "alice@example.com");
    expect((await login("alice@example.com", "password123")).statusCode).toBe(200);

    await failTimes(3, "alice@example.com");
  });

  it("holds when many tries arrive at once", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => login("race@example.com")));
    expect(results.filter((res) => res.statusCode === 401)).toHaveLength(5);
    expect(results.filter((res) => res.statusCode === 429)).toHaveLength(3);
  });

  it("limits all logins from one IP", async () => {
    for (let i = 0; i < 8; i++) expect((await login(`user${i}@example.com`)).statusCode).toBe(401);

    expect((await login("user9@example.com")).statusCode).toBe(429);
    expect((await login("user9@example.com", "x-password", "198.51.100.1")).statusCode).toBe(401);
  });

  it("never puts an email or IP into Redis", async () => {
    await login("secret@example.com");
    const keys = (await ctx.redis.keys("*")).join();
    expect(keys).toContain("cm:rl:auth:");
    expect(keys).not.toContain("secret@example.com");
    expect(keys).not.toContain("203.0.113.10");
  });
});

describe("registration limit", () => {
  it("limits sign-ups from one IP", async () => {
    for (let i = 0; i < 3; i++) await registerUser(ctx.app, `user${i}@example.com`);

    await expect(registerUser(ctx.app, "user4@example.com")).rejects.toThrow("RATE_LIMITED");
    expect(await ctx.prisma.user.count()).toBe(3);
  });
});
