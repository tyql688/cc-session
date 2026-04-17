import { For, Show } from "solid-js";
import type { Accessor } from "solid-js";
import { useI18n } from "../../i18n/index";
import type {
  ChartMetric,
  HoveredDaySummary,
  UsageDailyChartData,
} from "../../lib/usage";
import type { ProviderChipInfo } from "./Toolbar";

export interface ChartProps {
  dailyChartData: Accessor<UsageDailyChartData>;
  hoveredDate: Accessor<string | null>;
  setHoveredDate: (date: string | null) => void;
  hoveredDaySummary: Accessor<HoveredDaySummary | null>;
  chartMetric: Accessor<ChartMetric>;
  setChartMetric: (metric: ChartMetric) => void;
  activeRangeLabel: Accessor<string>;
  fmtChartValue: (n: number) => string;
  providerInfo: (key: string) => ProviderChipInfo;
}

export function Chart(props: ChartProps) {
  const { t } = useI18n();

  return (
    <section class="usage-card usage-chart-card">
      <div class="usage-section-header">
        <div class="usage-section-title-row">
          <div class="usage-chart-heading">
            <div class="usage-section-title">{t("usage.dailyUsage")}</div>
            <div class="usage-section-subtitle">{props.activeRangeLabel()}</div>
            <div class="usage-metric-toggle">
              <button
                class={`usage-metric-btn${props.chartMetric() === "tokens" ? " active" : ""}`}
                aria-pressed={props.chartMetric() === "tokens"}
                onClick={() => props.setChartMetric("tokens")}
                type="button"
              >
                {t("usage.tokens")}
              </button>
              <button
                class={`usage-metric-btn${props.chartMetric() === "cost" ? " active" : ""}`}
                aria-pressed={props.chartMetric() === "cost"}
                onClick={() => props.setChartMetric("cost")}
                type="button"
              >
                {t("usage.cost")}
              </button>
            </div>
          </div>
        </div>
        <div class="usage-chart-inspector">
          <Show
            when={props.hoveredDaySummary()}
            fallback={
              <div class="usage-chart-hint">{t("usage.hoverHint")}</div>
            }
          >
            {(summary) => (
              <>
                <div class="usage-chart-inspector-date">{summary().date}</div>
                <div class="usage-chart-inspector-total">
                  {props.fmtChartValue(summary().total)}
                </div>
                <div class="usage-chart-inspector-breakdown">
                  <For each={summary().breakdown}>
                    {(entry) => (
                      <span class="usage-chart-inspector-item">
                        <span
                          class="usage-provider-dot"
                          style={{ background: entry.color }}
                        />
                        {entry.label}
                        <strong>{props.fmtChartValue(entry.value)}</strong>
                      </span>
                    )}
                  </For>
                </div>
              </>
            )}
          </Show>
        </div>
      </div>

      <Show when={props.dailyChartData().dates.length > 0}>
        <>
          <div class="usage-chart-wrap">
            <div class="usage-daily-bars">
              <For each={props.dailyChartData().dates}>
                {(date) => {
                  const providers = props.dailyChartData().byDate.get(date)!;
                  const max = props.dailyChartData().maxValue;
                  const active = () => props.hoveredDate() === date;
                  return (
                    <button
                      class={`usage-bar-col${active() ? " active" : ""}`}
                      onBlur={() => props.setHoveredDate(null)}
                      onFocus={() => props.setHoveredDate(date)}
                      onMouseEnter={() => props.setHoveredDate(date)}
                      onMouseLeave={() => props.setHoveredDate(null)}
                      title={`${date} · ${props.fmtChartValue(
                        [...providers.values()].reduce(
                          (sum, value) => sum + value,
                          0,
                        ),
                      )}`}
                      type="button"
                    >
                      <For
                        each={props
                          .dailyChartData()
                          .providers.slice()
                          .reverse()}
                      >
                        {(provider) => {
                          const val = providers.get(provider) ?? 0;
                          const color = () =>
                            props.providerInfo(provider).color;
                          return (
                            <Show when={val > 0}>
                              <span
                                class={`usage-bar-seg${
                                  props.hoveredDate() && !active()
                                    ? " usage-bar-seg-muted"
                                    : ""
                                }`}
                                style={{
                                  height: `${Math.max(4, (val / max) * 100)}%`,
                                  background: color(),
                                }}
                              />
                            </Show>
                          );
                        }}
                      </For>
                    </button>
                  );
                }}
              </For>
            </div>
            <div class="usage-bar-labels">
              <For each={props.dailyChartData().dates}>
                {(date) => (
                  <span
                    class={props.hoveredDate() === date ? "active" : undefined}
                  >
                    {date.slice(5)}
                  </span>
                )}
              </For>
            </div>
          </div>

          <div class="usage-legend">
            <For each={props.dailyChartData().providers}>
              {(provider) => (
                <span class="usage-legend-item">
                  <span
                    class="usage-provider-dot"
                    style={{
                      background: props.providerInfo(provider).color,
                    }}
                  />
                  {props.providerInfo(provider).label}
                </span>
              )}
            </For>
          </div>
        </>
      </Show>
    </section>
  );
}
