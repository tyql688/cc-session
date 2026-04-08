import { createSignal } from "solid-js";
import { getProviderCatalog } from "../lib/tauri";
import type { Provider, ProviderCatalogItem } from "../lib/types";
import { getDisplayLabel as getFallbackDisplayLabel } from "../lib/provider-registry";

type ProviderCatalogMap = Partial<Record<Provider, ProviderCatalogItem>>;
type ProviderWatchStrategy = ProviderCatalogItem["watch_strategy"];
type ProviderSortOrder = ProviderCatalogItem["sort_order"];

const [providerCatalog, setProviderCatalog] = createSignal<ProviderCatalogMap>(
  {},
);

const FALLBACK_WATCH_STRATEGIES: Record<Provider, ProviderWatchStrategy> = {
  claude: "fs",
  codex: "fs",
  gemini: "poll",
  cursor: "fs",
  opencode: "poll",
  kimi: "fs",
  "cc-mirror": "fs",
  qwen: "fs",
};

const FALLBACK_SORT_ORDERS: Record<Provider, ProviderSortOrder> = {
  claude: 0,
  "cc-mirror": 1,
  codex: 2,
  gemini: 3,
  cursor: 4,
  opencode: 5,
  kimi: 6,
  qwen: 7,
};

let loadPromise: Promise<void> | null = null;

export async function loadProviderCatalog() {
  if (Object.keys(providerCatalog()).length > 0) {
    return;
  }

  if (loadPromise) return loadPromise;

  loadPromise = getProviderCatalog()
    .then((items) => {
      const next: ProviderCatalogMap = {};
      for (const item of items) {
        next[item.key] = item;
      }
      setProviderCatalog(next);
    })
    .catch(() => {})
    .finally(() => {
      loadPromise = null;
    });

  return loadPromise;
}

export function getProviderCatalogItem(provider: Provider) {
  return providerCatalog()[provider];
}

export function getProviderLabel(
  provider: Provider,
  variantName?: string,
): string {
  if (provider === "cc-mirror" && variantName) {
    return variantName;
  }

  return (
    getProviderCatalogItem(provider)?.label ??
    getFallbackDisplayLabel(provider, variantName)
  );
}

export function getProviderColor(provider: Provider): string {
  return getProviderCatalogItem(provider)?.color ?? `var(--${provider})`;
}

export function getProviderWatchStrategy(
  provider: Provider,
): ProviderWatchStrategy {
  return (
    getProviderCatalogItem(provider)?.watch_strategy ??
    FALLBACK_WATCH_STRATEGIES[provider]
  );
}

export function getProvidersForWatchStrategy(
  strategy: ProviderWatchStrategy,
): Provider[] {
  return (Object.keys(FALLBACK_SORT_ORDERS) as Provider[]).filter(
    (provider) => getProviderWatchStrategy(provider) === strategy,
  );
}

export function getProviderSortOrder(provider: Provider): ProviderSortOrder {
  return (
    getProviderCatalogItem(provider)?.sort_order ??
    FALLBACK_SORT_ORDERS[provider]
  );
}
