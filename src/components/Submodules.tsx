// Submodules in the sidebar: each with its state against the commit this
// repository records, opened in a tab with a click, updated from the header.

import { t } from "../i18n";
import type { SubmoduleInfo } from "../types";
import { Icon } from "./Icon";
import { SideSection } from "./Sidebar";

const short = (id: string | null) => id?.slice(0, 7) ?? "—";

export function SubmoduleSection(p: {
  submodules: SubmoduleInfo[];
  busy: boolean;
  onOpen(m: SubmoduleInfo): void;
  onUpdateAll(): void;
  onMenu(m: SubmoduleInfo, x: number, y: number): void;
}) {
  if (p.submodules.length === 0) return null;
  const behind = p.submodules.some((m) => m.state === "uninitialized" || m.state === "moved");
  return (
    <SideSection
      id="submodule"
      icon="orbit"
      className="submodules"
      title={t("sub.title")}
      count={p.submodules.length}
      actions={
        <button
          className={`h3-add ${behind ? "lit" : ""}`}
          title={t("sub.updateAll")}
          aria-label={t("sub.updateAll")}
          disabled={p.busy}
          onClick={p.onUpdateAll}
        >
          <Icon name="refresh" size={12} />
        </button>
      }
    >
      <ul>
        {p.submodules.map((m) => {
          const ready = m.state !== "uninitialized";
          const hint =
            m.state === "uninitialized"
              ? t("sub.hint.uninitialized")
              : m.state === "moved"
                ? t("sub.hint.moved", { recorded: short(m.recorded), checkedOut: short(m.checkedOut) })
                : t("sub.hint.open");
          return (
            <li
              key={m.path}
              className={`sub-${m.state}`}
              title={`${m.path}\n${hint}`}
              onClick={() => ready && p.onOpen(m)}
              onContextMenu={(e) => {
                e.preventDefault();
                p.onMenu(m, e.clientX, e.clientY);
              }}
            >
              <Icon name="folder" size={11} />
              <span className="name">{m.path}</span>
              <span className="sub-state">{t(`sub.state.${m.state}`)}</span>
            </li>
          );
        })}
      </ul>
    </SideSection>
  );
}
