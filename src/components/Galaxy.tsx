// The galaxy dashboard on the new-tab screen: every recent repository as a
// world, with what it needs (stopped work, changes, commits to pull or push)
// read at a glance, gathered in the user's groups (one band each, then the
// ungrouped), with "fetch" and "open all" per group and for the lot.

import { useCallback, useEffect, useState } from "react";
import { api, DEMO_PATH } from "../api";
import { fmtAgo } from "../format";
import { fetchable, signals, tally } from "../galaxy";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { bands, nextHue, type RepoGroup, suggestGroup } from "../groups";
import { FREE_DASHBOARD, offerPro, proOpen, usePro } from "../pro";
import { repoName } from "../recent";
import type { RepoGlance } from "../types";
import type { Recent } from "./Connect";
import { type Confirm, ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { NameDialog, type NameRequest } from "./NameDialog";
import { Icon } from "./Icon";
import { PlanetDot } from "./Planet";
import { ProBadge } from "./ProOffer";

/** Grouping suggestions the user said no to. */
const HINTS = "ddugit.groupHints";

/** Drag data type: the paths of the cards being moved. */
const DRAG = "application/x-ddugit-repos";

/** Fetches running side by side in "fetch all". */
const FETCH_LANES = 3;

type Fetched = { status: "run" | "ok" | "auth" | "failed"; output?: string };

interface Props {
  recent: Recent;
  /** Ask before "fetch all" (the fetch confirmation setting). */
  confirmFetch: boolean;
  onOpen(path: string): void;
  /** Open several repositories as tabs (a group's "open all"). */
  onOpenMany(paths: string[]): void;
  toast(kind: "ok" | "err", text: string): void;
}

export function Galaxy({ recent, confirmFetch, onOpen, onOpenMany, toast }: Props) {
  const paths = recent.list.map((r) => r.path).filter((p) => p !== DEMO_PATH);
  // Free reads the first few (starred first, then most recent); Pro reads them all.
  const pro = proOpen(usePro());
  const lockedPaths = pro ? [] : paths.slice(FREE_DASHBOARD);
  const key = paths.filter((p) => !lockedPaths.includes(p)).join("\n");
  const [loaded, setLoaded] = useState<{ key: string; byPath: Map<string, RepoGlance> } | null>(null);
  const [fetched, setFetched] = useState<Record<string, Fetched>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; title: string; items: MenuItem[] } | null>(null);
  const [nameReq, setNameReq] = useState<NameRequest | null>(null);
  /** Cards picked with ⌘/Ctrl or Shift + click, to group or move together. */
  const [picked, setPicked] = useState<string[]>([]);
  /** The band a card is being dragged over (group id, "" for ungrouped). */
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(HINTS) ?? "[]") as string[];
    } catch {
      return [];
    }
  });
  const byPath = loaded && loaded.key === key ? loaded.byPath : null;

  // Read every world now, and again whenever the window comes back to the front.
  useEffect(() => {
    let live = true;
    const list = key ? key.split("\n") : [];
    const load = () =>
      void api
        .glance(list)
        .then((l) => live && setLoaded({ key, byPath: new Map(l.map((g) => [g.path, g])) }))
        .catch(() => {});
    load();
    window.addEventListener("focus", load);
    return () => {
      live = false;
      window.removeEventListener("focus", load);
    };
  }, [key]);

  const reread = useCallback(async (path: string) => {
    const [g] = await api.glance([path]);
    if (g) setLoaded((l) => l && { ...l, byPath: new Map(l.byPath).set(path, g) });
  }, []);

  const glances = byPath ? paths.flatMap((p) => byPath.get(p) ?? []) : [];
  const glancesOf = (ps: string[]) => (byPath ? ps.flatMap((p) => byPath.get(p) ?? []) : []);

  const fetchPaths = async (targets: string[]) => {
    setConfirm(null);
    const queue = [...targets];
    let ok = 0;
    const lane = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const path = p;
        setFetched((f) => ({ ...f, [path]: { status: "run" } }));
        let done: Fetched;
        try {
          const r = await api.remote(path, "fetch");
          done = { status: r.status === "ok" ? "ok" : r.status === "auth" ? "auth" : "failed", output: r.output };
        } catch (e) {
          done = { status: "failed", output: String(e) };
        }
        if (done.status === "ok") ok++;
        setFetched((f) => ({ ...f, [path]: done }));
        await reread(path).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: FETCH_LANES }, lane));
    const failed = targets.length - ok;
    if (failed) toast("err", t("galaxy.fetchedSome", { ok, failed }));
    else toast("ok", t("galaxy.fetched", { n: ok }));
  };

  const askFetch = (targets: string[]) => {
    if (!confirmFetch) return void fetchPaths(targets);
    setConfirm({
      title: t("galaxy.confirm.title"),
      confirmLabel: t("galaxy.confirm.go", { n: targets.length }),
      body: (
        <p>
          <Rich k="galaxy.confirm.body" vars={{ n: targets.length }} />
        </p>
      ),
      onConfirm: () => void fetchPaths(targets),
    });
  };
  const running = Object.values(fetched).some((f) => f.status === "run");
  const everything = fetchable(glances);

  /** Ask for a group name (new, or renaming `group`). */
  const askName = (group: RepoGroup | null, then: (name: string) => void) =>
    setNameReq({
      title: group ? t("group.rename") : t("group.new"),
      placeholder: t("group.placeholder"),
      confirmLabel: group ? t("group.rename.go") : t("group.new.go"),
      initial: group?.name,
      free: true,
      onSubmit: (name) => {
        setNameReq(null);
        then(name);
      },
    });

  const groupMenu = (g: RepoGroup): MenuItem[] => [
    { label: t("group.rename"), icon: "edit", onSelect: () => askName(g, (name) => recent.editGroup(g.id, { name })) },
    { label: t("group.recolor"), onSelect: () => recent.editGroup(g.id, { hue: nextHue(g.hue) }) },
    { label: t("group.up"), icon: "chevronUp", onSelect: () => recent.moveGroup(g.id, -1) },
    { label: t("group.down"), icon: "chevronDown", onSelect: () => recent.moveGroup(g.id, 1) },
    "separator",
    { label: t("group.remove"), danger: true, onSelect: () => recent.removeGroup(g.id) },
  ];

  const moveMenu = (path: string): MenuItem[] => {
    const current = recent.list.find((r) => r.path === path)?.group;
    return [
      ...recent.groups
        .filter((g) => g.id !== current)
        .map((g) => ({ label: t("group.moveTo", { name: g.name }), onSelect: () => recent.setGroup([path], g.id) })),
      {
        label: t("group.newWith"),
        icon: "plus" as const,
        onSelect: () => askName(null, (n) => recent.addGroup(n, [path])),
      },
      ...(current
        ? ["separator" as const, { label: t("group.takeOut"), onSelect: () => recent.setGroup([path], null) }]
        : []),
    ];
  };

  /** A repository beyond Free's dashboard: its name, opening still works, the rest is Pro. */
  const lockedCard = (path: string) => (
    <li key={path} className="world locked">
      <button className="world-open" title={path} onClick={() => onOpen(path)}>
        <span className="world-name">
          <PlanetDot path={path} big /> <b>{repoName(path)}</b>
        </span>
        <span className="world-path">{path}</span>
      </button>
      <button className="world-unlock" onClick={() => offerPro("dashboard")}>
        {t("pro.dashboardMore")} <ProBadge />
      </button>
    </li>
  );

  const card = (path: string) => {
    if (lockedPaths.includes(path)) return lockedCard(path);
    const g = byPath?.get(path);
    const f = fetched[path];
    const starred = recent.list.find((r) => r.path === path)?.starred ?? false;
    const lit = g ? signals(g) : [];
    return (
      <li
        key={path}
        className={`world ${g?.error ? "missing" : ""} ${picked.includes(path) ? "picked" : ""}`}
        draggable
        onDragStart={(e) => {
          // Dragging a picked card moves all the picked ones.
          const moving = picked.includes(path) ? picked : [path];
          e.dataTransfer.setData(DRAG, JSON.stringify(moving));
          e.dataTransfer.effectAllowed = "move";
        }}
        onDragEnd={() => setDropOn(null)}
      >
        <button
          className="world-open"
          title={g?.error ?? path}
          aria-pressed={picked.includes(path)}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || picked.length) {
              setPicked((ps) => (ps.includes(path) ? ps.filter((x) => x !== path) : [...ps, path]));
              return;
            }
            onOpen(path);
          }}
        >
          <span className="world-name">
            <PlanetDot path={path} big /> <b>{repoName(path)}</b>
          </span>
          <span className="world-path">{path}</span>
          {g && !g.error && (
            <span className="world-branch">
              <Icon name="branch" size={11} /> {g.branch ?? t("galaxy.detached")}
              {g.upstream && <span className="muted"> → {g.upstream}</span>}
            </span>
          )}
          <span className="world-signals">
            {!g ? (
              <span className="muted">…</span>
            ) : lit.length === 0 ? (
              <span className="sig sig-quiet">{t("galaxy.quiet")}</span>
            ) : (
              lit.map((l) => (
                <span key={l.signal} className={`sig sig-${l.signal}`}>
                  {t(`galaxy.sig.${l.signal}`, { n: l.n })}
                </span>
              ))
            )}
          </span>
          {g && !g.error && (
            <span className="world-last">
              {g.last ? (
                <>
                  {g.last.summary} <span className="muted">· {fmtAgo(g.last.time)}</span>
                </>
              ) : (
                <span className="muted">{t("galaxy.noCommits")}</span>
              )}
            </span>
          )}
        </button>
        {f && (
          <span className={`world-fetch ${f.status}`} title={f.output}>
            {f.status === "run" ? (
              t("galaxy.fetching")
            ) : f.status === "ok" ? (
              <Icon name="check" size={12} />
            ) : (
              t(f.status === "auth" ? "galaxy.fetchAuth" : "galaxy.fetchFailed")
            )}
          </span>
        )}
        <span className="world-tools">
          <button
            className="icon more"
            aria-label={t("group.cardMenu")}
            title={t("group.cardMenu")}
            onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, title: repoName(path), items: moveMenu(path) })}
          >
            <Icon name="more" />
          </button>
          <button
            className={`icon star ${starred ? "on" : ""}`}
            aria-pressed={starred}
            aria-label={starred ? t("connect.unstar") : t("connect.star")}
            title={starred ? t("connect.unstar") : t("connect.star")}
            onClick={() => recent.star(path)}
          >
            <Icon name="star" filled={starred} />
          </button>
          <button
            className="icon"
            aria-label={t("connect.forget")}
            title={t("connect.forget")}
            onClick={() => recent.forget(path)}
          >
            <Icon name="close" />
          </button>
        </span>
      </li>
    );
  };

  const origins = new Map(glances.map((g) => [g.path, g.origin]));
  const hint = byPath
    ? suggestGroup(
        recent.list.filter((r) => r.path !== DEMO_PATH),
        origins,
        recent.groups,
        dismissed,
      )
    : null;
  const dismiss = (key: string) => {
    const next = [...dismissed, key];
    setDismissed(next);
    try {
      localStorage.setItem(HINTS, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  const moveTo = (paths: string[], id: string | null) => {
    recent.setGroup(paths, id);
    setPicked([]);
  };
  /** Drop target props for a band (`id` null: ungrouped). */
  const dropZone = (id: string | null) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG)) return;
      e.preventDefault();
      setDropOn(id ?? "");
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropOn(null);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDropOn(null);
      const paths = JSON.parse(e.dataTransfer.getData(DRAG) || "[]") as string[];
      if (paths.length) moveTo(paths, id);
    },
  });

  const laid = bands(
    recent.groups,
    recent.list.filter((r) => r.path !== DEMO_PATH),
  );
  const grouped = recent.groups.length > 0;

  return (
    <section className="galaxy" aria-label={t("galaxy.label")}>
      <header className="galaxy-head">
        <div className="eyebrow">{t("galaxy.title", { n: paths.length })}</div>
        <Tally list={glances} />
        <button onClick={() => askName(null, (name) => recent.addGroup(name))}>
          <Icon name="plus" size={13} /> {t("group.new.button")}
        </button>
        <button disabled={running || everything.length === 0} onClick={() => askFetch(everything)}>
          <Icon name="fetch" size={13} /> {running ? t("galaxy.fetching") : t("galaxy.fetchAll")}
        </button>
      </header>
      {hint && (
        <div className="group-hint" role="note">
          <Icon name="sparkle" size={12} />
          <span>
            <Rich k="group.hint" vars={{ name: hint.name, n: hint.paths.length }} />
          </span>
          <button onClick={() => recent.addGroup(hint.name, hint.paths)}>{t("group.hint.go")}</button>
          <button className="ghost" onClick={() => dismiss(hint.key)}>
            {t("group.hint.no")}
          </button>
        </div>
      )}
      {picked.length > 0 && (
        <div className="pick-bar" role="toolbar" aria-label={t("group.picked", { n: picked.length })}>
          <b>{t("group.picked", { n: picked.length })}</b>
          <button onClick={() => askName(null, (name) => (recent.addGroup(name, picked), setPicked([])))}>
            <Icon name="plus" size={12} /> {t("group.pickNew")}
          </button>
          {recent.groups.map((g) => (
            <button key={g.id} onClick={() => moveTo(picked, g.id)}>
              {t("group.moveTo", { name: g.name })}
            </button>
          ))}
          <button onClick={() => moveTo(picked, null)}>{t("group.takeOut")}</button>
          <button className="ghost" onClick={() => setPicked([])}>
            {t("group.unpick")}
          </button>
        </div>
      )}
      <div className="galaxy-body" onKeyDown={(e) => e.key === "Escape" && setPicked([])}>
        {laid.map(({ group, repos }) => {
          const ps = repos.map((r) => r.path);
          // Before any group exists there is one plain list, as before.
          if (!group && !grouped)
            return (
              <ul key="all" className="worlds">
                {ps.map(card)}
              </ul>
            );
          const mine = fetchable(glancesOf(ps));
          return (
            <section
              key={group?.id ?? "ungrouped"}
              className={`band ${group ? "" : "ungrouped"} ${dropOn === (group?.id ?? "") ? "drop" : ""}`}
              {...dropZone(group?.id ?? null)}
              style={group ? { ["--h" as string]: group.hue } : undefined}
              aria-label={group?.name ?? t("group.none")}
            >
              <header className="band-head">
                <button
                  className="fold"
                  aria-expanded={!group?.collapsed}
                  disabled={!group}
                  onClick={() => group && recent.editGroup(group.id, { collapsed: !group.collapsed })}
                >
                  {group && <Icon name="chevronRight" size={10} className="chev" />}
                  {group && <span className="band-star" aria-hidden />}
                  <b>{group?.name ?? t("group.none")}</b> <span className="muted">{ps.length}</span>
                </button>
                <Tally list={glancesOf(ps)} />
                {group && (
                  <>
                    <button disabled={running || !mine.length} onClick={() => askFetch(mine)}>
                      <Icon name="fetch" size={12} /> Fetch
                    </button>
                    <button disabled={!ps.length} onClick={() => onOpenMany(ps)}>
                      {t("group.openAll")}
                    </button>
                    <button
                      className="icon"
                      title={t("group.menu", { name: group.name })}
                      aria-label={t("group.menu", { name: group.name })}
                      onClick={(e) =>
                        setMenu({ x: e.clientX, y: e.clientY, title: group.name, items: groupMenu(group) })
                      }
                    >
                      <Icon name="more" size={13} />
                    </button>
                  </>
                )}
              </header>
              {!group?.collapsed &&
                (ps.length ? (
                  <ul className="worlds">{ps.map(card)}</ul>
                ) : (
                  <p className="muted small band-empty">{t(group ? "group.empty" : "group.noneEmpty")}</p>
                ))}
            </section>
          );
        })}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {nameReq && <NameDialog req={nameReq} busy={false} onCancel={() => setNameReq(null)} />}
      {confirm && <ConfirmDialog confirm={confirm} busy={false} onCancel={() => setConfirm(null)} />}
    </section>
  );
}

/** How many worlds give off each signal. */
function Tally({ list }: { list: RepoGlance[] }) {
  return (
    <div className="galaxy-tally">
      {tally(list).map((l) => (
        <span key={l.signal} className={`sig sig-${l.signal}`}>
          {t(`galaxy.tally.${l.signal}`, { n: l.n })}
        </span>
      ))}
    </div>
  );
}
