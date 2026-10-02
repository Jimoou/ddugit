import { useState } from "react";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import type { SyncPlan } from "../sync";
import { Icon } from "./Icon";

/** Commits listed by name before the rest are counted. */
const LISTED = 8;

/**
 * Before a fetch, pull or push: what will move and where, so nothing leaves
 * or lands by a stray click. "Don't ask again" turns it off for that kind of
 * work (settings can turn it back on).
 */
export function SyncConfirm(p: {
  plan: SyncPlan;
  branch: string | null;
  busy: boolean;
  onGo(): void;
  onNeverAsk(): void;
  onCancel(): void;
}) {
  const { plan } = p;
  const [never, setNever] = useState(false);
  const n = plan.commits.length;
  const body =
    plan.op === "fetch"
      ? "sync.ask.fetch"
      : plan.op === "pull"
        ? "sync.ask.pull"
        : plan.upstream
          ? "sync.ask.push"
          : "sync.ask.pushFirst";
  const go = () => {
    if (never) p.onNeverAsk();
    p.onGo();
  };
  return (
    <div className="scrim" onClick={p.onCancel}>
      <div
        className="dialog sync-confirm"
        role="dialog"
        aria-label={t(`sync.ask.title.${plan.op}`)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && p.onCancel()}
      >
        <div className="eyebrow">
          <Icon name={plan.op === "push" ? "arrowUp" : plan.op === "pull" ? "arrowDown" : "fetch"} size={12} />{" "}
          {t(`sync.ask.title.${plan.op}`)}
        </div>
        <p>
          <Rich k={body} vars={{ n, upstream: plan.upstream ?? "", branch: p.branch ?? "HEAD" }} />
        </p>
        {plan.op !== "fetch" && n === 0 && <p className="muted">{t(`sync.ask.none.${plan.op}`)}</p>}
        {n > 0 && (
          <ul className="sync-commits">
            {plan.commits.slice(0, LISTED).map((c) => (
              <li key={c.id}>
                <code>{c.id.slice(0, 7)}</code> {c.summary}
              </li>
            ))}
            {n > LISTED && <li className="muted">{t("sync.ask.more", { n: n - LISTED })}</li>}
          </ul>
        )}
        {plan.op === "pull" && plan.dirty && <p className="note warn">{t("sync.ask.dirty")}</p>}
        <label className="check">
          <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} />
          {t("sync.ask.never")}
        </label>
        <div className="dialog-actions">
          <button onClick={p.onCancel}>{t("common.cancel")}</button>
          <button className="primary" autoFocus disabled={p.busy} onClick={go}>
            {t(`sync.ask.go.${plan.op}`, { n })}
          </button>
        </div>
      </div>
    </div>
  );
}
