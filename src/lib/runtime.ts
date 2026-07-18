/**
 * Shell runtime detection. The same frontend bundle runs in two shells:
 * the Tauri webview (desktop GUI) and a plain browser served by the
 * headless server. All shell-specific behavior branches on this flag —
 * command transport, event transport, window chrome, save-vs-download.
 */
export const isTauriRuntime: boolean = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const TOKEN_STORAGE_KEY = "sessionview-token";

/**
 * Auth token for the headless API, when the server was started with
 * `--token`. Arrives once as a `?token=` query parameter, is stashed in
 * sessionStorage, and is stripped from the visible URL.
 */
export function backendToken(): string | null {
  if (isTauriRuntime) return null;
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, fromQuery);
    url.searchParams.delete("token");
    window.history.replaceState(null, "", url);
  }
  return sessionStorage.getItem(TOKEN_STORAGE_KEY);
}

/** Append the auth token (if any) to a same-origin API URL. Used where a
 * request can't carry headers: SSE and browser-native downloads. */
export function withBackendToken(path: string): string {
  const token = backendToken();
  if (!token) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}token=${encodeURIComponent(token)}`;
}
