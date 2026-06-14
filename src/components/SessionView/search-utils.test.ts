import { describe, expect, it } from "vitest";
import type { Message } from "../../lib/types";
import type { ProcessedEntry } from "./hooks";
import {
  findNewestMatchingEntryIndex,
  getMarksInVisualOrder,
} from "./search-utils";

function message(content: string): Message {
  return {
    role: "assistant",
    content,
    timestamp: null,
    tool_name: null,
    tool_input: null,
    token_usage: null,
  };
}

describe("session search utilities", () => {
  it("finds the newest matching entry across messages and tool groups", () => {
    const entries: ProcessedEntry[] = [
      {
        key: "m1",
        type: "message",
        msg: message("英文内容"),
        searchHaystack: "英文内容".toLocaleLowerCase(),
      },
      {
        key: "tools",
        type: "merged-tools",
        tools: ["Bash"],
        messages: [
          {
            role: "tool",
            content: "工具输出里有中文搜索",
            timestamp: null,
            tool_name: "Bash",
            tool_input: null,
            token_usage: null,
          },
        ],
        searchHaystack: "Bash\n工具输出里有中文搜索".toLocaleLowerCase(),
      },
      {
        key: "m2",
        type: "message",
        msg: message("最新中文命中"),
        searchHaystack: "最新中文命中".toLocaleLowerCase(),
      },
    ];

    expect(findNewestMatchingEntryIndex(entries, "中文")).toBe(2);
  });

  it("returns an empty list when the mark container is missing", () => {
    // getMarksInVisualOrder is the single source of truth shared by the counter
    // total and Next/Prev navigation; with no container both must yield zero.
    // DOM-backed counting is covered in SessionSearch.test.tsx (happy-dom).
    expect(getMarksInVisualOrder(undefined)).toEqual([]);
  });
});
