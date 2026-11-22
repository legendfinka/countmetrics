import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  DEMO_DOMAIN,
  DEMO_EMAIL,
  DEMO_SITE_ID,
  DEMO_SITE_KEY,
  DEMO_USER_ID,
} from "@countmetrics/shared";
import { LOGGED_IN, LOGGED_OUT, apiError, dashboardRoutes, mockApi, renderApp } from "../../test/helpers";

const demoSession = {
  accessToken: "demo-token",
  user: { id: DEMO_USER_ID, email: DEMO_EMAIL, name: "Demo User" },
};
const demoSite = {
  id: DEMO_SITE_ID,
  domain: DEMO_DOMAIN,
  siteKey: DEMO_SITE_KEY,
  createdAt: "2026-03-10T12:00:00.000Z",
};

describe("Try the demo", () => {
  it("opens the demo dashboard from the login page", async () => {
    const server = mockApi({
      ...LOGGED_OUT,
      "POST /api/auth/demo": { body: demoSession },
      ...dashboardRoutes({ pageviews: 5 }, demoSite),
    });
    renderApp("/login");

    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));

    expect(await screen.findByRole("heading", { name: DEMO_DOMAIN })).toBeInTheDocument();
    expect(server.count("POST /api/auth/demo")).toBe(1);
    const siteRequest = server.calls.find((call) => call.path === `/api/sites/${DEMO_SITE_ID}`);
    expect(siteRequest?.headers.get("authorization")).toBe("Bearer demo-token");
  });

  it("is also on the register page", async () => {
    mockApi({
      ...LOGGED_OUT,
      "POST /api/auth/demo": { body: demoSession },
      ...dashboardRoutes({ pageviews: 5 }, demoSite),
    });
    renderApp("/register");

    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));

    expect(await screen.findByRole("heading", { name: DEMO_DOMAIN })).toBeInTheDocument();
  });

  it("shows the error when the demo is not set up", async () => {
    mockApi({
      ...LOGGED_OUT,
      "POST /api/auth/demo": {
        status: 404,
        body: apiError("DEMO_NOT_AVAILABLE", "The demo is not set up yet. Run the seed command."),
      },
    });
    renderApp("/login");

    await userEvent.click(await screen.findByRole("button", { name: "Try the demo" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("The demo is not set up yet");
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("sends a demo user who is already logged in from the login page to the demo dashboard", async () => {
    mockApi({
      "POST /api/auth/refresh": { body: demoSession },
      ...dashboardRoutes({ pageviews: 5 }, demoSite),
    });
    renderApp("/login");

    expect(await screen.findByRole("heading", { name: DEMO_DOMAIN })).toBeInTheDocument();
  });
});

describe("the demo banner", () => {
  it("is shown for the demo user", async () => {
    mockApi({
      "POST /api/auth/refresh": { body: demoSession },
      ...dashboardRoutes({ pageviews: 5 }, demoSite),
    });
    renderApp(`/sites/${DEMO_SITE_ID}`);

    expect(await screen.findByText("demo account")).toBeInTheDocument();
  });

  it("is not shown for other users", async () => {
    mockApi({ ...LOGGED_IN, "GET /api/sites": { body: { sites: [] } } });
    renderApp("/sites");

    await screen.findByRole("heading", { name: "Your sites" });
    expect(screen.queryByText("demo account")).not.toBeInTheDocument();
  });
});
