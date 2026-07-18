import { invoke } from "@tauri-apps/api/core";
import { backendToken, isTauriRuntime } from "@/lib/runtime";

/**
 * Transport bridge for backend commands: Tauri IPC in the desktop shell,
 * `POST /api/invoke/{command}` against the headless server in a browser.
 * Argument objects are identical in both shells (camelCase, mirroring
 * `BackendCommandMap`), so callers never branch on the runtime.
 */
export async function invokeBackend<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauriRuntime) {
    return args === undefined ? invoke<T>(command) : invoke<T>(command, args);
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = backendToken();
  if (token) headers["X-SessionView-Token"] = token;

  const response = await fetch(`/api/invoke/${command}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args ?? {}),
  });
  if (!response.ok) {
    // The server responds with the command's error chain as plain text —
    // surface it verbatim so sentinel checks (load-canceled) keep working.
    throw new Error(await response.text());
  }
  return (await response.json()) as T;
}
