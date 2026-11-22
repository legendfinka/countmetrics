import { QueryClient } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { BREAKDOWN_KINDS, type BreakdownKind, type BreakdownRow } from "@countmetrics/shared";
import { AppRoutes } from "../App";
import { AppProviders } from "../providers";

export interface FakeRequest {
  method: string;
  /** Path and query string */
  path: string;
  body: unknown;
  headers: Headers;
}

export interface FakeReply {
  status?: number;
  body?: unknown;
}

type Handler = FakeReply | ((request: FakeRequest) => FakeReply);

/**
 * Replaces fetch with a fake API. Routes look like "GET /api/sites".
 * A request to a route that is not listed fails the test.
 */
export function mockApi(routes: Record<string, Handler>) {
  const calls: FakeRequest[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const request: FakeRequest = {
      method,
      path: url.pathname + url.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: new Headers(init?.headers),
    };
    calls.push(request);

    const handler = routes[`${method} ${url.pathname}`];
    if (!handler) throw new Error(`Unexpected request: ${method} ${url.pathname}`);

    const reply = typeof handler === "function" ? handler(request) : handler;
    const status = reply.status ?? 200;
    const body = status === 204 || reply.body === undefined ? null : JSON.stringify(reply.body);
    return new Response(body, { status, headers: { "Content-Type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);

  return {
    calls,
    /** How many requests went to a route like "POST /api/auth/login" */
    count: (route: string) =>
      calls.filter((call) => `${call.method} ${call.path.split("?")[0]}` === route).length,
  };
}

export const apiError = (code: string, message: string) => ({ error: { code, message } });

export const alice = { id: "00000000-0000-4000-8000-000000000001", email: "alice@example.com", name: "Alice" };
export const session = { accessToken: "token-1", user: alice };

export const site = {
  id: "00000000-0000-4000-8000-0000000000aa",
  domain: "example.com",
  siteKey: "cm_testkey00001",
  createdAt: "2026-03-10T12:00:00.000Z",
};

interface DashboardData {
  pageviews?: number;
  events?: number;
  visitors?: number;
  currentVisitors?: number;
  points?: { time: string; pageviews: number; visitors: number }[];
  lists?: Partial<Record<BreakdownKind, BreakdownRow[]>>;
}

/** All the requests the dashboard makes for the test site. Without options, the site has no data. */
export function dashboardRoutes(data: DashboardData = {}, target = site): Record<string, Handler> {
  const base = `/api/sites/${target.id}`;
  const routes: Record<string, Handler> = {
    [`GET ${base}`]: { body: { site: target } },
    [`GET ${base}/simulate`]: { body: { state: "idle", secondsLeft: 0 } },
    [`GET ${base}/stats/overview`]: {
      body: {
        range: "24h",
        pageviews: data.pageviews ?? 0,
        events: data.events ?? 0,
        visitors: data.visitors ?? 0,
        currentVisitors: data.currentVisitors ?? 0,
      },
    },
    [`GET ${base}/stats/timeseries`]: {
      body: {
        range: "24h",
        points: data.points ?? [{ time: "2026-03-10T12:00:00Z", pageviews: 0, visitors: 0 }],
      },
    },
  };
  for (const kind of BREAKDOWN_KINDS) {
    routes[`GET ${base}/stats/${kind}`] = { body: { range: "24h", rows: data.lists?.[kind] ?? [] } };
  }
  return routes;
}

/** No session: the refresh cookie is missing. */
export const LOGGED_OUT = {
  "POST /api/auth/refresh": { status: 401, body: apiError("INVALID_REFRESH_TOKEN", "Invalid refresh token") },
};

/** The refresh cookie works, so the user is logged in after the page loads. */
export const LOGGED_IN = { "POST /api/auth/refresh": { body: session } };

/** Renders the whole app (in React StrictMode, like in development) at a path. */
export function renderApp(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <StrictMode>
      <AppProviders client={client}>
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>
      </AppProviders>
    </StrictMode>,
  );
}
