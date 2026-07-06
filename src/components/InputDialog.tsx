import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n/index";

export function InputDialog(props: {
  open: boolean;
  title: string;
  label: string;
  defaultValue: string;
  confirmLabel: string;
  maxLength?: number;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(props.defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (props.open) {
      setValue(props.defaultValue);
      // Focus input after render
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [props.open, props.defaultValue]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) {
      props.onCancel();
    }
  }

  function handleSubmit() {
    const trimmed = value.trim();
    if (trimmed && trimmed !== props.defaultValue) {
      props.onConfirm(trimmed);
    } else {
      props.onCancel();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
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
          <div className="modal-message">{props.label}</div>
          <input
            ref={inputRef}
            className="modal-input"
            type="text"
            value={value}
            maxLength={props.maxLength}
            onChange={(e) => setValue(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          {props.maxLength !== undefined && (
            <div className="modal-input-counter">
              {value.length}/{props.maxLength}
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={props.onCancel}>
              {t("confirm.cancel")}
            </button>
            <button className="btn btn-primary" onClick={handleSubmit}>
              {props.confirmLabel}
            </button>
          </div>
        </div>
      </div>
    )
  );
}
