import { Icon } from "./Icon";
import type { IconName } from "../icons";
import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import type { Settings } from "../settings";
import { stashTitle } from "../format";
import type { RefInfo, StashInfo } from "../types";
import { type Key, t } from "../i18n";

interface Props {
  /** Folded to a rail of section icons. */
  collapsed: boolean;
  /** Sections folded shut. */
  closed: string[];
  onLayout(patch: Pick<Partial<Settings>, "sidebarCollapsed" | "closedSections">): void;
  /** The visible tab: only it takes the fold shortcut. */
  active: boolean;
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
  /** A new branch where HEAD is. */
  onNewBranch(): void;
  /** Open branch housekeeping (merged, gone, stale). */
  onCleanup(): void;
  /** Open the backport sheet (commits another branch has that this one doesn't). */
  onBackport(): void;
  /** Local branches checked out in another worktree → that worktree's folder. */
  elsewhere: Record<string, string>;
  /** More sections after the refs (pull requests, worktrees). */
  extra?: ReactNode;
}

const GROUPS: { kind: RefInfo["kind"]; title: Key; icon: IconName }[] = [
  { kind: "local", title: "side.local", icon: "branch" },
  { kind: "remote", title: "side.remote", icon: "cloud" },
  { kind: "tag", title: "side.tag", icon: "tag" },
];

const Sections = createContext<{ closed: string[]; toggle(id: string): void }>({ closed: [], toggle: () => {} });

/** A sidebar section whose title folds it open and shut; `actions` sit at the end of the title row. */
export function SideSection(p: {
  id: string;
  title: ReactNode;
  count: number;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { closed, toggle } = useContext(Sections);
  const shut = closed.includes(p.id);
  return (
    <section className={`${p.className ?? ""} ${shut ? "shut" : ""}`}>
      <h3>
        <button className="fold" aria-expanded={!shut} onClick={() => toggle(p.id)}>
          <Icon name="chevronRight" size={10} className="chev" />
          {p.title} <span className="muted">{p.count}</span>
        </button>
        {p.actions}
      </h3>
      {!shut && p.children}
    </section>
  );
}

export function Sidebar(props: Props) {
  const { refs, headBranch, colorOf, focused, onFocus, onCheckout, onRefMenu, stashes, selectedStash, onStash } = props;
  const { collapsed, closed, onLayout, active } = props;
  const [q, setQ] = useState("");
  const searching = q.trim() !== "";
  const filtered = useMemo(
    () =>
      refs.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [refs, q],
  );

  const localNames = useMemo(() => new Set(refs.filter((r) => r.kind === "local").map((r) => r.name)), [refs]);

  const fold = () => onLayout({ sidebarCollapsed: !collapsed });
  const toggle = (id: string) =>
    onLayout({ closedSections: closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id] });

  // ⌘/Ctrl+B folds the sidebar, like an editor's side bar.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        fold();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (collapsed) {
    // The rail: a button to unfold, and each section as an icon with its count that opens it.
    const open = (id: string) => onLayout({ sidebarCollapsed: false, closedSections: closed.filter((x) => x !== id) });
    const rail: { id: string; icon: IconName; title: string; n: number }[] = [
      ...GROUPS.map((g) => ({
        id: g.kind,
        icon: g.icon,
        title: t(g.title),
        n: refs.filter((r) => r.kind === g.kind).length,
      })),
      ...(stashes.length ? [{ id: "stash", icon: "stash" as const, title: t("side.stash"), n: stashes.length }] : []),
    ];
    return (
      <nav className="sidebar rail">
        <button className="rail-btn" onClick={fold} title={t("side.unfold")} aria-label={t("side.unfold")}>
          <Icon name="sidebar" />
        </button>
        {rail.map((x) => (
          <button
            key={x.id}
            className="rail-btn"
            onClick={() => open(x.id)}
            title={`${x.title} ${x.n}`}
            aria-label={x.title}
          >
            <Icon name={x.icon} />
            <span className="rail-n">{x.n}</span>
          </button>
        ))}
      </nav>
    );
  }

  return (
    <Sections.Provider value={{ closed: searching ? [] : closed, toggle }}>
      <nav className="sidebar">
        <div className="side-top">
          <input
            className="text search"
            placeholder={t("side.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="icon fold-side" onClick={fold} title={t("side.fold")} aria-label={t("side.fold")}>
            <Icon name="sidebar" />
          </button>
        </div>
        {GROUPS.map((g) => {
          const items = filtered.filter((r) => r.kind === g.kind);
          // Branches and remotes stay (with their add buttons) even when empty.
          if (!items.length && (g.kind === "tag" || searching)) return null;
          return (
            <SideSection
              key={g.kind}
              id={g.kind}
              title={t(g.title)}
              count={items.length}
              actions={
                <>
                  {g.kind === "remote" && (
                    <button
                      className="h3-add"
                      title={t("side.addRemote")}
                      aria-label={t("side.addRemote")}
                      onClick={props.onAddRemote}
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  )}
                  {g.kind === "local" && (
                    <button
                      className="h3-add"
                      title={t("branch.newMenu")}
                      aria-label={t("branch.newMenu")}
                      onClick={props.onNewBranch}
                    >
                      <Icon name="plus" size={12} />
                    </button>
                  )}
                  {g.kind === "local" && (
                    <button
                      className="h3-add"
                      title={t("bp.open")}
                      aria-label={t("bp.open")}
                      onClick={props.onBackport}
                    >
                      <Icon name="backport" size={12} />
                    </button>
                  )}
                  {g.kind === "local" && (
                    <button
                      className="h3-add"
                      title={t("clean.open")}
                      aria-label={t("clean.open")}
                      onClick={props.onCleanup}
                    >
                      <Icon name="sparkles" size={12} />
                    </button>
                  )}
                </>
              }
            >
              {g.kind === "local" && !items.length && <p className="side-note muted">{t("branch.local.none")}</p>}
              <ul>
                {items.map((r) => {
                  const key = `${r.kind}:${r.name}`;
                  // A remote branch with no local branch of its name yet.
                  const remoteOnly = r.kind === "remote" && !localNames.has(r.name.slice(r.name.indexOf("/") + 1));
                  const isHead = r.kind === "local" && r.name === headBranch;
                  return (
                    <li
                      key={key}
                      className={`${focused === key ? "focused" : ""} ${isHead ? "head" : ""}`}
                      style={{ ["--c" as string]: colorOf(r.target) }}
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
                      {remoteOnly && (
                        <button
                          className="icon to-local"
                          title={t("side.toLocal")}
                          aria-label={`${t("side.toLocal")}: ${r.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onCheckout(r);
                          }}
                        >
                          <Icon name="plus" size={11} />
                        </button>
                      )}
                      {r.kind === "local" && props.elsewhere[r.name] && (
                        <span className="elsewhere" title={t("wt.elsewhere", { path: props.elsewhere[r.name] })}>
                          <Icon name="folder" size={11} />
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </SideSection>
          );
        })}
        {props.extra}
        {stashes.length > 0 && (
          <SideSection id="stash" title={t("side.stash")} count={stashes.length}>
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
          </SideSection>
        )}
      </nav>
    </Sections.Provider>
  );
}
