// Stacked branches: a sidebar section listing each stack (lowest branch first,
// each branch under the one it sits on) with a restack button per stack.
// Stacks are built and changed from the branch menu (RepoView's `refMenu`).

import { t } from "../i18n";
import { offerPro, proOpen, usePro } from "../pro";
import { stackGroups } from "../stack";
import type { StackBranch } from "../types";
import { Icon } from "./Icon";
import { ProBadge } from "./ProOffer";
import { SideSection } from "./Sidebar";

export function StackSection(p: {
  stacks: StackBranch[];
  head: string | null;
  busy: boolean;
  onRestack(branch: string): void;
  onShow(branch: string): void;
  onMenu(branch: string, x: number, y: number): void;
}) {
  const pro = proOpen(usePro());
  const groups = stackGroups(p.stacks);
  if (!groups.length) return null;
  return (
    <SideSection id="stack" className="stacks" title={t("stack.title")} count={groups.length}>
      {groups.map((g) => {
        const lowest = g.rows[0].branch.name;
        return (
          <div key={lowest} className="stack-group">
            <div className="stack-base">
              <Icon name="stack" size={11} />
              <span className="mono" title={g.base}>
                {g.base}
              </span>
              <button
                className={`stack-restack ${g.behind ? "lit" : ""}`}
                title={t("stack.restack.hint")}
                disabled={p.busy}
                onClick={() => (pro ? p.onRestack(lowest) : offerPro("stack"))}
              >
                {t("stack.restack")} {!pro && <ProBadge />}
              </button>
            </div>
            <ul>
              {g.rows.map(({ branch: b, depth }) => (
                <li
                  key={b.name}
                  className={b.name === p.head ? "head" : ""}
                  style={{ paddingLeft: 14 + depth * 12 }}
                  onClick={() => p.onShow(b.name)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    p.onMenu(b.name, e.clientX, e.clientY);
                  }}
                >
                  <span className="stack-tick" aria-hidden>
                    └
                  </span>
                  <span className="name">{b.name}</span>
                  {b.parentMissing ? (
                    <span className="stack-flag warn" title={t("stack.parentMissing.hint", { parent: b.parent })}>
                      {t("stack.parentMissing")}
                    </span>
                  ) : b.behind ? (
                    <span className="stack-flag" title={t("stack.behind")}>
                      {t("stack.behind")}
                    </span>
                  ) : (
                    <span className="muted small">{t("stack.own", { n: b.own })}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </SideSection>
  );
}
