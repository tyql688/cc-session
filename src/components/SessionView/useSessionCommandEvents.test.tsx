import { render } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { describe, expect, it } from "vitest";

import {
  dispatchSessionCommand,
  SESSION_COMMAND_EVENTS,
} from "../../lib/session-command-events";
import { useSessionCommandEvents } from "./useSessionCommandEvents";

function CommandHarness(props: {
  active: () => boolean;
  record: (command: string) => void;
}) {
  useSessionCommandEvents({
    active: props.active,
    onResume: () => props.record("resume"),
    onExport: () => props.record("export"),
    onFavorite: () => props.record("favorite"),
    onWatch: () => props.record("watch"),
    onDelete: () => props.record("delete"),
    onSessionSearch: () => props.record("sessionSearch"),
  });

  return <div />;
}

describe("useSessionCommandEvents", () => {
  it("runs every session command while the view is active", () => {
    const commands: string[] = [];
    render(() => (
      <CommandHarness
        active={() => true}
        record={(name) => commands.push(name)}
      />
    ));

    dispatchSessionCommand(SESSION_COMMAND_EVENTS.resume);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.exportSession);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.favorite);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.watch);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.delete);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.sessionSearch);

    expect(commands).toEqual([
      "resume",
      "export",
      "favorite",
      "watch",
      "delete",
      "sessionSearch",
    ]);
  });

  it("ignores commands while inactive and reads active state live", () => {
    const [active, setActive] = createSignal(false);
    const commands: string[] = [];
    render(() => (
      <CommandHarness active={active} record={(name) => commands.push(name)} />
    ));

    dispatchSessionCommand(SESSION_COMMAND_EVENTS.resume);
    setActive(true);
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.resume);

    expect(commands).toEqual(["resume"]);
  });

  it("removes document listeners on cleanup", () => {
    const commands: string[] = [];
    const { unmount } = render(() => (
      <CommandHarness
        active={() => true}
        record={(name) => commands.push(name)}
      />
    ));

    unmount();
    dispatchSessionCommand(SESSION_COMMAND_EVENTS.resume);

    expect(commands).toEqual([]);
  });
});
