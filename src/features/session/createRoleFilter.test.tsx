import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Message } from "@/lib/types";
import type { ProcessedEntry } from "@/features/session/hooks";
import { useRoleFilter } from "@/features/session/createRoleFilter";

const baseMessage: Message = {
  role: "assistant",
  content: "",
  timestamp: null,
  tool_name: null,
  tool_input: null,
  token_usage: null,
};

function messageEntry(role: Message["role"], index: number): ProcessedEntry {
  const msg = { ...baseMessage, role, content: `${role} ${index}` };
  return {
    key: `msg-${index}-${role}`,
    type: "message",
    msg,
    messageIndex: index,
    searchHaystack: msg.content,
  };
}

describe("useRoleFilter", () => {
  it("keeps every role visible when focus mode is off", () => {
    const entries = [
      messageEntry("user", 0),
      messageEntry("assistant", 1),
      messageEntry("tool", 2),
      messageEntry("system", 3),
    ];

    const { result } = renderHook(() => useRoleFilter(entries, false));

    expect(result.current.filteredEntries).toEqual(entries);
  });

  it("shows only user and assistant messages in focus mode", () => {
    const entries = [
      messageEntry("user", 0),
      messageEntry("assistant", 1),
      messageEntry("tool", 2),
      messageEntry("system", 3),
    ];

    const { result } = renderHook(() => useRoleFilter(entries, true));

    expect(
      result.current.filteredEntries.map((entry) =>
        entry.type === "message" ? entry.msg.role : entry.type,
      ),
    ).toEqual(["user", "assistant"]);
    expect(result.current.hiddenRoles.has("tool")).toBe(true);
    expect(result.current.hiddenRoles.has("system")).toBe(true);
  });
});
