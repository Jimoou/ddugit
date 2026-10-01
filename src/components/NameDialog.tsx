import { useState } from "react";

export interface NameRequest {
  title: string;
  placeholder: string;
  confirmLabel: string;
  /** Prefilled name (rename). */
  initial?: string;
  /** Shows an optional message field (annotated tag). */
  messagePlaceholder?: string;
  onSubmit(name: string, message: string): void;
}

/** Asks for a ref-like name (spaces become dashes) and optionally a message. */
export function NameDialog({ req, busy, onCancel }: { req: NameRequest; busy: boolean; onCancel(): void }) {
  const { title, placeholder, confirmLabel, initial = "", messagePlaceholder, onSubmit } = req;
  const [name, setName] = useState(initial);
  const [message, setMessage] = useState("");
  const ok = name.trim() !== "" && name.trim() !== initial && !busy;
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
        {messagePlaceholder && (
          <textarea
            className="message"
            rows={3}
            placeholder={messagePlaceholder}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>
            취소
          </button>
          <button className="primary" type="submit" disabled={!ok}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>
  );
}
