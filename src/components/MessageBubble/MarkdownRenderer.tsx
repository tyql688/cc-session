import { JSX } from "solid-js";
import {
  collectDefinitions,
  collectFootnotes,
  parseMarkdownAst,
} from "./markdown/parser";
import { renderBlockNodes, renderFootnotesSection } from "./markdown/renderers";
import type { RenderContext } from "./markdown/types";

export function renderMarkdownContent(
  raw: string,
  options: {
    footnotePrefix: string;
    highlightTerm?: string;
    onPreview: (src: string, source: string) => void;
  },
): JSX.Element {
  const tree = parseMarkdownAst(raw);
  const footnotes = collectFootnotes(tree);
  const context: RenderContext = {
    definitions: collectDefinitions(tree),
    footnoteDefinitions: footnotes.definitions,
    footnoteOrder: footnotes.order,
    footnoteNumbers: footnotes.numbers,
    footnotePrefix: options.footnotePrefix,
    highlightTerm: options.highlightTerm,
    onPreview: options.onPreview,
  };

  return (
    <div class="msg-text">
      {renderBlockNodes(tree.children, context)}
      {renderFootnotesSection(context)}
    </div>
  );
}

// Re-exports for backward compatibility with existing callers and tests.
export {
  collectFootnotes,
  footnoteDomId,
  headingTagName,
  parseContent,
  parseMarkdownAst,
  sanitizeMessageForClipboard,
} from "./markdown/parser";
export type { ContentSegment } from "./markdown/types";
