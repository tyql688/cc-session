import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/index";
import { searchTrends } from "@/lib/tauri";
import type { TrendSeries } from "@/lib/types";
import { toastError } from "@/stores/toast";

const TREND_DAYS = 90;
const MAX_KEYWORDS = 5;
const SERIES_COLORS = [
  "var(--accent)",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#ef4444",
];

const CHART_WIDTH = 640;
const CHART_HEIGHT = 140;
const CHART_PAD = 6;

function lastNDays(n: number): string[] {
  const days: string[] = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const dd = `${d.getDate()}`.padStart(2, "0");
    days.push(`${d.getFullYear()}-${m}-${dd}`);
  }
  return days;
}

/** Dense per-day values aligned to the axis; DB rows only cover days with
 * hits, so missing days become explicit zeros. */
function densify(series: TrendSeries, axis: string[]): number[] {
  const byDay = new Map(series.points.map((p) => [p.day, p.count]));
  return axis.map((day) => byDay.get(day) ?? 0);
}

function polylinePoints(values: number[], maxValue: number): string {
  const innerW = CHART_WIDTH - CHART_PAD * 2;
  const innerH = CHART_HEIGHT - CHART_PAD * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = CHART_PAD + i * step;
      const y =
        CHART_PAD + innerH - (maxValue > 0 ? (v / maxValue) * innerH : 0);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function TrendsCard() {
  const { t } = useI18n();
  const [keywords, setKeywords] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [series, setSeries] = useState<TrendSeries[]>([]);

  useEffect(() => {
    if (keywords.length === 0) {
      setSeries([]);
      return;
    }
    let cancelled = false;
    searchTrends(keywords, TREND_DAYS)
      .then((result) => {
        if (!cancelled) setSeries(result);
      })
      .catch((error: unknown) => {
        toastError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [keywords]);

  const axis = useMemo(() => lastNDays(TREND_DAYS), []);
  const dense = useMemo(
    () => series.map((s) => ({ keyword: s.keyword, values: densify(s, axis) })),
    [series, axis],
  );
  const maxValue = useMemo(
    () => Math.max(1, ...dense.flatMap((s) => s.values)),
    [dense],
  );

  const addKeyword = () => {
    const value = input.trim();
    if (!value || keywords.includes(value) || keywords.length >= MAX_KEYWORDS) {
      return;
    }
    setKeywords((prev) => [...prev, value]);
    setInput("");
  };

  return (
    <section className="usage-card">
      <div className="usage-section-header">
        <div className="usage-section-title-row">
          <div>
            <div className="usage-section-title">{t("usage.trends")}</div>
            <div className="usage-section-subtitle">
              {t("usage.trendsSubtitle")}
            </div>
          </div>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {keywords.map((keyword, i) => (
          <span
            key={keyword}
            className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-xs font-medium"
            style={{
              color: SERIES_COLORS[i % SERIES_COLORS.length],
              backgroundColor: `color-mix(in srgb, ${SERIES_COLORS[i % SERIES_COLORS.length]} 12%, transparent)`,
            }}
          >
            {keyword}
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-4 rounded-full p-0 text-current hover:text-current"
              aria-label={`remove ${keyword}`}
              onClick={() =>
                setKeywords((prev) => prev.filter((k) => k !== keyword))
              }
            >
              <X className="size-3" aria-hidden="true" />
            </Button>
          </span>
        ))}
        {keywords.length < MAX_KEYWORDS && (
          <input
            className="h-6 min-w-40 rounded-md border border-border-subtle bg-transparent px-2 text-xs outline-none placeholder:text-text-tertiary focus:border-brand"
            value={input}
            placeholder={t("usage.trendsPlaceholder")}
            onInput={(e) => setInput(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addKeyword();
              }
            }}
          />
        )}
      </div>

      {dense.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-text-tertiary">
          {t("usage.trendsEmpty")}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          className="h-36 w-full"
          role="img"
          aria-label={t("usage.trends")}
        >
          <line
            x1={CHART_PAD}
            y1={CHART_HEIGHT - CHART_PAD}
            x2={CHART_WIDTH - CHART_PAD}
            y2={CHART_HEIGHT - CHART_PAD}
            stroke="var(--border)"
            strokeWidth="1"
          />
          {dense.map((s, i) => (
            <polyline
              key={s.keyword}
              points={polylinePoints(s.values, maxValue)}
              fill="none"
              stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
        </svg>
      )}
    </section>
  );
}
