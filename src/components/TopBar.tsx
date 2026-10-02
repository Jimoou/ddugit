import { Icon } from "./Icon";
import type { IconName } from "../icons";
import type { ReactNode } from "react";
import { isTauri } from "../api";
import { isKey, type Key, t } from "../i18n";
import type { HeadInfo, Progress, RemoteOp } from "../types";

interface Props {
  /** Demo with the tutorial closed: the demo badge reopens it. */
  onVoyage?(): void;
  repoName: string;
  repoPath: string;
  head: HeadInfo;
  headColor: string;
  changeCount: number;
  busy: boolean;
  /** Remote operation currently running, for its spinner. */
  remoteBusy: RemoteOp | null;
  progress: Progress | null;
  animate: boolean;
  /** Toggle the repository menu (recent, open, clone, new). */
  onOpenRepo(): void;
  /** The open repository menu, shown under the name. */
  repoMenu?: ReactNode;
  onCompose(): void;
  onRefresh(): void;
  /** Open the undo history (reflog). */
  onUndoHistory(): void;
  onRemote(op: RemoteOp): void;
  onToggleAnimate(): void;
  onSettings(): void;
}

/** git's progress phase, translated when known. */
const phase = (name: string) => {
  const key = `progress.${name}`;
  return isKey(key) ? t(key) : name;
};

const REMOTE: { op: RemoteOp; icon: IconName; label: string; title: Key }[] = [
  { op: "fetch", icon: "fetch", label: "Fetch", title: "top.fetch.title" },
  { op: "pull", icon: "arrowDown", label: "Pull", title: "top.pull.title" },
  { op: "push", icon: "arrowUp", label: "Push", title: "top.push.title" },
];

export function TopBar(p: Props) {
  const { head, onVoyage } = p;
  const badge = (op: RemoteOp) => (op === "pull" ? head.behind : op === "push" ? head.ahead : 0);

  return (
    <header className="topbar">
      <h1 className="wordmark small">ddugit</h1>
      <span className="repo-anchor">
        <button className="repo" onClick={p.onOpenRepo} title={p.repoPath} aria-expanded={!!p.repoMenu}>
          {p.repoName} <Icon name="chevronDown" size={12} className="muted" />
        </button>
        {p.repoMenu}
      </span>
      <span className="branch-now" style={{ ["--c" as string]: p.headColor }}>
        <Icon name="head" size={12} />{" "}
        {head.branch ?? (head.target ? `detached @ ${head.target.slice(0, 7)}` : t("top.emptyRepo"))}
      </span>
      {head.upstream && (
        <span className="upstream muted">
          <Icon name="pull" size={12} /> {head.upstream}
        </span>
      )}
      {onVoyage ? (
        <button className="demo-pill" onClick={onVoyage} title={t("voyage.reopen")}>
          {t("top.demo")} <Icon name="sparkle" size={11} />
        </button>
      ) : (
        !isTauri && <span className="demo-pill">{t("top.demo")}</span>
      )}
      <div className="spacer" />

      <div className="remote-group">
        {REMOTE.map(({ op, icon, label, title }) => {
          const n = badge(op);
          const running = p.remoteBusy === op || (op === "pull" && p.remoteBusy?.startsWith("pull"));
          return (
            <button
              key={op}
              className={`ghost remote ${running ? "running" : ""}`}
              disabled={p.busy}
              title={op === "push" && !head.upstream ? t("top.push.first") : t(title)}
              onClick={() => p.onRemote(op)}
            >
              <Icon name={icon} className="ico" />{" "}
              {running && p.progress ? `${phase(p.progress.phase)} ${p.progress.percent}%` : label}
              {n > 0 && !running && <span className={`count ${op}`}>{n}</span>}
              {running && p.progress && (
                <span className="progress" title={p.progress.phase}>
                  <i style={{ width: `${p.progress.percent}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button className="ghost" onClick={p.onCompose} disabled={p.busy}>
        <Icon name="plus" /> {t("top.commit")} {p.changeCount > 0 && <span className="count">{p.changeCount}</span>}
      </button>
      <button className="ghost" onClick={p.onUndoHistory} title={t("undo.log.open")} aria-label={t("undo.log.open")}>
        <Icon name="history" />
      </button>
      <button className="ghost" onClick={p.onRefresh} title={t("top.refresh")} aria-label={t("top.refresh")}>
        <Icon name="refresh" />
      </button>
      <button
        className={`ghost ${p.animate ? "on" : ""}`}
        title={t("top.sparkle")}
        aria-label={t("top.sparkle")}
        onClick={p.onToggleAnimate}
      >
        <Icon name="sparkle" />
      </button>
      <button className="ghost" title={t("top.settings")} aria-label={t("top.settings.label")} onClick={p.onSettings}>
        <Icon name="settings" />
      </button>
    </header>
  );
}
