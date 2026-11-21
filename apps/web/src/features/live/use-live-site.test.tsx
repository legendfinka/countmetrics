import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { LIVE_CLOSE } from "@countmetrics/shared";
import { setAccessToken } from "../../lib/api";
import { FakeWebSocket, lastSocket } from "../../test/fake-websocket";
import { LOGGED_OUT, mockApi, session, site } from "../../test/helpers";
import { statsKey } from "../dashboard/stats-api";
import { useLiveSite } from "./use-live-site";

const instantly = () => 0;

function setup() {
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(() => useLiveSite(site.id, instantly), { wrapper });
  return { queryClient, ...hook };
}

const update = (overrides = {}) => ({
  type: "update",
  siteId: site.id,
  currentVisitors: 8,
  pageviews: 3,
  events: 2,
  at: "2026-03-10T12:00:00.000Z",
  ...overrides,
});

describe("connecting", () => {
  it("connects to the site and logs in with the current token", () => {
    setAccessToken("my-token");
    const { result } = setup();

    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(lastSocket().url).toBe(`ws://localhost:3000/api/sites/${site.id}/live`);
    expect(result.current).toBe("connecting");

    act(() => lastSocket().open());
    expect(lastSocket().sent).toEqual([{ type: "auth", token: "my-token" }]);

    act(() => lastSocket().receive({ type: "ready" }));
    expect(result.current).toBe("live");
  });

  it("closes the socket when the page is left, and does not reconnect", () => {
    const { unmount } = setup();
    const socket = lastSocket();

    unmount();
    expect(socket.closedByApp).toBe(true);

    socket.serverClose(1006);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("ignores messages it does not understand", () => {
    const { result } = setup();
    act(() => lastSocket().receive({ type: "nonsense" }));
    act(() => lastSocket().onmessage?.({ data: "not json" }));
    expect(result.current).toBe("connecting");
  });
});

describe("updates", () => {
  it("adds an update to the numbers in the cache, for every range", () => {
    const { queryClient } = setup();
    const overview = { range: "24h", pageviews: 10, events: 1, visitors: 5, currentVisitors: 2 };
    queryClient.setQueryData(statsKey(site.id, "overview", "24h"), overview);
    queryClient.setQueryData(statsKey(site.id, "overview", "7d"), { ...overview, range: "7d" });
    queryClient.setQueryData(statsKey(site.id, "timeseries", "24h"), {
      range: "24h",
      points: [
        { time: "2026-03-10T11:00:00Z", pageviews: 4, visitors: 2 },
        { time: "2026-03-10T12:00:00Z", pageviews: 6, visitors: 3 },
      ],
    });

    act(() => lastSocket().receive(update()));

    // Visitors stay as they are. They can't be added up.
    expect(queryClient.getQueryData(statsKey(site.id, "overview", "24h"))).toEqual({
      range: "24h",
      pageviews: 13,
      events: 3,
      visitors: 5,
      currentVisitors: 8,
    });
    expect(queryClient.getQueryData(statsKey(site.id, "overview", "7d"))).toMatchObject({
      pageviews: 13,
      currentVisitors: 8,
    });
    expect(queryClient.getQueryData(statsKey(site.id, "timeseries", "24h"))).toEqual({
      range: "24h",
      points: [
        { time: "2026-03-10T11:00:00Z", pageviews: 4, visitors: 2 },
        { time: "2026-03-10T12:00:00Z", pageviews: 9, visitors: 3 },
      ],
    });
  });

  it("does nothing for numbers that were not loaded yet", () => {
    const { queryClient } = setup();
    act(() => lastSocket().receive(update()));
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("does not change the numbers of another site", () => {
    const { queryClient } = setup();
    const otherKey = statsKey("another-site", "overview", "24h");
    queryClient.setQueryData(otherKey, { range: "24h", pageviews: 1, events: 0, visitors: 1, currentVisitors: 0 });

    act(() => lastSocket().receive(update()));

    expect(queryClient.getQueryData(otherKey)).toMatchObject({ pageviews: 1 });
  });
});

describe("reconnecting", () => {
  it("connects again after a dropped connection, without renewing the token", async () => {
    const server = mockApi({});
    const { result } = setup();
    act(() => lastSocket().receive({ type: "ready" }));

    act(() => lastSocket().serverClose(1006));
    expect(result.current).toBe("reconnecting");

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    expect(server.calls).toHaveLength(0);
  });

  it("renews the token and reconnects with it when the old token expired", async () => {
    setAccessToken("old-token");
    const server = mockApi({ "POST /api/auth/refresh": { body: session } });
    setup();

    act(() => lastSocket().serverClose(LIVE_CLOSE.UNAUTHORIZED));

    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
    expect(server.count("POST /api/auth/refresh")).toBe(1);
    act(() => lastSocket().open());
    expect(lastSocket().sent).toEqual([{ type: "auth", token: "token-1" }]);
  });

  it("goes offline and stops when the token can't be renewed", async () => {
    const server = mockApi(LOGGED_OUT);
    const { result } = setup();

    act(() => lastSocket().serverClose(LIVE_CLOSE.UNAUTHORIZED));

    await waitFor(() => expect(result.current).toBe("offline"));
    expect(server.count("POST /api/auth/refresh")).toBe(1);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("goes offline and stops when the site does not exist", () => {
    const server = mockApi({});
    const { result } = setup();

    act(() => lastSocket().serverClose(LIVE_CLOSE.SITE_NOT_FOUND));

    expect(result.current).toBe("offline");
    expect(FakeWebSocket.instances).toHaveLength(1);
    expect(server.calls).toHaveLength(0);
  });
});
