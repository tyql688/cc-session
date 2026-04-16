import katex from "katex";

export function renderKatex(tex: string, displayMode: boolean): string | null {
  try {
    return katex.renderToString(tex, { displayMode, throwOnError: false });
  } catch (error) {
    console.warn("Failed to render KaTeX:", error);
    return null;
  }
}
