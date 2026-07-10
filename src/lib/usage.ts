import type { DailyUsage, PrevPeriodTotals, ProviderSnapshot, UsageStats } from "@/lib/types";

export type UsageSortState = { col: string; asc: boolean };
export type ChartMetric = "tokens" | "cost";

export interface UsageChartProviderMeta {
  label: string;
  color: string;
}

export interface UsageDailyChartData {
  dates: string[];
  byDate: Map<string, Map<string, number>>;
  providers: string[];
  maxValue: number;
}

export interface HoveredDaySummary {
  date: string;
  total: number;
  breakdown: Array<{
    provider: string;
    label: string;
    color: string;
    value: number;
  }>;
}

export const ROW_LIMIT_OPTIONS = [10, 25, 50, 100] as const;

export function makeEmptyUsageStats(): UsageStats {
  return {
    total_sessions: 0,
    total_turns: 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    total_cost: 0,
    cache_hit_rate: 0,
    daily_usage: [],
    model_costs: [],
    project_costs: [],
    recent_sessions: [],
    provider_session_counts: [],
  };
}

export function filterScannedProviderSnapshots(snapshots: ProviderSnapshot[]): ProviderSnapshot[] {
  return snapshots.filter((snapshot) => snapshot.exists || snapshot.session_count > 0);
}

export function compareUsageValues(left: unknown, right: unknown, asc: boolean): number {
  if (typeof left === "string" && typeof right === "string") {
    return asc ? left.localeCompare(right) : right.localeCompare(left);
  }

  const leftNumber = typeof left === "number" ? left : 0;
  const rightNumber = typeof right === "number" ? right : 0;
  return asc ? leftNumber - rightNumber : rightNumber - leftNumber;
}

export function totalUsageTokens(data: UsageStats | undefined): number {
  if (!data) return 0;
  return (
    data.total_input_tokens + data.total_output_tokens + data.total_cache_read_tokens + data.total_cache_write_tokens
  );
}

export function buildDailyChartData(
  dailyUsage: DailyUsage[],
  selectedProviderKeys: string[],
  metric: ChartMetric = "tokens",
): UsageDailyChartData {
  const byDate = new Map<string, Map<string, number>>();

  for (const item of dailyUsage) {
    const providerMap = byDate.get(item.date) ?? new Map<string, number>();
    const value = metric === "cost" ? item.cost : item.tokens;
    providerMap.set(item.provider, value);
    byDate.set(item.date, providerMap);
  }

  let maxValue = 0;
  const providersWithActivity = new Set<string>();
  for (const providerMap of byDate.values()) {
    let total = 0;
    for (const [provider, value] of providerMap) {
      total += value;
      if (value > 0) providersWithActivity.add(provider);
    }
    if (total > maxValue) maxValue = total;
  }

  const providers = selectedProviderKeys.filter((key) => providersWithActivity.has(key));

  return {
    dates: [...byDate.keys()].sort(),
    byDate,
    providers,
    maxValue: maxValue || 1,
  };
}

export function buildHoveredDaySummary(
  date: string | null,
  chartData: UsageDailyChartData,
  getProviderMeta: (provider: string) => UsageChartProviderMeta,
): HoveredDaySummary | null {
  if (!date) return null;

  const providerMap = chartData.byDate.get(date);
  if (!providerMap) return null;

  const breakdown = chartData.providers
    .map((provider) => {
      const value = providerMap.get(provider) ?? 0;
      const meta = getProviderMeta(provider);
      return {
        provider,
        label: meta.label,
        color: meta.color,
        value,
      };
    })
    .filter((entry) => entry.value > 0)
    .sort((left, right) => right.value - left.value);

  return {
    date,
    total: breakdown.reduce((sum, entry) => sum + entry.value, 0),
    breakdown,
  };
}

/** Compute percentage change between current and previous values.
 *  Returns null when prev is 0 or undefined (no meaningful comparison). */
export function trendPercent(
  current: number,
  prev: PrevPeriodTotals | undefined,
  field: keyof PrevPeriodTotals,
): number | null {
  if (!prev) return null;
  const prevVal = prev[field];
  if (prevVal === 0) return null;
  return (current - prevVal) / prevVal;
}
