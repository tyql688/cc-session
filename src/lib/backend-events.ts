import { listen, type UnlistenFn as TauriUnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime, withBackendToken } from "@/lib/runtime";
import type { MaintenanceEvent } from "@/lib/types";

type RuntimeUnlistenFn = () => void | Promise<void>;

export interface BackendEventPayloads {
  "maintenance-status": MaintenanceEvent;
}

export function listenBackendEvent<Name extends keyof BackendEventPayloads>(
  name: Name,
  handler: (payload: BackendEventPayloads[Name]) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime) {
    return Promise.resolve(listenViaSse(name, handler));
  }
  return listen<BackendEventPayloads[Name]>(name, (event) => {
    handler(event.payload);
  }).then((unlisten) => safeUnlisten(name, unlisten));
}

export type UnlistenFn = () => void;

/** Shared SSE connection to the headless server; one stream fans out to all
 * listeners. Created lazily on first subscription. */
let sseSource: EventSource | null = null;

function eventSource(): EventSource {
  if (sseSource === null) {
    sseSource = new EventSource(withBackendToken("/api/events"));
    sseSource.onerror = () => {
      // EventSource auto-reconnects; log so a dead server is diagnosable.
      console.warn("backend event stream error (browser will retry)");
    };
  }
  return sseSource;
}

function listenViaSse<Name extends keyof BackendEventPayloads>(
  name: Name,
  handler: (payload: BackendEventPayloads[Name]) => void,
): UnlistenFn {
  const source = eventSource();
  const onMessage = (event: MessageEvent<string>) => {
    let payload: BackendEventPayloads[Name];
    try {
      payload = JSON.parse(event.data) as BackendEventPayloads[Name];
    } catch (error) {
      console.error(`Failed to parse backend event ${name}:`, error);
      return;
    }
    handler(payload);
  };
  source.addEventListener(name, onMessage);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    source.removeEventListener(name, onMessage);
  };
}

function safeUnlisten(eventName: string, unlisten: TauriUnlistenFn): UnlistenFn {
  // Tauri's d.ts says unlisten is sync, but the JS runtime returns a Promise.
  const runtimeUnlisten: RuntimeUnlistenFn = unlisten;
  let called = false;

  return () => {
    if (called) return;
    called = true;

    try {
      void Promise.resolve(runtimeUnlisten()).catch((error: unknown) => {
        reportUnlistenError(eventName, error);
      });
    } catch (error) {
      reportUnlistenError(eventName, error);
    }
  };
}

function reportUnlistenError(eventName: string, error: unknown) {
  const eventPluginInternals: unknown = Reflect.get(globalThis, "__TAURI_EVENT_PLUGIN_INTERNALS__");
  const expectedDevCleanupNoise =
    error instanceof TypeError && error.message.includes("unregisterListener") && eventPluginInternals == null;
  if (expectedDevCleanupNoise) return;
  console.warn(`Failed to unlisten backend event ${eventName}:`, error);
}
