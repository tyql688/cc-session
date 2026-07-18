import { backendToken, withBackendToken } from "@/lib/runtime";

/**
 * Browser-download replacements for the GUI's native save dialogs, backed by
 * the headless server's export endpoints. Only called when running outside
 * Tauri — callers branch on `isTauriRuntime` first.
 */

export function downloadSessionExport(sessionId: string, format: string): void {
  const url = withBackendToken(
    `/api/export/${encodeURIComponent(sessionId)}/download?format=${encodeURIComponent(format)}`,
  );
  triggerDownload(url, null);
}

export async function downloadSessionsBatchExport(items: string[], format: string): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = backendToken();
  if (token) headers["X-SessionView-Token"] = token;

  const response = await fetch("/api/export/batch/download", {
    method: "POST",
    headers,
    body: JSON.stringify({ items, format }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    triggerDownload(objectUrl, "sessions-export.zip");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function triggerDownload(url: string, filename: string | null): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  // For same-origin endpoint URLs the server's Content-Disposition supplies
  // the filename; blob URLs need it set explicitly.
  anchor.download = filename ?? "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
