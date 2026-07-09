import { beforeEach, describe, expect, it, vi } from "vitest";

const listen = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/event", () => ({
  listen,
}));

describe("backend event helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    listen.mockReset();
  });

  it("passes backend event payloads to the handler", async () => {
    const handler = vi.fn();
    let eventHandler: ((event: { payload: { phase: string } }) => void) | undefined;
    listen.mockImplementation(async (_name, callback) => {
      eventHandler = callback;
      return () => {};
    });

    const { listenBackendEvent } = await import("@/lib/backend-events");
    await listenBackendEvent("maintenance-status", handler);
    eventHandler?.({ payload: { phase: "started" } });

    expect(handler).toHaveBeenCalledWith({ phase: "started" });
  });

  it("absorbs async unlisten failures", async () => {
    const unlistenError = new TypeError("Cannot read properties of undefined");
    const rawUnlisten = vi.fn(() => Promise.reject(unlistenError));
    listen.mockResolvedValue(rawUnlisten);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const { listenBackendEvent } = await import("@/lib/backend-events");
      const unlisten = await listenBackendEvent("maintenance-status", vi.fn());

      unlisten();
      await Promise.resolve();

      expect(rawUnlisten).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith(
        "Failed to unlisten backend event maintenance-status:",
        unlistenError,
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("only calls the underlying unlisten once", async () => {
    const rawUnlisten = vi.fn();
    listen.mockResolvedValue(rawUnlisten);

    const { listenBackendEvent } = await import("@/lib/backend-events");
    const unlisten = await listenBackendEvent("maintenance-status", vi.fn());

    unlisten();
    unlisten();

    expect(rawUnlisten).toHaveBeenCalledTimes(1);
  });

  it("silences Tauri event plugin unregister compatibility noise", async () => {
    const unlistenError = new TypeError("Cannot read properties of undefined (reading 'unregisterListener')");
    const rawUnlisten = vi.fn(() => Promise.reject(unlistenError));
    listen.mockResolvedValue(rawUnlisten);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const { listenBackendEvent } = await import("@/lib/backend-events");
      const unlisten = await listenBackendEvent("maintenance-status", vi.fn());

      unlisten();
      await Promise.resolve();

      expect(rawUnlisten).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
