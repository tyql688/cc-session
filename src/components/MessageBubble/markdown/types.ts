import type {
  BlockContent,
  Definition,
  FootnoteDefinition,
  PhrasingContent,
  RootContent,
} from "mdast";

export interface MathNode {
  type: "math";
  value: string;
}

export interface InlineMathNode {
  type: "inlineMath";
  value: string;
}

export interface ContentSegment {
  type: "text" | "code" | "image";
  content: string;
  language?: string;
}

export type MarkdownBlockNode = RootContent | BlockContent;
export type MarkdownInlineNode = PhrasingContent;

export interface RenderContext {
  definitions: Map<string, Definition>;
  footnoteDefinitions: Map<string, FootnoteDefinition>;
  footnoteOrder: string[];
  footnoteNumbers: Map<string, number>;
  footnotePrefix: string;
  highlightTerm?: string;
  onPreview: (src: string, source: string) => void;
}
