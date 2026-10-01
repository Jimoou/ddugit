// Branch housekeeping: merged branches, ones whose remote branch was deleted,
// and ones nobody has touched in months, deleted together.

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { fmtTime } from "../format";
import { type Key, t } from "../i18n";
import type { BranchHealth, BranchReport } from "../types";

/** No commit for this long counts as stale. */
export const STALE_DAYS = 90;

type Group = "merged" | "gone" | "stale";
const GROUPS: { id: Group; title: Key; hint: Key }[] = [
  { id: "merged", title: "clean.merged", hint: "clean.merged.hint" },
  { id: "gone", title: "clean.gone", hint: "clean.gone.hint" },
  { id: "stale", title: "clean.stale", hint: "clean.stale.hint" },
];

/** Which group a branch falls in (first match), or null to leave it out. */
export function groupOf(b: BranchHealth, now: number): Group | null {
  if (b.merged) return "merged";
  if (b.gone) return "gone";
  if (now - b.time > STALE_DAYS * 86400) return "stale";
  return null;
}

export function CleanupSheet(p: {
  path: string;
  /** Changes whenever the repository does, so the report reloads. */
  version: unknown;
  busy: boolean;
  colorOf(id: string): string;
  onSelect(id: string): void;
  /** `unmerged`: some selected branches still have commits the base lacks. */
  onDelete(branches: BranchHealth[], unmerged: boolean): void;
  onClose(): void;
}) {
  const { path, version } = p;
  const [loaded, setLoaded] = useState<{ version: unknown; report: BranchReport; now: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  useEffect(() => {
    let live = true;
    api.branchReport(path).then(
      (report) => live && setLoaded({ version, report, now: Date.now() / 1000 }),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [path, version]);

  const report = loaded?.report ?? null;
  const grouped = useMemo(() => {
    const m = new Map<Group, BranchHealth[]>(GROUPS.map((g) => [g.id, []]));
    for (const b of loaded?.report.branches ?? []) {
      const g = groupOf(b, loaded!.now);
      if (g) m.get(g)!.push(b);
    }
    return m;
  }, [loaded]);
  // Merged branches are safe to delete, so they start selected.
  const selected = picked ?? new Set(grouped.get("merged")!.map((b) => b.name));
  const chosen = (report?.branches ?? []).filter((b) => selected.has(b.name));
  const toggle = (name: string) => {
    const next = new Set(selected);
    if (!next.delete(name)) next.add(name);
    setPicked(next);
  };
  const total = GROUPS.reduce((n, g) => n + grouped.get(g.id)!.length, 0);

  return (
    <section className="diff-sheet cleanup-sheet" style={{ height: "45vh" }}>
      <header>
        <div className="title">
          <span className="eyebrow">{t("clean.title")}</span>
          {report?.base && <span className="muted">{t("clean.base", { base: report.base })}</span>}
        </div>
        <button className="icon" onClick={p.onClose} title={t("common.closeEsc")} aria-label={t("common.close")}>
          ✕
        </button>
      </header>
      <div className="bp-body">
        {error && <p className="note warn pad">{error}</p>}
        {!report && !error && <p className="muted pad">{t("diff.loading")}</p>}
        {report && total === 0 && <p className="muted pad">{t("clean.none")}</p>}
        {GROUPS.map((g) => {
          const list = grouped.get(g.id)!;
          if (!list.length) return null;
          return (
            <div key={g.id} className="clean-group">
              <h4>
                {t(g.title)} <span className="muted">{list.length}</span>
                <span className="muted small"> · {t(g.hint, { days: STALE_DAYS })}</span>
              </h4>
              <ul>
                {list.map((b) => (
                  <li key={b.name}>
                    <label className="check">
                      <input
                        type="checkbox"
                        aria-label={b.name}
                        checked={selected.has(b.name)}
                        onChange={() => toggle(b.name)}
                      />
                      <span className="dot" style={{ background: p.colorOf(b.tip) }} />
                      <b>{b.name}</b>
                    </label>
                    <code className="link" onClick={() => p.onSelect(b.tip)}>
                      {b.tip.slice(0, 7)}
                    </code>
                    <span className="muted">{fmtTime(b.time, true)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <footer className="conflict-foot">
        <span className="muted">{t("clean.footer")}</span>
        <button
          className="primary danger"
          disabled={p.busy || chosen.length === 0}
          onClick={() =>
            p.onDelete(
              chosen,
              chosen.some((b) => !b.merged),
            )
          }
        >
          {t("clean.delete", { n: chosen.length })}
        </button>
      </footer>
    </section>
  );
}
