import type { KeyboardEvent, ReactNode } from "react";

interface Option<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

interface Props<T extends string> {
  options: readonly Option<NoInfer<T>>[];
  value: T;
  onChange(value: NoInfer<T>): void;
  /** Accessible name of the group. */
  label: string;
  /** "tablist" when the choice swaps the view below it, "radiogroup" when it is a value of a form. */
  role?: "tablist" | "radiogroup";
  disabled?: boolean;
  className?: string;
}

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/**
 * The one control for switching between a few options (views of a sheet, a form's either/or).
 * One Tab stop (the chosen option); arrows, Home and End move the choice, skipping disabled ones.
 */
export function Segmented<T extends string>(p: Props<T>) {
  const role = p.role ?? "radiogroup";
  const enabled = p.options.filter((o) => !o.disabled && !p.disabled);
  // The Tab stop: the chosen option, or the first one that can be chosen.
  const stop = enabled.some((o) => o.value === p.value) ? p.value : enabled[0]?.value;

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled.length) return;
    const at = enabled.findIndex((o) => o.value === p.value);
    const to =
      e.key === "Home"
        ? 0
        : e.key === "End"
          ? enabled.length - 1
          : e.key in STEP
            ? (at + STEP[e.key] + enabled.length) % enabled.length
            : -1;
    if (to < 0) return;
    e.preventDefault();
    p.onChange(enabled[to].value);
    // The new choice re-renders with tabIndex 0; move focus along with it.
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("button");
    buttons[p.options.indexOf(enabled[to])]?.focus();
  };

  return (
    <div className={`segmented ${p.className ?? ""}`} role={role} aria-label={p.label} onKeyDown={onKey}>
      {p.options.map((o) => {
        const on = o.value === p.value;
        return (
          <button
            key={o.value}
            type="button"
            role={role === "tablist" ? "tab" : "radio"}
            aria-selected={role === "tablist" ? on : undefined}
            aria-checked={role === "radiogroup" ? on : undefined}
            tabIndex={o.value === stop ? 0 : -1}
            className={on ? "on" : ""}
            disabled={p.disabled || o.disabled}
            onClick={() => p.onChange(o.value)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
