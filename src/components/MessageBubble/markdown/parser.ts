import type {
  Definition,
  FootnoteDefinition,
  FootnoteReference,
  Image,
  Root,
  Text,
} from "mdast";
import { unified } from "unified";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import type { ContentSegment } from "./types";

const IMAGE_PLACEHOLDER_REGEX =
  /\[Image(?:\s*#\d+)?(?::\s*source:\s*([^\]]+))?\]/g;

const markdownParser = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath);

export function sanitizeMessageForClipboard(raw: string): string {
  return raw.replace(
    /\[Image(?:\s*#\d+)?(?::\s*source:\s*[^\]]+)?\]/g,
    "[Image]",
  );
}

export function parseContent(raw: string): ContentSegment[] {
  if (!raw.includes("```") && !raw.includes("[Image")) {
    return [{ type: "text", content: raw }];
  }

  const segments: ContentSegment[] = [];
  const blockRegex =
    /```([\w+#.-]*)\n?([\s\S]*?)```|\[Image(?:\s*#\d+)?(?::\s*source:\s*([^\]]+))?\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockRegex.exec(raw)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: raw.slice(lastIndex, match.index),
      });
    }

    if (match[2] !== undefined) {
      segments.push({
        type: "code",
        content: match[2],
        language: match[1] || undefined,
      });
    } else {
      const imagePath = match[3]?.trim();
      if (imagePath) {
        segments.push({ type: "image", content: imagePath });
      } else {
        segments.push({ type: "text", content: match[0] });
      }
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < raw.length) {
    segments.push({ type: "text", content: raw.slice(lastIndex) });
  }

  return segments;
}

export function parseMarkdownAst(raw: string): Root {
  const tree = markdownParser.parse(raw) as Root;
  transformImagePlaceholders(tree);
  return tree;
}

export function collectDefinitions(tree: Root): Map<string, Definition> {
  const definitions = new Map<string, Definition>();

  visit(tree, "definition", (node: Definition) => {
    definitions.set(normalizeIdentifier(node.identifier), node);
  });

  return definitions;
}

export function normalizeIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

export function collectFootnotes(tree: Root) {
  const definitions = new Map<string, FootnoteDefinition>();
  const order: string[] = [];
  const seen = new Set<string>();

  visit(tree, "footnoteDefinition", (node: FootnoteDefinition) => {
    definitions.set(normalizeIdentifier(node.identifier), node);
  });

  visit(tree, "footnoteReference", (node: FootnoteReference) => {
    const identifier = normalizeIdentifier(node.identifier);
    if (seen.has(identifier)) return;
    seen.add(identifier);
    order.push(identifier);
  });

  for (const identifier of definitions.keys()) {
    if (seen.has(identifier)) continue;
    seen.add(identifier);
    order.push(identifier);
  }

  return {
    definitions,
    order,
    numbers: new Map(order.map((identifier, index) => [identifier, index + 1])),
  };
}

export function headingTagName(
  depth: number,
): "h1" | "h2" | "h3" | "h4" | "h5" | "h6" {
  if (depth <= 1) return "h1";
  if (depth === 2) return "h2";
  if (depth === 3) return "h3";
  if (depth === 4) return "h4";
  if (depth === 5) return "h5";
  return "h6";
}

export function footnoteDomId(prefix: string, identifier: string): string {
  const normalized = identifier
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return `msg-footnote-${prefix}-${normalized || "note"}`;
}

function transformImagePlaceholders(tree: Root) {
  visit(tree, "text", (node: Text, index, parent) => {
    if (index === undefined || !parent || !("children" in parent)) {
      return;
    }

    const replacement = splitTextWithImages(node.value);
    if (
      replacement.length === 1 &&
      replacement[0].type === "text" &&
      replacement[0].value === node.value
    ) {
      return;
    }

    parent.children.splice(index, 1, ...replacement);
    return index + replacement.length;
  });
}

function splitTextWithImages(value: string): Array<Text | Image> {
  if (!value.includes("[Image")) {
    return [{ type: "text", value }];
  }

  const nodes: Array<Text | Image> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  IMAGE_PLACEHOLDER_REGEX.lastIndex = 0;

  while ((match = IMAGE_PLACEHOLDER_REGEX.exec(value)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", value: value.slice(lastIndex, match.index) });
    }

    const imagePath = match[1]?.trim();
    if (imagePath) {
      nodes.push({
        type: "image",
        alt: "Image",
        title: null,
        url: imagePath,
      });
    } else {
      nodes.push({ type: "text", value: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < value.length) {
    nodes.push({ type: "text", value: value.slice(lastIndex) });
  }

  return nodes;
}
