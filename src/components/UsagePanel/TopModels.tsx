import { For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import { useI18n } from "../../i18n/index";
import type { ModelCost } from "../../lib/types";
import { fmtCost, fmtTokens } from "./formatters";

export interface TopModelsProps {
  topModels: Accessor<ModelCost[]>;
  maxTopModelCost: Accessor<number>;
  formatModelName: (model: string) => string;
}

export function TopModels(props: TopModelsProps) {
  const { t } = useI18n();

  return (
    <section class="usage-card usage-spotlight-card">
      <div class="usage-section-header">
        <div>
          <div class="usage-section-title">{t("usage.topModels")}</div>
          <div class="usage-section-subtitle">{t("usage.costByModel")}</div>
        </div>
      </div>

      <Show
        when={props.topModels().length > 0}
        fallback={<div class="usage-empty-inline">{t("usage.noData")}</div>}
      >
        <div class="usage-spotlight-list">
          <For each={props.topModels()}>
            {(row) => (
              <div class="usage-spotlight-item">
                <div class="usage-spotlight-meta">
                  <span class="usage-model-tag">
                    {props.formatModelName(row.model)}
                  </span>
                  <span class="usage-spotlight-tokens">
                    {fmtTokens(
                      row.input_tokens + row.output_tokens + row.cache_tokens,
                    )}
                  </span>
                </div>
                <div class="usage-spotlight-bar">
                  <div
                    class="usage-spotlight-bar-fill"
                    style={{
                      width: `${Math.max(
                        8,
                        props.maxTopModelCost() > 0
                          ? (row.cost / props.maxTopModelCost()) * 100
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
                <div class="usage-spotlight-cost">{fmtCost(row.cost)}</div>
              </div>
            )}
          </For>
        </div>
      </Show>
    </section>
  );
}
