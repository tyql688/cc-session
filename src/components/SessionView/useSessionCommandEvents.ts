import { onCleanup, onMount } from "solid-js";
import type { Accessor } from "solid-js";
import {
  SESSION_COMMAND_EVENTS,
  type SessionCommandEvent,
} from "../../lib/session-command-events";

export interface UseSessionCommandEventsOptions {
  active: Accessor<boolean>;
  onResume: () => void;
  onExport: () => void;
  onFavorite: () => void;
  onWatch: () => void;
  onDelete: () => void;
  onSessionSearch: () => void;
}

export function useSessionCommandEvents(
  opts: UseSessionCommandEventsOptions,
): void {
  const runIfActive = (callback: () => void) => {
    if (opts.active()) callback();
  };

  const handlers: Array<[SessionCommandEvent, EventListener]> = [
    [SESSION_COMMAND_EVENTS.resume, () => runIfActive(opts.onResume)],
    [SESSION_COMMAND_EVENTS.exportSession, () => runIfActive(opts.onExport)],
    [SESSION_COMMAND_EVENTS.favorite, () => runIfActive(opts.onFavorite)],
    [SESSION_COMMAND_EVENTS.watch, () => runIfActive(opts.onWatch)],
    [SESSION_COMMAND_EVENTS.delete, () => runIfActive(opts.onDelete)],
    [
      SESSION_COMMAND_EVENTS.sessionSearch,
      () => runIfActive(opts.onSessionSearch),
    ],
  ];

  onMount(() => {
    for (const [eventName, handler] of handlers) {
      document.addEventListener(eventName, handler);
    }
  });

  onCleanup(() => {
    for (const [eventName, handler] of handlers) {
      document.removeEventListener(eventName, handler);
    }
  });
}
