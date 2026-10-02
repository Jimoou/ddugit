// Worktrees: other branches of the same repository checked out side by side,
// each in its own folder. A sidebar section lists them (open one in a tab),
// and a dialog adds one for an existing or a new branch.

import { useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { joinPath, parentDir, repoName } from "../recent";
import type { WorktreeInfo, WorktreeOp } from "../types";
import { Icon } from "./Icon";
import { SideSection } from "./Sidebar";

export function WorktreeSection(p: {
  worktrees: WorktreeInfo[];
  onOpen(w: WorktreeInfo): void;
  onAdd(): void;
  onMenu(w: WorktreeInfo, x: number, y: number): void;
}) {
  return (
    <SideSection
      id="worktree"
      className="worktrees"
      title={t("wt.title")}
      count={p.worktrees.length}
      actions={
        <button className="h3-add" title={t("wt.add")} aria-label={t("wt.add")} onClick={p.onAdd}>
          <Icon name="plus" size={12} />
        </button>
      }
    >
      <ul>
        {p.worktrees.map((w) => (
          <li
            key={w.path}
            className={`${w.current ? "head" : ""} ${w.missing ? "missing" : ""}`}
            title={w.current ? w.path : t("wt.openHint", { path: w.path })}
            onDoubleClick={() => !w.current && !w.missing && p.onOpen(w)}
            onClick={() => !w.current && !w.missing && p.onOpen(w)}
            onContextMenu={(e) => {
              e.preventDefault();
              p.onMenu(w, e.clientX, e.clientY);
            }}
          >
            <Icon name="folder" size={11} />
            <span className="name">
              {repoName(w.path)}
              <span className="muted"> {w.missing ? t("wt.missing") : (w.branch ?? t("galaxy.detached"))}</span>
            </span>
            {w.current && <span className="head-pill">{t("wt.here")}</span>}
            {w.main && !w.current && <span className="muted small">{t("wt.main")}</span>}
          </li>
        ))}
      </ul>
    </SideSection>
  );
}

/** A branch to put in a new worktree: one of `free` (checked out nowhere), or a new one. */
export function WorktreeDialog(p: {
  worktrees: WorktreeInfo[];
  /** Local branches not checked out in any worktree. */
  free: string[];
  /** Preselected existing branch. */
  branch?: string;
  busy: boolean;
  onCancel(): void;
  onAdd(op: Extract<WorktreeOp, { kind: "add" }>): void;
}) {
  const main = p.worktrees.find((w) => w.main) ?? p.worktrees[0];
  const [fresh, setFresh] = useState(!p.branch && p.free.length === 0);
  const [branch, setBranch] = useState(p.branch ?? p.free[0] ?? "");
  const [name, setName] = useState("");
  const chosen = fresh ? name.trim() : branch;
  // Next to the main folder, named after the repository and the branch.
  const [parent, setParent] = useState(main ? parentDir(main.path) : "");
  const [dirEdit, setDirEdit] = useState<string | null>(null);
  const suggested =
    parent && chosen ? joinPath(parent, `${repoName(main?.path ?? "")}-${chosen.replace(/[\\/]+/g, "-")}`) : "";
  const dir = dirEdit ?? suggested;
  const ok = !!chosen && !!dir.trim() && !p.busy;
  return (
    <div className="scrim" onClick={p.onCancel}>
      <form
        className="dialog worktree-dialog"
        role="dialog"
        aria-label={t("wt.add")}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && p.onCancel()}
        onSubmit={(e) => {
          e.preventDefault();
          if (ok)
            p.onAdd({
              kind: "add",
              dir: dir.trim(),
              branch: fresh ? null : branch,
              newBranch: fresh ? chosen : null,
              at: null,
            });
        }}
      >
        <div className="eyebrow">{t("wt.add")}</div>
        <p className="muted small">{t("wt.explain")}</p>
        <span className="proto" role="radiogroup" aria-label={t("wt.add")}>
          {[false, true].map((isNew) => (
            <button
              key={String(isNew)}
              type="button"
              role="radio"
              aria-checked={fresh === isNew}
              className={fresh === isNew ? "on" : ""}
              disabled={!isNew && p.free.length === 0}
              onClick={() => setFresh(isNew)}
            >
              {t(isNew ? "wt.newBranch" : "wt.existing")}
            </button>
          ))}
        </span>
        {fresh ? (
          <input
            className="text"
            autoFocus
            placeholder="feature/my-idea"
            aria-label={t("wt.newBranch")}
            value={name}
            onChange={(e) => setName(e.target.value.replace(/\s+/g, "-"))}
          />
        ) : (
          <select aria-label={t("wt.existing")} value={branch} onChange={(e) => setBranch(e.target.value)}>
            {p.free.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        )}
        {!fresh && p.free.length === 0 && <p className="muted small">{t("wt.noFree")}</p>}
        <div className="row">
          <input
            className="text grow"
            aria-label={t("wt.folder")}
            placeholder={t("wt.folder")}
            value={dir}
            onChange={(e) => setDirEdit(e.target.value)}
          />
          <button
            type="button"
            onClick={() =>
              void api.pickFolder(t("wt.folder")).then((d) => {
                if (!d) return;
                setParent(d);
                setDirEdit(null);
              })
            }
          >
            {t("connect.clone.choose")}
          </button>
        </div>
        <div className="dialog-actions">
          <button type="button" onClick={p.onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={!ok}>
            {t("wt.go")}
          </button>
        </div>
      </form>
    </div>
  );
}
