import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LOGGED_IN, LOGGED_OUT, apiError, mockApi, renderApp, session } from "../../test/helpers";

const noSites = { "GET /api/sites": { body: { sites: [] } } };

async function fillAndSubmit(fields: Record<string, string>, button: string) {
  const user = userEvent.setup();
  for (const [label, text] of Object.entries(fields)) {
    await user.type(await screen.findByLabelText(label), text);
  }
  await user.click(screen.getByRole("button", { name: button }));
}

describe("route guards", () => {
  it("sends a logged-out visitor to the login page", async () => {
    mockApi(LOGGED_OUT);
    renderApp("/sites");
    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });

  it("keeps a user logged in after a page load (refresh cookie)", async () => {
    mockApi({ ...LOGGED_IN, ...noSites });
    renderApp("/sites");
    expect(await screen.findByRole("heading", { name: "Your sites" })).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
  });

  it("sends a logged-in user away from the login page", async () => {
    mockApi({ ...LOGGED_IN, ...noSites });
    renderApp("/login");
    expect(await screen.findByRole("heading", { name: "Your sites" })).toBeInTheDocument();
  });

  it("asks for a session only once, even in React StrictMode", async () => {
    const server = mockApi({ ...LOGGED_IN, ...noSites });
    renderApp("/sites");
    await screen.findByRole("heading", { name: "Your sites" });
    expect(server.count("POST /api/auth/refresh")).toBe(1);
  });
});

describe("login", () => {
  it("shows the problems and does not call the API when the form is empty", async () => {
    const server = mockApi(LOGGED_OUT);
    renderApp("/login");

    await userEvent.click(await screen.findByRole("button", { name: "Log in" }));

    expect(await screen.findByText("Enter a valid email address")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(server.count("POST /api/auth/login")).toBe(0);
  });

  it("logs in and opens the sites page with the new token", async () => {
    const server = mockApi({ ...LOGGED_OUT, "POST /api/auth/login": { body: session }, ...noSites });
    renderApp("/login");

    await fillAndSubmit({ Email: "Alice@Example.com", Password: "password123" }, "Log in");

    expect(await screen.findByRole("heading", { name: "Your sites" })).toBeInTheDocument();
    const login = server.calls.find((call) => call.path === "/api/auth/login");
    expect(login?.body).toEqual({ email: "alice@example.com", password: "password123" });
    const sites = server.calls.find((call) => call.path === "/api/sites");
    expect(sites?.headers.get("authorization")).toBe("Bearer token-1");
  });

  it("always opens the sites page, even after a visit to a dashboard", async () => {
    mockApi({ ...LOGGED_OUT, "POST /api/auth/login": { body: session }, ...noSites });
    // Like after logging out on a dashboard: the app sends you to the login page
    renderApp("/sites/00000000-0000-4000-8000-0000000000aa");

    await fillAndSubmit({ Email: "alice@example.com", Password: "password123" }, "Log in");

    expect(await screen.findByRole("heading", { name: "Your sites" })).toBeInTheDocument();
  });

  it("shows the error from the server for a wrong password", async () => {
    mockApi({
      ...LOGGED_OUT,
      "POST /api/auth/login": { status: 401, body: apiError("INVALID_CREDENTIALS", "Invalid email or password") },
    });
    renderApp("/login");

    await fillAndSubmit({ Email: "alice@example.com", Password: "wrong-password" }, "Log in");

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password");
    expect(screen.getByRole("heading", { name: "Log in" })).toBeInTheDocument();
  });
});

describe("register", () => {
  it("checks the form before sending it", async () => {
    const server = mockApi(LOGGED_OUT);
    renderApp("/register");

    await fillAndSubmit({ Email: "alice@example.com", Password: "short" }, "Sign up");

    expect(await screen.findByText("Enter your name")).toBeInTheDocument();
    expect(screen.getByText("Use at least 8 characters")).toBeInTheDocument();
    expect(server.count("POST /api/auth/register")).toBe(0);
  });

  it("creates the account and logs the user in", async () => {
    mockApi({ ...LOGGED_OUT, "POST /api/auth/register": { status: 201, body: session }, ...noSites });
    renderApp("/register");

    await fillAndSubmit({ Name: "Alice", Email: "alice@example.com", Password: "password123" }, "Sign up");

    expect(await screen.findByRole("heading", { name: "Your sites" })).toBeInTheDocument();
  });

  it("shows a taken email under the email field", async () => {
    mockApi({
      ...LOGGED_OUT,
      "POST /api/auth/register": { status: 409, body: apiError("EMAIL_TAKEN", "Email is already registered") },
    });
    renderApp("/register");

    await fillAndSubmit({ Name: "Alice", Email: "alice@example.com", Password: "password123" }, "Sign up");

    expect(await screen.findByText("Email is already registered")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("logout", () => {
  it("logs out and shows the login page", async () => {
    const server = mockApi({ ...LOGGED_IN, ...noSites, "POST /api/auth/logout": { status: 204 } });
    renderApp("/sites");

    await userEvent.click(await screen.findByRole("button", { name: "Log out" }));

    expect(await screen.findByRole("heading", { name: "Log in" })).toBeInTheDocument();
    expect(server.count("POST /api/auth/logout")).toBe(1);
  });
});
