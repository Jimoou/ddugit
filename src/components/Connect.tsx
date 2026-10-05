// Ways into a repository: recent ones (with stars), open a folder, clone a
// URL, or start a new one. Used by the welcome screen and the top bar menu.

import { Icon } from "./Icon";
import { SshSetup } from "./SshSetup";
import { isSshUrl, toHttps, toSsh } from "../sshUrl";
import { PlanetDot } from "./Planet";
import { useCallback, useState } from "react";
import { ForgeRepoPicker, type Picked, ProtoSwitch, SourceTabs } from "./ForgeRepoPicker";
import { SOURCES, type Source } from "../forgeRepos";
import { api } from "../api";
import { t } from "../i18n";
import { openLink } from "../share";
import {
  forgetRecent,
  joinPath,
  nameFromUrl,
  parseRecent,
  type RecentRepo,
  repoName,
  sortRecent,
  toggleStar,
  touchRecent,
} from "../recent";
import type { OpResult, Progress } from "../types";
import {
  addGroup,
  assignGroup,
  bands,
  moveGroup,
  parseGroups,
  removeGroup,
  type RepoGroup,
  updateGroup,
} from "../groups";
import { Modal } from "./Modal";
import { useDialog } from "./useDialog";
import { readStored, writeStored } from "../storage";

const RECENT = "ddugit.recent";
const GROUPS = "ddugit.groups";
const CLONE_PARENT = "ddugit.cloneParent";
const CLONE_SOURCE = "ddugit.cloneSource";

/** Recent repositories and their groups, persisted; the callbacks are stable. */
export function useRecent() {
  const [list, setList] = useState(() => sortRecent(parseRecent(readStored(RECENT))));
  const [groups, setGroups] = useState(() => parseGroups(readStored(GROUPS)));
  const update = useCallback((f: (l: RecentRepo[]) => RecentRepo[]) => {
    setList((l) => {
      const next = sortRecent(f(l));
      writeStored(RECENT, JSON.stringify(next));
      return next;
    });
  }, []);
  const updateGroups = useCallback((f: (g: RepoGroup[]) => RepoGroup[]) => {
    setGroups((g) => {
      const next = f(g);
      writeStored(GROUPS, JSON.stringify(next));
      return next;
    });
  }, []);
  return {
    list,
    groups,
    /** A new group (optionally with `paths` in it); returns its id. */
    addGroup: useCallback(
      (name: string, paths: string[] = []) => {
        const id = `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        updateGroups((g) => addGroup(g, id, name));
        if (paths.length) update((l) => assignGroup(l, paths, id));
        return id;
      },
      [update, updateGroups],
    ),
    editGroup: useCallback(
      (id: string, patch: Partial<Omit<RepoGroup, "id">>) => updateGroups((g) => updateGroup(g, id, patch)),
      [updateGroups],
    ),
    moveGroup: useCallback((id: string, delta: number) => updateGroups((g) => moveGroup(g, id, delta)), [updateGroups]),
    removeGroup: useCallback(
      (id: string) => {
        updateGroups((g) => g.filter((x) => x.id !== id));
        update((l) => removeGroup([], l, id).list);
      },
      [update, updateGroups],
    ),
    /** Put `paths` in group `id` (`null`: ungroup them). */
    setGroup: useCallback((paths: string[], id: string | null) => update((l) => assignGroup(l, paths, id)), [update]),
    touch: useCallback((path: string) => update((l) => touchRecent(l, path, Date.now())), [update]),
    star: useCallback((path: string) => update((l) => toggleStar(l, path)), [update]),
    forget: useCallback((path: string) => update((l) => forgetRecent(l, path)), [update]),
  };
}
export type Recent = ReturnType<typeof useRecent>;

/** Open folder / clone / new: the three ways in besides the recent list. */
export function ConnectActions(p: { onOpen(): void; onClone(): void; onInit(): void; primary?: boolean }) {
  return (
    <div className="connect-actions">
      <button className={p.primary ? "primary" : ""} onClick={p.onOpen}>
        <Icon name="folder" className="ico" /> {t("connect.open")}
      </button>
      <button onClick={p.onClone}>
        <Icon name="clone" className="ico" /> {t("connect.clone")}
      </button>
      <button onClick={p.onInit}>
        <Icon name="sparkle" className="ico" /> {t("connect.init")}
      </button>
    </div>
  );
}

export function RecentList(p: {
  recent: Recent;
  current?: string | null;
  onOpen(path: string): void;
  /** A group's "open all" (shown when there are groups). */
  onOpenMany?(paths: string[]): void;
}) {
  const { list, groups } = p.recent;
  if (list.length === 0) return <p className="muted small recent-empty">{t("connect.noRecent")}</p>;
  if (!groups.length) return <RecentRows {...p} rows={list} />;
  // Under each group's name, then the ungrouped.
  return (
    <div className="recent-groups">
      {bands(groups, list).map(({ group, repos }) =>
        repos.length ? (
          <section key={group?.id ?? "none"} style={group ? { ["--h" as string]: group.hue } : undefined}>
            <div className="recent-group">
              {group && <span className="band-star" aria-hidden />}
              <span>{group?.name ?? t("group.none")}</span>
              {group && p.onOpenMany && (
                <button className="ghost" onClick={() => p.onOpenMany!(repos.map((r) => r.path))}>
                  {t("group.openAll")}
                </button>
              )}
            </div>
            <RecentRows {...p} rows={repos} />
          </section>
        ) : null,
      )}
    </div>
  );
}

function RecentRows(p: { recent: Recent; current?: string | null; onOpen(path: string): void; rows: RecentRepo[] }) {
  const { star, forget } = p.recent;
  return (
    <ul className="recent-list" aria-label={t("connect.recent")}>
      {p.rows.map((r) => (
        <li key={r.path} className={r.path === p.current ? "on" : ""}>
          <button className="recent-open" title={r.path} onClick={() => p.onOpen(r.path)}>
            <b>
              <PlanetDot path={r.path} /> {repoName(r.path)}
            </b>
            <span className="muted">{r.path}</span>
          </button>
          <button
            className={`icon star ${r.starred ? "on" : ""}`}
            aria-pressed={r.starred}
            aria-label={r.starred ? t("connect.unstar") : t("connect.star")}
            title={r.starred ? t("connect.unstar") : t("connect.star")}
            onClick={() => star(r.path)}
          >
            <Icon name="star" filled={r.starred} />
          </button>
          <button
            className="icon"
            aria-label={t("connect.forget")}
            title={t("connect.forget")}
            onClick={() => forget(r.path)}
          >
            <Icon name="close" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Drop-down under the repository name in the top bar. */
export function RepoMenu(p: {
  recent: Recent;
  current: string;
  onOpenPath(path: string): void;
  onOpenMany(paths: string[]): void;
  onOpen(): void;
  onClone(): void;
  onInit(): void;
  onClose(): void;
}) {
  const pick = (f: () => void) => () => {
    p.onClose();
    f();
  };
  const dialog = useDialog(p.onClose);
  return (
    <>
      <div className="menu-catch" onClick={p.onClose} />
      <div className="repo-menu" aria-label={t("connect.title")} {...dialog}>
        <ConnectActions onOpen={pick(p.onOpen)} onClone={pick(p.onClone)} onInit={pick(p.onInit)} />
        <div className="eyebrow">{t("connect.recent")}</div>
        <RecentList
          recent={p.recent}
          current={p.current}
          onOpen={(path) => pick(() => p.onOpenPath(path))()}
          onOpenMany={(paths) => pick(() => p.onOpenMany(paths))()}
        />
      </div>
    </>
  );
}

export interface CloneInit {
  url?: string;
  parent?: string;
  name?: string;
}

/**
 * Clone a URL, or one of the user's repositories on GitHub / GitLab, into
 * <folder>/<name>. The name follows the URL until edited.
 * Credentials problems hand back to the caller (`onAuth`) to explain setup.
 */
export function CloneDialog(p: {
  init: CloneInit;
  onCancel(): void;
  onCloned(path: string): void;
  onAuth(req: Required<CloneInit>, output: string): void;
}) {
  // A retry after an auth problem comes back to the address it tried.
  const [source, setSource] = useState<Source>(() => {
    const last = readStored(CLONE_SOURCE) as Source | null;
    return p.init.url || !last || !SOURCES.includes(last) ? "url" : last;
  });
  const [typed, setTyped] = useState(p.init.url ?? "");
  const [picked, setPicked] = useState<Picked | null>(null);
  const url = source === "url" ? typed : (picked?.url ?? "");
  const [parent, setParent] = useState(p.init.parent ?? readStored(CLONE_PARENT) ?? "");
  const [name, setName] = useState<string | null>(p.init.name ?? null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const finalName = name ?? nameFromUrl(url);
  const ssh = isSshUrl(url);
  const [sshOpen, setSshOpen] = useState(false);
  const dest = parent && finalName ? joinPath(parent, finalName) : "";
  const ok = url.trim() !== "" && dest !== "" && !running;

  const start = async () => {
    const [u, d] = [url, dest];
    setRunning(true);
    setError(null);
    setProgress(null);
    let r: OpResult;
    try {
      r = await api.clone(u, d, setProgress);
    } catch (e) {
      r = { status: "failed", output: String(e) };
    }
    setRunning(false);
    if (r.status === "ok") {
      writeStored(CLONE_PARENT, parent);
      p.onCloned(d);
    } else if (r.status === "auth") p.onAuth({ url: u, parent, name: finalName }, r.output);
    else setError(r.output || t("connect.clone.failed"));
  };

  const chooseSource = (next: Source) => {
    setSource(next);
    setPicked(null);
    setName(null);
    writeStored(CLONE_SOURCE, next);
  };

  const chooseParent = async () => {
    const dir = await api.pickFolder(t("connect.clone.where"));
    if (dir) setParent(dir);
  };

  return (
    <Modal
      onClose={() => !running && p.onCancel()}
      className="clone"
      title={t("connect.clone.title")}
      onSubmit={() => {
        if (ok) void start();
      }}
      actions={
        <>
          <button type="button" disabled={running} onClick={p.onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={!ok}>
            {running ? t("connect.clone.running") : t("connect.clone.go")}
          </button>
        </>
      }
    >
      <div className="source-body">
        <SourceTabs value={source} onChange={chooseSource} disabled={running} />
        <div className="source-pane">
          {source === "url" ? (
            <div className="field col">
              <span className="row url-head">
                <label htmlFor="clone-url">{t("connect.clone.url")}</label>
                <span className="spacer" />
                {/* Same repository, other transport: switch between the two forge address forms. */}
                <ProtoSwitch
                  value={ssh ? "ssh" : "https"}
                  disabled={running}
                  onChange={(proto) => setTyped(proto === "ssh" ? toSsh(url) : toHttps(url))}
                />
              </span>
              <input
                id="clone-url"
                className="text"
                autoFocus
                placeholder={ssh ? "git@github.com:owner/repo.git" : "https://github.com/owner/repo.git"}
                value={url}
                disabled={running}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          ) : (
            <ForgeRepoPicker
              key={source}
              kind={source}
              path=""
              picked={picked}
              onPick={(pk) => {
                setPicked(pk);
                setName(null);
              }}
              disabled={running}
            />
          )}
          {ssh && url.includes(":") && (
            <details className="ssh-ready" open={sshOpen} onToggle={(e) => setSshOpen(e.currentTarget.open)}>
              <summary>{t("ssh.title")}</summary>
              <SshSetup url={url} onOpenUrl={openLink} />
            </details>
          )}
          <div className="field col">
            <span>{t("connect.clone.where")}</span>
            <span className="row">
              <code className="folder">{parent || t("connect.clone.noFolder")}</code>
              <button type="button" disabled={running} onClick={() => void chooseParent()}>
                {t("connect.clone.choose")}
              </button>
            </span>
          </div>
          <label className="field col">
            {t("connect.clone.name")}
            <input
              className="text"
              value={finalName}
              disabled={running}
              onChange={(e) => setName(e.target.value.replace(/[\\/]/g, "-"))}
            />
          </label>
          {dest && <p className="muted small">→ {dest}</p>}
          {running && (
            <div className="clone-progress" role="status">
              <span>{progress ? `${progress.phase} ${progress.percent}%` : t("connect.clone.starting")}</span>
              <span className="progress">
                <i style={{ width: `${progress?.percent ?? 0}%` }} />
              </span>
            </div>
          )}
          {error && <pre className="note warn raw">{error}</pre>}
        </div>
      </div>
    </Modal>
  );
}
