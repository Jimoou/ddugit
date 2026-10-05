import type { ReactNode } from "react";
import { t } from "../i18n";
import { Modal } from "./Modal";

export interface Confirm {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Destructive: red confirm button. */
  danger?: boolean;
  onConfirm(): void;
}

export function ConfirmDialog({ confirm, busy, onCancel }: { confirm: Confirm; busy: boolean; onCancel(): void }) {
  return (
    <Modal
      onClose={onCancel}
      title={confirm.title}
      titleClass={confirm.danger ? "danger" : undefined}
      actions={
        <>
          <button onClick={onCancel}>{t("common.cancel")}</button>
          <button
            className={confirm.danger ? "danger" : "primary"}
            autoFocus
            disabled={busy}
            onClick={confirm.onConfirm}
          >
            {confirm.confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-body">{confirm.body}</div>
    </Modal>
  );
}
