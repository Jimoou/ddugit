import { useState } from "react";
import { t } from "../i18n";
import { Modal } from "./Modal";

export interface NameRequest {
  title: string;
  /** A note under the title. */
  hint?: string;
  placeholder: string;
  confirmLabel: string;
  /** Prefilled name (rename): submitting needs a different one. */
  initial?: string;
  /** Prefilled suggestion that can be taken as it is. */
  value?: string;
  /** Free text (a display name): spaces stay, instead of becoming dashes like a ref name. */
  free?: boolean;
  /** A second, optional field: a tag message. */
  extra?: { placeholder: string };
  /** An option under the fields, off at first (push the new tag too). */
  check?: { label: string };
  onSubmit(name: string, extra: string, checked: boolean): void;
}

/** Asks for a ref-like name (spaces become dashes) and optionally a second value. */
export function NameDialog({ req, busy, onCancel }: { req: NameRequest; busy: boolean; onCancel(): void }) {
  const { title, placeholder, confirmLabel, initial = "", extra, check, onSubmit } = req;
  const [name, setName] = useState(req.value ?? initial);
  const [message, setMessage] = useState("");
  const [checked, setChecked] = useState(false);
  const ok = name.trim() !== "" && name.trim() !== initial && !busy;
  return (
    <Modal
      onClose={onCancel}
      title={title}
      onSubmit={() => {
        if (ok) onSubmit(name.trim(), message.trim(), checked);
      }}
      actions={
        <>
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={!ok}>
            {confirmLabel}
          </button>
        </>
      }
    >
      {req.hint && <p className="muted">{req.hint}</p>}
      <input
        className="text"
        autoFocus
        placeholder={placeholder}
        value={name}
        onChange={(e) => setName(req.free ? e.target.value : e.target.value.replace(/\s+/g, "-"))}
      />
      {extra && (
        <textarea
          className="message"
          rows={3}
          placeholder={extra.placeholder}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      )}
      {check && (
        <label className="check">
          <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
          {check.label}
        </label>
      )}
    </Modal>
  );
}
