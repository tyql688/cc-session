import createDOMPurify, { type Config, type DOMPurify } from "dompurify";
import MarkdownIt from "markdown-it";
import cjkFriendly from "markdown-it-cjk-friendly";
import taskLists from "markdown-it-task-lists";
import katexPluginModule from "@vscode/markdown-it-katex";
import { LruCache } from "@/lib/markdown/lru";

const MARKDOWN_CACHE_CAPACITY = 5000;
const DANGEROUS_PROTOCOL_RE = /^(?:javascript|vbscript|data):/i;

const KATEX_TAGS = [
  "annotation",
  "math",
  "maction",
  "menclose",
  "mfrac",
  "mglyph",
  "mi",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mphantom",
  "mroot",
  "mrow",
  "ms",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msubsup",
  "msup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover",
  "semantics",
] satisfies string[];

const SANITIZE_CONFIG: Config = {
  USE_PROFILES: { html: true, mathMl: true },
  ADD_TAGS: [...KATEX_TAGS, "pre"],
  ADD_ATTR: [
    "aria-hidden",
    "checked",
    "class",
    "disabled",
    "display",
    "encoding",
    "height",
    "href",
    "mathvariant",
    "rel",
    "src",
    "style",
    "target",
    "title",
    "type",
    "width",
    "xmlns",
  ],
};

const markdownCache = new LruCache<string, string>(MARKDOWN_CACHE_CAPACITY);

let purifier: DOMPurify | null = null;

type KatexPlugin = (md: MarkdownIt, options?: { enableFencedBlocks?: boolean; throwOnError?: boolean }) => MarkdownIt;

function defaultExport(value: unknown): unknown {
  return value !== null && typeof value === "object" && "default" in value ? value.default : undefined;
}

function isKatexPlugin(value: unknown): value is KatexPlugin {
  return typeof value === "function";
}

function resolveKatexPlugin(value: unknown): KatexPlugin {
  if (isKatexPlugin(value)) return value;

  const firstDefault = defaultExport(value);
  if (isKatexPlugin(firstDefault)) return firstDefault;

  const secondDefault = defaultExport(firstDefault);
  if (isKatexPlugin(secondDefault)) return secondDefault;

  throw new Error("Unable to load markdown-it KaTeX plugin");
}

function getPurifier(): DOMPurify {
  if (purifier !== null) return purifier;
  if (typeof window === "undefined") {
    throw new Error("Markdown HTML sanitization requires a browser window");
  }
  purifier = createDOMPurify(window);
  return purifier;
}

function validateMarkdownLink(rawUrl: string): boolean {
  let normalized = "";
  for (const char of rawUrl.trim()) {
    const codePoint = char.codePointAt(0);
    if (
      char.trim() === "" ||
      codePoint === undefined ||
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      continue;
    }
    normalized += char;
  }
  normalized = normalized.toLowerCase();
  return !DANGEROUS_PROTOCOL_RE.test(normalized);
}

const markdownParser = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: false,
});

markdownParser.validateLink = validateMarkdownLink;
markdownParser.use(cjkFriendly);
markdownParser.use(resolveKatexPlugin(katexPluginModule), {
  enableFencedBlocks: true,
  throwOnError: false,
});
markdownParser.use(taskLists, {
  enabled: false,
});

// Emit the code-block chrome (wrapper + header + language label) directly in the
// HTML string so a row's height is fully settled at first mount. Post-processing
// then only adds the copy button (into a min-height header) and swaps in the
// shiki-highlighted <pre> (same body class) — neither changes the row height, so
// the virtualizer never has to re-measure and shift content after a scroll stops.
// Mermaid stays a bare <pre><code class="language-mermaid"> so the diagram
// post-processor can still find and render it.
function fenceLanguage(info: string): string {
  return info.trim().split(/\s+/u)[0]?.toLowerCase() ?? "";
}

markdownParser.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx];
  const language = fenceLanguage(token.info);
  const escaped = markdownParser.utils.escapeHtml(token.content);
  if (language === "mermaid") {
    return `<pre><code class="language-mermaid">${escaped}</code></pre>`;
  }
  const codeClass = language.length > 0 ? ` class="language-${markdownParser.utils.escapeHtml(language)}"` : "";
  const label =
    language.length > 0
      ? `<span class="markdown-code-block-lang">${markdownParser.utils.escapeHtml(language)}</span>`
      : "";
  return `<div class="markdown-code-block"><div class="markdown-code-block-header">${label}</div><pre class="markdown-code-block-body"><code${codeClass}>${escaped}</code></pre></div>`;
};

markdownParser.renderer.rules.code_block = (tokens, idx) => {
  const escaped = markdownParser.utils.escapeHtml(tokens[idx].content);
  return `<div class="markdown-code-block"><div class="markdown-code-block-header"></div><pre class="markdown-code-block-body"><code>${escaped}</code></pre></div>`;
};

export function markdownToHtml(text: string): string {
  const cached = markdownCache.get(text);
  if (cached !== undefined) return cached;

  const rendered = markdownParser.render(text);
  const html = getPurifier().sanitize(rendered, SANITIZE_CONFIG);
  markdownCache.set(text, html);
  return html;
}

export function clearMarkdownCache(): void {
  markdownCache.clear();
}
