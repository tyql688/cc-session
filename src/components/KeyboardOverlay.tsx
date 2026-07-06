import { useI18n } from "../i18n/index";
import { isMac } from "../lib/platform";
const mod = isMac ? "\u2318" : "Ctrl+";
const shift = isMac ? "\u21E7" : "Shift+";
const opt = isMac ? "\u2325" : "Alt+";

interface ShortcutItem {
  keys: string;
  descKey: string;
}

interface ShortcutCategory {
  categoryKey: string;
  items: ShortcutItem[];
}

const shortcuts: ShortcutCategory[] = [
  {
    categoryKey: "keyboard.navigation",
    items: [
      { keys: `${mod}K`, descKey: "keyboard.globalSearch" },
      { keys: `${mod}1-9`, descKey: "keyboard.switchTab" },
      { keys: isMac ? `${mod}]` : "Ctrl+Tab", descKey: "keyboard.nextTab" },
      {
        keys: isMac ? `${mod}[` : `${shift}Ctrl+Tab`,
        descKey: "keyboard.prevTab",
      },
    ],
  },
  {
    categoryKey: "keyboard.tabs",
    items: [
      { keys: `${mod}W`, descKey: "keyboard.closeTab" },
      { keys: `${shift}${mod}W`, descKey: "keyboard.closeAllTabs" },
    ],
  },
  {
    categoryKey: "keyboard.session",
    items: [
      { keys: `${mod}F`, descKey: "keyboard.findInSession" },
      { keys: `${shift}${mod}R`, descKey: "keyboard.resumeSession" },
      { keys: `${shift}${mod}E`, descKey: "keyboard.exportSession" },
      { keys: `${mod}B`, descKey: "keyboard.toggleFavorite" },
      { keys: `${mod}L`, descKey: "keyboard.toggleWatch" },
      { keys: `${mod}\u232B`, descKey: "keyboard.deleteSession" },
    ],
  },
  {
    categoryKey: "keyboard.splitView",
    items: [
      { keys: `${mod}\\`, descKey: "keyboard.splitEditor" },
      {
        keys: isMac ? `${mod}${opt}←` : `Ctrl+${opt}←`,
        descKey: "keyboard.focusGroupLeft",
      },
      {
        keys: isMac ? `${mod}${opt}→` : `Ctrl+${opt}→`,
        descKey: "keyboard.focusGroupRight",
      },
    ],
  },
  {
    categoryKey: "keyboard.general",
    items: [
      { keys: `${mod},`, descKey: "keyboard.openSettings" },
      { keys: `${mod}R`, descKey: "keyboard.refresh" },
      { keys: `${mod}/`, descKey: "keyboard.showShortcuts" },
      { keys: "?", descKey: "keyboard.showShortcuts" },
      { keys: "Esc", descKey: "keyboard.escape" },
    ],
  },
];

export function KeyboardOverlay(props: { show: boolean; onClose: () => void }) {
  const { t } = useI18n();

  return (
    props.show && (
      <div
        className="keyboard-overlay-backdrop"
        onClick={() => props.onClose()}
      >
        <div
          className="keyboard-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t("keyboard.title")}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="keyboard-overlay-header">
            <span className="keyboard-overlay-title">
              {t("keyboard.title")}
            </span>
            <button
              className="keyboard-overlay-close"
              onClick={() => props.onClose()}
            >
              <svg
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="keyboard-grid">
            {shortcuts.map((cat) => (
              <div key={cat.categoryKey}>
                <div className="keyboard-category-title">
                  {t(cat.categoryKey)}
                </div>
                {cat.items.map((item, i) => (
                  <div className="keyboard-item" key={i}>
                    <span className="keyboard-item-desc">
                      {t(item.descKey) || item.descKey}
                    </span>
                    <span className="keyboard-keys">{item.keys}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  );
}
