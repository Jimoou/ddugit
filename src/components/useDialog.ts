import { useCallback, useEffect, useId, useRef, useState } from "react";

/**
 * Keyboard behaviour shared by every dialog, sheet and popup menu:
 *
 * - Esc closes the topmost visible layer only (a token dialog over "new PR" closes alone).
 *   Hidden tabs keep their layers mounted, so a layer counts only while it is on screen.
 * - A modal layer takes focus when it opens (its `autoFocus` element, else itself),
 *   keeps Tab / Shift+Tab inside, and is labelled by its title (`.dialog-title` or another heading).
 * - A non-modal layer (sheets beside the graph, menus) leaves focus alone and ignores
 *   Esc typed into a field outside it, so search and the commit message keep their own Esc.
 * - Whatever had focus before the layer opened gets it back when the layer goes away.
 *
 * Spread the result on the layer's root; menus that have their own role take only `ref`.
 */
export function useDialog(onClose: () => void, modal = true) {
  const layer = useRef<Layer>({ el: null, close: onClose, modal });
  useEffect(() => {
    layer.current.close = onClose;
  });
  // Read during the first render: children's `autoFocus` runs before any effect of ours.
  const [opener] = useState(() => document.activeElement);
  const titleId = useId();

  useEffect(() => {
    const me = layer.current;
    if (!layers.length) {
      window.addEventListener("keydown", onKey);
      document.addEventListener("focusin", onFocusIn);
    }
    layers.push(me);
    const el = me.el;
    if (el && modal) {
      if (!el.hasAttribute("aria-label") && !el.hasAttribute("aria-labelledby")) {
        const title = el.querySelector<HTMLElement>(".dialog-title, h1, h2, h3");
        if (title) {
          title.id ||= titleId;
          el.setAttribute("aria-labelledby", title.id);
        }
      }
      if (!el.contains(document.activeElement)) el.focus({ preventScroll: true });
    }
    return () => {
      layers.splice(layers.indexOf(me), 1);
      if (!layers.length) {
        window.removeEventListener("keydown", onKey);
        document.removeEventListener("focusin", onFocusIn);
      }
      const now = document.activeElement;
      const lost = !now || now === document.body || !now.isConnected;
      if (lost && opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [modal, opener, titleId]);

  const ref = useCallback((el: HTMLElement | null) => {
    layer.current.el = el;
  }, []);
  return { ref, role: "dialog", "aria-modal": modal || undefined, tabIndex: -1 } as const;
}

interface Layer {
  el: HTMLElement | null;
  close(): void;
  modal: boolean;
}

/** Open layers, oldest first. */
const layers: Layer[] = [];

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=hidden])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function top(): Layer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) if (layers[i].el?.getClientRects().length) return layers[i];
}

const typing = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

/** What Tab visits: shown controls out of the tab order's -1, and of a radio group only its checked one (when one is). */
function tabStops(el: HTMLElement) {
  const skipped = (x: HTMLElement) =>
    x instanceof HTMLInputElement &&
    x.type === "radio" &&
    !x.checked &&
    !!el.querySelector(`input[type=radio][name="${CSS.escape(x.name)}"]:checked`);
  return [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (x) => x.tabIndex >= 0 && x.getClientRects().length && !skipped(x),
  );
}

function onKey(e: KeyboardEvent) {
  const l = top();
  if (!l?.el || e.defaultPrevented || e.isComposing) return;
  if (e.key === "Escape") {
    if (!l.modal && typing(e.target) && !l.el.contains(e.target as Node)) return;
    e.preventDefault();
    l.close();
  } else if (e.key === "Tab" && l.modal) {
    const stops = tabStops(l.el);
    const first = stops[0];
    const last = stops[stops.length - 1];
    const at = document.activeElement;
    const inside = at !== l.el && l.el.contains(at);
    // From the dialog itself, or past either end, wrap around instead of leaving.
    if (!first || !inside || at === (e.shiftKey ? first : last)) {
      e.preventDefault();
      (e.shiftKey ? (last ?? l.el) : (first ?? l.el)).focus();
    }
  }
}

/** Backstop for the trap: focus that lands outside the top modal (say, a click on a toast) goes back in. */
function onFocusIn(e: FocusEvent) {
  const l = top();
  if (l?.modal && l.el && e.target instanceof Node && !l.el.contains(e.target)) l.el.focus({ preventScroll: true });
}
