import { createSignal } from "solid-js";

export type Theme = "light" | "dark" | "system";

function getInitialTheme(): Theme {
  // In non-DOM environments (vitest under node) `localStorage` and
  // `document` are not defined. The module is imported transitively
  // by components included in tests, so we must degrade safely.
  if (typeof localStorage === "undefined") return "system";
  const stored = localStorage.getItem("cc-session-theme");
  if (stored === "light" || stored === "dark") return stored;
  return "system";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined" || typeof localStorage === "undefined") {
    return;
  }
  const root = document.documentElement;
  if (theme === "system") {
    root.removeAttribute("data-theme");
  } else {
    root.setAttribute("data-theme", theme);
  }
  localStorage.setItem("cc-session-theme", theme);
}

const [theme, setThemeSignal] = createSignal<Theme>(getInitialTheme());

export function setTheme(t: Theme) {
  setThemeSignal(t);
  applyTheme(t);
}

export { theme };
