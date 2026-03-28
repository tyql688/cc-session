import { For, Show } from "solid-js";
import { useI18n } from "../i18n/index";
import { blockedFolders, removeBlockedFolder } from "../stores/settings";

export function BlockedView(props: { onRefreshTree?: () => void }) {
  const { t } = useI18n();

  return (
    <div class="blocked-view">
      <div class="explorer-header">{t("settings.blockedFolders")}</div>
      <Show
        when={blockedFolders().length > 0}
        fallback={
          <div class="empty-state">
            <p class="empty-state-text">{t("settings.noBlockedFolders")}</p>
            <p class="empty-state-hint">{t("blocked.hint")}</p>
          </div>
        }
      >
        <div class="blocked-list">
          <For each={blockedFolders()}>
            {(folder) => {
              const short = () => folder.split("/").slice(-2).join("/");
              return (
                <div class="blocked-item" title={folder}>
                  <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" class="blocked-item-icon">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                  </svg>
                  <span class="blocked-item-label">{short()}</span>
                  <button
                    class="blocked-item-btn"
                    title={t("settings.unblock")}
                    onClick={() => {
                      removeBlockedFolder(folder);
                      props.onRefreshTree?.();
                    }}
                  >
                    <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              );
            }}
          </For>
        </div>
      </Show>
    </div>
  );
}
