import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n/index";
import { clearMarkdownCache } from "@/lib/markdown";
import { Markdown } from "@/features/session/timeline/Markdown";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    bindFunctions: vi.fn(),
    svg: '<svg viewBox="0 0 100 40"><text>A</text></svg>',
  })),
}));

vi.mock("mermaid", () => ({
  default: {
    initialize: mermaidMock.initialize,
    render: mermaidMock.render,
  },
}));

describe("Markdown", () => {
  beforeEach(async () => {
    clearMarkdownCache();
    mermaidMock.initialize.mockClear();
    mermaidMock.render.mockClear();
    await i18next.changeLanguage("en");
  });

  it("enhances mermaid diagrams with fullscreen and pan-zoom controls", async () => {
    const { container } = render(<Markdown text={"```mermaid\ngraph TD\n  A-->B\n```"} />);

    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledTimes(1));

    const block = container.querySelector<HTMLElement>(".markdown-mermaid-block");
    expect(block).not.toBeNull();
    expect(container.querySelector(".markdown-mermaid-content svg")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View fullscreen" }));
    expect(block).toHaveClass("markdown-mermaid-fullscreen");
    expect(screen.getByRole("button", { name: "Exit fullscreen" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(block?.dataset.mermaidScale).not.toBe("1");

    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(block?.dataset.mermaidScale).toBe("1");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(block).not.toHaveClass("markdown-mermaid-fullscreen");
  });
});
