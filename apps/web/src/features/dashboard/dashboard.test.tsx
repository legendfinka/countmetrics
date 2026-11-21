import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  LOGGED_IN,
  apiError,
  dashboardRoutes,
  mockApi,
  renderApp,
  site,
} from "../../test/helpers";
import { lastSocket } from "../../test/fake-websocket";
import { snippetFor } from "../sites/snippet";

const base = `/api/sites/${site.id}`;
const page = `/sites/${site.id}`;

/** The queries of one card (found by its name), like "Pageviews" or "Top pages" */
const card = (name: string) => within(screen.getByRole("region", { name }));

describe("numbers and lists", () => {
  it("shows the numbers from the API", async () => {
    mockApi({
      ...LOGGED_IN,
      ...dashboardRoutes({ pageviews: 1234, events: 5, visitors: 321, currentVisitors: 7 }),
    });
    renderApp(page);

    await waitFor(() => expect(card("Pageviews").getByText("1,234")).toBeInTheDocument());
    expect(card("Visitors").getByText("321")).toBeInTheDocument();
    expect(card("Custom events").getByText("5")).toBeInTheDocument();
    expect(card("Online now").getByText("7")).toBeInTheDocument();
  });

  it("shows the top lists with readable names", async () => {
    mockApi({
      ...LOGGED_IN,
      ...dashboardRoutes({
        pageviews: 200,
        lists: {
          pages: [{ name: "/pricing", count: 120, visitors: 80 }],
          referrers: [{ name: "Direct", count: 50, visitors: 40 }],
          countries: [{ name: "DE", count: 30, visitors: 20 }],
          devices: [{ name: "mobile", count: 10, visitors: 9 }],
          browsers: [{ name: "Firefox", count: 8, visitors: 7 }],
          events: [{ name: "signup", count: 3, visitors: 3 }],
        },
      }),
    });
    renderApp(page);

    await waitFor(() => expect(card("Top pages").getByText("/pricing")).toBeInTheDocument());
    expect(card("Top pages").getByText("120")).toBeInTheDocument();
    expect(card("Top referrers").getByText("Direct")).toBeInTheDocument();
    expect(card("Countries").getByText("🇩🇪 Germany")).toBeInTheDocument();
    expect(card("Devices").getByText("Mobile")).toBeInTheDocument();
    expect(card("Browsers").getByText("Firefox")).toBeInTheDocument();
    expect(card("Top events").getByText("signup")).toBeInTheDocument();
  });

  it("draws the chart when there is data", async () => {
    mockApi({
      ...LOGGED_IN,
      ...dashboardRoutes({
        pageviews: 3,
        points: [
          { time: "2026-03-10T11:00:00Z", pageviews: 1, visitors: 1 },
          { time: "2026-03-10T12:00:00Z", pageviews: 2, visitors: 1 },
        ],
      }),
    });
    renderApp(page);

    expect(await screen.findByRole("img", { name: "Chart of pageviews and visitors over time" })).toBeInTheDocument();
  });

  it("shows an error in one card, and that card can try again", async () => {
    let fail = true;
    mockApi({
      ...LOGGED_IN,
      ...dashboardRoutes({ pageviews: 1 }),
      [`GET ${base}/stats/pages`]: () =>
        fail
          ? { status: 500, body: apiError("INTERNAL_ERROR", "Internal server error") }
          : { body: { range: "24h", rows: [{ name: "/pricing", count: 1, visitors: 1 }] } },
    });
    renderApp(page);

    expect(await within(await screen.findByRole("region", { name: "Top pages" })).findByRole("alert")).toHaveTextContent(
      "Internal server error",
    );
    // The other cards are fine
    expect(card("Top referrers").getByText("No data yet")).toBeInTheDocument();

    fail = false;
    await userEvent.click(card("Top pages").getByRole("button", { name: "Try again" }));
    expect(await card("Top pages").findByText("/pricing")).toBeInTheDocument();
  });
});

describe("time range", () => {
  it("starts with 24 hours", async () => {
    mockApi({ ...LOGGED_IN, ...dashboardRoutes({ pageviews: 1 }) });
    renderApp(page);
    expect(await screen.findByRole("button", { name: "24 hours" })).toHaveAttribute("aria-pressed", "true");
  });

  it("asks for the new range when the user picks one, and keeps it in the URL", async () => {
    const server = mockApi({ ...LOGGED_IN, ...dashboardRoutes({ pageviews: 1 }) });
    renderApp(page);

    await userEvent.click(await screen.findByRole("button", { name: "7 days" }));

    await waitFor(() => expect(server.calls.map((c) => c.path)).toContain(`${base}/stats/overview?range=7d`));
    expect(server.calls.map((c) => c.path)).toContain(`${base}/stats/timeseries?range=7d`);
    expect(server.calls.map((c) => c.path)).toContain(`${base}/stats/pages?range=7d&limit=10`);
    expect(screen.getByRole("button", { name: "7 days" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "24 hours" })).toHaveAttribute("aria-pressed", "false");
  });

  it("uses the range from the link", async () => {
    const server = mockApi({ ...LOGGED_IN, ...dashboardRoutes({ pageviews: 1 }) });
    renderApp(`${page}?range=30d`);

    expect(await screen.findByRole("button", { name: "30 days" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(server.calls.map((c) => c.path)).toContain(`${base}/stats/overview?range=30d`));
  });

  it("uses 24 hours when the range in the link is wrong", async () => {
    const server = mockApi({ ...LOGGED_IN, ...dashboardRoutes({ pageviews: 1 }) });
    renderApp(`${page}?range=forever`);

    expect(await screen.findByRole("button", { name: "24 hours" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(server.calls.map((c) => c.path)).toContain(`${base}/stats/overview?range=24h`));
  });
});

describe("a site without data", () => {
  it("shows the snippet first, and empty messages", async () => {
    mockApi({ ...LOGGED_IN, ...dashboardRoutes() });
    renderApp(page);

    expect(await screen.findByText(snippetFor(site.siteKey))).toBeInTheDocument();
    expect(await screen.findByText("No pageviews in this period yet.")).toBeInTheDocument();
    expect(await screen.findAllByText("No data yet")).toHaveLength(6);
  });

  it("copies the snippet", async () => {
    const user = userEvent.setup(); // also adds a fake clipboard
    mockApi({ ...LOGGED_IN, ...dashboardRoutes() });
    renderApp(page);

    await user.click(await screen.findByRole("button", { name: "Copy" }));

    expect(await navigator.clipboard.readText()).toBe(snippetFor(site.siteKey));
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });
});

describe("a site with data", () => {
  it("hides the snippet, but the user can show and hide it", async () => {
    mockApi({ ...LOGGED_IN, ...dashboardRoutes({ pageviews: 3 }) });
    renderApp(page);
    await waitFor(() => expect(card("Pageviews").getByText("3")).toBeInTheDocument());

    expect(screen.queryByText(snippetFor(site.siteKey))).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Show snippet" }));
    expect(screen.getByText(snippetFor(site.siteKey))).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Hide snippet" }));
    expect(screen.queryByText(snippetFor(site.siteKey))).not.toBeInTheDocument();
  });
});

describe("live updates", () => {
  it("logs in over the WebSocket and shows that it is live", async () => {
    mockApi({ ...LOGGED_IN, ...dashboardRoutes({ pageviews: 1 }) });
    renderApp(page);
    await waitFor(() => expect(card("Pageviews").getByText("1")).toBeInTheDocument());

    const socket = lastSocket();
    expect(socket.url).toBe(`ws://localhost:3000${base}/live`);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();

    act(() => socket.open());
    expect(socket.sent).toEqual([{ type: "auth", token: "token-1" }]);

    act(() => socket.receive({ type: "ready" }));
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("changes the numbers at once when an update arrives, without asking the API", async () => {
    const server = mockApi({
      ...LOGGED_IN,
      ...dashboardRoutes({ pageviews: 10, events: 1, currentVisitors: 2 }),
    });
    renderApp(page);
    await waitFor(() => expect(card("Pageviews").getByText("10")).toBeInTheDocument());
    const requestsBefore = server.calls.length;

    act(() =>
      lastSocket().receive({
        type: "update",
        siteId: site.id,
        currentVisitors: 9,
        pageviews: 2,
        events: 1,
        at: "2026-03-10T12:00:00.000Z",
      }),
    );

    // React Query tells the page about cache changes a moment later
    await waitFor(() => expect(card("Online now").getByText("9")).toBeInTheDocument());
    expect(card("Pageviews").getByText("12")).toBeInTheDocument();
    expect(card("Custom events").getByText("2")).toBeInTheDocument();
    expect(server.calls).toHaveLength(requestsBefore);
  });
});

describe("problems", () => {
  it("shows a message for a site that does not exist", async () => {
    mockApi({
      ...LOGGED_IN,
      ...dashboardRoutes(),
      [`GET ${base}`]: { status: 404, body: apiError("SITE_NOT_FOUND", "Site not found") },
    });
    renderApp(page);

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not find this site.");
    expect(screen.getByRole("link", { name: "Back to your sites" })).toBeInTheDocument();
  });
});
