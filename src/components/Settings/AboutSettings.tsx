import { onMount } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { createSignal } from "solid-js";
import { useI18n } from "../../i18n/index";
import {
  phase,
  availableVersion,
  checkForUpdate,
  downloadAndInstall,
} from "../../stores/updater";

export function AboutSettings() {
  const { t } = useI18n();
  const [version, setVersion] = createSignal("0.1.0");

  onMount(async () => {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      setVersion(await getVersion());
    } catch {
      /* fallback */
    }
  });

  const buttonLabel = () => {
    switch (phase()) {
      case "checking":
        return "...";
      case "available":
        return `↑ v${availableVersion()}`;
      case "downloading":
      case "installing":
        return t("settings.updating");
      case "error":
        return t("settings.updateFailed");
      default:
        return t("settings.checkUpdate");
    }
  };

  const isDisabled = () =>
    phase() === "checking" ||
    phase() === "downloading" ||
    phase() === "installing";

  function handleClick() {
    if (phase() === "available") {
      void downloadAndInstall();
    } else if (phase() === "idle" || phase() === "error") {
      void checkForUpdate();
    }
  }

  return (
    <div class="settings-section">
      <div class="settings-section-title">{t("settings.about")}</div>

      <div class="settings-row">
        <div class="settings-label">{t("settings.version")}</div>
        <div style={{ display: "flex", "align-items": "center", gap: "8px" }}>
          <span class="settings-stat">{version()}</span>
          <button
            class="settings-btn"
            disabled={isDisabled()}
            onClick={handleClick}
          >
            {buttonLabel()}
          </button>
        </div>
      </div>

      <div class="settings-row">
        <div class="settings-label">{t("settings.github")}</div>
        <a
          class="settings-stat link-accent"
          href="https://github.com/tyql688/cc-session"
          onClick={(e) => {
            e.preventDefault();
            invoke("open_external", {
              url: "https://github.com/tyql688/cc-session",
            }).catch((e) => console.error("Failed to open GitHub:", e));
          }}
        >
          cc-session
        </a>
      </div>
    </div>
  );
}
