// Ways into a repository: recent ones (with stars), open a folder, clone a
// URL, or start a new one. Used by the welcome screen and the top bar menu.

import { Icon } from "./Icon";
import { SshSetup } from "./SshSetup";
import { isSshUrl, toHttps, toSsh } from "../sshUrl";
import { PlanetDot } from "./Planet";
import { useCallback, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
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

const RECENT = "ddugit.recent";
const CLONE_PARENT = "ddugit.cloneParent";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

/** Recent repositories, persisted; the callbacks are stable. */
export function useRecent() {
  const [list, setList] = useState(() => sortRecent(parseRecent(read(RECENT))));
  const update = useCallback((f: (l: RecentRepo[]) => RecentRepo[]) => {
    setList((l) => {
      const next = sortRecent(f(l));
      write(RECENT, JSON.stringify(next));
      return next;
    });
  }, []);
  return {
    list,
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

export function RecentList(p: { recent: Recent; current?: string | null; onOpen(path: string): void }) {
  const { list, star, forget } = p.recent;
  if (list.length === 0) return <p className="muted small recent-empty">{t("connect.noRecent")}</p>;
  return (
    <ul className="recent-list" aria-label={t("connect.recent")}>
      {list.map((r) => (
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
  onOpen(): void;
  onClone(): void;
  onInit(): void;
  onClose(): void;
}) {
  const pick = (f: () => void) => () => {
    p.onClose();
    f();
  };
  return (
    <>
      <div className="menu-catch" onClick={p.onClose} />
      <div
        className="repo-menu"
        role="dialog"
        aria-label={t("connect.title")}
        onKeyDown={(e) => e.key === "Escape" && p.onClose()}
      >
        <ConnectActions onOpen={pick(p.onOpen)} onClone={pick(p.onClone)} onInit={pick(p.onInit)} />
        <div className="eyebrow">{t("connect.recent")}</div>
        <RecentList recent={p.recent} current={p.current} onOpen={(path) => pick(() => p.onOpenPath(path))()} />
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
 * Clone a URL into <folder>/<name>. The name follows the URL until edited.
 * Credentials problems hand back to the caller (`onAuth`) to explain setup.
 */
export function CloneDialog(p: {
  init: CloneInit;
  onCancel(): void;
  onCloned(path: string): void;
  onAuth(req: Required<CloneInit>, output: string): void;
}) {
  const [url, setUrl] = useState(p.init.url ?? "");
  const [parent, setParent] = useState(p.init.parent ?? read(CLONE_PARENT) ?? "");
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
      write(CLONE_PARENT, parent);
      p.onCloned(d);
    } else if (r.status === "auth") p.onAuth({ url: u, parent, name: finalName }, r.output);
    else setError(r.output || t("connect.clone.failed"));
  };

  const chooseParent = async () => {
    const dir = await api.pickFolder(t("connect.clone.where"));
    if (dir) setParent(dir);
  };

  return (
    <div className="scrim" onClick={() => !running && p.onCancel()}>
      <form
        className="dialog clone"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok) void start();
        }}
        onKeyDown={(e) => e.key === "Escape" && !running && p.onCancel()}
      >
        <div className="eyebrow">{t("connect.clone")}</div>
        <div className="field col">
          <span className="row url-head">
            <label htmlFor="clone-url">{t("connect.clone.url")}</label>
            <span className="spacer" />
            {/* Same repository, other transport: switch between the two forge address forms. */}
            <span className="proto" role="radiogroup" aria-label={t("connect.clone.proto")}>
              {(["https", "ssh"] as const).map((proto) => (
                <button
                  key={proto}
                  type="button"
                  role="radio"
                  aria-checked={(proto === "ssh") === ssh}
                  className={(proto === "ssh") === ssh ? "on" : ""}
                  disabled={running}
                  onClick={() => setUrl(proto === "ssh" ? toSsh(url) : toHttps(url))}
                >
                  {proto.toUpperCase()}
                </button>
              ))}
            </span>
          </span>
          <input
            id="clone-url"
            className="text"
            autoFocus
            placeholder={ssh ? "git@github.com:owner/repo.git" : "https://github.com/owner/repo.git"}
            value={url}
            disabled={running}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        {ssh && url.includes(":") && (
          <details className="ssh-ready" open={sshOpen} onToggle={(e) => setSshOpen(e.currentTarget.open)}>
            <summary>{t("ssh.title")}</summary>
            <SshSetup url={url} onOpenUrl={(u) => void api.openUrl("", u)} />
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
        <div className="dialog-actions">
          <button type="button" disabled={running} onClick={p.onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={!ok}>
            {running ? t("connect.clone.running") : t("connect.clone.go")}
          </button>
        </div>
      </form>
    </div>
  );
}
