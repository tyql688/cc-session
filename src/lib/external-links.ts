import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "@/lib/runtime";
import { openInFolder } from "@/lib/tauri";

const EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Local file targets (file:// URLs, absolute or ~-relative paths) reveal in
 * the system file manager instead of launching — never execute a file. */
export function localPathFrom(rawUrl: string): string | null {
  if (rawUrl.startsWith("file://")) {
    try {
      const url = new URL(rawUrl);
      let pathname = decodeURIComponent(url.pathname);
      // file:///C:/x parses with a leading slash before the drive letter.
      if (/^\/[A-Za-z]:\//.test(pathname)) pathname = pathname.slice(1);
      return pathname;
    } catch {
      return null;
    }
  }
  if (rawUrl.startsWith("/") || rawUrl.startsWith("~/")) return rawUrl;
  return null;
}

function normalizeExternalUrl(rawUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (error) {
    throw new Error(`Invalid external URL: ${rawUrl}`, { cause: error });
  }

  if (!EXTERNAL_URL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported external URL protocol: ${parsed.protocol}`);
  }

  return parsed.href;
}

export async function openExternalUrl(rawUrl: string): Promise<void> {
  const localPath = localPathFrom(rawUrl);
  if (localPath !== null) {
    await openInFolder(localPath);
    return;
  }
  const url = normalizeExternalUrl(rawUrl);
  if (!isTauriRuntime) {
    // Headless shell: the frontend runs in a real browser, which can open
    // links itself — no backend round-trip.
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }
  await invoke<void>("plugin:opener|open_url", { url });
}
