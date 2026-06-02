import type { JSX } from "solid-js";
import type { Definition, FootnoteDefinition, Root } from "mdast";
import {
  collectDefinitions,
  collectFootnotes,
  parseMarkdownAst,
} from "./markdown/parser";
import { renderBlockNodes, renderFootnotesSection } from "./markdown/renderers";
import type { RenderContext } from "./markdown/types";

/**
 * The expensive, highlight-independent half of rendering a message: the full
 * markdown parse plus footnote/definition collection. Keyed on `content` only
 * so it can be memoized once per message and reused across highlight-term
 * changes (in-session Cmd+F), which would otherwise re-parse every visible
 * bubble on each committed query.
 */
export interface ParsedMarkdownDocument {
  tree: Root;
  definitions: Map<string, Definition>;
  footnoteDefinitions: Map<string, FootnoteDefinition>;
  footnoteOrder: string[];
  footnoteNumbers: Map<string, number>;
}

export interface RenderMarkdownOptions {
  footnotePrefix: string;
  highlightTerm?: string;
  onPreview: (src: string, source: string) => void;
}

export function parseMarkdownDocument(raw: string): ParsedMarkdownDocument {
  const tree = parseMarkdownAst(raw);
  const footnotes = collectFootnotes(tree);
  return {
    tree,
    definitions: collectDefinitions(tree),
    footnoteDefinitions: footnotes.definitions,
    footnoteOrder: footnotes.order,
    footnoteNumbers: footnotes.numbers,
  };
}

/**
 * The cheap, highlight-dependent half: walk the already-parsed AST into JSX,
 * threading the highlight term to leaf renderers. Re-runs when only the
 * highlight term changes, but never re-parses markdown.
 */
export function renderParsedMarkdown(
  parsed: ParsedMarkdownDocument,
  options: RenderMarkdownOptions,
): JSX.Element {
  const context: RenderContext = {
    definitions: parsed.definitions,
    footnoteDefinitions: parsed.footnoteDefinitions,
    footnoteOrder: parsed.footnoteOrder,
    footnoteNumbers: parsed.footnoteNumbers,
    footnotePrefix: options.footnotePrefix,
    highlightTerm: options.highlightTerm,
    onPreview: options.onPreview,
  };

  return (
    <div class="msg-text">
      {renderBlockNodes(parsed.tree.children, context)}
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
