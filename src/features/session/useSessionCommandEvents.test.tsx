import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { dispatchSessionCommand, SESSION_COMMAND_EVENTS } from "../../lib/session-command-events";
import { useSessionCommandEvents } from "./useSessionCommandEvents";

describe("useSessionCommandEvents", () => {
  it("runs every session command while the view is active", () => {
    const commands: string[] = [];
    renderHook(() =>
      useSessionCommandEvents({
        active: true,
        onResume: () => commands.push("resume"),
        onExport: () => commands.push("export"),
        onFavorite: () => commands.push("favorite"),
        onSessionSearch: () => commands.push("sessionSearch"),
        onFindNext: () => commands.push("findNext"),
        onFindPrev: () => commands.push("findPrev"),
      }),
    );

    dispatchSessionCommand(SESSION_COMMAND_EVENTS.resume);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.exportSession);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.favorite);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.sessionSearch);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.findNext);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.findPrev);

    expect(commands).toEqual(["resume", "export", "favorite", "sessionSearch", "findNext", "findPrev"]);
  });

  it("ignores commands while inactive and reads active state live", () => {
    const commands: string[] = [];
    const { rerender } = renderHook(
      ({ active }: { active: boolean }) =>
        useSessionCommandEvents({
          active,
          onResume: () => commands.push("resume"),
          onExport: () => {},
          onFavorite: () => {},
          onSessionSearch: () => {},
          onFindNext: () => {},
          onFindPrev: () => {},
        }),
      { initialProps: { active: false } },
    );

    dispatchSessionCommand(SESSION_COMMAND_EVENTS.resume);
    rerender({ active: true });
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.resume);

    expect(commands).toEqual(["resume"]);
  });

  it("removes document listeners on cleanup", () => {
    const commands: string[] = [];
    const { unmount } = renderHook(() =>
      useSessionCommandEvents({
        active: true,
        onResume: () => commands.push("resume"),
        onExport: () => {},
        onFavorite: () => {},
        onSessionSearch: () => {},
        onFindNext: () => {},
        onFindPrev: () => {},
      }),
    );

    unmount();
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.resume);

    expect(commands).toEqual([]);
  });
});
