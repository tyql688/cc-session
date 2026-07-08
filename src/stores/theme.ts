import { create } from "zustand";

export type Theme = "light" | "dark" | "system";

interface ProcessLike {
  versions?: {
    node?: unknown;
  };
}

function isNodeRuntime(): boolean {
  const maybeProcess = (globalThis as { process?: ProcessLike }).process;
  return typeof maybeProcess?.versions?.node === "string";
}

function browserLocalStorage(): Storage | null {
  if (isNodeRuntime()) {
    return null;
  }
  return typeof window !== "undefined" ? window.localStorage : null;
}

function readStoredTheme(): Theme {
  try {
    const storage = browserLocalStorage();
    if (storage === null || typeof storage.getItem !== "function") {
      return "system";
    }
    const stored = storage.getItem("sessionview-theme");
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch (error) {
    console.error("Failed to read theme from localStorage:", error);
    return "system";
  }
}

function writeStoredTheme(theme: Theme): void {
  try {
    const storage = browserLocalStorage();
    if (storage === null || typeof storage.setItem !== "function") {
      return;
    }
    storage.setItem("sessionview-theme", theme);
  } catch (error) {
    console.error("Failed to write theme to localStorage:", error);
  }
}

/** Resolve the OS color scheme; defaults to light when unavailable (tests/SSR). */
function resolveSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") {
    return;
  }
  // Always set an explicit light/dark attribute, resolving "system" via the OS
  // so the app shell follows OS dark mode.
  const resolved = theme === "system" ? resolveSystemTheme() : theme;
  document.documentElement.setAttribute("data-theme", resolved);
  useThemeStore.setState({ resolvedTheme: resolved });
  writeStoredTheme(theme);
}

interface ThemeState {
  theme: Theme;
  /** The concrete light/dark value after resolving "system" against the OS —
   * for consumers that must feed a renderer (e.g. mermaid) a real theme. */
  resolvedTheme: "light" | "dark";
}

const initialTheme = readStoredTheme();

const useThemeStore = create<ThemeState>(() => ({
  theme: initialTheme,
  resolvedTheme: initialTheme === "system" ? resolveSystemTheme() : initialTheme,
}));

export function setTheme(t: Theme) {
  useThemeStore.setState({ theme: t });
  applyTheme(t);
}

export function getTheme(): Theme {
  return useThemeStore.getState().theme;
}

export function useTheme(): Theme {
  return useThemeStore((state) => state.theme);
}

export function useResolvedTheme(): "light" | "dark" {
  return useThemeStore((state) => state.resolvedTheme);
}

// Re-apply on OS theme change while tracking it ("system" mode), so a live
// light<->dark switch in the OS is reflected without a restart.
if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (useThemeStore.getState().theme === "system") {
      applyTheme("system");
    }
  });
}
