import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  LOGGED_IN,
  apiError,
  mockApi,
  overview,
  renderApp,
  site,
} from "../../test/helpers";
import { snippetFor } from "./snippet";

const siteRoutes = (pageviews = 0) => ({
  [`GET /api/sites/${site.id}`]: { body: { site } },
  [`GET /api/sites/${site.id}/stats/overview`]: { body: overview(pageviews) },
});

describe("sites list", () => {
  it("shows a message when there are no sites", async () => {
    mockApi({ ...LOGGED_IN, "GET /api/sites": { body: { sites: [] } } });
    renderApp("/sites");
    expect(await screen.findByText(/No sites yet/)).toBeInTheDocument();
  });

  it("lists the sites", async () => {
    mockApi({ ...LOGGED_IN, "GET /api/sites": { body: { sites: [site] } } });
    renderApp("/sites");
    expect(await screen.findByText("example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", `/sites/${site.id}`);
  });

  it("shows an error and can try again", async () => {
    let fail = true;
    mockApi({
      ...LOGGED_IN,
      "GET /api/sites": () =>
        fail ? { status: 500, body: apiError("INTERNAL_ERROR", "Internal server error") } : { body: { sites: [] } },
    });
    renderApp("/sites");

    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");

    fail = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/No sites yet/)).toBeInTheDocument();
  });
});

describe("add a site", () => {
  it("saves the domain and shows the snippet to copy", async () => {
    const server = mockApi({
      ...LOGGED_IN,
      "GET /api/sites": { body: { sites: [] } },
      "POST /api/sites": { status: 201, body: { site } },
      ...siteRoutes(),
    });
    renderApp("/sites");

    await userEvent.type(await screen.findByLabelText("Domain"), " Example.COM ");
    await userEvent.click(screen.getByRole("button", { name: "Add site" }));

    expect(await screen.findByRole("heading", { name: "example.com" })).toBeInTheDocument();
    expect(screen.getByText(snippetFor(site.siteKey))).toBeInTheDocument();
    expect(server.calls.find((call) => call.method === "POST" && call.path === "/api/sites")?.body).toEqual({
      domain: "example.com",
    });
  });

  it("shows a problem with the domain and does not call the API", async () => {
    const server = mockApi({ ...LOGGED_IN, "GET /api/sites": { body: { sites: [] } } });
    renderApp("/sites");

    await userEvent.type(await screen.findByLabelText("Domain"), "https://example.com/page");
    await userEvent.click(screen.getByRole("button", { name: "Add site" }));

    expect(await screen.findByText(/Must be a hostname/)).toBeInTheDocument();
    expect(server.count("POST /api/sites")).toBe(0);
  });

  it("shows an error from the server", async () => {
    mockApi({
      ...LOGGED_IN,
      "GET /api/sites": { body: { sites: [] } },
      "POST /api/sites": { status: 500, body: apiError("INTERNAL_ERROR", "Internal server error") },
    });
    renderApp("/sites");

    await userEvent.type(await screen.findByLabelText("Domain"), "example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add site" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Internal server error");
  });
});

describe("delete a site", () => {
  function setup() {
    let sites = [site];
    const server = mockApi({
      ...LOGGED_IN,
      "GET /api/sites": () => ({ body: { sites } }),
      [`DELETE /api/sites/${site.id}`]: () => {
        sites = [];
        return { status: 204 };
      },
    });
    return server;
  }

  it("deletes the site after the user confirms", async () => {
    const server = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderApp("/sites");

    await userEvent.click(await screen.findByRole("button", { name: "Delete example.com" }));

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("example.com"));
    expect(await screen.findByText(/No sites yet/)).toBeInTheDocument();
    expect(server.count(`DELETE /api/sites/${site.id}`)).toBe(1);
  });

  it("does nothing when the user cancels", async () => {
    const server = setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderApp("/sites");

    await userEvent.click(await screen.findByRole("button", { name: "Delete example.com" }));

    expect(server.count(`DELETE /api/sites/${site.id}`)).toBe(0);
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });
});

describe("site page", () => {
  it("shows the snippet with the site key", async () => {
    mockApi({ ...LOGGED_IN, ...siteRoutes() });
    renderApp(`/sites/${site.id}`);

    expect(await screen.findByText(snippetFor("cm_testkey00001"))).toBeInTheDocument();
    expect(snippetFor("cm_testkey00001")).toMatch(/^<script defer src="http.*\/tracker\.js" data-site-key="cm_testkey00001"><\/script>$/);
  });

  it("copies the snippet", async () => {
    const user = userEvent.setup(); // also adds a fake clipboard
    mockApi({ ...LOGGED_IN, ...siteRoutes() });
    renderApp(`/sites/${site.id}`);

    await user.click(await screen.findByRole("button", { name: "Copy" }));

    expect(await navigator.clipboard.readText()).toBe(snippetFor(site.siteKey));
    expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
  });

  it("waits for the first pageview", async () => {
    mockApi({ ...LOGGED_IN, ...siteRoutes(0) });
    renderApp(`/sites/${site.id}`);
    expect(await screen.findByText("Waiting for your first pageview…")).toBeInTheDocument();
  });

  it("shows that data is coming in", async () => {
    mockApi({ ...LOGGED_IN, ...siteRoutes(3) });
    renderApp(`/sites/${site.id}`);
    await waitFor(() => expect(screen.getByText("Receiving data")).toBeInTheDocument());
  });

  it("shows a message for a site that does not exist", async () => {
    mockApi({
      ...LOGGED_IN,
      [`GET /api/sites/${site.id}`]: { status: 404, body: apiError("SITE_NOT_FOUND", "Site not found") },
    });
    renderApp(`/sites/${site.id}`);

    expect(await screen.findByRole("alert")).toHaveTextContent("We could not find this site.");
    expect(screen.getByRole("link", { name: "Back to your sites" })).toBeInTheDocument();
  });
});
