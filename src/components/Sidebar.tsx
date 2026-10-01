import { useMemo, useState } from "react";
import { stashTitle } from "../format";
import type { RefInfo, StashInfo } from "../types";
import { type Key, t } from "../i18n";

interface Props {
  refs: RefInfo[];
  headBranch: string | null;
  colorOf(target: string): string;
  focused: string | null;
  onFocus(ref: RefInfo | null): void;
  onCheckout(ref: RefInfo): void;
  onRefMenu(ref: RefInfo, x: number, y: number): void;
  stashes: StashInfo[];
  selectedStash: number | null;
  onStash(index: number): void;
  onAddRemote(): void;
  /** Open branch housekeeping (merged, gone, stale). */
  onCleanup(): void;
}

const GROUPS: { kind: RefInfo["kind"]; title: Key }[] = [
  { kind: "local", title: "side.local" },
  { kind: "remote", title: "side.remote" },
  { kind: "tag", title: "side.tag" },
];

export function Sidebar(props: Props) {
  const { refs, headBranch, colorOf, focused, onFocus, onCheckout, onRefMenu, stashes, selectedStash, onStash } = props;
  const [q, setQ] = useState("");
  const searching = q.trim() !== "";
  const filtered = useMemo(
    () =>
      refs.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [refs, q],
  );

  return (
    <nav className="sidebar">
      <input className="text search" placeholder={t("side.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      {GROUPS.map((g) => {
        const items = filtered.filter((r) => r.kind === g.kind);
        // The remote group stays (with its add button) even before any remote exists.
        if (!items.length && (g.kind !== "remote" || searching)) return null;
        return (
          <section key={g.kind}>
            <h3>
              {t(g.title)} <span className="muted">{items.length}</span>
              {g.kind === "remote" && (
                <button className="h3-add" title={t("side.addRemote")} onClick={props.onAddRemote}>
                  ＋
                </button>
              )}
              {g.kind === "local" && (
                <button
                  className="h3-add"
                  title={t("clean.open")}
                  aria-label={t("clean.open")}
                  onClick={props.onCleanup}
                >
                  ✧
                </button>
              )}
            </h3>
            <ul>
              {items.map((r) => {
                const key = `${r.kind}:${r.name}`;
                const isHead = r.kind === "local" && r.name === headBranch;
                return (
                  <li
                    key={key}
                    className={`${focused === key ? "focused" : ""} ${isHead ? "head" : ""}`}
                    title={r.kind === "tag" ? t("side.hint.tag") : t("side.hint.branch")}
                    onClick={() => onFocus(focused === key ? null : r)}
                    onDoubleClick={() => r.kind !== "tag" && onCheckout(r)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      onRefMenu(r, e.clientX, e.clientY);
                    }}
                  >
                    <span className="dot" style={{ background: colorOf(r.target), color: colorOf(r.target) }} />
                    <span className="name">{r.name}</span>
                    {isHead && <span className="head-pill">HEAD</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {stashes.length > 0 && (
        <section>
          <h3>
            {t("side.stash")} <span className="muted">{stashes.length}</span>
          </h3>
          <ul>
            {stashes.map((st) => (
              <li
                key={st.id}
                className={selectedStash === st.index ? "focused" : ""}
                title={st.message}
                onClick={() => onStash(st.index)}
              >
                <span className="diamond" />
                <span className="name">{stashTitle(st.message)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </nav>
  );
}
