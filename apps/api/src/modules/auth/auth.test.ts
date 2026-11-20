import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AuthResponse } from "@countmetrics/shared";
import {
  bearer,
  createTestContext,
  registerUser,
  resetDb,
  type TestContext,
} from "../../../test/helpers.js";
import { hashToken } from "../../lib/tokens.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.prisma));

const refresh = (token?: string) =>
  ctx.app.inject({
    method: "POST",
    url: "/api/auth/refresh",
    cookies: token ? { refresh_token: token } : {},
  });

describe("register", () => {
  it("creates a user, returns an access token and sets an httpOnly refresh cookie", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "Alice@Example.com", password: "password123", name: "Alice" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json<AuthResponse>();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user).toMatchObject({ email: "alice@example.com", name: "Alice" });
    expect(res.body).not.toContain("passwordHash");

    const cookie = res.cookies.find((c) => c.name === "refresh_token");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("stores the password and refresh token hashed", async () => {
    const { refreshToken } = await registerUser(ctx.app);

    const user = await ctx.prisma.user.findFirstOrThrow();
    expect(user.passwordHash).not.toContain("password123");

    const stored = await ctx.prisma.refreshToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(refreshToken);
    expect(stored.tokenHash).toBe(hashToken(refreshToken));
  });

  it("rejects a duplicate email with 409", async () => {
    await registerUser(ctx.app);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "alice@example.com", password: "password123", name: "Other" },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects invalid input with the standard error shape", async () => {
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", password: "short", name: "" },
    });
    expect(res.statusCode).toBe(400);
    const { error } = res.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "email" })]),
    );
  });
});

describe("login", () => {
  it("logs in with correct credentials", async () => {
    await registerUser(ctx.app);
    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice@example.com", password: "password123" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AuthResponse>().accessToken).toEqual(expect.any(String));
    expect(res.cookies.some((c) => c.name === "refresh_token")).toBe(true);
  });

  it("returns the same 401 for a wrong password and an unknown email", async () => {
    await registerUser(ctx.app);
    const wrongPassword = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "alice@example.com", password: "wrong-password" },
    });
    const unknownEmail = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@example.com", password: "password123" },
    });
    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownEmail.json());
  });
});

describe("me", () => {
  it("returns the current user for a valid token", async () => {
    const { accessToken } = await registerUser(ctx.app);
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: bearer(accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().user.email).toBe("alice@example.com");
  });

  it("returns 401 without or with a bad token", async () => {
    const none = await ctx.app.inject({ method: "GET", url: "/api/auth/me" });
    const bad = await ctx.app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: bearer("garbage"),
    });
    expect(none.statusCode).toBe(401);
    expect(bad.statusCode).toBe(401);
    expect(none.json().error.code).toBe("INVALID_ACCESS_TOKEN");
  });
});

describe("refresh rotation", () => {
  it("issues a new refresh token and invalidates the old one", async () => {
    const { refreshToken: first } = await registerUser(ctx.app);

    const res = await refresh(first);
    expect(res.statusCode).toBe(200);
    const second = res.cookies.find((c) => c.name === "refresh_token")?.value;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    expect((await refresh(second)).statusCode).toBe(200);
  });

  it("revokes every session of the user when a revoked token is reused", async () => {
    const { refreshToken: first } = await registerUser(ctx.app);
    const second = (await refresh(first)).cookies.find((c) => c.name === "refresh_token")?.value;

    // Using the old token again looks like theft
    expect((await refresh(first)).statusCode).toBe(401);
    // So the new token stops working too
    expect((await refresh(second)).statusCode).toBe(401);
  });

  it("rejects a missing, unknown or expired token", async () => {
    const { refreshToken } = await registerUser(ctx.app);
    expect((await refresh()).statusCode).toBe(401);
    expect((await refresh("unknown-token")).statusCode).toBe(401);

    await ctx.prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await refresh(refreshToken)).statusCode).toBe(401);
  });
});

describe("logout", () => {
  it("revokes the refresh token and clears the cookie", async () => {
    const { refreshToken } = await registerUser(ctx.app);

    const res = await ctx.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      cookies: { refresh_token: refreshToken },
    });
    expect(res.statusCode).toBe(204);

    const stored = await ctx.prisma.refreshToken.findFirstOrThrow();
    expect(stored.revokedAt).not.toBeNull();
    expect((await refresh(refreshToken)).statusCode).toBe(401);
  });

  it("is idempotent without a cookie", async () => {
    const res = await ctx.app.inject({ method: "POST", url: "/api/auth/logout" });
    expect(res.statusCode).toBe(204);
  });
});
