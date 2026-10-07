import { ContextMenu } from "./ContextMenu";
import { Icon } from "./Icon";
import type { IconName } from "../icons";
import {
  createContext,
  memo,
  type ReactNode,
  type RefObject,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Settings } from "../settings";
import { stashTitle } from "../format";
import type { RefInfo, RemoteInfo, StashInfo } from "../types";
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
  /** Picked refs, as `kind:name`. */
  focused: string[];
  /** Click on a ref: adds it to the picked set, or takes it out if already picked. */
  onFocus(ref: RefInfo): void;
  onClearFocus(): void;
  onCheckout(ref: RefInfo): void;
  onRefMenu(ref: RefInfo, x: number, y: number): void;
  stashes: StashInfo[];
  selectedStash: number | null;
  onStash(index: number): void;
  onStashMenu(stash: StashInfo, x: number, y: number): void;
  onAddRemote(): void;
  /** Remotes, for a fold per remote when there are several. */
  remotes: RemoteInfo[];
  /** The ⋯ on a remote's fold: fetch it alone, copy its URL, remove it. */
  onRemoteMenu(name: string, x: number, y: number): void;
  /** A new branch where HEAD is. */
  onNewBranch(): void;
  /** Open branch housekeeping (merged, gone, stale). */
  onCleanup(): void;
  /** Open the backport sheet (commits another branch has that this one doesn't). */
  onBackport(): void;
  /** Open air-gapped transfer (bundles out and in). */
  onTransfer(): void;
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

const Sections = createContext<{
  closed: string[];
  toggle(id: string): void;
  /** Folded to the rail: sections show as icons that unfold the sidebar at them. */
  rail: ((id: string) => void) | null;
}>({ closed: [], toggle: () => {}, rail: null });

/**
 * A sidebar section whose title folds it open and shut; `actions` sit at the end of the title row.
 * On the folded rail a section with an `icon` is that icon and its count (one without is left out).
 */
export function SideSection(p: {
  id: string;
  title: ReactNode;
  count: number;
  icon?: IconName;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { closed, toggle, rail } = useContext(Sections);
  const shut = closed.includes(p.id);
  if (rail) {
    if (!p.icon) return null;
    const name = typeof p.title === "string" ? p.title : p.id;
    return (
      <button className="rail-btn" onClick={() => rail(p.id)} title={`${name} ${p.count}`} aria-label={name}>
        <Icon name={p.icon} />
        <span className="rail-n">{p.count}</span>
      </button>
    );
  }
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

interface RowHandlers {
  onFocus(ref: RefInfo): void;
  onCheckout(ref: RefInfo): void;
  onRefMenu(ref: RefInfo, x: number, y: number): void;
}

const RefRow = memo(function RefRow(p: {
  r: RefInfo;
  label: string;
  color: string;
  isFocused: boolean;
  isHead: boolean;
  remoteOnly: boolean;
  /** Checked out in another worktree at this folder. */
  elsewhere?: string;
  /** Latest handlers, read on events (they change on every render of the view). */
  on: RefObject<RowHandlers>;
}) {
  const { r, color, on } = p;
  return (
    <li
      className={`${p.isFocused ? "focused" : ""} ${p.isHead ? "head" : ""}`}
      aria-selected={p.isFocused}
      style={{ ["--c" as string]: color }}
      title={`${r.name}\n${r.kind === "tag" ? t("side.hint.tag") : t("side.hint.branch")}`}
      onClick={() => on.current.onFocus(r)}
      onDoubleClick={() => r.kind !== "tag" && on.current.onCheckout(r)}
      onContextMenu={(e) => {
        e.preventDefault();
        on.current.onRefMenu(r, e.clientX, e.clientY);
      }}
    >
      <span className="dot" style={{ background: color, color }} />
      <span className="name">{p.label}</span>
      {p.isHead && <span className="badge head">HEAD</span>}
      {p.remoteOnly && (
        <button
          className="icon to-local"
          title={t("side.toLocal")}
          aria-label={`${t("side.toLocal")}: ${r.name}`}
          onClick={(e) => {
            e.stopPropagation();
            on.current.onCheckout(r);
          }}
        >
          <Icon name="plus" size={11} />
        </button>
      )}
      {p.elsewhere && (
        <span className="elsewhere" title={t("wt.elsewhere", { path: p.elsewhere })}>
          <Icon name="folder" size={11} />
        </span>
      )}
    </li>
  );
});

export function Sidebar(props: Props) {
  const { refs, headBranch, colorOf, focused, onFocus, onCheckout, onRefMenu, stashes, selectedStash, onStash } = props;
  const { collapsed, closed, onLayout, active } = props;
  const [q, setQ] = useState("");
  // The rail has no search box: it counts everything.
  const shown = collapsed ? "" : q.trim().toLowerCase();
  const searching = shown !== "";
  const filtered = useMemo(
    () => refs.filter((r) => r.name.toLowerCase().includes(shown)).sort((a, b) => a.name.localeCompare(b.name)),
    [refs, shown],
  );

  const localNames = useMemo(() => new Set(refs.filter((r) => r.kind === "local").map((r) => r.name)), [refs]);

  /** `origin/feature/x` → `feature/x` (remote names may hold slashes too). */
  const branchOf = (name: string) => {
    const rm = props.remotes.find((x) => name.startsWith(`${x.name}/`))?.name ?? name.split("/")[0];
    return name.slice(rm.length + 1);
  };
  const remotes = props.remotes;

  // Rows only re-render when their own ref changes: a big repository lists
  // hundreds of refs, and the view re-renders on every selection.
  const latest = useRef({ onFocus, onCheckout, onRefMenu });
  useEffect(() => {
    latest.current = { onFocus, onCheckout, onRefMenu };
  });
  const row = (r: RefInfo, label: string) => {
    const key = `${r.kind}:${r.name}`;
    return (
      <RefRow
        key={key}
        r={r}
        label={label}
        color={colorOf(r.target)}
        isFocused={focused.includes(key)}
        isHead={r.kind === "local" && r.name === headBranch}
        // A remote branch with no local branch of its name yet.
        remoteOnly={r.kind === "remote" && !localNames.has(branchOf(r.name))}
        elsewhere={r.kind === "local" ? props.elsewhere[r.name] : undefined}
        on={latest}
      />
    );
  };

  /** Slide only when the user folds or unfolds, not when the view first appears. */
  const [slide, setSlide] = useState(false);
  const fold = () => {
    setSlide(true);
    onLayout({ sidebarCollapsed: !collapsed });
  };
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

  // The rail: a button to unfold, and each section as an icon with its count that opens it.
  const openAt = (id: string) => {
    setSlide(true);
    onLayout({ sidebarCollapsed: false, closedSections: closed.filter((x) => x !== id) });
  };
  const [more, setMore] = useState<{ x: number; y: number } | null>(null);

  return (
    <Sections.Provider value={{ closed: searching ? [] : closed, toggle, rail: collapsed ? openAt : null }}>
      <nav
        className={`sidebar ${collapsed ? "rail" : ""} ${slide ? "slide" : ""}`}
        onAnimationEnd={(e) => e.target === e.currentTarget && setSlide(false)}
      >
        {collapsed ? (
          <button className="rail-btn" onClick={fold} title={t("side.unfold")} aria-label={t("side.unfold")}>
            <Icon name="sidebar" />
          </button>
        ) : (
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
        )}
        {focused.length > 1 && !collapsed && (
          <div className="side-picked" role="status">
            <span>{t("side.picked", { n: focused.length })}</span>
            <button className="ghost" onClick={props.onClearFocus}>
              {t("side.unpick")}
            </button>
          </div>
        )}
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
              icon={g.icon}
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
                      className="h3-add h3-more"
                      title={t("side.branchMore")}
                      aria-label={t("side.branchMore")}
                      aria-haspopup="menu"
                      onClick={(e) => setMore({ x: e.clientX, y: e.clientY })}
                    >
                      <Icon name="more" size={14} />
                    </button>
                  )}
                </>
              }
            >
              {g.kind === "local" && !items.length && <p className="side-note muted">{t("branch.local.none")}</p>}
              {g.kind === "remote" && remotes.length > 0 ? (
                // Several remotes: a fold per remote, branches listed without its prefix.
                remotes.map((rm) => {
                  const mine = items.filter((r) => r.name.startsWith(`${rm.name}/`));
                  if (searching && !mine.length) return null;
                  return (
                    <SideSection
                      key={rm.name}
                      id={`remote:${rm.name}`}
                      className="sub remote-sub"
                      title={
                        <span className="remote-name" title={rm.url}>
                          <Icon name="cloud" size={12} />
                          <span className="nm">{rm.name}</span>
                          {!rm.push && (
                            <span className="fetch-only" title={t("side.fetchOnly.hint")}>
                              {t("side.fetchOnly")}
                            </span>
                          )}
                        </span>
                      }
                      count={mine.length}
                      actions={
                        <button
                          className="h3-add h3-more"
                          title={t("side.remoteMenu", { name: rm.name })}
                          aria-label={t("side.remoteMenu", { name: rm.name })}
                          onClick={(e) => props.onRemoteMenu(rm.name, e.clientX, e.clientY)}
                        >
                          <Icon name="more" size={14} />
                        </button>
                      }
                    >
                      {!mine.length && <p className="side-note muted">{t("side.remoteEmpty")}</p>}
                      <ul>{mine.map((r) => row(r, r.name.slice(rm.name.length + 1)))}</ul>
                    </SideSection>
                  );
                })
              ) : (
                <ul>{items.map((r) => row(r, r.name))}</ul>
              )}
            </SideSection>
          );
        })}
        {props.extra}
        {stashes.length > 0 && (
          <SideSection id="stash" title={t("side.stash")} count={stashes.length} icon="stash">
            <ul>
              {stashes.map((st) => (
                <li
                  key={st.id}
                  className={selectedStash === st.index ? "focused" : ""}
                  title={st.message}
                  onClick={() => onStash(st.index)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    props.onStashMenu(st, e.clientX, e.clientY);
                  }}
                >
                  <span className="diamond" />
                  <span className="name">{stashTitle(st.message)}</span>
                </li>
              ))}
            </ul>
          </SideSection>
        )}
      </nav>
      {more && (
        <ContextMenu
          x={more.x}
          y={more.y}
          onClose={() => setMore(null)}
          items={[
            { label: t("side.more.backport"), icon: "backport", onSelect: props.onBackport },
            { label: t("side.more.transfer"), icon: "bundle", onSelect: props.onTransfer },
            { label: t("side.more.cleanup"), icon: "sparkles", onSelect: props.onCleanup },
          ]}
        />
      )}
    </Sections.Provider>
  );
}
