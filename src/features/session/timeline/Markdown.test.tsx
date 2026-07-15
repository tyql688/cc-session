import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n/index";
import { clearMarkdownCache } from "@/lib/markdown";
import { Markdown } from "@/features/session/timeline/Markdown";
import { setTheme } from "@/stores/theme";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(async () => ({
    bindFunctions: vi.fn(),
    svg: [
      '<svg id="mock-mermaid" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 40">',
      "<style>#mock-mermaid .node{fill:#e8f2ff;}</style>",
      '<g class="node"><text>A</text></g>',
      "</svg>",
    ].join(""),
  })),
}));
const clipboardWrite = vi.fn<(text: string) => Promise<void>>();

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
    clipboardWrite.mockReset();
    clipboardWrite.mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    await i18next.changeLanguage("en");
  });

  it("enhances mermaid diagrams with source copy, fullscreen, and pan-zoom controls", async () => {
    const { container } = render(<Markdown text={"```mermaid\ngraph TD\n  A-->B\n```"} />);

    await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledTimes(1));

    const block = container.querySelector<HTMLElement>(".markdown-mermaid-block");
    const content = container.querySelector<HTMLElement>(".markdown-mermaid-content");
    expect(block).not.toBeNull();
    expect(container.querySelector(".markdown-mermaid-content svg")).toBeInTheDocument();
    expect(content?.querySelector(":scope > style[data-mermaid-stylesheet]")).toHaveTextContent(
      "#mock-mermaid .node{fill:#e8f2ff;}",
    );
    expect(content?.querySelector("svg style")).toBeInTheDocument();
    expect(mermaidMock.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        theme: "base",
        themeVariables: expect.objectContaining({
          background: "#ffffff",
          primaryColor: "#e8f2ff",
          primaryTextColor: "#1d1d1f",
          lineColor: "#66717f",
          signalColor: "#456f9e",
          sequenceNumberColor: "#ffffff",
        }),
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy Mermaid source" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(block?.dataset.mermaidSource));
    expect(block?.dataset.mermaidSource).toContain("graph TD");
    expect(block?.dataset.mermaidSource).not.toContain("```");
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();

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

  it("reinitializes Mermaid with a legible dark palette", async () => {
    setTheme("dark");
    const view = render(<Markdown text={"```mermaid\ngraph TD\n  A-->B\n```"} />);

    try {
      await waitFor(() => expect(mermaidMock.render).toHaveBeenCalledTimes(1));
      expect(mermaidMock.initialize).toHaveBeenCalledWith(
        expect.objectContaining({
          theme: "base",
          themeVariables: expect.objectContaining({
            background: "#191b20",
            primaryColor: "#27384f",
            primaryTextColor: "#f1f3f5",
            lineColor: "#aeb6c2",
            signalColor: "#8fb8e8",
            sequenceNumberColor: "#172033",
          }),
        }),
      );
    } finally {
      view.unmount();
      setTheme("light");
    }
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
