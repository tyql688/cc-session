import { For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import { useI18n } from "../../i18n/index";
import { fmtCost, fmtTrend, trendClass } from "./formatters";

export interface SummaryStatItem {
  label: string;
  value: string;
  trend: number | null;
}

export interface TokenBreakdownItem {
  label: string;
  value: string;
  share: string;
}

export interface SummaryCardsProps {
  totalCost: Accessor<number>;
  totalCostTrend: Accessor<number | null>;
  summaryStats: Accessor<SummaryStatItem[]>;
  tokenBreakdown: Accessor<TokenBreakdownItem[]>;
}

export function SummaryCards(props: SummaryCardsProps) {
  const { t } = useI18n();

  return (
    <section class="usage-card usage-summary-card">
      <div class="usage-summary-main">
        <div class="usage-summary-hero">
          <span class="usage-overline">{t("usage.estCost")}</span>
          <div class="usage-cost-row">
            <div class="usage-cost-hero">{fmtCost(props.totalCost())}</div>
            <Show when={props.totalCostTrend() !== null}>
              <span
                class={`usage-trend ${trendClass(props.totalCostTrend(), true)}`}
              >
                {fmtTrend(props.totalCostTrend())}
              </span>
            </Show>
          </div>
          <div class="usage-cost-detail">{t("usage.pricingNote")}</div>
        </div>

        <div class="usage-summary-kpis">
          <For each={props.summaryStats()}>
            {(item) => (
              <div class="usage-summary-stat">
                <span class="usage-kpi-label">{item.label}</span>
                <strong class="usage-kpi-value">{item.value}</strong>
                <span class="usage-kpi-sub">
                  <Show when={item.trend !== null} fallback={"\u00A0"}>
                    <span class={`usage-trend ${trendClass(item.trend)}`}>
                      {fmtTrend(item.trend)}
                    </span>
                  </Show>
                </span>
              </div>
            )}
          </For>
        </div>
      </div>

      <div class="usage-breakdown-grid">
        <For each={props.tokenBreakdown()}>
          {(item) => (
            <div class="usage-breakdown-item">
              <span class="usage-breakdown-label">{item.label}</span>
              <strong class="usage-breakdown-value">{item.value}</strong>
              <span class="usage-breakdown-pct">{item.share}</span>
            </div>
          )}
        </For>
      </div>

      <div class="usage-summary-notes">
        <span class="usage-note-pill">{t("usage.rebuildKeepsSessions")}</span>
        <span class="usage-note-pill">{t("usage.pricingSourceNote")}</span>
      </div>
    </section>
  );
}
