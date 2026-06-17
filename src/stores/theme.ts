import { createSignal } from "solid-js";

export type Theme = "light" | "dark" | "system";

function readStoredTheme(): Theme {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function"
  ) {
    return "system";
  }
  try {
    const stored = localStorage.getItem("cc-session-theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch (error) {
    console.error("Failed to read theme from localStorage:", error);
    return "system";
  }
}

function writeStoredTheme(theme: Theme): void {
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.setItem !== "function"
  ) {
    return;
  }
  try {
    localStorage.setItem("cc-session-theme", theme);
  } catch (error) {
    console.error("Failed to write theme to localStorage:", error);
  }
}

function getInitialTheme(): Theme {
  // In non-DOM environments (vitest under node) `localStorage` and
  // `document` are not defined. The module is imported transitively
  // by components included in tests, so we must degrade safely.
  return readStoredTheme();
}

/** Resolve the OS color scheme; defaults to light when unavailable (tests/SSR). */
function resolveSystemTheme(): "light" | "dark" {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") {
    return;
  }
  // Always set an explicit light/dark attribute, resolving "system" via the OS
  // so the app shell follows OS dark mode. (It used to removeAttribute for
  // "system", falling back to the light :root defaults, which left a dark-mode
  // OS rendering a fully light app while Mermaid diagrams rendered dark.)
  const resolved = theme === "system" ? resolveSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
  writeStoredTheme(theme);
}

const [theme, setThemeSignal] = createSignal<Theme>(getInitialTheme());

export function setTheme(t: Theme) {
  setThemeSignal(t);
  applyTheme(t);
}

// Re-apply on OS theme change while we're tracking it ("system" mode), so a
// live light<->dark switch in the OS is reflected without a restart.
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (theme() === "system") {
        applyTheme("system");
      }
    });
}

export { theme };
