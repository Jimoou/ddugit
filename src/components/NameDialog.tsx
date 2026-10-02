import { useState } from "react";
import { t } from "../i18n";

export interface NameRequest {
  title: string;
  placeholder: string;
  confirmLabel: string;
  /** Prefilled name (rename): submitting needs a different one. */
  initial?: string;
  /** Prefilled suggestion that can be taken as it is. */
  value?: string;
  /** A second field: a tag message (multiline, optional) or a remote URL (required). */
  extra?: { placeholder: string; multiline?: boolean; required?: boolean };
  onSubmit(name: string, extra: string): void;
}

/** Asks for a ref-like name (spaces become dashes) and optionally a second value. */
export function NameDialog({ req, busy, onCancel }: { req: NameRequest; busy: boolean; onCancel(): void }) {
  const { title, placeholder, confirmLabel, initial = "", extra, onSubmit } = req;
  const [name, setName] = useState(req.value ?? initial);
  const [message, setMessage] = useState("");
  const ok = name.trim() !== "" && name.trim() !== initial && !busy && (!extra?.required || message.trim() !== "");
  return (
    <div className="scrim" onClick={onCancel}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSubmit(name.trim(), message.trim());
        }}
      >
        <div className="eyebrow">{title}</div>
        <input
          className="text"
          autoFocus
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s+/g, "-"))}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
        />
        {extra?.multiline && (
          <textarea
            className="message"
            rows={3}
            placeholder={extra.placeholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        )}
        {extra && !extra.multiline && (
          <input
            className="text"
            placeholder={extra.placeholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && onCancel()}
          />
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={!ok}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
