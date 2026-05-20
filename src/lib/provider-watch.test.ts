import { describe, expect, it } from "vitest";
import {
  getPollWatchProviders,
  getProviderWatchBehavior,
  getProviderWatchConfig,
} from "./provider-watch";
import type { Provider } from "./types";

const ALL_PROVIDERS: Provider[] = [
  "claude",
  "codex",
  "antigravity",
  "opencode",
  "kimi",
  "cc-mirror",
];

describe("provider-watch", () => {
  it("getProviderWatchBehavior returns config for all providers", () => {
    for (const key of ALL_PROVIDERS) {
      const watch = getProviderWatchBehavior(key);
      expect(watch).toBeDefined();
      expect(watch.debounceMs).toBeGreaterThan(0);
    }
  });

  it("combines provider strategy with frontend watch behavior", () => {
    const config = getProviderWatchConfig("antigravity");
    expect(config.strategy).toBe("fs");
    expect(config.debounceMs).toBeGreaterThan(0);
  });

  it("returns poll providers from the active catalog", () => {
    expect(getPollWatchProviders()).toEqual(["opencode"]);
  });
});
