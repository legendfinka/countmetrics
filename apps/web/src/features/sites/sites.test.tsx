import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LOGGED_IN, apiError, dashboardRoutes, mockApi, renderApp, site } from "../../test/helpers";
import { snippetFor } from "./snippet";

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
  it("saves the domain and opens the dashboard with the snippet", async () => {
    const server = mockApi({
      ...LOGGED_IN,
      "GET /api/sites": { body: { sites: [] } },
      "POST /api/sites": { status: 201, body: { site } },
      ...dashboardRoutes(),
    });
    renderApp("/sites");

    await userEvent.type(await screen.findByLabelText("Domain"), " Example.COM ");
    await userEvent.click(screen.getByRole("button", { name: "Add site" }));

    expect(await screen.findByRole("heading", { name: "example.com" })).toBeInTheDocument();
    expect(await screen.findByText(snippetFor(site.siteKey))).toBeInTheDocument();
    expect(server.calls.find((call) => call.method === "POST" && call.path === "/api/sites")?.body).toEqual({
      domain: "example.com",
    });
  });

  it("shows a problem with the domain and does not call the API", async () => {
    const server = mockApi({ ...LOGGED_IN, "GET /api/sites": { body: { sites: [] } } });
    renderApp("/sites");

    await userEvent.type(await screen.findByLabelText("Domain"), "exa mple.com");
    await userEvent.click(screen.getByRole("button", { name: "Add site" }));

    expect(await screen.findByText(/Must be an address/)).toBeInTheDocument();
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
    return mockApi({
      ...LOGGED_IN,
      "GET /api/sites": () => ({ body: { sites } }),
      [`DELETE /api/sites/${site.id}`]: () => {
        sites = [];
        return { status: 204 };
      },
    });
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
