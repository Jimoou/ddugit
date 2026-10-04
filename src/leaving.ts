// Popups leave with an animation even though React unmounts them at once: a
// dialog on its scrim or a context menu that disappears is cloned back in place,
// plays its `.leaving` animation (App.css) and is then dropped. The clone is inert
// (no clicks, hidden from assistive tech). Reduced motion and automated browsers
// (e2e, where a lingering copy would match the same selectors) skip it.

const POPUPS = ".scrim, .context-menu";
/** Longest leaving animation in App.css, plus a margin, in case `animationend` never comes. */
const MAX_MS = 260;

function playOut(el: HTMLElement, parent: Node) {
  const ghost = el.cloneNode(true) as HTMLElement;
  ghost.classList.add("leaving");
  ghost.inert = true;
  ghost.setAttribute("aria-hidden", "true");
  (parent.isConnected ? parent : document.body).appendChild(ghost);
  const drop = () => ghost.remove();
  ghost.addEventListener("animationend", (e) => e.target === ghost && drop());
  setTimeout(drop, MAX_MS);
}

export function animatePopupsLeaving() {
  if (navigator.webdriver || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  new MutationObserver((records) => {
    for (const r of records) {
      for (const node of r.removedNodes) {
        if (!(node instanceof HTMLElement) || node.classList.contains("leaving")) continue;
        const popups = node.matches(POPUPS) ? [node] : [...node.querySelectorAll<HTMLElement>(POPUPS)];
        // A popup removed together with its whole screen (closing a tab) just goes.
        if (popups.length === 1) playOut(popups[0], r.target);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
