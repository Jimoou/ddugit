// The galaxy dashboard on the new-tab screen: every recent repository with
// what it needs (stopped work, changes, commits to pull or push) read at a
// glance, gathered in the user's groups. Two views: the star chart (a
// constellation per group, components/StarChart.tsx) with a list beside it,
// or the cards in one band per group. A group filter and the batch work
// (fetch, pull, branch switch, open all) sit over both.

import { useCallback, useEffect, useState } from "react";
import { api, DEMO_PATH } from "../api";
import { fmtAgo } from "../format";
import { chart, fetchable, pullable, signals, switchable, tally, tone } from "../galaxy";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { bands, nextHue, parseStringList, type RepoGroup, suggestGroup } from "../groups";
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
import { StarChart } from "./StarChart";
import { readStored, writeStored } from "../storage";

/** Grouping suggestions the user said no to. */
const HINTS = "ddugit.groupHints";
/** The view last chosen: the star chart or the cards. */
const VIEW = "ddugit.galaxyView";
type View = "chart" | "list";
/** Which repositories show: all, one group's, or the ungrouped (`NONE`). */
const ALL = "";
const NONE = "\u0000none";

/** Drag data type: the paths of the cards being moved. */
const DRAG = "application/x-ddugit-repos";

/** Repositories worked on side by side in a batch (fetch, pull, branch switch). */
const LANES = 3;

/** One repository's part in a batch, shown on its card. */
type Job = {
  kind: "fetch" | "pull" | "switch";
  status: "run" | "ok" | "auth" | "diverged" | "failed";
  output?: string;
};
const RUNNING = { fetch: "galaxy.fetching", pull: "galaxy.pulling", switch: "galaxy.switching" } as const;

interface Props {
  recent: Recent;
  /** Ask before "fetch all" (the fetch confirmation setting). */
  confirmFetch: boolean;
  onOpen(path: string): void;
  /** Open several repositories as tabs (a group's "open all"). */
  onOpenMany(paths: string[]): void;
  toast(kind: "ok" | "err", text: string): void;
  /** Getting another repository in: open a folder, clone, create. */
  connect: { onOpen(): void; onClone(): void; onInit(): void };
  /** Open the demo repository's tour. */
  onDemo(): void;
}

export function Galaxy({ recent, confirmFetch, onOpen, onOpenMany, toast, connect, onDemo }: Props) {
  const paths = recent.list.map((r) => r.path).filter((p) => p !== DEMO_PATH);
  // Free reads the first few (starred first, then most recent); Pro reads them all.
  const pro = proOpen(usePro());
  const lockedPaths = pro ? [] : paths.slice(FREE_DASHBOARD);
  const key = paths.filter((p) => !lockedPaths.includes(p)).join("\n");
  // `at`: when they were read (Unix seconds), the chart's "now".
  const [loaded, setLoaded] = useState<{ key: string; byPath: Map<string, RepoGlance>; at: number } | null>(null);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; title?: string; items: MenuItem[] } | null>(null);
  const [nameReq, setNameReq] = useState<NameRequest | null>(null);
  /** Cards picked with ⌘/Ctrl or Shift + click, to group or move together. */
  const [picked, setPicked] = useState<string[]>([]);
  /** The band a card is being dragged over (group id, "" for ungrouped). */
  const [dropOn, setDropOn] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => parseStringList(readStored(HINTS)));
  const [view, setView] = useState<View>(() => (readStored(VIEW) === "list" ? "list" : "chart"));
  const [filter, setFilter] = useState(ALL);
  /** The repository under the pointer, lit in both the chart and the list. */
  const [hovered, setHovered] = useState<string | null>(null);
  const byPath = loaded && loaded.key === key ? loaded.byPath : null;

  // Read every world now, and again whenever the window comes back to the front.
  useEffect(() => {
    let live = true;
    const list = key ? key.split("\n") : [];
    const load = () =>
      void api
        .glance(list)
        .then((l) => live && setLoaded({ key, byPath: new Map(l.map((g) => [g.path, g])), at: Date.now() / 1000 }))
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

  /** Run `work` over `targets`, a few at a time, showing each card's progress; how many went well. */
  const runAll = async (kind: Job["kind"], targets: string[], work: (path: string) => Promise<Omit<Job, "kind">>) => {
    const queue = [...targets];
    let ok = 0;
    const lane = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const path = p;
        setJobs((j) => ({ ...j, [path]: { kind, status: "run" } }));
        let done: Omit<Job, "kind">;
        try {
          done = await work(path);
        } catch (e) {
          done = { status: "failed", output: String(e) };
        }
        if (done.status === "ok") ok++;
        setJobs((j) => ({ ...j, [path]: { kind, ...done } }));
        await reread(path).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: LANES }, lane));
    return ok;
  };

  const fetchPaths = async (targets: string[]) => {
    setConfirm(null);
    const ok = await runAll("fetch", targets, async (path) => {
      const r = await api.remote(path, "fetch");
      return { status: r.status === "ok" ? "ok" : r.status === "auth" ? "auth" : "failed", output: r.output };
    });
    const failed = targets.length - ok;
    if (failed) toast("err", t("galaxy.fetchedSome", { ok, failed }));
    else toast("ok", t("galaxy.fetched", { n: ok }));
  };

  /** Fast-forward each to its upstream (Pro); a diverged one is left alone and marked. */
  const pullPaths = async (targets: string[]) => {
    if (!pro) return offerPro("batch");
    const ok = await runAll("pull", targets, async (path) => {
      const r = await api.remote(path, "pull");
      const status = r.status === "ok" || r.status === "auth" || r.status === "diverged" ? r.status : "failed";
      return { status, output: r.output };
    });
    const failed = targets.length - ok;
    if (failed) toast("err", t("galaxy.pulledSome", { ok, failed }));
    else toast("ok", t("galaxy.pulled", { n: ok }));
  };

  /** Ask for a branch, then get every one of `targets` onto it (Pro). */
  const askSwitch = (targets: string[]) => {
    if (!pro) return offerPro("batch");
    setNameReq({
      title: t("galaxy.switch.title", { n: targets.length }),
      hint: t("galaxy.switch.hint"),
      placeholder: "release/2.1",
      confirmLabel: t("galaxy.switch.go"),
      onSubmit: (branch) => {
        setNameReq(null);
        void (async () => {
          const ok = await runAll("switch", targets, async (path) => {
            const r = await api.batchSwitch(path, branch);
            return { status: r.result.status === "ok" ? "ok" : "failed", output: r.result.output };
          });
          const failed = targets.length - ok;
          if (failed) toast("err", t("galaxy.switchedSome", { ok, failed, branch }));
          else toast("ok", t("galaxy.switched", { n: ok, branch }));
        })();
      },
    });
  };

  /** Pull / branch buttons for a set of repositories (a group, or the picked cards). */
  const batchButtons = (ps: string[]) => {
    const list = glancesOf(ps);
    // On Free they stay clickable, to say what they are.
    const off = (targets: string[]) => pro && (running || !targets.length);
    return (
      <>
        <button disabled={off(pullable(list))} onClick={() => void pullPaths(pullable(list))}>
          <Icon name="arrowDown" size={12} /> {t("galaxy.pull")} {!pro && <ProBadge />}
        </button>
        <button disabled={off(switchable(list))} onClick={() => askSwitch(switchable(list))}>
          <Icon name="branch" size={12} /> {t("galaxy.switch")} {!pro && <ProBadge />}
        </button>
      </>
    );
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
  const running = Object.values(jobs).some((j) => j.status === "run");

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

  /** A repository's part in the batch running or just run: how it went. */
  const jobMark = (path: string) => {
    const f = jobs[path];
    if (!f) return null;
    return (
      <span className={`world-fetch ${f.status}`} title={f.output}>
        {f.status === "run" ? (
          t(RUNNING[f.kind])
        ) : f.status === "ok" ? (
          <Icon name="check" size={12} />
        ) : f.status === "auth" ? (
          t("galaxy.fetchAuth")
        ) : f.status === "diverged" ? (
          t("galaxy.diverged")
        ) : (
          t(f.kind === "fetch" ? "galaxy.fetchFailed" : "galaxy.failed")
        )}
      </span>
    );
  };

  /** A click on a repository: open it, or with ⌘/Ctrl or Shift (or while some are picked) pick it. */
  const pickOrOpen = (path: string, e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || picked.length) {
      setPicked((ps) => (ps.includes(path) ? ps.filter((x) => x !== path) : [...ps, path]));
      return;
    }
    onOpen(path);
  };

  /** Drag props for a repository (a picked one carries all the picked). */
  const dragOf = (path: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      const moving = picked.includes(path) ? picked : [path];
      e.dataTransfer.setData(DRAG, JSON.stringify(moving));
      e.dataTransfer.effectAllowed = "move";
    },
    onDragEnd: () => setDropOn(null),
  });

  /** A repository's menu: star, move between groups, forget. */
  const repoMenu = (path: string): MenuItem[] => {
    const starred = recent.list.find((r) => r.path === path)?.starred ?? false;
    return [
      {
        label: starred ? t("connect.unstar") : t("connect.star"),
        icon: "star",
        onSelect: () => recent.star(path),
      },
      "separator",
      ...moveMenu(path),
      "separator",
      { label: t("connect.forget"), icon: "close", danger: true, onSelect: () => recent.forget(path) },
    ];
  };
  const openRepoMenu = (path: string, e: React.MouseEvent) =>
    setMenu({ x: e.clientX, y: e.clientY, title: repoName(path), items: repoMenu(path) });

  /** A group's menu in the chart's list: its batch work, then the group itself. */
  const groupActions = (g: RepoGroup, ps: string[]): MenuItem[] => {
    const list = glancesOf(ps);
    const mine = fetchable(list);
    const pro_ = pro ? undefined : "PRO";
    return [
      { label: "Fetch", icon: "fetch", disabled: running || !mine.length, onSelect: () => askFetch(mine) },
      {
        label: t("galaxy.pull"),
        icon: "arrowDown",
        hint: pro_,
        disabled: pro && (running || !pullable(list).length),
        onSelect: () => void pullPaths(pullable(list)),
      },
      {
        label: t("galaxy.switch"),
        icon: "branch",
        hint: pro_,
        disabled: pro && (running || !switchable(list).length),
        onSelect: () => askSwitch(switchable(list)),
      },
      { label: t("group.openAll"), disabled: !ps.length, onSelect: () => onOpenMany(ps) },
      "separator",
      ...groupMenu(g),
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
    const starred = recent.list.find((r) => r.path === path)?.starred ?? false;
    const lit = g ? signals(g) : [];
    return (
      <li
        key={path}
        className={`world ${g?.error ? "missing" : ""} ${picked.includes(path) ? "picked" : ""}`}
        {...dragOf(path)}
      >
        <button
          className="world-open"
          title={g?.error ?? path}
          aria-pressed={picked.includes(path)}
          onClick={(e) => pickOrOpen(path, e)}
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
        {jobMark(path)}
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
    writeStored(HINTS, JSON.stringify(next));
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
      const paths = parseStringList(e.dataTransfer.getData(DRAG));
      if (paths.length) moveTo(paths, id);
    },
  });

  const laid = bands(
    recent.groups,
    recent.list.filter((r) => r.path !== DEMO_PATH),
  );
  const grouped = recent.groups.length > 0;
  // A filter on a group that has since gone shows everything.
  const shown = filter === NONE || recent.groups.some((g) => g.id === filter) ? filter : ALL;
  const visible = laid.filter(({ group }) => (shown === ALL ? true : shown === NONE ? !group : group?.id === shown));
  const visiblePaths = visible.flatMap((b) => b.repos.map((r) => r.path));
  const visibleGlances = glancesOf(visiblePaths);
  const fetchTargets = fetchable(visibleGlances);
  const pullTargets = pullable(visibleGlances.filter((g) => g.behind > 0));
  const loose = laid.find((b) => !b.group)?.repos.length ?? 0;
  const pickView = (v: View) => {
    setView(v);
    writeStored(VIEW, v);
  };
  const timeOf = (path: string) => byPath?.get(path)?.last?.time ?? null;
  /** Most recent work first; the unread and the locked last. */
  const byActivity = (ps: string[]) => [...ps].sort((a, b) => (timeOf(b) ?? -Infinity) - (timeOf(a) ?? -Infinity));

  /** A repository in the list beside the chart: its state's dot, name, branch and age, what it needs. */
  const row = (path: string) => {
    const name = repoName(path);
    if (lockedPaths.includes(path))
      return (
        <li key={path} className="orbit-row locked">
          <button className="orbit-open" title={path} onClick={() => onOpen(path)}>
            <i className="tone-dot" aria-hidden />
            <span className="orbit-text">
              <span className="orbit-name">{name}</span>
              <span className="orbit-sub">{path}</span>
            </span>
          </button>
          <button className="orbit-pro" title={t("pro.dashboardMore")} onClick={() => offerPro("dashboard")}>
            <ProBadge />
          </button>
        </li>
      );
    const g = byPath?.get(path);
    const starred = recent.list.find((r) => r.path === path)?.starred ?? false;
    const lit = g && !g.error ? signals(g).slice(0, 2) : [];
    return (
      <li
        key={path}
        className={`orbit-row tone-${tone(g)} ${hovered === path ? "hot" : ""} ${picked.includes(path) ? "picked" : ""}`}
        {...dragOf(path)}
        onMouseEnter={() => setHovered(path)}
        onMouseLeave={() => setHovered(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          openRepoMenu(path, e);
        }}
      >
        <button
          className="orbit-open"
          title={g?.error ?? path}
          aria-pressed={picked.includes(path)}
          onClick={(e) => pickOrOpen(path, e)}
        >
          <i className="tone-dot" aria-hidden />
          <span className="orbit-text">
            <span className="orbit-name">
              {name}
              {starred && <Icon name="star" size={10} filled className="orbit-star" />}
            </span>
            <span className="orbit-sub">
              {!g
                ? "…"
                : g.error
                  ? t("galaxy.sig.missing")
                  : `${g.branch ?? t("galaxy.detached")}${g.last ? ` · ${fmtAgo(g.last.time)}` : ""}`}
            </span>
          </span>
          {jobMark(path) ?? (
            <span className="orbit-sigs">
              {lit.map((l) => (
                <span key={l.signal} className={`sig-${l.signal}`}>
                  {t(`galaxy.sig.${l.signal}`, { n: l.n })}
                </span>
              ))}
            </span>
          )}
        </button>
        <button
          className="icon more"
          aria-label={t("group.menu", { name })}
          title={t("group.menu", { name })}
          onClick={(e) => openRepoMenu(path, e)}
        >
          <Icon name="more" />
        </button>
      </li>
    );
  };

  /** A group's cards (the list view). */
  const band = ({ group, repos }: (typeof laid)[number]) => {
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
              {batchButtons(ps)}
              <button disabled={!ps.length} onClick={() => onOpenMany(ps)}>
                {t("group.openAll")}
              </button>
              <button
                className="icon"
                title={t("group.menu", { name: group.name })}
                aria-label={t("group.menu", { name: group.name })}
                onClick={(e) => setMenu({ x: e.clientX, y: e.clientY, title: group.name, items: groupMenu(group) })}
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
  };

  /** A group's part of the list beside the chart. */
  const orbit = ({ group, repos }: (typeof laid)[number]) => {
    if (!group && !repos.length) return null;
    const ps = byActivity(repos.map((r) => r.path));
    return (
      <section
        key={group?.id ?? "ungrouped"}
        className={`orbit ${dropOn === (group?.id ?? "") ? "drop" : ""}`}
        {...dropZone(group?.id ?? null)}
        style={group ? { ["--h" as string]: group.hue } : undefined}
        aria-label={group?.name ?? t("group.none")}
      >
        {grouped && (
          <header className="orbit-head">
            <button
              className="fold"
              aria-expanded={!group?.collapsed}
              disabled={!group}
              onClick={() => group && recent.editGroup(group.id, { collapsed: !group.collapsed })}
            >
              {group && <span className="band-star" aria-hidden />}
              {group?.name ?? t("group.none")} <span className="muted">{ps.length}</span>
              {group && <Icon name="chevronRight" size={9} className="chev" />}
            </button>
            {group && (
              <button
                className="icon more"
                title={t("group.menu", { name: group.name })}
                aria-label={t("group.menu", { name: group.name })}
                onClick={(e) =>
                  setMenu({ x: e.clientX, y: e.clientY, title: group.name, items: groupActions(group, ps) })
                }
              >
                <Icon name="more" size={13} />
              </button>
            )}
          </header>
        )}
        {!group?.collapsed &&
          (ps.length ? <ul>{ps.map(row)}</ul> : <p className="muted small band-empty">{t("group.empty")}</p>)}
      </section>
    );
  };

  const seg = (on: boolean) => (on ? "on" : "");
  return (
    <section className="galaxy" aria-label={t("galaxy.label")}>
      <header className="galaxy-head">
        <div className="seg" role="group" aria-label={t("galaxy.filter")}>
          <button className={seg(shown === ALL)} aria-pressed={shown === ALL} onClick={() => setFilter(ALL)}>
            {t("galaxy.all")} <span className="n">{paths.length}</span>
          </button>
          {recent.groups.map((g) => {
            const n = laid.find((b) => b.group?.id === g.id)?.repos.length ?? 0;
            return (
              <button
                key={g.id}
                className={seg(shown === g.id)}
                aria-pressed={shown === g.id}
                onClick={() => setFilter(g.id)}
              >
                {g.name} <span className="n">{n}</span>
              </button>
            );
          })}
          {grouped && loose > 0 && (
            <button className={seg(shown === NONE)} aria-pressed={shown === NONE} onClick={() => setFilter(NONE)}>
              {t("group.none")} <span className="n">{loose}</span>
            </button>
          )}
          <button className="seg-add" onClick={() => askName(null, (name) => recent.addGroup(name))}>
            <Icon name="plus" size={11} /> {t("group.new.button")}
          </button>
        </div>
        <span className="galaxy-head-gap" />
        <div className="seg" role="group" aria-label={t("galaxy.view")}>
          {(["chart", "list"] as const).map((v) => (
            <button key={v} className={seg(view === v)} aria-pressed={view === v} onClick={() => pickView(v)}>
              {t(`galaxy.view.${v}`)}
            </button>
          ))}
        </div>
        <button disabled={running || fetchTargets.length === 0} onClick={() => askFetch(fetchTargets)}>
          <Icon name="fetch" size={13} /> {running ? t("galaxy.fetching") : t("galaxy.fetchAll")}
        </button>
        <button
          className="primary"
          title={t("galaxy.pullBehind", { n: pullTargets.length })}
          disabled={pro && (running || pullTargets.length === 0)}
          onClick={() => void pullPaths(pullTargets)}
        >
          <Icon name="arrowDown" size={13} /> {t("galaxy.pull")} <span className="n">{pullTargets.length}</span>
          {!pro && <ProBadge />}
        </button>
        <button
          className="ghost"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({
              x: r.left,
              y: r.bottom + 4,
              items: [
                { label: t("connect.open"), icon: "folder", onSelect: connect.onOpen },
                { label: t("connect.clone"), icon: "clone", onSelect: connect.onClone },
                { label: t("connect.init"), icon: "sparkle", onSelect: connect.onInit },
                "separator",
                { label: t("app.demo"), icon: "sparkle", onSelect: onDemo },
              ],
            });
          }}
        >
          <Icon name="plus" size={13} /> {t("galaxy.add")}
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
          <button
            disabled={running || !fetchable(glancesOf(picked)).length}
            onClick={() => askFetch(fetchable(glancesOf(picked)))}
          >
            <Icon name="fetch" size={12} /> Fetch
          </button>
          {batchButtons(picked)}
          <span className="pick-sep" aria-hidden />
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
      {view === "chart" ? (
        <div className="galaxy-sky" onKeyDown={(e) => e.key === "Escape" && setPicked([])}>
          <StarChart
            constellations={chart(
              visible.map((b) => ({ id: b.group?.id ?? null, paths: b.repos.map((r) => r.path) })),
              timeOf,
              loaded?.at ?? 0,
            )}
            groupName={(id) => recent.groups.find((g) => g.id === id)?.name ?? ""}
            glanceOf={(path) => byPath?.get(path)}
            locked={new Set(lockedPaths)}
            hovered={hovered}
            picked={picked}
            onHover={setHovered}
            onStar={(path, e) => (lockedPaths.includes(path) ? onOpen(path) : pickOrOpen(path, e))}
            onMenu={(path, e) => !lockedPaths.includes(path) && openRepoMenu(path, e)}
          />
          <aside className="galaxy-list" aria-label={t("galaxy.repos")}>
            <div className="galaxy-list-head">
              <b>
                {t("galaxy.repos")} <span className="muted">{visiblePaths.length}</span>
              </b>
              <span className="muted">{t("galaxy.byActivity")}</span>
            </div>
            <div className="galaxy-list-body">{visible.map(orbit)}</div>
          </aside>
        </div>
      ) : (
        <div className="galaxy-body" onKeyDown={(e) => e.key === "Escape" && setPicked([])}>
          {visible.map(band)}
        </div>
      )}
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
