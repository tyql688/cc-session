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

  it("shares one Escape listener across fullscreen diagrams", async () => {
    const addEventListener = vi.spyOn(document, "addEventListener");
    const removeEventListener = vi.spyOn(document, "removeEventListener");
    const diagram = "```mermaid\ngraph TD\n  A-->B\n```";
    const { container } = render(
      <>
        <Markdown text={diagram} />
        <Markdown text={diagram} />
      </>,
    );

    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledTimes(2));
    expect(addEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(0);

    const fullscreenButtons = screen.getAllByRole("button", { name: "View fullscreen" });
    fireEvent.click(fullscreenButtons[0]);
    fireEvent.click(fullscreenButtons[1]);

    expect(addEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    expect(container.querySelectorAll(".markdown-mermaid-fullscreen")).toHaveLength(2);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(container.querySelectorAll(".markdown-mermaid-fullscreen")).toHaveLength(0);
    expect(removeEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);

    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });

  it("removes the shared Escape listener when fullscreen content is replaced", async () => {
    const addEventListener = vi.spyOn(document, "addEventListener");
    const removeEventListener = vi.spyOn(document, "removeEventListener");
    const { rerender } = render(<Markdown text={"```mermaid\ngraph TD\n  A-->B\n```"} />);

    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "View fullscreen" }));
    expect(addEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);

    rerender(<Markdown text="plain text" />);

    expect(removeEventListener.mock.calls.filter(([type]) => type === "keydown")).toHaveLength(1);
    addEventListener.mockRestore();
    removeEventListener.mockRestore();
  });
});
