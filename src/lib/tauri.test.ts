import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();

vi.mock("@tauri-apps/api/core", () => ({
  invoke,
}));

describe("tauri api wrappers", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  it("getSessionDetail sends only sessionId", async () => {
    const { getSessionDetail } = await import("./tauri");

    await getSessionDetail("sess-1");

    expect(invoke).toHaveBeenCalledWith("get_session_detail", {
      sessionId: "sess-1",
    });
  });

  it("exportSession uses the simplified session-based payload", async () => {
    const { exportSession } = await import("./tauri");

    await exportSession("sess-1", "json", "/tmp/out.json");

    expect(invoke).toHaveBeenCalledWith("export_session", {
      sessionId: "sess-1",
      format: "json",
      outputPath: "/tmp/out.json",
    });
  });

  it("resumeSession sends sessionId plus terminal app", async () => {
    const { resumeSession } = await import("./tauri");

    await resumeSession("sess-1", "iTerm");

    expect(invoke).toHaveBeenCalledWith("resume_session", {
      sessionId: "sess-1",
      terminalApp: "iTerm",
    });
  });

  it("getResumeCommand sends only sessionId", async () => {
    const { getResumeCommand } = await import("./tauri");

    await getResumeCommand("sess-1");

    expect(invoke).toHaveBeenCalledWith("get_resume_command", {
      sessionId: "sess-1",
    });
  });

  it("trashSession sends only sessionId", async () => {
    const { trashSession } = await import("./tauri");

    await trashSession("sess-1");

    expect(invoke).toHaveBeenCalledWith("trash_session", {
      sessionId: "sess-1",
    });
  });

  it("getProviderSnapshots calls the snapshot endpoint", async () => {
    const { getProviderSnapshots } = await import("./tauri");

    await getProviderSnapshots();

    expect(invoke).toHaveBeenCalledWith("get_provider_snapshots");
  });

  it("exportSessionsBatch sends string ids instead of tuple payloads", async () => {
    const { exportSessionsBatch } = await import("./tauri");

    await exportSessionsBatch(["s1", "s2"], "markdown", "/tmp/export.zip");

    expect(invoke).toHaveBeenCalledWith("export_sessions_batch", {
      items: ["s1", "s2"],
      format: "markdown",
      outputPath: "/tmp/export.zip",
    });
  });
});
