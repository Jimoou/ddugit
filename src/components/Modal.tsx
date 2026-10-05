import type { MouseEvent, ReactNode } from "react";
import { useDialog } from "./useDialog";

interface Props {
  onClose(): void;
  /** Classes beside `dialog`, naming this one for its styles. */
  className?: string;
  /** Accessible name, when the title holds more than the name (a badge, an icon). */
  label?: string;
  /** The `.dialog-title` heading; leave it out to lay out a heading of your own. */
  title?: ReactNode;
  titleClass?: string;
  /** Makes the dialog a form: Enter in a field submits. */
  onSubmit?(): void;
  /** The footer's buttons (`.dialog-actions`). */
  actions?: ReactNode;
  children?: ReactNode;
}

/** A modal dialog over a scrim: keyboard and focus from `useDialog`, closed by Esc or a click on the scrim. */
export function Modal({ onClose, className, label, title, titleClass, onSubmit, actions, children }: Props) {
  const dialog = useDialog(onClose);
  const root = {
    className: className ? `dialog ${className}` : "dialog",
    "aria-label": label,
    onClick: (e: { stopPropagation(): void }) => e.stopPropagation(),
    ...dialog,
  };
  const inner = (
    <>
      {title !== undefined && <h2 className={titleClass ? `dialog-title ${titleClass}` : "dialog-title"}>{title}</h2>}
      {children}
      {actions && <div className="dialog-actions">{actions}</div>}
    </>
  );
  return (
    <div className="scrim" {...closeOnScrim(onClose)}>
      {onSubmit ? (
        <form
          {...root}
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {inner}
        </form>
      ) : (
        <div {...root}>{inner}</div>
      )}
    </div>
  );
}

/** The scrim a press started on; a press inside the dialog (a text selection dragged out) leaves it null. */
let pressed: EventTarget | null = null;

/**
 * Props for a dialog's scrim: a click on it closes the dialog, but only when the press started on the scrim too.
 * A selection dragged out of a field and released over the scrim "clicks" it, and must not throw the text away.
 */
function closeOnScrim(close: () => void) {
  const self = (e: MouseEvent) => e.target === e.currentTarget;
  return {
    onPointerDown: (e: MouseEvent) => {
      pressed = self(e) ? e.currentTarget : null;
    },
    onClick: (e: MouseEvent) => {
      const on = pressed === e.currentTarget && self(e);
      pressed = null;
      if (on) close();
    },
  };
}
