import type { Message } from "../../lib/types";
import { parseTimestamp, formatTimeOnly } from "../../lib/formatters";

export type ProcessedEntry =
  | { key: string; type: "message"; msg: Message }
  | { key: string; type: "time-sep"; time: string }
  | { key: string; type: "merged-tools"; tools: string[]; messages: Message[] };

export function processMessages(msgs: Message[]): ProcessedEntry[] {
  const entries: ProcessedEntry[] = [];
  let i = 0;

  while (i < msgs.length) {
    const msg = msgs[i];

    // Try to merge consecutive tool messages
    if (msg.role === "tool") {
      const toolGroup: Message[] = [msg];
      let j = i + 1;
      while (j < msgs.length && msgs[j].role === "tool") {
        toolGroup.push(msgs[j]);
        j++;
      }
      if (toolGroup.length > 1) {
        const toolNames = toolGroup
          .map((m) => m.tool_name)
          .filter((n): n is string => !!n && n.trim().length > 0);
        entries.push({
          key: `tools-${i}-${toolGroup[0].timestamp ?? "none"}`,
          type: "merged-tools",
          tools: toolNames,
          messages: toolGroup,
        });
      } else {
        entries.push({
          key: `msg-${i}-${msg.role}-${msg.timestamp ?? "none"}`,
          type: "message",
          msg,
        });
      }
      i = j;
      continue;
    }

    // Check time gap with previous message
    if (entries.length > 0) {
      const prevEntry = entries[entries.length - 1];
      let prevTs: number | null = null;
      if (prevEntry.type === "message") {
        prevTs = parseTimestamp(prevEntry.msg.timestamp);
      } else if (prevEntry.type === "merged-tools") {
        const lastTool = prevEntry.messages[prevEntry.messages.length - 1];
        prevTs = parseTimestamp(lastTool.timestamp);
      }
      const curTs = parseTimestamp(msg.timestamp);
      const TIME_GAP_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
      if (prevTs && curTs && curTs - prevTs > TIME_GAP_THRESHOLD_MS) {
        entries.push({
          key: `sep-${i}-${curTs}`,
          type: "time-sep",
          time: formatTimeOnly(curTs),
        });
      }
    }

    entries.push({
      key: `msg-${i}-${msg.role}-${msg.timestamp ?? "none"}`,
      type: "message",
      msg,
    });
    i++;
  }

  return entries;
}
