import { createResource, createSignal } from "solid-js";
import { useI18n } from "../../i18n/index";
import type { IndexStats } from "../../lib/types";
import { getIndexStats, startRebuildIndex, clearIndex } from "../../lib/tauri";
import { toast, toastError, toastInfo } from "../../stores/toast";
import { errorMessage } from "../../lib/errors";
import { formatFileSize } from "../../lib/formatters";
import { ConfirmDialog } from "../ConfirmDialog";

export function IndexSettings(props: { onIndexChanged: () => void }) {
  const { t } = useI18n();
  const [showClearIndexConfirm, setShowClearIndexConfirm] = createSignal(false);

  const [indexStats, { refetch: refetchStats }] = createResource<IndexStats>(
    () => getIndexStats(),
  );

  const indexStatsError = () =>
    indexStats.error ? errorMessage(indexStats.error) : null;

  async function handleRebuildIndex() {
    try {
      const started = await startRebuildIndex();
      if (!started) {
        toastInfo(t("toast.maintenanceBusy"));
        return;
      }
    } catch (_e) {
      toastError(t("toast.rebuildFailed"));
    }
  }

  return (
    <div class="settings-section">
      <div class="settings-section-title">{t("settings.index")}</div>

      {indexStatsError() && (
        <div class="session-error">{indexStatsError()}</div>
      )}

      <div class="settings-row">
        <div class="settings-label">{t("settings.totalSessions")}</div>
        <span class="settings-stat">
          {indexStats() ? indexStats()!.session_count.toLocaleString() : "—"}
        </span>
      </div>

      <div class="settings-row">
        <div class="settings-label">{t("settings.dbSize")}</div>
        <span class="settings-stat">
          {indexStats() ? formatFileSize(indexStats()!.db_size_bytes) : "—"}
        </span>
      </div>

      <div class="settings-row settings-row-spaced">
        <button class="settings-btn" onClick={handleRebuildIndex}>
          {t("settings.rebuildIndex")}
        </button>
        <button
          class="settings-btn settings-btn-danger"
          onClick={() => setShowClearIndexConfirm(true)}
        >
          {t("settings.clearIndex")}
        </button>
      </div>

      <div class="settings-help-text">{t("settings.rebuildIndexNote")}</div>
      <div class="settings-help-text">{t("settings.rebuildShortcutNote")}</div>

      <ConfirmDialog
        open={showClearIndexConfirm()}
        title={t("settings.clearIndex")}
        message={t("settings.clearIndexConfirm")}
        confirmLabel={t("settings.clearIndex")}
        onConfirm={async () => {
          setShowClearIndexConfirm(false);
          try {
            await clearIndex();
            toast(t("toast.clearIndexOk"));
            refetchStats();
            props.onIndexChanged();
          } catch (e) {
            toastError(errorMessage(e));
          }
        }}
        onCancel={() => setShowClearIndexConfirm(false)}
        danger={true}
      />
    </div>
  );
}
