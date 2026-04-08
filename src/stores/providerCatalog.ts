import { createSignal } from "solid-js";
import { getProviderCatalog } from "../lib/tauri";
import type { Provider, ProviderCatalogItem } from "../lib/types";
import { getDisplayLabel as getFallbackDisplayLabel } from "../lib/provider-registry";

type ProviderCatalogMap = Partial<Record<Provider, ProviderCatalogItem>>;

const [providerCatalog, setProviderCatalog] = createSignal<ProviderCatalogMap>(
  {},
);

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
