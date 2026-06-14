import type { ToolMetadata } from "../types";
import type { ToolDetail } from "./types";

/** Result presentation is derived by Rust tool metadata builders. */
export function formatToolResultMetadata(
  metadata: ToolMetadata | undefined,
): ToolDetail | null {
  return metadata?.presentation?.resultDetail ?? null;
}
