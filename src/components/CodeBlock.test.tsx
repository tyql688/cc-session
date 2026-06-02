import { describe, it, expect } from "vitest";
import { render } from "@solidjs/testing-library";
import { CodeBlock } from "./CodeBlock";

describe("CodeBlock", () => {
  it("renders the provided code text", () => {
    const { container } = render(() => (
      <CodeBlock code="const answer = 42;" language="typescript" />
    ));
    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toBe("const answer = 42;");
  });

  it("shows the language label when a language is given", () => {
    const { getByText } = render(() => (
      <CodeBlock code="print('hi')" language="python" />
    ));
    expect(getByText("python")).toHaveClass("code-block-lang");
  });

  it("omits the language label when no language is given", () => {
    const { container } = render(() => <CodeBlock code="plain text" />);
    expect(container.querySelector(".code-block-lang")).toBeNull();
  });

  it("renders a copy button", () => {
    const { container } = render(() => (
      <CodeBlock code="x = 1" language="python" />
    ));
    expect(container.querySelector(".code-block-copy")).not.toBeNull();
  });
});
