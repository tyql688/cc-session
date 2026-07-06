import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import {
  ImagePreview,
  isLocalPath,
  LocalImage,
  RemoteImage,
} from "../../../components/MessageBubble/ImagePreview";
import { TokenUsageDisplay } from "../../../components/MessageBubble/TokenUsage";
import { ToolMessage } from "../../../components/MessageBubble/ToolMessage";
import { useI18n } from "../../../i18n/index";
import { formatTimeOnly } from "../../../lib/formatters";
import type { Provider } from "../../../lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import type { ActivityItem, ImageRef, TimelineRow } from "./types";

type PreviewImage = { src: string; source?: string };

const SYSTEM_MARKER_LABEL_KEYS: Record<string, string> = {
  turn_duration: "system.turnDuration",
  compact_boundary: "system.compact",
  microcompact_boundary: "system.microcompact",
  stop_hook_summary: "system.hooks",
  api_error: "system.apiError",
  away_summary: "system.awaySummary",
  scheduled_task_fire: "system.scheduledTask",
  pr_link: "system.prLink",
  error: "system.error",
  turn_aborted: "system.turnAborted",
  context_compacted: "system.contextCompacted",
};

function fmtDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
}

function ImageStrip(props: {
  images: ImageRef[];
  onPreview: (image: PreviewImage) => void;
}) {
  const sourced = props.images.filter(
    (image): image is { source: string } => image.source !== null,
  );
  if (sourced.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {sourced.map((image) =>
        isLocalPath(image.source) ? (
          <LocalImage
            key={image.source}
            path={image.source}
            onPreview={(src, source) => props.onPreview({ src, source })}
          />
        ) : (
          <RemoteImage
            key={image.source}
            src={image.source}
            onPreview={(src, source) => props.onPreview({ src, source })}
          />
        ),
      )}
    </div>
  );
}

function UserRow(props: {
  item: Extract<TimelineRow, { kind: "user" }>["item"];
}) {
  const { t } = useI18n();
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const { item } = props;
  return (
    <div className="flex flex-col items-end gap-1">
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-1.5 rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed",
          item.command
            ? "border border-success/30 bg-success/10 font-mono"
            : "bg-brand-soft text-text-primary",
        )}
      >
        {item.command && (
          <span className="text-2xs font-medium tracking-wide text-success uppercase">
            {t(
              item.command === "input"
                ? "timeline.commandInput"
                : "timeline.commandOutput",
            )}
          </span>
        )}
        <ImageStrip images={item.images} onPreview={setPreviewImage} />
        <div className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {item.markdown}
        </div>
      </div>
      {item.ts !== null && (
        <span className="px-1 text-2xs text-text-tertiary">
          {formatTimeOnly(item.ts)}
        </span>
      )}
      {previewImage && (
        <ImagePreview
          src={previewImage.src}
          source={previewImage.source}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

function AssistantRow(props: {
  item: Extract<TimelineRow, { kind: "assistant" }>["item"];
  streaming: boolean;
}) {
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const { item } = props;
  return (
    <div className="group/assistant min-w-0">
      <Markdown text={item.markdown} streaming={props.streaming} />
      <ImageStrip images={item.images} onPreview={setPreviewImage} />
      {(item.usage || item.model || item.ts !== null) && (
        <div className="mt-1 flex items-center gap-2 text-2xs text-text-tertiary opacity-0 transition-opacity group-hover/assistant:opacity-100">
          {item.model && <span>{item.model}</span>}
          {item.usage && <TokenUsageDisplay usage={item.usage} />}
          {item.ts !== null && <span>{formatTimeOnly(item.ts)}</span>}
        </div>
      )}
      {previewImage && (
        <ImagePreview
          src={previewImage.src}
          source={previewImage.source}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}

function MarkerRow(props: {
  item: Extract<TimelineRow, { kind: "marker" }>["item"];
}) {
  const { t } = useI18n();
  const labelKey = SYSTEM_MARKER_LABEL_KEYS[props.item.subtype];
  return (
    <div className="flex items-center gap-3 py-0.5 text-xs text-text-tertiary">
      <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
      <span className="max-w-[70%] truncate">
        {labelKey ? `${t(labelKey)} · ${props.item.detail}` : props.item.detail}
      </span>
      <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
    </div>
  );
}

function UnknownRow(props: {
  item: Extract<TimelineRow, { kind: "unknown" }>["item"];
}) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/10 p-3">
      <span className="text-2xs font-medium tracking-wide text-warning uppercase">
        {t("timeline.unknownMessage")}
      </span>
      <pre className="mt-1 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap text-text-secondary">
        {JSON.stringify(props.item.raw, null, 2)}
      </pre>
    </div>
  );
}

function ThinkingStep(props: { text: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-fit items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
      >
        <ChevronDown
          className={cn(
            "size-3 transition-transform",
            !expanded && "-rotate-90",
          )}
          aria-hidden="true"
        />
        {t("timeline.thinking")}
      </button>
      {expanded && (
        <p className="rounded-lg bg-surface-code px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-text-secondary italic">
          {props.text}
        </p>
      )}
    </div>
  );
}

function ActivityGroupRow(props: {
  row: Extract<TimelineRow, { kind: "activity" }>;
  provider: Provider;
  parentSessionId: string;
}) {
  const { t } = useI18n();
  const { row } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!row.running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [row.running]);

  const endTs = row.running ? now : row.endTs;
  const seconds =
    row.startTs !== null && endTs !== null
      ? Math.max(0, Math.round((endTs - row.startTs) / 1000))
      : null;
  const label = row.running
    ? t("timeline.working")
    : seconds !== null
      ? t("timeline.workedFor", { duration: fmtDuration(seconds) })
      : t("timeline.steps", { count: row.items.length });

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 py-0.5 text-xs text-text-secondary transition-colors hover:text-text-primary"
      >
        <ChevronDown
          className={cn(
            "size-3 shrink-0 transition-transform",
            collapsed && "-rotate-90",
          )}
          aria-hidden="true"
        />
        <span className={cn("shrink-0", row.running && "animate-pulse")}>
          {label}
        </span>
        <span
          className="h-px min-w-8 flex-1 bg-border-subtle"
          aria-hidden="true"
        />
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1 border-l border-border-subtle pl-3">
          {row.items.map((item: ActivityItem) =>
            item.kind === "thinking" ? (
              <div key={item.index} data-entry-key={`item-${item.index}`}>
                <ThinkingStep text={item.text} />
              </div>
            ) : (
              <div key={item.index} data-entry-key={`item-${item.index}`}>
                <ToolMessage
                  message={item.message}
                  provider={props.provider}
                  parentSessionId={props.parentSessionId}
                />
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function TimelineRowView(props: {
  row: TimelineRow;
  provider: Provider;
  parentSessionId: string;
  /** True for the trailing assistant message while live watch streams. */
  streaming: boolean;
}) {
  const { row } = props;
  switch (row.kind) {
    case "user":
      return <UserRow item={row.item} />;
    case "assistant":
      return <AssistantRow item={row.item} streaming={props.streaming} />;
    case "marker":
      return <MarkerRow item={row.item} />;
    case "unknown":
      return <UnknownRow item={row.item} />;
    case "activity":
      return (
        <ActivityGroupRow
          row={row}
          provider={props.provider}
          parentSessionId={props.parentSessionId}
        />
      );
  }
}
