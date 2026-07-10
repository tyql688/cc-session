import { beforeEach, describe, expect, it, vi } from "vitest";
import { createKeyboardHandler, type KeyboardDeps } from "@/app/KeyboardShortcuts";
import { SESSION_COMMAND_EVENTS } from "@/lib/session-command-events";

function makeDeps(overrides: Partial<KeyboardDeps> = {}): KeyboardDeps {
  return {
    activeTabId: () => "tab-1",
    openTabs: () => [],
    setActiveTabId: vi.fn(),
    setShowKeyboardOverlay: vi.fn(),
    setShowSearchOverlay: vi.fn(),
    setActiveView: vi.fn(),
    closeTab: vi.fn(),
    closeAllTabs: vi.fn(),
    reopenClosedTab: vi.fn(),
    toggleSidebar: vi.fn(),
    splitToRight: vi.fn(),
    focusAdjacentGroup: vi.fn(),
    startRebuildIndex: vi.fn(),
    ...overrides,
  };
}

function keydown(key: string, mods: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", { key, cancelable: true, ...mods });
  return event;
}

describe("createKeyboardHandler", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    (document.activeElement as HTMLElement | null)?.blur?.();
  });

  it("closes the tab on Cmd+W even with CapsLock (uppercase key)", () => {
    const deps = makeDeps();
    createKeyboardHandler(deps)(keydown("W", { metaKey: true }));
    expect(deps.closeTab).toHaveBeenCalledWith("tab-1");
  });

  it("does not delete the session while typing in an input", () => {
    const deleted = vi.fn();
    document.addEventListener(SESSION_COMMAND_EVENTS.delete, deleted);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    createKeyboardHandler(makeDeps())(keydown("Backspace", { metaKey: true }));
    expect(deleted).not.toHaveBeenCalled();

    input.blur();
    createKeyboardHandler(makeDeps())(keydown("Backspace", { metaKey: true }));
    expect(deleted).toHaveBeenCalledTimes(1);
    document.removeEventListener(SESSION_COMMAND_EVENTS.delete, deleted);
  });

  it("Cmd+B toggles the sidebar and Cmd+D toggles favorite", () => {
    const deps = makeDeps();
    const favorite = vi.fn();
    document.addEventListener(SESSION_COMMAND_EVENTS.favorite, favorite);

    createKeyboardHandler(deps)(keydown("b", { metaKey: true }));
    expect(deps.toggleSidebar).toHaveBeenCalledTimes(1);

    createKeyboardHandler(deps)(keydown("d", { metaKey: true }));
    expect(favorite).toHaveBeenCalledTimes(1);
    document.removeEventListener(SESSION_COMMAND_EVENTS.favorite, favorite);
  });

  it("Cmd+Shift+T reopens the last closed tab", () => {
    const deps = makeDeps();
    createKeyboardHandler(deps)(keydown("T", { metaKey: true, shiftKey: true }));
    expect(deps.reopenClosedTab).toHaveBeenCalledTimes(1);
  });

  it("Cmd+P opens the global search overlay", () => {
    const deps = makeDeps();
    createKeyboardHandler(deps)(keydown("p", { metaKey: true }));
    expect(deps.setShowSearchOverlay).toHaveBeenCalledWith(true);
  });

  it("Cmd+G / Cmd+Shift+G step through search matches", () => {
    const next = vi.fn();
    const prev = vi.fn();
    document.addEventListener(SESSION_COMMAND_EVENTS.findNext, next);
    document.addEventListener(SESSION_COMMAND_EVENTS.findPrev, prev);

    const handler = createKeyboardHandler(makeDeps());
    handler(keydown("g", { metaKey: true }));
    handler(keydown("G", { metaKey: true, shiftKey: true }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(prev).toHaveBeenCalledTimes(1);

    document.removeEventListener(SESSION_COMMAND_EVENTS.findNext, next);
    document.removeEventListener(SESSION_COMMAND_EVENTS.findPrev, prev);
  });
});
