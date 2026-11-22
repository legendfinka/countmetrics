import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LOGGED_IN, apiError, dashboardRoutes, mockApi, renderApp, site } from "../../test/helpers";
import { SimulateButton } from "./simulate-button";

const path = `/api/sites/${site.id}/simulate`;

const idle = { state: "idle", secondsLeft: 0 };
const running = (secondsLeft: number) => ({ state: "running", secondsLeft });

function renderButton() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SimulateButton siteId={site.id} />
    </QueryClientProvider>,
  );
}

describe("SimulateButton", () => {
  it("can be clicked when nothing is running", async () => {
    mockApi({ [`GET ${path}`]: { body: idle } });
    renderButton();
    expect(await screen.findByRole("button", { name: "Simulate traffic" })).toBeEnabled();
  });

  it("starts a simulation (without sending anything but the site) and shows a countdown", async () => {
    const server = mockApi({
      [`GET ${path}`]: { body: idle },
      [`POST ${path}`]: { status: 202, body: running(30) },
    });
    renderButton();

    await userEvent.click(await screen.findByRole("button", { name: "Simulate traffic" }));

    const button = await screen.findByRole("button", { name: "Simulating… 30s" });
    expect(button).toBeDisabled();
    const post = server.calls.find((call) => call.method === "POST");
    expect(post?.body).toBeUndefined();
    expect(server.count(`POST ${path}`)).toBe(1);
  });

  it("counts down every second", async () => {
    mockApi({ [`GET ${path}`]: { body: running(3) } });
    renderButton();

    expect(await screen.findByRole("button", { name: "Simulating… 3s" })).toBeDisabled();
    expect(await screen.findByRole("button", { name: "Simulating… 2s" }, { timeout: 2500 })).toBeInTheDocument();
  });

  it("asks the server again when the countdown is over, and is ready for the next run", async () => {
    let calls = 0;
    mockApi({ [`GET ${path}`]: () => ({ body: ++calls === 1 ? running(1) : idle }) });
    renderButton();

    expect(await screen.findByRole("button", { name: "Simulating… 1s" })).toBeDisabled();

    expect(await screen.findByRole("button", { name: "Simulate traffic" }, { timeout: 4000 })).toBeEnabled();
  });

  it("is disabled during the pause after a run", async () => {
    mockApi({ [`GET ${path}`]: { body: { state: "cooldown", secondsLeft: 12 } } });
    renderButton();

    expect(await screen.findByRole("button", { name: "Available in 12s" })).toBeDisabled();
  });

  it("shows the error, and asks the server what is going on", async () => {
    let calls = 0;
    mockApi({
      [`GET ${path}`]: () => ({ body: ++calls === 1 ? idle : running(20) }),
      [`POST ${path}`]: {
        status: 409,
        body: apiError("SIMULATION_RUNNING", "A simulation is already running for this site"),
      },
    });
    renderButton();

    await userEvent.click(await screen.findByRole("button", { name: "Simulate traffic" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("A simulation is already running");
    expect(await screen.findByRole("button", { name: "Simulating… 20s" })).toBeDisabled();
  });
});

describe("on the dashboard", () => {
  it("is next to the time range", async () => {
    mockApi({ ...LOGGED_IN, ...dashboardRoutes() });
    renderApp(`/sites/${site.id}`);

    expect(await screen.findByRole("button", { name: "Simulate traffic" })).toBeEnabled();
  });
});
