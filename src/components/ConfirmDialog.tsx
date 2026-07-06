import type React from "react";
import { useI18n } from "../i18n/index";

export function ConfirmDialog(props: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const { t } = useI18n();

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      props.onCancel();
    }
  }

  return (
    props.open && (
      <div
        className="modal-overlay"
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
      >
        <div className="modal-card">
          <div className="modal-title">{props.title}</div>
          <div className="modal-message">{props.message}</div>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={props.onCancel}>
              {t("confirm.cancel")}
            </button>
            <button
              className={`btn ${props.danger ? "btn-danger" : "btn-primary"}`}
              onClick={props.onConfirm}
            >
              {props.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )
  );
}
