import katex from "katex";

export function renderKatex(tex: string, displayMode: boolean): string | null {
  try {
    // strict: "ignore" — user-authored math in transcripts routinely
    // contains non-LaTeX unicode (em-dash, smart quotes, full-width
    // punctuation) that KaTeX would otherwise log a warning for on
    // every render. The user can't fix those characters retroactively;
    // best we can do is render what KaTeX understands and stay quiet
    // about the rest.
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: "ignore",
    });
  } catch (error) {
    console.warn("Failed to render KaTeX:", error);
    return null;
  }
}
