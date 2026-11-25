import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { chooseTheme, currentTheme, subscribeTheme } from "../lib/theme";
import { cn } from "../lib/utils";

/** Switches between light and dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme);
  const next = theme === "dark" ? "light" : "dark";
  const Icon = theme === "dark" ? Sun : Moon;

  return (
    <button
      type="button"
      onClick={() => chooseTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className={cn("rounded p-2 focus-visible:outline-2", className)}
    >
      <Icon size={18} aria-hidden="true" />
    </button>
  );
}
