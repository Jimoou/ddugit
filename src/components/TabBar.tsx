import { t } from "../i18n";
import { repoName } from "../recent";
import type { Tabs } from "../tabs";

/** One tab per open repository, plus "+" for a new (welcome) tab. */
export function TabBar(p: { tabs: Tabs; onSelect(id: number): void; onClose(id: number): void; onNew(): void }) {
  return (
    <nav className="tabbar" role="tablist" aria-label={t("tabs.label")}>
      {p.tabs.list.map((tab) => {
        const on = tab.id === p.tabs.active;
        const name = tab.path ? repoName(tab.path) : t("tabs.new");
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
            <button
              className="tab-close"
              aria-label={t("tabs.close", { name })}
              title={t("tabs.close", { name })}
              onClick={(e) => {
                e.stopPropagation();
                p.onClose(tab.id);
              }}
            >
              ✕
            </button>
          </div>
        );
      })}
      <button className="tab-new" aria-label={t("tabs.newTab")} title={t("tabs.newTab")} onClick={p.onNew}>
        ＋
      </button>
    </nav>
  );
}
