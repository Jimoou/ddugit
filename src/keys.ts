// What the window-wide keyboard shortcuts have in common.

const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * The key went to a field the user types or picks in (a select's type-ahead included), so single-key
 * shortcuts must leave it alone. Duck-typed so it also answers for non-element targets (window, document).
 */
export function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as { tagName?: unknown; isContentEditable?: unknown } | null;
  return !!el && (el.isContentEditable === true || (typeof el.tagName === "string" && FIELDS.has(el.tagName)));
}

/** Laid out on screen: hidden tabs keep their panels mounted, and only the visible tab's take keys. */
export function isOnScreen(el: Element | null | undefined): boolean {
  return !!el?.getClientRects().length;
}
