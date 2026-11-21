import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { siteUpdateChannel, type SiteUpdateMessage } from "@countmetrics/shared";
import { redisUrl, waitFor } from "../../../test/helpers.js";
import { createLiveHub, type LiveHub } from "./live-hub.js";

let publisher: Redis;
let hub: LiveHub;

beforeAll(() => {
  publisher = new Redis(redisUrl);
});
afterAll(() => publisher.quit());
beforeEach(async () => {
  await publisher.flushdb();
  hub = createLiveHub(new Redis(redisUrl));
});
afterEach(() => hub.close());

const update = (siteId: string, currentVisitors = 1): SiteUpdateMessage => ({
  siteId,
  currentVisitors,
  pageviews: 1,
  events: 0,
  at: "2026-03-10T12:00:00.000Z",
});

const publish = (siteId: string, message: unknown) =>
  publisher.publish(siteUpdateChannel(siteId), typeof message === "string" ? message : JSON.stringify(message));

/** How many Redis connections listen to the site's channel */
async function listeners(siteId: string): Promise<number> {
  const result = (await publisher.pubsub("NUMSUB", siteUpdateChannel(siteId))) as [string, number];
  return Number(result[1]);
}

describe("live hub", () => {
  it("sends a message to every viewer of the site, with one Redis subscription", async () => {
    const siteId = randomUUID();
    const a = vi.fn();
    const b = vi.fn();
    await hub.subscribe(siteId, a);
    await hub.subscribe(siteId, b);

    await publish(siteId, update(siteId, 5));

    await waitFor(() => a.mock.calls.length === 1 && b.mock.calls.length === 1);
    expect(a).toHaveBeenCalledWith(update(siteId, 5));
    expect(await listeners(siteId)).toBe(1);
  });

  it("does not send messages of other sites", async () => {
    const mine = randomUUID();
    const other = randomUUID();
    const listener = vi.fn();
    await hub.subscribe(mine, listener);

    await publish(other, update(other));
    await publish(mine, update(mine, 2));

    await waitFor(() => listener.mock.calls.length === 1);
    expect(listener).toHaveBeenCalledWith(update(mine, 2));
  });

  it("ignores messages it does not understand", async () => {
    const siteId = randomUUID();
    const listener = vi.fn();
    await hub.subscribe(siteId, listener);

    await publish(siteId, "not json");
    await publish(siteId, { hello: "world" });
    await publish(siteId, update(siteId, 3));

    await waitFor(() => listener.mock.calls.length === 1);
    expect(listener).toHaveBeenCalledWith(update(siteId, 3));
  });

  it("stays subscribed while a viewer is left, and unsubscribes after the last one", async () => {
    const siteId = randomUUID();
    const stopA = await hub.subscribe(siteId, vi.fn());
    const stopB = await hub.subscribe(siteId, vi.fn());
    expect(await listeners(siteId)).toBe(1);

    await stopA();
    expect(await listeners(siteId)).toBe(1);

    await stopB();
    expect(await listeners(siteId)).toBe(0);
  });

  it("stops sending to a viewer that left", async () => {
    const siteId = randomUUID();
    const left = vi.fn();
    const stays = vi.fn();
    const stop = await hub.subscribe(siteId, left);
    await hub.subscribe(siteId, stays);

    await stop();
    await publish(siteId, update(siteId));

    await waitFor(() => stays.mock.calls.length === 1);
    expect(left).not.toHaveBeenCalled();
  });

  it("can subscribe again after everyone left", async () => {
    const siteId = randomUUID();
    const stop = await hub.subscribe(siteId, vi.fn());
    await stop();

    const listener = vi.fn();
    await hub.subscribe(siteId, listener);
    await publish(siteId, update(siteId));

    await waitFor(() => listener.mock.calls.length === 1);
  });
});
