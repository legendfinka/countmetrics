import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Site } from "@countmetrics/shared";
import {
  bearer,
  createTestContext,
  registerUser,
  resetDb,
  type TestContext,
} from "../../../test/helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());
beforeEach(() => resetDb(ctx.prisma));

async function createSite(accessToken: string, domain = "example.com"): Promise<Site> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/sites",
    headers: bearer(accessToken),
    payload: { domain },
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ site: Site }>().site;
}

describe("authentication", () => {
  it("requires a token on every route", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const calls = [
      { method: "GET", url: "/api/sites" },
      { method: "POST", url: "/api/sites", payload: { domain: "example.com" } },
      { method: "GET", url: `/api/sites/${id}` },
      { method: "PATCH", url: `/api/sites/${id}`, payload: { domain: "example.com" } },
      { method: "DELETE", url: `/api/sites/${id}` },
    ] as const;

    for (const call of calls) {
      const res = await ctx.app.inject(call);
      expect(res.statusCode, `${call.method} ${call.url}`).toBe(401);
    }
  });
});

describe("create and list", () => {
  it("creates a site with a public siteKey", async () => {
    const { accessToken } = await registerUser(ctx.app);
    const site = await createSite(accessToken, "Example.COM");
    expect(site.domain).toBe("example.com");
    expect(site.siteKey).toMatch(/^cm_[\w-]{12}$/);
  });

  it("generates a unique siteKey per site", async () => {
    const { accessToken } = await registerUser(ctx.app);
    const a = await createSite(accessToken, "a.com");
    const b = await createSite(accessToken, "b.com");
    expect(a.siteKey).not.toBe(b.siteKey);
  });

  it("lists only the current user's sites", async () => {
    const alice = await registerUser(ctx.app, "alice@example.com");
    const bob = await registerUser(ctx.app, "bob@example.com");
    await createSite(alice.accessToken, "alice.com");
    await createSite(bob.accessToken, "bob.com");

    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/sites",
      headers: bearer(alice.accessToken),
    });
    const { sites } = res.json<{ sites: Site[] }>();
    expect(sites.map((s) => s.domain)).toEqual(["alice.com"]);
  });

  it.each(["http://example.com", "example.com/path", "exa mple.com", "", "-bad.com"])(
    "rejects invalid domain %j",
    async (domain) => {
      const { accessToken } = await registerUser(ctx.app);
      const res = await ctx.app.inject({
        method: "POST",
        url: "/api/sites",
        headers: bearer(accessToken),
        payload: { domain },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    },
  );
});

describe("ownership", () => {
  it("returns 404 (not 403) when another user accesses the site", async () => {
    const alice = await registerUser(ctx.app, "alice@example.com");
    const bob = await registerUser(ctx.app, "bob@example.com");
    const site = await createSite(alice.accessToken);

    const get = await ctx.app.inject({
      method: "GET",
      url: `/api/sites/${site.id}`,
      headers: bearer(bob.accessToken),
    });
    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/api/sites/${site.id}`,
      headers: bearer(bob.accessToken),
      payload: { domain: "evil.com" },
    });
    const del = await ctx.app.inject({
      method: "DELETE",
      url: `/api/sites/${site.id}`,
      headers: bearer(bob.accessToken),
    });

    for (const res of [get, patch, del]) {
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe("SITE_NOT_FOUND");
    }
    // The site did not change
    const stored = await ctx.prisma.site.findUniqueOrThrow({ where: { id: site.id } });
    expect(stored.domain).toBe("example.com");
  });

  it("lets the owner read, update and delete", async () => {
    const { accessToken } = await registerUser(ctx.app);
    const site = await createSite(accessToken);
    const headers = bearer(accessToken);

    const get = await ctx.app.inject({ method: "GET", url: `/api/sites/${site.id}`, headers });
    expect(get.statusCode).toBe(200);

    const patch = await ctx.app.inject({
      method: "PATCH",
      url: `/api/sites/${site.id}`,
      headers,
      payload: { domain: "new.example.com" },
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json().site.domain).toBe("new.example.com");
    expect(patch.json().site.siteKey).toBe(site.siteKey);

    const del = await ctx.app.inject({ method: "DELETE", url: `/api/sites/${site.id}`, headers });
    expect(del.statusCode).toBe(204);
    expect(await ctx.prisma.site.count()).toBe(0);
  });

  it("returns 400 for a malformed site id", async () => {
    const { accessToken } = await registerUser(ctx.app);
    const res = await ctx.app.inject({
      method: "GET",
      url: "/api/sites/not-a-uuid",
      headers: bearer(accessToken),
    });
    expect(res.statusCode).toBe(400);
  });
});
