export type Theme = "light" | "dark";

const STORAGE_KEY = "cm-theme";
const listeners = new Set<() => void>();

/** The user's own choice, or null if they never picked one. */
function savedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    // The browser blocks storage
    return null;
  }
}

const deviceQuery = () => window.matchMedia?.("(prefers-color-scheme: dark)");

export const currentTheme = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light";

function apply(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  for (const listener of listeners) listener();
}

/** Call once at start. Without a saved choice, the app follows the device. */
export function startTheme(): void {
  const device = deviceQuery();
  apply(savedTheme() ?? (device?.matches ? "dark" : "light"));
  device?.addEventListener("change", (event) => {
    if (!savedTheme()) apply(event.matches ? "dark" : "light");
  });
}

export function chooseTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // The choice then lasts until the page is closed
  }
  apply(theme);
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
