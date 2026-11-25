import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorldMap } from "./world-map";

// Three tiny fake shapes are enough to test the colours
vi.mock("./world-shapes", () => ({
  MAP_VIEW_BOX: "0 0 10 10",
  WORLD_SHAPES: [
    { code: "DE", d: "M0 0h1v1z" },
    { code: "UA", d: "M2 0h1v1z" },
    { code: null, d: "M4 0h1v1z" },
  ],
}));

describe("WorldMap", () => {
  it("colours the countries with visits, stronger for more visits", () => {
    const { container } = render(
      <WorldMap
        rows={[
          { name: "DE", count: 100, visitors: 50 },
          { name: "UA", count: 25, visitors: 10 },
          { name: "Unknown", count: 500, visitors: 5 },
        ]}
      />,
    );

    const [germany, ukraine, other] = container.querySelectorAll("path");
    expect(germany).toHaveAttribute("fill", "var(--color-brand)");
    // "Unknown" is not a country, so it does not change the scale
    expect(germany).toHaveAttribute("fill-opacity", "1");
    expect(ukraine).toHaveAttribute("fill-opacity", "0.625");
    expect(other).toHaveAttribute("fill", "var(--color-line)");
  });

  it("shows the name and visits right away, and highlights the country", () => {
    const { container } = render(<WorldMap rows={[{ name: "DE", count: 100, visitors: 50 }]} />);
    const [germany, ukraine] = container.querySelectorAll("path");

    fireEvent.pointerMove(germany!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Germany100 pageviews");
    expect(screen.getByTestId("map-highlight")).toHaveAttribute("d", "M0 0h1v1z");

    fireEvent.pointerMove(ukraine!);
    expect(screen.getByRole("tooltip")).toHaveTextContent("UkraineNo visits");
    expect(screen.getByTestId("map-highlight")).toHaveAttribute("d", "M2 0h1v1z");
  });

  it("hides the tooltip when the mouse leaves the map", () => {
    const { container } = render(<WorldMap rows={[]} />);
    fireEvent.pointerMove(container.querySelector("path")!);

    fireEvent.pointerLeave(screen.getByRole("img", { name: /World map/ }).parentElement!);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("ignores areas without a country code", () => {
    const { container } = render(<WorldMap rows={[]} />);

    fireEvent.pointerMove(container.querySelectorAll("path")[2]!);

    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
