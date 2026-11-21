import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestContext, type TestContext } from "../test/helpers.js";

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(() => ctx.close());

describe("CORS for the dashboard", () => {
  it("allows the dashboard origin to use DELETE and PATCH, with cookies", async () => {
    for (const method of ["DELETE", "PATCH"]) {
      const res = await ctx.app.inject({
        method: "OPTIONS",
        url: "/api/sites/00000000-0000-4000-8000-000000000000",
        headers: {
          origin: "http://localhost:5173",
          "access-control-request-method": method,
        },
      });
      expect(res.statusCode).toBe(204);
      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
      expect(res.headers["access-control-allow-methods"]).toContain(method);
    }
  });
});
