import { For } from "solid-js";
import type { Accessor } from "solid-js";
import { useI18n } from "../../i18n/index";
import type { SessionCostRow } from "../../lib/types";
import { ROW_LIMIT_OPTIONS, type UsageSortState } from "../../lib/usage";
import { fmtActive, fmtCost, fmtTokens, sortIcon } from "./formatters";
import type { LimitOption } from "./ProjectTable";
import type { ProviderChipInfo } from "./Toolbar";

export interface SessionTableProps {
  visibleSessions: Accessor<SessionCostRow[]>;
  totalSessionCount: Accessor<number>;
  sessionLimit: Accessor<LimitOption>;
  onLimitChange: (limit: LimitOption) => void;
  sessionSort: Accessor<UsageSortState>;
  onSort: (col: string) => void;
  providerInfo: (key: string) => ProviderChipInfo;
  formatProjectName: (project: string, projectPath: string) => string;
  formatProjectPath: (projectPath: string) => string;
  formatModelName: (model: string) => string;
}

export function SessionTable(props: SessionTableProps) {
  const { t } = useI18n();
  const icon = (col: string) => sortIcon(props.sessionSort(), col);

  return (
    <section class="usage-card usage-table-card">
      <div class="usage-section-header">
        <div>
          <div class="usage-section-title">{t("usage.recentSessions")}</div>
          <div class="usage-section-subtitle">
            {Math.min(props.sessionLimit(), props.totalSessionCount())}/
            {props.totalSessionCount()}
          </div>
        </div>
        <div class="usage-section-actions">
          <For each={ROW_LIMIT_OPTIONS}>
            {(limit) => (
              <button
                class={`usage-limit-btn${props.sessionLimit() === limit ? " active" : ""}`}
                onClick={() => props.onLimitChange(limit)}
                type="button"
              >
                {limit}
              </button>
            )}
          </For>
        </div>
      </div>
      <div class="usage-table-wrap">
        <table class="usage-table">
          <thead>
            <tr>
              <th>{t("usage.project")}</th>
              <th>{t("usage.provider")}</th>
              <th>{t("usage.model")}</th>
              <th class="r" onClick={() => props.onSort("updated_at")}>
                {t("usage.active")}
                <span class="usage-sort-icon">{icon("updated_at")}</span>
              </th>
              <th class="r" onClick={() => props.onSort("turns")}>
                {t("usage.turns")}
                <span class="usage-sort-icon">{icon("turns")}</span>
              </th>
              <th class="r" onClick={() => props.onSort("tokens")}>
                {t("usage.tokens")}
                <span class="usage-sort-icon">{icon("tokens")}</span>
              </th>
              <th class="r" onClick={() => props.onSort("cost")}>
                {t("usage.cost")}
                <span class="usage-sort-icon">{icon("cost")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <For each={props.visibleSessions()}>
              {(row) => {
                const info = props.providerInfo(row.provider);
                return (
                  <tr>
                    <td>
                      <div class="usage-entity-cell">
                        <div class="usage-entity-title">
                          {props.formatProjectName(
                            row.project,
                            row.project_path,
                          )}
                        </div>
                        <div
                          class="usage-entity-subtitle"
                          title={props.formatProjectPath(row.project_path)}
                        >
                          {props.formatProjectPath(row.project_path)}
                        </div>
                      </div>
                    </td>
                    <td class="usage-provider-cell">
                      <span
                        class="usage-provider-dot"
                        style={{ background: info.color }}
                      />
                      {info.label}
                    </td>
                    <td>
                      <span class="usage-model-tag">
                        {props.formatModelName(row.model)}
                      </span>
                    </td>
                    <td class="r usage-dim">{fmtActive(row.updated_at)}</td>
                    <td class="r">{row.turns.toLocaleString()}</td>
                    <td class="r">{fmtTokens(row.tokens)}</td>
                    <td class="r usage-cost-val">{fmtCost(row.cost)}</td>
                  </tr>
                );
              }}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}
