import { createSignal, Show, For } from "solid-js";
import type { Message, Provider } from "../lib/types";
import { toolDisplayName, toolIcon } from "../lib/tools";
import { MessageBubble } from "./MessageBubble";

export function MergedToolRow(props: {
  tools: string[];
  messages: Message[];
  provider?: Provider;
  highlightTerm?: string;
}) {
  const [expanded, setExpanded] = createSignal(false);

  const label = () =>
    props.tools.length > 0
      ? props.tools
          .map((toolName, index) => {
            const metadata = props.messages[index]?.tool_metadata;
            return `${toolIcon(toolName, metadata)} ${toolDisplayName(
              toolName,
              metadata,
            )}`;
          })
          .join(", ")
      : "tools";

  return (
    <div class="merged-tools">
      <div class="merged-tools-header" onClick={() => setExpanded(!expanded())}>
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
                provider={props.provider}
                highlightTerm={props.highlightTerm}
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
