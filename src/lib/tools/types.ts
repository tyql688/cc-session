import type { ToolMetadata } from "../types";
import type { ToolDiffLine } from "../diff";
import { shortenHomePath } from "../formatters";

/** A single label/value row rendered in the expanded tool detail. */
export interface Line {
  label: string;
  value: string;
}

export interface ToolDetail {
  lines: Line[];
  diff?: { old: string; new: string };
  patchDiff?: ToolDiffLine[];
  persistedOutputPath?: string;
}

export function isPathLabel(label: string): boolean {
  const normalized = label.toLowerCase();
  return (
    normalized === "file" ||
    normalized === "path" ||
    normalized.endsWith("path")
  );
}

export function toolLine(label: string, value: unknown): Line {
  const stringValue = String(value ?? "");
  return {
    label,
    value: isPathLabel(label) ? shortenHomePath(stringValue) : stringValue,
  };
}

/** First non-empty string value among `keys` in `obj` (empty string if none). */
export function firstString(
  obj: Record<string, unknown>,
  keys: string[],
): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

/**
 * Pick the first present value across an alias chain (e.g. file_path/path),
 * returning it stringified, or `undefined` when none of the aliases carry a
 * non-nullish value. Use for the "first alias wins" pattern where a falsy-but-
 * present value (0, "") should still be considered absent only if nullish.
 */
export function pickField(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return undefined;
}

export function maybeNumber(value: unknown): string | undefined {
  return typeof value === "number" ? value.toLocaleString() : undefined;
}

export function valueToDisplayString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return value.toLocaleString();
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return value.map(valueToDisplayString).filter(Boolean).join(", ");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const from = record.from;
    const to = record.to;
    if (
      (typeof from === "string" || typeof from === "number") &&
      (typeof to === "string" || typeof to === "number")
    ) {
      return `${valueToDisplayString(from)} → ${valueToDisplayString(to)}`;
    }
    return Object.entries(record)
      .map(([key, nested]) => `${key}: ${valueToDisplayString(nested)}`)
      .join(", ");
  }
  return "";
}

export function structuredRecord(
  metadata: ToolMetadata | undefined,
): Record<string, unknown> | null {
  const structured = metadata?.structured;
  return structured &&
    typeof structured === "object" &&
    !Array.isArray(structured)
    ? (structured as Record<string, unknown>)
    : null;
}

export function nestedRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
