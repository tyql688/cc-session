import { formatShortcut, isMac } from "@/lib/platform";

interface ShortcutItem {
  keys: string;
  descKey: string;
}

export interface ShortcutCategory {
  categoryKey: string;
  items: ShortcutItem[];
}

/**
 * Single source of truth for every displayed shortcut hint — the overlay
 * (Cmd+/) and the Settings page both render this list, so they can't drift
 * from each other. Keep it in sync with the handler in KeyboardShortcuts.ts.
 */
export const SHORTCUT_MANIFEST: ShortcutCategory[] = [
  {
    categoryKey: "keyboard.navigation",
    items: [
      { keys: `${formatShortcut("K")} / ${formatShortcut("P")}`, descKey: "keyboard.globalSearch" },
      { keys: formatShortcut("F", { shift: true }), descKey: "keyboard.globalSearch" },
      { keys: formatShortcut("1-9"), descKey: "keyboard.switchTab" },
      { keys: isMac ? formatShortcut("]") : "Ctrl+Tab", descKey: "keyboard.nextTab" },
      { keys: isMac ? formatShortcut("[") : "Ctrl+Shift+Tab", descKey: "keyboard.prevTab" },
    ],
  },
  {
    categoryKey: "keyboard.tabs",
    items: [
      { keys: formatShortcut("W"), descKey: "keyboard.closeTab" },
      { keys: formatShortcut("W", { shift: true }), descKey: "keyboard.closeAllTabs" },
      { keys: formatShortcut("T", { shift: true }), descKey: "keyboard.reopenTab" },
    ],
  },
  {
    categoryKey: "keyboard.session",
    items: [
      { keys: formatShortcut("F"), descKey: "keyboard.findInSession" },
      { keys: formatShortcut("G"), descKey: "keyboard.findNext" },
      { keys: formatShortcut("G", { shift: true }), descKey: "keyboard.findPrev" },
      { keys: formatShortcut("R", { shift: true }), descKey: "keyboard.resumeSession" },
      { keys: formatShortcut("E", { shift: true }), descKey: "keyboard.exportSession" },
      { keys: formatShortcut("D"), descKey: "keyboard.toggleFavorite" },
    ],
  },
  {
    categoryKey: "keyboard.splitView",
    items: [
      { keys: formatShortcut("\\"), descKey: "keyboard.splitEditor" },
      { keys: formatShortcut("←", { alt: true }), descKey: "keyboard.focusGroupLeft" },
      { keys: formatShortcut("→", { alt: true }), descKey: "keyboard.focusGroupRight" },
      { keys: formatShortcut("B"), descKey: "keyboard.toggleSidebar" },
    ],
  },
  {
    categoryKey: "keyboard.general",
    items: [
      { keys: formatShortcut(","), descKey: "keyboard.openSettings" },
      { keys: formatShortcut("R"), descKey: "keyboard.refresh" },
      { keys: `${formatShortcut("/")} / ?`, descKey: "keyboard.showShortcuts" },
      { keys: "Esc", descKey: "keyboard.escape" },
    ],
  },
];
