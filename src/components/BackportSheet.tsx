import { Icon } from "./Icon";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { fmtTime } from "../format";
import type { BackportItem, BackportState, BackportTally } from "../types";
import { type Key, t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { offerPro, proOpen, usePro } from "../pro";
import { ProBadge } from "./ProOffer";
import { Segmented } from "./Segmented";
import { useDialog } from "./useDialog";

interface Props {
  path: string;
  /** Local and remote branch names to compare. */
  branches: string[];
  /** Branches listed in the per-target overview (local ones: each customer's line). */
  targets: string[];
  source: string;
  target: string;
  /** With fewer than two remotes, explain how to add the other repository. */
  remoteCount: number;
  onAddRemote(): void;
  /** Changes whenever the repository does, so the list reloads. */
  version: unknown;
  busy: boolean;
  onPair(source: string, target: string): void;
  onSelect(id: string): void;
  /** Ids oldest first, the order they must be applied in. */
  onApply(ids: string[]): void;
  onExport(ids: string[]): void;
  onClose(): void;
}

const GUIDE_KEY = "ddugit.backportGuide";
const guideOpen = () => {
  try {
    return localStorage.getItem(GUIDE_KEY) === "open";
  } catch {
    return false;
  }
};

/** How backporting goes: a one-line "how to" that unfolds (and stays the way the user left it). */
function BackportGuide({ source, target }: { source: string; target: string }) {
  const [open, setOpen] = useState(guideOpen);
  const fold = (o: boolean) => {
    setOpen(o);
    try {
      localStorage.setItem(GUIDE_KEY, o ? "open" : "closed");
    } catch {
      // storage unavailable: remembered for this session only
    }
  };
  return (
    <div className={`bp-guide ${open ? "open" : ""}`}>
      <button className="bp-guide-head" aria-expanded={open} onClick={() => fold(!open)}>
        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} /> {t("bp.guide.title")}
      </button>
      {open && (
        <ol>
          {(["bp.guide.1", "bp.guide.2", "bp.guide.3"] as const).map((k) => (
            <li key={k}>
              <Rich k={k} vars={{ source, target }} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

const STATE: Record<BackportState["kind"], Key> = {
  missing: "bp.state.missing",
  applied: "bp.state.applied",
  picked: "bp.state.picked",
  ignored: "bp.state.ignored",
};

/**
 * Commits of `source` the `target` doesn't have yet (e.g. the original repo's
 * fixes vs a customer fork), with ports recognised by patch or `-x` trailer.
 */
export function BackportSheet(p: Props) {
  const { path, source, target, version } = p;
  const [items, setItems] = useState<BackportItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"missing" | "all" | "targets">("missing");
  const all = view === "all";
  const [reload, setReload] = useState(0);
  // Overview rows belong to one source (and repo state); others are stale.
  const tallyKey = `${source}\n${p.targets.join("\n")}`;
  const [tallies, setTallies] = useState<{ key: string; version: unknown; rows: BackportTally[] } | null>(null);
  const rows = tallies && tallies.key === tallyKey && tallies.version === version ? tallies.rows : null;

  useEffect(() => {
    if (view !== "targets") return;
    let live = true;
    api.backportSummary(path, source, p.targets).then(
      (r) => live && setTallies({ key: tallyKey, version, rows: r }),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [view, path, source, p.targets, tallyKey, version]);

  useEffect(() => {
    let live = true;
    api.backportCompare(path, source, target).then(
      (list) => {
        if (!live) return;
        setItems(list);
        setError(null);
        // Keep only selections that are still missing.
        setPicked((s) => new Set(list.filter((i) => s.has(i.id) && i.state.kind === "missing").map((i) => i.id)));
      },
      (e) => {
        if (!live) return;
        setItems([]);
        setError(String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [path, source, target, version, reload]);

  const count = useMemo(() => {
    const c = { missing: 0, applied: 0, ignored: 0 };
    for (const i of items ?? []) c[i.state.kind === "picked" ? "applied" : i.state.kind]++;
    return c;
  }, [items]);
  const shown = (items ?? []).filter((i) => all || i.state.kind === "missing" || i.state.kind === "ignored");
  const missing = shown.filter((i) => i.state.kind === "missing");
  // Oldest first for cherry-pick / format-patch.
  const chosen = () =>
    (items ?? [])
      .filter((i) => picked.has(i.id))
      .reverse()
      .map((i) => i.id);
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  // Comparing is Free; acting on it (cherry-pick, export, ignore) is Pro.
  const pro = proOpen(usePro());
  const ignore = (id: string, on: boolean) =>
    !pro
      ? offerPro("backport")
      : api.backportIgnore(path, target, id, on).then(
          () => setReload((r) => r + 1),
          (e) => setError(String(e)),
        );

  const select = (name: string, value: string, onChange: (v: string) => void) => (
    <select aria-label={name} value={value} onChange={(e) => onChange(e.target.value)}>
      {(p.branches.includes(value) ? p.branches : [value, ...p.branches]).map((b) => (
        <option key={b}>{b}</option>
      ))}
    </select>
  );

  const sheet = useDialog(p.onClose, false);
  return (
    <section className="diff-sheet backport-sheet" style={{ height: "50vh" }} {...sheet}>
      <header>
        <div className="title">
          <h2 className="dialog-title">{t("bp.title")}</h2>
          {select(t("bp.source"), source, (s) => p.onPair(s, target))}
          <span className="muted">→</span>
          {select(t("bp.target"), target, (tg) => p.onPair(source, tg))}
          {items && (
            <span className="muted">
              <Rich k="bp.counts" vars={count} bold="bp-missing" />
            </span>
          )}
        </div>
        <Segmented
          role="tablist"
          label={t("bp.title")}
          value={view}
          onChange={setView}
          options={[
            { value: "missing", label: t("bp.state.missing") },
            { value: "all", label: t("bp.tab.all") },
            { value: "targets", label: t("bp.tab.targets") },
          ]}
        />
        <button className="icon" onClick={p.onClose} title={t("common.close")}>
          <Icon name="close" />
        </button>
      </header>

      <div className="bp-body">
        <BackportGuide source={source} target={target} />
        {error && <p className="note warn">{error}</p>}
        {view === "targets" ? (
          <Overview
            source={source}
            current={target}
            rows={rows}
            onOpen={(tg) => {
              p.onPair(source, tg);
              setView("missing");
            }}
          />
        ) : (
          <>
            {!items && !error && <p className="muted pad">{t("bp.comparing")}</p>}
            {items && !error && shown.length === 0 && (
              <p className="muted pad">{t("bp.upToDate", { target, source })}</p>
            )}
            {shown.length > 0 && (
              <table className="bp-list">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label={t("bp.selectAll")}
                        disabled={missing.length === 0}
                        checked={missing.length > 0 && missing.every((i) => picked.has(i.id))}
                        onChange={(e) => setPicked(new Set(e.target.checked ? missing.map((i) => i.id) : []))}
                      />
                    </th>
                    <th>{t("bp.col.state")}</th>
                    <th>{t("bp.col.commit")}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id} className={`bp-${i.state.kind}`}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={t("bp.select", { summary: i.summary })}
                          disabled={i.state.kind !== "missing"}
                          checked={picked.has(i.id)}
                          onChange={() => toggle(i.id)}
                        />
                      </td>
                      <td>
                        <span
                          className={`chip bp-${i.state.kind}`}
                          title={
                            i.state.kind === "picked" ? t("bp.pickedFrom", { sha: i.state.by.slice(0, 7) }) : undefined
                          }
                        >
                          {t(STATE[i.state.kind])}
                        </span>
                      </td>
                      <td className="bp-commit" onClick={() => p.onSelect(i.id)} title={t("bp.showInGraph")}>
                        <code>{i.id.slice(0, 7)}</code> <span className="summary">{i.summary}</span>
                        <span className="muted">
                          {" "}
                          · {i.author} · {fmtTime(i.time, false)}
                        </span>
                      </td>
                      <td className="bp-actions">
                        {i.state.kind === "missing" && (
                          <button onClick={() => void ignore(i.id, true)}>{t("bp.ignore")}</button>
                        )}
                        {i.state.kind === "ignored" && (
                          <button onClick={() => void ignore(i.id, false)}>{t("bp.unignore")}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        {p.remoteCount < 2 && (
          <p className="note bp-hint">
            <Rich k="bp.remoteHint" /> <button onClick={p.onAddRemote}>{t("bp.addRemote")}</button>
          </p>
        )}
      </div>

      {view !== "targets" && (
        <footer className="conflict-foot">
          <span className="muted">
            {picked.size ? t("bp.picked", { n: picked.size }) : t("bp.ignoreHint", { target })}
          </span>
          <button
            disabled={p.busy || picked.size === 0}
            onClick={() => (pro ? p.onExport(chosen()) : offerPro("backport"))}
          >
            {t("bp.export")} {!pro && <ProBadge />}
          </button>
          <button
            className="primary"
            disabled={p.busy || picked.size === 0}
            onClick={() => (pro ? p.onApply(chosen()) : offerPro("backport"))}
          >
            {t("bp.apply", { target })} {!pro && <ProBadge />}
          </button>
        </footer>
      )}
    </section>
  );
}

/** One row per target branch: how much of `source` each still lacks. */
function Overview(props: {
  source: string;
  current: string;
  rows: BackportTally[] | null;
  onOpen(target: string): void;
}) {
  const { rows } = props;
  if (!rows) return <p className="muted pad">{t("bp.overview.loading")}</p>;
  if (rows.length === 0) return <p className="muted pad">{t("bp.overview.none")}</p>;
  const sorted = [...rows].sort((a, b) => b.missing - a.missing || a.target.localeCompare(b.target));
  return (
    <table className="bp-list bp-overview">
      <thead>
        <tr>
          <th>{t("bp.overview.target", { source: props.source })}</th>
          <th>{t("bp.state.missing")}</th>
          <th>{t("bp.state.applied")}</th>
          <th>{t("bp.state.ignored")}</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr
            key={r.target}
            className={r.target === props.current ? "on" : ""}
            onClick={() => props.onOpen(r.target)}
            title={t("bp.overview.open")}
          >
            <td className="bp-commit">{r.target}</td>
            <td>{r.missing > 0 ? <b className="bp-missing">{r.missing}</b> : <span className="muted">0</span>}</td>
            <td>{r.applied}</td>
            <td>{r.ignored}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
