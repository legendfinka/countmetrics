import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
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
    // The whole row is one link
    const row = screen.getByRole("link", { name: /example\.com/ });
    expect(row).toHaveAttribute("href", `/sites/${site.id}`);
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

describe("edit a site", () => {
  const route = `PATCH /api/sites/${site.id}`;

  async function openDialog() {
    await userEvent.click(await screen.findByRole("button", { name: "Edit example.com" }));
    return screen.getByLabelText("New domain");
  }

  it("saves the cleaned domain, closes and shows the new name", async () => {
    let current = site;
    const server = mockApi({
      ...LOGGED_IN,
      "GET /api/sites": () => ({ body: { sites: [current] } }),
      [route]: () => {
        current = { ...site, domain: "new.com" };
        return { body: { site: current } };
      },
    });
    renderApp("/sites");
    const input = await openDialog();
    expect(input).toHaveValue("example.com");

    await userEvent.clear(input);
    await userEvent.type(input, "https://New.com/page{Enter}");

    expect(await screen.findByText("new.com")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(server.calls.find((call) => call.method === "PATCH")?.body).toEqual({ domain: "new.com" });
  });

  it("stays open for a bad domain, without calling the API", async () => {
    const server = mockApi({ ...LOGGED_IN, "GET /api/sites": { body: { sites: [site] } } });
    renderApp("/sites");
    const input = await openDialog();

    await userEvent.clear(input);
    await userEvent.type(input, "exa mple.com{Enter}");

    expect(await screen.findByText(/Must be an address/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(server.count(route)).toBe(0);
  });

  it("stays open and shows the error from the server", async () => {
    mockApi({
      ...LOGGED_IN,
      "GET /api/sites": { body: { sites: [site] } },
      [route]: { status: 403, body: apiError("DEMO_READ_ONLY", "The demo account is read-only.") },
    });
    renderApp("/sites");
    const input = await openDialog();

    await userEvent.clear(input);
    await userEvent.type(input, "other.com{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("read-only");
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    // Typing again hides the old error
    await userEvent.type(input, "x");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not call the API when nothing changed or on Cancel", async () => {
    const server = mockApi({ ...LOGGED_IN, "GET /api/sites": { body: { sites: [site] } } });
    renderApp("/sites");

    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await openDialog();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(server.count(route)).toBe(0);
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
    renderApp("/sites");

    await userEvent.click(await screen.findByRole("button", { name: "Delete example.com" }));

    expect(screen.getByRole("dialog", { name: "Delete site?" })).toHaveTextContent("example.com");
    expect(server.count(`DELETE /api/sites/${site.id}`)).toBe(0);
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/No sites yet/)).toBeInTheDocument();
    expect(server.count(`DELETE /api/sites/${site.id}`)).toBe(1);
  });

  it("does nothing when the user cancels", async () => {
    const server = setup();
    renderApp("/sites");

    await userEvent.click(await screen.findByRole("button", { name: "Delete example.com" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(server.count(`DELETE /api/sites/${site.id}`)).toBe(0);
    expect(screen.getByText("example.com")).toBeInTheDocument();
  });
});
