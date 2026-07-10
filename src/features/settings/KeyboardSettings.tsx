import { SHORTCUT_MANIFEST } from "@/app/shortcutManifest";
import { useI18n } from "@/i18n/index";

export function KeyboardSettings() {
  const { t } = useI18n();

  return (
    <div className="settings-section">
      <div className="settings-section-title">{t("keyboard.title")}</div>
      {SHORTCUT_MANIFEST.map((cat) => (
        <div className="settings-shortcuts-group" key={cat.categoryKey}>
          <div className="settings-shortcuts-label">{t(cat.categoryKey)}</div>
          {cat.items.map((item) => (
            <div className="settings-shortcut-row" key={`${item.descKey}:${item.keys}`}>
              <span>{t(item.descKey)}</span>
              <kbd>{item.keys}</kbd>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
