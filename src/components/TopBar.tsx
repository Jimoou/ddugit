import { phase } from "./JobCard";
import { Icon } from "./Icon";
import type { IconName } from "../icons";
import { isTauri } from "../api";
import { type Key, t } from "../i18n";
import type { HeadInfo, Progress, RemoteOp } from "../types";

interface Props {
  /** Demo with the tutorial closed: the demo badge reopens it. */
  onVoyage?(): void;
  head: HeadInfo;
  headColor: string;
  changeCount: number;
  busy: boolean;
  /** Remote operation currently running, for its spinner. */
  remoteBusy: RemoteOp | null;
  progress: Progress | null;
  /** Open the branch switcher under the button at (x, y) window px. */
  onBranches(x: number, y: number): void;
  onCompose(): void;
  /** Open the undo history (reflog). */
  onUndoHistory(): void;
  onRemote(op: RemoteOp): void;
}

const REMOTE: { op: RemoteOp; icon: IconName; label: string; title: Key }[] = [
  { op: "fetch", icon: "fetch", label: "Fetch", title: "top.fetch.title" },
  { op: "pull", icon: "arrowDown", label: "Pull", title: "top.pull.title" },
  { op: "push", icon: "arrowUp", label: "Push", title: "top.push.title" },
];

/**
 * The open repository's context row, under the tabs: where HEAD is (a branch
 * switcher) and its upstream on the left; syncing, committing and undo on the right.
 */
export function TopBar(p: Props) {
  const { head, onVoyage } = p;
  const badge = (op: RemoteOp) => (op === "pull" ? head.behind : op === "push" ? head.ahead : 0);

  return (
    <header className="topbar">
      <button
        className="branch-now"
        style={{ ["--c" as string]: p.headColor }}
        title={t("top.branches")}
        aria-haspopup="menu"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          p.onBranches(r.left, r.bottom + 6);
        }}
      >
        <Icon name="head" size={12} />
        <span className="branch-name">
          {head.branch ?? (head.target ? `detached @ ${head.target.slice(0, 7)}` : t("top.emptyRepo"))}
        </span>
        <Icon name="chevronDown" size={12} className="muted" />
      </button>
      {head.upstream && (
        <span className="upstream muted" title={t("top.upstream")}>
          <Icon name="pull" size={12} /> {head.upstream}
        </span>
      )}
      {onVoyage ? (
        <button className="demo-pill" onClick={onVoyage} title={t("voyage.reopen")}>
          {t("top.demo.tour")}
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
              <Icon name={icon} className="ico" />
              {label}
              {n > 0 && !running && <span className={`count ${op}`}>{n}</span>}
              {/* The verb stays put; the percentage rides in a fixed-width badge (the phase is in the job card). */}
              {running && p.progress && (
                <>
                  <span className="count pct">{p.progress.percent}%</span>
                  <span className="progress" title={phase(p.progress.phase)}>
                    <i style={{ width: `${p.progress.percent}%` }} />
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <button className="ghost commit-btn" onClick={p.onCompose} disabled={p.busy}>
        <Icon name="plus" /> {t("top.commit")} {p.changeCount > 0 && <span className="count">{p.changeCount}</span>}
      </button>
      <button className="ghost" onClick={p.onUndoHistory} title={t("undo.log.open")} aria-label={t("undo.log.open")}>
        <Icon name="history" />
      </button>
    </header>
  );
}
