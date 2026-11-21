import { afterEach, describe, expect, it, vi } from "vitest";
import { alice, apiError, mockApi, session } from "../test/helpers";
import { ApiError, api, setAccessToken, setSessionLostHandler } from "./api";

afterEach(() => setSessionLostHandler(null));

const tokenError = { status: 401, body: apiError("INVALID_ACCESS_TOKEN", "Invalid or expired access token") };

describe("api", () => {
  it("sends the token and the JSON body", async () => {
    setAccessToken("my-token");
    const server = mockApi({ "POST /api/sites": { status: 201, body: { ok: true } } });

    await api("/api/sites", { method: "POST", body: { domain: "example.com" } });

    const [call] = server.calls;
    expect(call?.headers.get("authorization")).toBe("Bearer my-token");
    expect(call?.headers.get("content-type")).toBe("application/json");
    expect(call?.body).toEqual({ domain: "example.com" });
  });

  it("renews the token only once when two requests get a 401 at the same time", async () => {
    setAccessToken("old-token");
    const server = mockApi({
      "POST /api/auth/refresh": { body: session },
      "GET /api/sites": (request) =>
        request.headers.get("authorization") === "Bearer token-1" ? { body: { sites: [] } } : tokenError,
    });

    const results = await Promise.all([api("/api/sites"), api("/api/sites")]);

    expect(results).toEqual([{ sites: [] }, { sites: [] }]);
    expect(server.count("POST /api/auth/refresh")).toBe(1);
  });

  it("throws the 401 and tells the app the session is lost when renewing fails", async () => {
    const onSessionLost = vi.fn();
    setSessionLostHandler(onSessionLost);
    setAccessToken("old-token");
    mockApi({
      "POST /api/auth/refresh": { status: 401, body: apiError("INVALID_REFRESH_TOKEN", "Invalid refresh token") },
      "GET /api/sites": tokenError,
    });

    await expect(api("/api/sites")).rejects.toMatchObject({ status: 401, code: "INVALID_ACCESS_TOKEN" });
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });

  it("does not try to renew the token for login (auth: false)", async () => {
    const server = mockApi({
      "POST /api/auth/login": { status: 401, body: apiError("INVALID_CREDENTIALS", "Invalid email or password") },
    });

    await expect(
      api("/api/auth/login", { method: "POST", body: { email: alice.email }, auth: false }),
    ).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(server.count("POST /api/auth/refresh")).toBe(0);
  });

  it("throws an ApiError with the code and details from the server", async () => {
    mockApi({
      "GET /api/sites": {
        status: 400,
        body: { error: { code: "VALIDATION_ERROR", message: "Invalid request", details: [{ path: "id" }] } },
      },
    });

    const error = await api("/api/sites").catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 400, code: "VALIDATION_ERROR", details: [{ path: "id" }] });
  });

  it("returns nothing for a 204 response", async () => {
    mockApi({ "DELETE /api/sites/1": { status: 204 } });
    await expect(api("/api/sites/1", { method: "DELETE" })).resolves.toBeUndefined();
  });
});
