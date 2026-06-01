/**
 * Pre-render normalisation for Mermaid source pulled from arbitrary
 * AI session transcripts.
 *
 * Mermaid 11's `quadrantChart` lexer rejects bare non-ASCII tokens
 * after `title` / `x-axis` / `y-axis` / `quadrant-N`, while `flowchart`
 * accepts them (because labels live inside `[]`/`()`). Real-world AI
 * agents routinely emit `title 鉴权方案优先级` etc., which then
 * fails to render. Fixing this on the transcript side is impossible
 * (the transcript is already written), so we normalise on read by
 * auto-quoting bare non-ASCII text on the relevant keywords.
 *
 * The function is a no-op for any other diagram type, and for
 * already-quoted text or pure ASCII identifiers — so existing
 * well-formed transcripts are untouched.
 */

const QUADRANT_KEYWORDS = new Set([
  "title",
  "x-axis",
  "y-axis",
  "quadrant-1",
  "quadrant-2",
  "quadrant-3",
  "quadrant-4",
]);

export function normalizeMermaidCode(code: string): string {
  const firstNonEmpty = code.split("\n").find((l) => l.trim().length > 0);
  if (!firstNonEmpty?.trim().startsWith("quadrantChart")) {
    return code;
  }
  return code
    .split("\n")
    .map((line) => normalizeQuadrantLine(line))
    .join("\n");
}

function normalizeQuadrantLine(line: string): string {
  // Point-label form: `<label>: [x, y]` — the colon is unambiguous
  // because no keyword line contains one. Bare non-ASCII labels need
  // quoting just like title/axis text. Match this BEFORE the keyword
  // form so an unquoted label like `MCP注入` isn't mis-classified.
  const point = line.match(/^(\s*)(.+?):\s*(\[[^\]]+\])\s*$/);
  if (point) {
    const [, indent, rawLabel, coords] = point;
    const trimmed = rawLabel.trim();
    // Don't normalise non-point lines that happen to contain a colon
    // (e.g. `accTitle: foo`). Real point labels never start with a
    // recognised quadrant keyword.
    if (!QUADRANT_KEYWORDS.has(trimmed.split(/\s+/)[0] ?? "")) {
      return `${indent}${quoteIfBareNonAscii(trimmed)}: ${coords}`;
    }
  }

  const m = line.match(/^(\s*)(\S+)(\s+)(.*?)\s*$/);
  if (!m) return line;
  const [, indent, keyword, sep, rest] = m;
  if (!QUADRANT_KEYWORDS.has(keyword)) return line;

  if (keyword === "x-axis" || keyword === "y-axis") {
    const arrowIdx = rest.indexOf("-->");
    if (arrowIdx !== -1) {
      const left = rest.slice(0, arrowIdx).trim();
      const right = rest.slice(arrowIdx + 3).trim();
      return `${indent}${keyword}${sep}${quoteIfBareNonAscii(left)} --> ${quoteIfBareNonAscii(right)}`;
    }
  }
  return `${indent}${keyword}${sep}${quoteIfBareNonAscii(rest)}`;
}

function quoteIfBareNonAscii(text: string): string {
  if (!text) return text;
  // Already quoted at both ends — trust the author.
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    return text;
  }
  // Pure ASCII identifier (letters, digits, _, -): mermaid handles it
  // natively, no need to quote.
  if (/^[A-Za-z0-9_-]+$/.test(text)) return text;
  // Anything else (Chinese, spaces, punctuation): wrap in quotes,
  // escaping internal backslashes and quotes so we don't corrupt the
  // payload.
  const escaped = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}
