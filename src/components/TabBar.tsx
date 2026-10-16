import { Icon } from "./Icon";
import { useRef, useState, type ReactNode, type PointerEvent } from "react";
import { t } from "../i18n";
import { repoName } from "../recent";
import type { Tabs } from "../tabs";
import { PlanetDot } from "./Planet";
import { WindowControls } from "./WindowControls";
import { chromeOf } from "../chrome";
import { Wordmark } from "./Wordmark";
import { isTauri } from "../api";

/** Pointer travel (px) before a press on a tab becomes a drag, so clicks still just select. */
const DRAG_START = 5;

/** The frame this window draws (fixed for the session). */
const chrome = chromeOf(navigator.userAgent, isTauri);

/**
 * The window's top row: the wordmark, the home tab (the galaxy dashboard), a tab per open repository (the open
 * tab's ▾ opens the repository menu: recent, open, clone, new), "+" for a new
 * tab, and settings at the far end. In the desktop app on macOS and Windows the row is also
 * the title bar: its empty parts drag the window (double-click maximizes), macOS's traffic
 * lights sit at its start and Windows gets our own window buttons at its end. Dragging a
 * repository tab sideways moves it among the others (the home tab stays first).
 */
export function TabBar(p: {
  tabs: Tabs;
  /** The galaxy dashboard is showing instead of the active tab. */
  home: boolean;
  onHome(): void;
  /** Repository names as the snapshots report them, by path (the folder name until loaded). */
  names: Record<string, string>;
  /** Group of each grouped repository, by path: its colour runs along the tab's top. */
  groupOf: Record<string, { name: string; hue: number }>;
  onSelect(id: number): void;
  onClose(id: number): void;
  onNew(): void;
  /** Move a tab to position `to` among the others while it's dragged. */
  onMove(id: number, to: number): void;
  /** Toggle the repository menu under the button at `x` (window px). */
  onRepoMenu(x: number): void;
  /** The open repository menu and where it hangs. */
  menu?: { x: number; node: ReactNode };
  onSettings(): void;
}) {
  const nav = useRef<HTMLElement>(null);
  /** The tab under a held pointer: where it went down, and whether it has moved far enough to drag. */
  const held = useRef<{ id: number; x: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const down = (e: PointerEvent<HTMLElement>, id: number) => {
    if (e.button !== 0 || (e.target as Element).closest("button")) return;
    held.current = { id, x: e.clientX, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLElement>) => {
    const h = held.current;
    if (!h || (!h.moved && Math.abs(e.clientX - h.x) < DRAG_START)) return;
    if (!h.moved) {
      h.moved = true;
      setDragging(h.id);
    }
    // The slot is how many of the other tabs sit left of the pointer.
    const others = [...(nav.current?.querySelectorAll<HTMLElement>(".tab[data-tab]") ?? [])].filter(
      (el) => Number(el.dataset.tab) !== h.id,
    );
    const to = others.filter((el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2 < e.clientX;
    }).length;
    if (p.tabs.list.findIndex((x) => x.id === h.id) !== to) p.onMove(h.id, to);
  };
  const up = () => {
    held.current = null;
    setDragging(null);
  };

  return (
    <header className={`tabrow chrome-${chrome}`} data-tauri-drag-region>
      <h1 className="brand small" data-tauri-drag-region>
        <Wordmark />
      </h1>
      <nav
        ref={nav}
        className={`tabbar ${dragging !== null ? "sorting" : ""}`}
        role="tablist"
        aria-label={t("tabs.label")}
        data-tauri-drag-region
      >
        <div
          role="tab"
          aria-selected={p.home}
          className={`tab tab-home ${p.home ? "on" : ""}`}
          title={t("tabs.homeHint")}
          onClick={p.onHome}
        >
          <Icon name="orbit" />
          <span className="tab-name">{t("tabs.home")}</span>
        </div>
        {p.tabs.list.map((tab) => {
          const on = !p.home && tab.id === p.tabs.active;
          const name = tab.path ? (p.names[tab.path] ?? repoName(tab.path)) : t("tabs.new");
          const group = tab.path ? p.groupOf[tab.path] : undefined;
          return (
            <div
              key={tab.id}
              role="tab"
              data-tab={tab.id}
              aria-selected={on}
              className={`tab ${on ? "on" : ""} ${group ? "grouped" : ""} ${dragging === tab.id ? "dragging" : ""}`}
              style={group ? { ["--h" as string]: group.hue } : undefined}
              title={tab.path ? (group ? `${group.name} · ${tab.path}` : tab.path) : undefined}
              onClick={() => p.onSelect(tab.id)}
              onAuxClick={(e) => e.button === 1 && p.onClose(tab.id)}
              onPointerDown={(e) => down(e, tab.id)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            >
              {tab.path && <PlanetDot path={tab.path} />}
              <span className="tab-name">{name}</span>
              {on && tab.path && (
                <button
                  className="tab-menu"
                  aria-label={t("tabs.menu")}
                  title={t("tabs.menu")}
                  aria-expanded={!!p.menu}
                  onClick={(e) => {
                    e.stopPropagation();
                    p.onRepoMenu(e.currentTarget.closest(".tab")!.getBoundingClientRect().left);
                  }}
                >
                  <Icon name="chevronDown" size={12} />
                </button>
              )}
              <button
                className="tab-close"
                aria-label={t("tabs.close", { name })}
                title={t("tabs.close", { name })}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onClose(tab.id);
                }}
              >
                <Icon name="close" />
              </button>
            </div>
          );
        })}
        <button className="tab-new" aria-label={t("tabs.newTab")} title={t("tabs.newTab")} onClick={p.onNew}>
          <Icon name="plus" />
        </button>
      </nav>
      <button
        className="ghost tabrow-settings"
        title={t("top.settings")}
        aria-label={t("top.settings.label")}
        onClick={p.onSettings}
      >
        <Icon name="settings" />
      </button>
      {chrome === "win" && <WindowControls />}
      {p.menu && (
        <div className="tab-menu-anchor" style={{ left: p.menu.x }}>
          {p.menu.node}
        </div>
      )}
    </header>
  );
}
