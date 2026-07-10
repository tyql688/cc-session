import { type CSSProperties, type PointerEvent, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fmtCost, fmtTokens } from "@/features/usage/formatters";
import { addDays } from "@/features/usage/heatmap";
import type { ProviderChipInfo } from "@/features/usage/Toolbar";
import type { CustomDateRange } from "@/features/usage/usageView";
import { useI18n } from "@/i18n/index";
import { toLocalISODate } from "@/lib/formatters";
import type { ProjectDailyUsage } from "@/lib/types";
import { cn } from "@/lib/utils";

type TrendMetric = "tokens" | "cost";
type TrendDimension = "total" | "provider" | "model";

interface TrendDayTotals {
  date: string;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  tokens: number;
  cost: number;
}

interface TrendSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
  total: number;
}

interface TrendData {
  dates: string[];
  totals: TrendDayTotals[];
  series: TrendSeries[];
  maxValue: number;
  total: number;
}

interface TrendPoint {
  x: number;
  y: number;
  value: number;
}

interface ProjectTrendPanelProps {
  days: ProjectDailyUsage[] | null;
  loading: boolean;
  error: string | null;
  rangeDays: number | null;
  customRange: CustomDateRange | null;
  activeRangeLabel: string;
  providerInfo: (key: string) => ProviderChipInfo;
  formatModelName: (model: string) => string;
}

const TREND_MIN_WIDTH = 420;
const TREND_HEIGHT = 258;
const TREND_LEFT = 58;
const TREND_RIGHT_GUTTER = 26;
const TREND_TOP = 24;
const TREND_BOTTOM = 190;
const TREND_MODEL_COLORS = ["#0a84ff", "#14b8a6", "#8b5cf6", "#f59e0b", "#ec4899", "#64748b"];
const MAX_PROVIDER_SERIES = 8;
const MAX_MODEL_SERIES = 6;

function fmtCompactCost(value: number): string {
  if (value >= 1000) return `$${fmtTokens(value)}`;
  return fmtCost(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function makeTrendDates(
  days: ProjectDailyUsage[],
  rangeDays: number | null,
  customRange: CustomDateRange | null,
): string[] {
  if (rangeDays === null && customRange === null) {
    return [...new Set(days.map((day) => day.date))].sort();
  }

  const start = customRange?.start ?? addDays(toLocalISODate(), -Math.max(0, (rangeDays ?? 1) - 1));
  const end = customRange?.end ?? toLocalISODate();
  const result: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) {
    result.push(date);
  }
  return result;
}

function metricValue(row: ProjectDailyUsage, metric: TrendMetric): number {
  switch (metric) {
    case "tokens":
      return row.tokens;
    case "cost":
      return row.cost;
  }
}

function totalsMetricValue(totals: TrendDayTotals, metric: TrendMetric): number {
  switch (metric) {
    case "tokens":
      return totals.tokens;
    case "cost":
      return totals.cost;
  }
}

function formatTrendValue(metric: TrendMetric, value: number): string {
  return metric === "cost" ? fmtCost(value) : fmtTokens(value);
}

function formatTrendAxisValue(metric: TrendMetric, value: number): string {
  return metric === "cost" ? fmtCompactCost(value) : fmtTokens(value);
}

function isTrendMetric(value: string | undefined): value is TrendMetric {
  return value === "tokens" || value === "cost";
}

function isTrendDimension(value: string | undefined): value is TrendDimension {
  return value === "total" || value === "provider" || value === "model";
}

function addToSeries(bucket: Map<string, number[]>, id: string, index: number, value: number, length: number) {
  const values = bucket.get(id) ?? Array.from({ length }, () => 0);
  values[index] = (values[index] ?? 0) + value;
  bucket.set(id, values);
}

function seriesFromBucket(
  bucket: Map<string, number[]>,
  labelForId: (id: string) => string,
  colorForId: (id: string, index: number) => string,
  limit: number,
): TrendSeries[] {
  return [...bucket.entries()]
    .map(([id, values]) => ({
      id,
      label: labelForId(id),
      color: colorForId(id, 0),
      values,
      total: values.reduce((sum, value) => sum + value, 0),
    }))
    .filter((series) => series.total > 0)
    .sort((left, right) => right.total - left.total || left.label.localeCompare(right.label))
    .slice(0, limit)
    .map((series, index) => ({ ...series, color: colorForId(series.id, index) }));
}

function buildTrendData(
  rows: ProjectDailyUsage[],
  rangeDays: number | null,
  customRange: CustomDateRange | null,
  metric: TrendMetric,
  dimension: TrendDimension,
  providerInfo: (key: string) => ProviderChipInfo,
  formatModelName: (model: string) => string,
): TrendData {
  const dates = makeTrendDates(rows, rangeDays, customRange);
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const totals = dates.map<TrendDayTotals>((date) => ({
    date,
    turns: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    tokens: 0,
    cost: 0,
  }));
  const providerBucket = new Map<string, number[]>();
  const modelBucket = new Map<string, number[]>();

  for (const row of rows) {
    const index = dateIndex.get(row.date);
    if (index === undefined) continue;
    const day = totals[index];
    if (!day) continue;
    day.turns += row.turns;
    day.inputTokens += row.input_tokens;
    day.outputTokens += row.output_tokens;
    day.cacheReadTokens += row.cache_read_tokens;
    day.cacheWriteTokens += row.cache_write_tokens;
    day.tokens += row.tokens;
    day.cost += row.cost;

    const value = metricValue(row, metric);
    addToSeries(providerBucket, row.provider, index, value, dates.length);
    addToSeries(modelBucket, row.model.trim(), index, value, dates.length);
  }

  const totalValues = totals.map((day) => totalsMetricValue(day, metric));
  const series =
    dimension === "total"
      ? [
          {
            id: "total",
            label: "",
            color: "var(--accent)",
            values: totalValues,
            total: totalValues.reduce((sum, value) => sum + value, 0),
          },
        ].filter((seriesItem) => seriesItem.total > 0)
      : dimension === "provider"
        ? seriesFromBucket(
            providerBucket,
            (id) => providerInfo(id).label,
            (id) => providerInfo(id).color,
            MAX_PROVIDER_SERIES,
          )
        : seriesFromBucket(
            modelBucket,
            (id) => formatModelName(id),
            (_id, index) => TREND_MODEL_COLORS[index % TREND_MODEL_COLORS.length]!,
            MAX_MODEL_SERIES,
          );
  const maxValue = Math.max(...series.flatMap((seriesItem) => seriesItem.values), 1);
  const total = totalValues.reduce((sum, value) => sum + value, 0);

  return { dates, totals, series, maxValue, total };
}

function makeTickIndexes(count: number): number[] {
  if (count <= 0) return [];
  if (count <= 7) return Array.from({ length: count }, (_value, index) => index);
  return [
    ...new Set([
      0,
      Math.round((count - 1) * 0.25),
      Math.round((count - 1) * 0.5),
      Math.round((count - 1) * 0.75),
      count - 1,
    ]),
  ];
}

function pointsForSeries(values: number[], width: number, maxValue: number): TrendPoint[] {
  const right = Math.max(TREND_LEFT + 1, width - TREND_RIGHT_GUTTER);
  const chartWidth = right - TREND_LEFT;
  const chartHeight = TREND_BOTTOM - TREND_TOP;
  return values.map((value, index) => {
    const x =
      values.length <= 1 ? TREND_LEFT + chartWidth / 2 : TREND_LEFT + (index / (values.length - 1)) * chartWidth;
    const y = TREND_BOTTOM - (value / maxValue) * chartHeight;
    return { x, y, value };
  });
}

function pathFromPoints(points: TrendPoint[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function areaPathFromPoints(points: TrendPoint[]): string {
  if (points.length === 0) return "";
  return `${pathFromPoints(points)} L ${points[points.length - 1]!.x} ${TREND_BOTTOM} L ${points[0]!.x} ${TREND_BOTTOM} Z`;
}

export function ProjectTrendPanel(props: ProjectTrendPanelProps) {
  const { t } = useI18n();
  const [metric, setMetric] = useState<TrendMetric>("tokens");
  const [dimension, setDimension] = useState<TrendDimension>("total");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLButtonElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [chartWidth, setChartWidth] = useState(960);
  const trendData = useMemo(
    () =>
      buildTrendData(
        props.days ?? [],
        props.rangeDays,
        props.customRange,
        metric,
        dimension,
        props.providerInfo,
        props.formatModelName,
      ),
    [props.days, props.rangeDays, props.customRange, metric, dimension, props.providerInfo, props.formatModelName],
  );

  useLayoutEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const resize = () => {
      const next = Math.max(TREND_MIN_WIDTH, Math.round(node.getBoundingClientRect().width));
      setChartWidth((current) => (current === next ? current : next));
    };
    resize();
    const frame = requestAnimationFrame(resize);
    const observer = new ResizeObserver(resize);
    observer.observe(node);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  const activeIndexSafe =
    activeIndex !== null && activeIndex >= 0 && activeIndex < trendData.dates.length ? activeIndex : null;
  const activeTotals = activeIndexSafe !== null ? (trendData.totals[activeIndexSafe] ?? null) : null;
  const activeValue = activeTotals ? totalsMetricValue(activeTotals, metric) : trendData.total;
  const seriesPoints = trendData.series.map((seriesItem) => ({
    series: seriesItem,
    points: pointsForSeries(seriesItem.values, chartWidth, trendData.maxValue),
  }));
  const activeX =
    activeIndexSafe !== null && trendData.dates.length > 0
      ? trendData.dates.length <= 1
        ? TREND_LEFT + (Math.max(TREND_LEFT + 1, chartWidth - TREND_RIGHT_GUTTER) - TREND_LEFT) / 2
        : TREND_LEFT +
          (activeIndexSafe / (trendData.dates.length - 1)) *
            (Math.max(TREND_LEFT + 1, chartWidth - TREND_RIGHT_GUTTER) - TREND_LEFT)
      : null;
  const xTickIndexes = makeTickIndexes(trendData.dates.length);
  const chartRight = Math.max(TREND_LEFT + 1, chartWidth - TREND_RIGHT_GUTTER);
  const chartHeight = TREND_BOTTOM - TREND_TOP;
  const totalAreaPath = dimension === "total" && seriesPoints[0] ? areaPathFromPoints(seriesPoints[0].points) : "";
  const metricOptions: { value: TrendMetric; label: string }[] = [
    { value: "tokens", label: t("usage.tokens") },
    { value: "cost", label: t("usage.cost") },
  ];
  const dimensionOptions: { value: TrendDimension; label: string }[] = [
    { value: "total", label: t("usage.folderTrendTotal") },
    { value: "provider", label: t("usage.folderTrendProvider") },
    { value: "model", label: t("usage.folderTrendModel") },
  ];

  function updateActiveIndexFromPointer(event: PointerEvent<HTMLButtonElement>) {
    if (trendData.dates.length === 0) return;
    const measuredWidth = Math.round(event.currentTarget.getBoundingClientRect().width);
    if (measuredWidth > 0 && measuredWidth !== chartWidth) {
      setChartWidth(Math.max(TREND_MIN_WIDTH, measuredWidth));
    }
    const svg = svgRef.current;
    let svgX: number | null = null;
    const matrix = svg?.getScreenCTM();
    if (svg && matrix) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      svgX = point.matrixTransform(matrix.inverse()).x;
    }
    if (svgX === null) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0) return;
      svgX = ((event.clientX - rect.left) / rect.width) * chartWidth;
    }
    const ratio = clamp((svgX - TREND_LEFT) / (chartRight - TREND_LEFT), 0, 1);
    const index = trendData.dates.length <= 1 ? 0 : Math.round(ratio * (trendData.dates.length - 1));
    setActiveIndex(index);
  }
  const activeBreakdown =
    activeIndexSafe === null
      ? []
      : trendData.series
          .map((series) => ({
            id: series.id,
            label: dimension === "total" ? t("usage.folderTrendTotal") : series.label,
            color: series.color,
            value: series.values[activeIndexSafe] ?? 0,
          }))
          .filter((entry) => entry.value > 0)
          .slice(0, 4);
  const dimensionLabel =
    dimensionOptions.find((option) => option.value === dimension)?.label ?? t("usage.folderTrendTotal");

  return (
    <section className="usage-card usage-chart-card folder-detail-panel folder-trend-panel">
      <div className="usage-section-header">
        <div className="usage-section-title-row">
          <div className="usage-chart-heading">
            <div className="usage-section-title">
              <TrendingUp className="size-3.5" aria-hidden="true" />
              {t("usage.folderTrend")}
            </div>
            <div className="usage-section-subtitle">{props.activeRangeLabel}</div>
            <div className="folder-trend-controls">
              <ToggleGroup
                className="usage-metric-toggle folder-trend-toggle"
                size="sm"
                spacing={0}
                value={[metric]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (isTrendMetric(value)) {
                    setMetric(value);
                    setActiveIndex(null);
                  }
                }}
              >
                {metricOptions.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className={cn("usage-metric-btn h-auto min-w-0", metric === option.value && "active")}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <ToggleGroup
                className="usage-metric-toggle folder-trend-toggle"
                size="sm"
                spacing={0}
                value={[dimension]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (isTrendDimension(value)) {
                    setDimension(value);
                    setActiveIndex(null);
                  }
                }}
              >
                {dimensionOptions.map((option) => (
                  <ToggleGroupItem
                    key={option.value}
                    value={option.value}
                    className={cn("usage-metric-btn h-auto min-w-0", dimension === option.value && "active")}
                  >
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          </div>
        </div>
        <div className="usage-chart-inspector folder-trend-summary">
          {activeTotals ? (
            <>
              <div className="usage-chart-inspector-date">{activeTotals.date}</div>
              <div className="usage-chart-inspector-total">{formatTrendValue(metric, activeValue)}</div>
              <div className="usage-chart-inspector-breakdown">
                {activeBreakdown.map((entry) => (
                  <span key={entry.id} className="usage-chart-inspector-item">
                    <span className="usage-provider-dot" style={{ background: entry.color }} />
                    {entry.label}
                    <strong>{formatTrendValue(metric, entry.value)}</strong>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="usage-chart-hint">{t("usage.hoverHint")}</div>
          )}
        </div>
      </div>

      {props.loading ? (
        <div className="folder-detail-muted">{t("usage.loadingTrend")}</div>
      ) : props.error ? (
        <div className="folder-detail-muted">{props.error}</div>
      ) : trendData.dates.length === 0 || trendData.total === 0 || trendData.series.length === 0 ? (
        <div className="folder-detail-muted">{t("usage.noTrendData")}</div>
      ) : (
        <div className="folder-trend-chart">
          <div className="folder-trend-plot-card">
            <button
              ref={plotRef}
              type="button"
              className="folder-trend-plot"
              aria-label={t("usage.folderTrend")}
              onBlur={() => setActiveIndex(null)}
              onKeyDown={(event) => {
                if (trendData.dates.length === 0) return;
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  setActiveIndex((current) => Math.max(0, (current ?? trendData.dates.length - 1) - 1));
                } else if (event.key === "ArrowRight") {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    Math.min(trendData.dates.length - 1, (current ?? trendData.dates.length - 1) + 1),
                  );
                }
              }}
              onPointerDown={updateActiveIndexFromPointer}
              onPointerLeave={() => setActiveIndex(null)}
              onPointerMove={updateActiveIndexFromPointer}
            >
              <svg ref={svgRef} viewBox={`0 0 ${chartWidth} ${TREND_HEIGHT}`} aria-hidden="true">
                <defs>
                  <linearGradient id="folder-trend-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[1, 0.75, 0.5, 0.25, 0].map((ratio) => {
                  const y = TREND_BOTTOM - ratio * chartHeight;
                  return (
                    <g key={ratio}>
                      <line className="folder-trend-grid" x1={TREND_LEFT} x2={chartRight} y1={y} y2={y} />
                      <text className="folder-trend-tick" x={TREND_LEFT - 10} y={y + 3} textAnchor="end">
                        {ratio === 0 ? "0" : formatTrendAxisValue(metric, trendData.maxValue * ratio)}
                      </text>
                    </g>
                  );
                })}
                {xTickIndexes.map((index) => {
                  const date = trendData.dates[index]!;
                  const x =
                    trendData.dates.length <= 1
                      ? TREND_LEFT + (chartRight - TREND_LEFT) / 2
                      : TREND_LEFT + (index / (trendData.dates.length - 1)) * (chartRight - TREND_LEFT);
                  return (
                    <text key={date} className="folder-trend-x-label" x={x} y={TREND_HEIGHT - 18} textAnchor="middle">
                      {date.slice(5)}
                    </text>
                  );
                })}
                {totalAreaPath && <path className="folder-trend-area" d={totalAreaPath} />}
                {seriesPoints.map(({ series, points }, index) => (
                  <path
                    key={series.id}
                    className={cn("folder-trend-line", index > 0 && "is-secondary")}
                    d={pathFromPoints(points)}
                    pathLength={1}
                    style={{ "--folder-trend-color": series.color } as CSSProperties}
                  />
                ))}
                {activeX !== null && (
                  <g className="folder-trend-marker">
                    <line x1={activeX} x2={activeX} y1={TREND_TOP} y2={TREND_BOTTOM} />
                    {seriesPoints.map(({ series, points }) => {
                      const point = activeIndexSafe !== null ? points[activeIndexSafe] : null;
                      if (!point || point.value <= 0) return null;
                      return (
                        <circle
                          key={series.id}
                          cx={point.x}
                          cy={point.y}
                          r="4.5"
                          style={{ "--folder-trend-color": series.color } as CSSProperties}
                        />
                      );
                    })}
                  </g>
                )}
              </svg>
            </button>
          </div>
          <aside className="folder-trend-side">
            <div className="folder-panel-heading">
              <span>{dimensionLabel}</span>
              <small>{formatTrendValue(metric, trendData.total)}</small>
            </div>
            <div className="folder-trend-legend">
              {trendData.series.map((series) => (
                <span key={series.id} className="folder-trend-legend-item">
                  <span className="folder-trend-legend-dot" style={{ background: series.color }} aria-hidden="true" />
                  <span className="folder-trend-legend-label">
                    {dimension === "total" ? t("usage.folderTrendTotal") : series.label}
                  </span>
                  <strong>{formatTrendValue(metric, series.total)}</strong>
                </span>
              ))}
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}
