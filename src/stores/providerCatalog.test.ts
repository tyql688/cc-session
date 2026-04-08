import { describe, expect, it } from "vitest";
import {
  getProviderLabel,
  getProviderSortOrder,
  getProviderWatchStrategy,
} from "./providerCatalog";

describe("providerCatalog store fallbacks", () => {
  it("uses fallback label values before catalog loads", () => {
    expect(getProviderLabel("claude")).toBe("Claude Code");
    expect(getProviderLabel("cc-mirror", "cczai")).toBe("cczai");
    expect(getProviderLabel("cc-mirror")).toBe("CC-Mirror");
  });

  it("uses fallback watch strategy and sort order before catalog loads", () => {
    expect(getProviderWatchStrategy("gemini")).toBe("poll");
    expect(getProviderSortOrder("claude")).toBeLessThan(
      getProviderSortOrder("codex"),
    );
  });
});
