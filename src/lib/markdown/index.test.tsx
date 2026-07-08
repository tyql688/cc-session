import { beforeEach, describe, expect, it } from "vitest";
import { clearMarkdownCache, markdownToHtml } from "@/lib/markdown";

describe("markdownToHtml", () => {
  beforeEach(() => {
    clearMarkdownCache();
  });

  it("renders common markdown and task lists", () => {
    const html = markdownToHtml("**加粗**：\n\n- [x] done\n\n| A | B |\n| - | - |\n| 1 | 2 |");

    expect(html).toContain("<strong>加粗</strong>：");
    expect(html).toContain('class="contains-task-list"');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain("<table>");
  });

  it("renders katex while sanitizing unsafe html and links", () => {
    const html = markdownToHtml("$E=mc^2$ <img src=x onerror=alert(1)> [bad](javascript:alert(1))");

    expect(html).toContain("katex");
    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
  });

  it("returns cached html for repeated source text", () => {
    const first = markdownToHtml("plain **text**");
    const second = markdownToHtml("plain **text**");

    expect(second).toBe(first);
  });
});
