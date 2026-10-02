import { Icon } from "./Icon";
import type { ReactNode } from "react";
import { t } from "../i18n";
import { repoName } from "../recent";
import type { Tabs } from "../tabs";

/**
 * The window's top row: the wordmark, a tab per open repository (the open
 * tab's ▾ opens the repository menu: recent, open, clone, new), "+" for a new
 * tab, and settings at the far end.
 */
export function TabBar(p: {
  tabs: Tabs;
  /** Repository names as the snapshots report them, by path (the folder name until loaded). */
  names: Record<string, string>;
  onSelect(id: number): void;
  onClose(id: number): void;
  onNew(): void;
  /** Toggle the repository menu under the button at `x` (window px). */
  onRepoMenu(x: number): void;
  /** The open repository menu and where it hangs. */
  menu?: { x: number; node: ReactNode };
  onSettings(): void;
}) {
  return (
    <header className="tabrow">
      <h1 className="wordmark small">ddugit</h1>
      <nav className="tabbar" role="tablist" aria-label={t("tabs.label")}>
        {p.tabs.list.map((tab) => {
          const on = tab.id === p.tabs.active;
          const name = tab.path ? (p.names[tab.path] ?? repoName(tab.path)) : t("tabs.new");
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={on}
              className={`tab ${on ? "on" : ""}`}
              title={tab.path ?? undefined}
              onClick={() => p.onSelect(tab.id)}
              onAuxClick={(e) => e.button === 1 && p.onClose(tab.id)}
            >
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
      {p.menu && (
        <div className="tab-menu-anchor" style={{ left: p.menu.x }}>
          {p.menu.node}
        </div>
      )}
    </header>
  );
}
