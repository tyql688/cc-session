import { describe, expect, it } from "vitest";
import type {
  TimelineEntry,
  TimelineItem,
} from "../../features/session/timeline/types";
import { findFirstMatchingEntryIndex } from "./search-utils";

function assistantItem(index: number, markdown: string): TimelineItem {
  return {
    kind: "assistantText",
    index,
    markdown,
    images: [],
    ts: null,
    usage: null,
    model: null,
    command: null,
  };
}

function entry(index: number, content: string): TimelineEntry {
  return {
    key: `item-${index}`,
    messageIndex: index,
    searchHaystack: content.toLocaleLowerCase(),
    item: assistantItem(index, content),
  };
}

describe("session search utilities", () => {
  it("finds the first matching entry across searchable messages", () => {
    const entries = [
      entry(0, "英文内容"),
      entry(1, "第一条中文命中"),
      entry(2, "最新中文命中"),
    ];
    expect(findFirstMatchingEntryIndex(entries, "中文")).toBe(1);
  });

  it("returns -1 for a blank query", () => {
    expect(findFirstMatchingEntryIndex([entry(0, "anything")], "  ")).toBe(-1);
  });
});
