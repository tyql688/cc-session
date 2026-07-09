import { listen, type UnlistenFn as TauriUnlistenFn } from "@tauri-apps/api/event";
import type { MaintenanceEvent } from "@/lib/types";

type RuntimeUnlistenFn = () => void | Promise<void>;

export interface BackendEventPayloads {
  "maintenance-status": MaintenanceEvent;
}

export function listenBackendEvent<Name extends keyof BackendEventPayloads>(
  name: Name,
  handler: (payload: BackendEventPayloads[Name]) => void,
): Promise<UnlistenFn> {
  return listen<BackendEventPayloads[Name]>(name, (event) => {
    handler(event.payload);
  }).then((unlisten) => safeUnlisten(name, unlisten));
}

export type UnlistenFn = () => void;

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
