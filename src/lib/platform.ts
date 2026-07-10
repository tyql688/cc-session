export const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
export const isWindows = typeof navigator !== "undefined" && /Win/.test(navigator.platform);

/**
 * Render a keyboard shortcut with platform-conventional modifier order:
 * macOS symbols in the HIG order (⌃⌥⇧⌘ before the key, no separators),
 * Windows/Linux as "Ctrl+Alt+Shift+Key". Every displayed hint goes through
 * here so orderings can't drift per call site.
 */
export function formatShortcut(key: string, mods: { shift?: boolean; alt?: boolean; mod?: boolean } = {}): string {
  const { shift = false, alt = false, mod = true } = mods;
  if (isMac) {
    return `${alt ? "⌥" : ""}${shift ? "⇧" : ""}${mod ? "⌘" : ""}${key}`;
  }
  return `${mod ? "Ctrl+" : ""}${alt ? "Alt+" : ""}${shift ? "Shift+" : ""}${key}`;
}
