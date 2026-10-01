import { useState } from "react";

interface Props {
  title: string;
  placeholder: string;
  confirmLabel: string;
  busy: boolean;
  onSubmit(name: string): void;
  onCancel(): void;
}

/** Asks for a single ref-like name (spaces become dashes). */
export function NameDialog({ title, placeholder, confirmLabel, busy, onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const ok = name.trim() !== "" && !busy;
  return (
    <div className="scrim" onClick={onCancel}>
      <form
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) onSubmit(name.trim());
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
