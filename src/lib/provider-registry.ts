import type { Provider } from "./types";

export interface ProviderWatchBehavior {
  debounceMs: number;
  matchPrefix: boolean;
}

const WATCH_BEHAVIORS: Record<Provider, ProviderWatchBehavior> = {
  claude: { debounceMs: 300, matchPrefix: false },
  codex: { debounceMs: 300, matchPrefix: false },
  gemini: { debounceMs: 2000, matchPrefix: true },
  cursor: { debounceMs: 300, matchPrefix: false },
  opencode: { debounceMs: 2000, matchPrefix: false },
  kimi: { debounceMs: 300, matchPrefix: false },
  "cc-mirror": { debounceMs: 300, matchPrefix: false },
  qwen: { debounceMs: 300, matchPrefix: false },
};

export function getProviderWatchBehavior(
  provider: Provider,
): ProviderWatchBehavior {
  return WATCH_BEHAVIORS[provider];
}
