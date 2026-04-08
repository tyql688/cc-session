import { describe, expect, it } from "vitest";
import { getProviderWatchBehavior } from "./provider-registry";
import type { Provider } from "./types";

const ALL_PROVIDERS: Provider[] = [
  "claude",
  "codex",
  "gemini",
  "cursor",
  "opencode",
  "kimi",
  "cc-mirror",
  "qwen",
];

describe("provider-registry", () => {
  it("getProviderWatchBehavior returns config for all providers", () => {
    for (const key of ALL_PROVIDERS) {
      const watch = getProviderWatchBehavior(key);
      expect(watch).toBeDefined();
      expect(watch.debounceMs).toBeGreaterThan(0);
    }
  });
});
