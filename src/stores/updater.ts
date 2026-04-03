import { createSignal } from "solid-js";
import type { Update } from "@tauri-apps/plugin-updater";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "upToDate"
  | "available"
  | "downloading"
  | "installing"
  | "error";

const [phase, setPhase] = createSignal<UpdatePhase>("idle");
const [availableVersion, setAvailableVersion] = createSignal<string | null>(
  null,
);
const [errorDetail, setErrorDetail] = createSignal<string | null>(null);

let pendingUpdate: Update | null = null;
let isChecking = false;
let resetTimer: ReturnType<typeof setTimeout> | null = null;

export { phase, availableVersion, errorDetail };

/** Clear any pending phase-reset timer. */
function clearResetTimer() {
  if (resetTimer !== null) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
}

/** Set phase after a delay, cancelling any previous delayed reset. */
function scheduleReset(target: UpdatePhase, ms: number) {
  clearResetTimer();
  resetTimer = setTimeout(() => {
    resetTimer = null;
    setPhase(target);
  }, ms);
}

export async function checkForUpdate(): Promise<void> {
  if (isChecking || phase() === "downloading" || phase() === "installing")
    return;
  isChecking = true;
  clearResetTimer();
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
      setPhase("upToDate");
      scheduleReset("idle", 3000);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[updater] check failed:", msg);
    setErrorDetail(msg);
    setPhase("error");
    scheduleReset("idle", 3000);
  } finally {
    isChecking = false;
  }
}

export async function downloadAndInstall(): Promise<void> {
  if (!pendingUpdate || phase() !== "available") return;
  const update = pendingUpdate;

  clearResetTimer();
  setPhase("downloading");
  try {
    await update.downloadAndInstall();
    setPhase("installing");
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[updater] install failed:", msg);
    setErrorDetail(msg);
    setPhase("error");
    scheduleReset("available", 3000);
  }
}
