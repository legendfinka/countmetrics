import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { startTheme } from "../lib/theme";
import { ThemeToggle } from "./theme-toggle";

afterEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});

describe("theme", () => {
  it("switches to dark and remembers it", async () => {
    startTheme();
    render(<ThemeToggle />);

    await userEvent.click(screen.getByRole("button", { name: "Switch to dark mode" }));

    expect(document.documentElement).toHaveClass("dark");
    expect(localStorage.getItem("cm-theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeInTheDocument();
  });

  it("uses the saved choice at start", () => {
    localStorage.setItem("cm-theme", "dark");
    startTheme();
    expect(document.documentElement).toHaveClass("dark");
  });
});
