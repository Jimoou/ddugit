import type { ReactNode } from "react";
import { t } from "../i18n";
import { useDialog } from "./useDialog";

export interface Confirm {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Destructive: red confirm button. */
  danger?: boolean;
  onConfirm(): void;
}

export function ConfirmDialog({ confirm, busy, onCancel }: { confirm: Confirm; busy: boolean; onCancel(): void }) {
  const dialog = useDialog(onCancel);
  return (
    <div className="scrim" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} {...dialog}>
        <div className={`eyebrow ${confirm.danger ? "danger" : ""}`}>{confirm.title}</div>
        <div className="confirm-body">{confirm.body}</div>
        <div className="dialog-actions">
          <button onClick={onCancel}>{t("common.cancel")}</button>
          <button
            className={confirm.danger ? "danger" : "primary"}
            autoFocus
            disabled={busy}
            onClick={confirm.onConfirm}
          >
            {confirm.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
