import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  LIVE_CLOSE,
  siteUpdateChannel,
  type Site,
  type SiteUpdateMessage,
} from "@countmetrics/shared";
import {
  bearer,
  createTestContext,
  registerUser,
  resetDb,
  waitFor,
  type RegisteredUser,
  type TestContext,
} from "../../../test/helpers.js";

let ctx: TestContext;
let open: WebSocket[] = [];

beforeAll(async () => {
  // A short login time, so the timeout test is fast
  ctx = await createTestContext({}, { liveAuthTimeoutMs: 300 });
  await ctx.app.ready();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDb(ctx.prisma);
  await ctx.redis.flushdb();
});
afterEach(() => {
  for (const socket of open) socket.terminate();
  open = [];
});

async function createSite(user: RegisteredUser): Promise<string> {
  const res = await ctx.app.inject({
    method: "POST",
    url: "/api/sites",
    headers: bearer(user.accessToken),
    payload: { domain: "example.com" },
  });
  return res.json<{ site: Site }>().site.id;
}

async function connect(siteId: string) {
  const ws = await ctx.app.injectWS(`/api/sites/${siteId}/live`);
  open.push(ws);

  const messages: unknown[] = [];
  ws.on("message", (data) => messages.push(JSON.parse(String(data))));
  const closed = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.on("close", (code, reason) => resolve({ code, reason: String(reason) }));
  });

  return {
    ws,
    messages,
    closed,
    login: (token: string) => ws.send(JSON.stringify({ type: "auth", token })),
  };
}

const update = (siteId: string): SiteUpdateMessage => ({
  siteId,
  currentVisitors: 3,
  pageviews: 2,
  events: 1,
  at: "2026-03-10T12:00:00.000Z",
});

const publish = (siteId: string, message: unknown) =>
  ctx.redis.publish(siteUpdateChannel(siteId), JSON.stringify(message));

async function listeners(siteId: string): Promise<number> {
  const result = (await ctx.redis.pubsub("NUMSUB", siteUpdateChannel(siteId))) as [string, number];
  return Number(result[1]);
}

describe("login", () => {
  it("sends ready after a valid login, then the updates of the site", async () => {
    const alice = await registerUser(ctx.app);
    const siteId = await createSite(alice);
    const client = await connect(siteId);

    client.login(alice.accessToken);
    await waitFor(() => client.messages.length === 1);
    expect(client.messages[0]).toEqual({ type: "ready" });

    await publish(siteId, update(siteId));
    await waitFor(() => client.messages.length === 2);
    expect(client.messages[1]).toEqual({ type: "update", ...update(siteId) });
  });

  it("does not send updates of other sites", async () => {
    const alice = await registerUser(ctx.app);
    const siteId = await createSite(alice);
    const client = await connect(siteId);
    client.login(alice.accessToken);
    await waitFor(() => client.messages.length === 1);

    const otherSite = randomUUID();
    await publish(otherSite, update(otherSite));
    await publish(siteId, update(siteId));

    await waitFor(() => client.messages.length === 2);
    expect(client.messages[1]).toMatchObject({ type: "update", siteId });
  });

  it("closes the socket when nobody logs in in time", async () => {
    const alice = await registerUser(ctx.app);
    const client = await connect(await createSite(alice));

    expect(await client.closed).toMatchObject({ code: LIVE_CLOSE.UNAUTHORIZED, reason: "Login timeout" });
  });

  it.each(["hello", "{}", JSON.stringify({ type: "auth" }), JSON.stringify({ type: "nope", token: "x" })])(
    "closes the socket for a first message that is not a login: %s",
    async (message) => {
      const alice = await registerUser(ctx.app);
      const client = await connect(await createSite(alice));

      client.ws.send(message);

      expect((await client.closed).code).toBe(LIVE_CLOSE.UNAUTHORIZED);
    },
  );

  it("closes the socket for a bad token", async () => {
    const alice = await registerUser(ctx.app);
    const client = await connect(await createSite(alice));

    client.login("not-a-token");

    expect(await client.closed).toMatchObject({ code: LIVE_CLOSE.UNAUTHORIZED });
  });

  it("closes the socket with 'not found' for the site of another user", async () => {
    const alice = await registerUser(ctx.app, "alice@example.com");
    const bob = await registerUser(ctx.app, "bob@example.com");
    const client = await connect(await createSite(alice));

    client.login(bob.accessToken);

    expect(await client.closed).toMatchObject({ code: LIVE_CLOSE.SITE_NOT_FOUND });
    expect(client.messages).toEqual([]);
  });

  it("closes the socket with 'not found' for a site id that is not valid", async () => {
    const client = await connect("not-a-uuid");
    expect((await client.closed).code).toBe(LIVE_CLOSE.SITE_NOT_FOUND);
  });
});

describe("token expiry", () => {
  it("closes the socket when the token expires, so the browser reconnects with a new one", async () => {
    const alice = await registerUser(ctx.app);
    const siteId = await createSite(alice);
    const shortToken = ctx.app.jwt.sign({ sub: alice.user.id }, { expiresIn: 2 });
    const client = await connect(siteId);

    client.login(shortToken);
    await waitFor(() => client.messages.length === 1);

    expect(await client.closed).toMatchObject({ code: LIVE_CLOSE.UNAUTHORIZED, reason: "Token expired" });
  });
});

describe("subscriptions", () => {
  // This test uses a real network connection. The in-memory one from injectWS
  // does not show the server that the viewer left.
  it("listens to Redis while the viewer is connected, and stops when they leave", async () => {
    const server = await createTestContext();
    const alice = await registerUser(ctx.app);
    const siteId = await createSite(alice);
    const address = await server.app.listen({ port: 0, host: "127.0.0.1" });
    const ws = new WebSocket(`${address.replace("http", "ws")}/api/sites/${siteId}/live`);

    try {
      const messages: unknown[] = [];
      ws.on("message", (data) => messages.push(JSON.parse(String(data))));
      ws.on("open", () => ws.send(JSON.stringify({ type: "auth", token: alice.accessToken })));
      await waitFor(() => messages.length === 1);
      expect(await listeners(siteId)).toBe(1);

      ws.close();

      await waitFor(async () => (await listeners(siteId)) === 0);
    } finally {
      ws.terminate();
      await server.close();
    }
  });

  it("shares one Redis subscription between two viewers", async () => {
    const alice = await registerUser(ctx.app);
    const siteId = await createSite(alice);
    const first = await connect(siteId);
    const second = await connect(siteId);
    first.login(alice.accessToken);
    second.login(alice.accessToken);
    await waitFor(() => first.messages.length === 1 && second.messages.length === 1);

    expect(await listeners(siteId)).toBe(1);
    await publish(siteId, update(siteId));
    await waitFor(() => first.messages.length === 2 && second.messages.length === 2);
  });
});
