import { createSignal, For, Show } from "solid-js";
import type { Message } from "../lib/types";
import { MessageBubble, formatMcpLabel } from "./MessageBubble";

const TOOL_ICONS: Record<string, string> = {
  Read: "📄",
  Edit: "✏️",
  Apply_patch: "✏️",
  Plan: "📋",
  Write: "📝",
  Bash: "⬛",
  Glob: "🔍",
  Grep: "🔎",
  Agent: "🤖",
  WebSearch: "🌐",
  WebFetch: "🌐",
  TaskCreate: "📋",
  TaskUpdate: "📋",
  Skill: "⚡",
  mcp: "🔌",
};

function toolIcon(name: string): string {
  if (name.startsWith("mcp__")) return TOOL_ICONS.mcp;
  return TOOL_ICONS[name] || "⚙";
}

export function MergedToolRow(props: {
  tools: string[];
  messages: Message[];
  highlightTerm?: string;
}) {
  const [expanded, setExpanded] = createSignal(false);

  const icons = () => {
    const seen = new Set<string>();
    return props.tools
      .map((t) => toolIcon(formatMcpLabel(t)))
      .filter((icon) => {
        if (seen.has(icon)) return false;
        seen.add(icon);
        return true;
      });
  };

  const label = () =>
    props.tools.length > 0
      ? props.tools.map(formatMcpLabel).join(", ")
      : "tools";

  return (
    <div class="merged-tools">
      <div class="merged-tools-header" onClick={() => setExpanded(!expanded())}>
        <span class="msg-tool-icon">
          <For each={icons()}>{(icon) => <>{icon}</>}</For>
        </span>
        <span class="merged-tools-label">{label()}</span>
        <span class="merged-tools-chevron">
          {expanded() ? "\u25BE" : "\u25B8"}
        </span>
      </div>
      <Show when={expanded()}>
        <div class="merged-tools-body">
          <For each={props.messages}>
            {(msg) => (
              <MessageBubble
                message={msg}
                highlightTerm={props.highlightTerm}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
