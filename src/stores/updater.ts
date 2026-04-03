import { createSignal } from "solid-js";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "installing"
  | "error";

const [phase, setPhase] = createSignal<UpdatePhase>("idle");
const [availableVersion, setAvailableVersion] = createSignal<string | null>(
  null,
);

let pendingUpdate: Update | null = null;
let isChecking = false;

export { phase, availableVersion };

export async function checkForUpdate(): Promise<void> {
  if (isChecking || phase() === "downloading" || phase() === "installing")
    return;
  isChecking = true;
  setPhase("checking");

  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (update) {
      pendingUpdate = update;
      setAvailableVersion(update.version);
      setPhase("available");
    } else {
      pendingUpdate = null;
      setAvailableVersion(null);
      setPhase("idle");
    }
  } catch {
    setPhase("error");
    setTimeout(() => setPhase("idle"), 3000);
  } finally {
    isChecking = false;
  }
}

export async function downloadAndInstall(): Promise<void> {
  if (!pendingUpdate || phase() !== "available") return;
  const update = pendingUpdate;

  setPhase("downloading");
  try {
    await update.downloadAndInstall();
    setPhase("installing");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch {
    setPhase("error");
    setTimeout(() => setPhase("available"), 3000);
  }
}
