import { Icon } from "./Icon";
import { useState } from "react";
import { fmtTime } from "../format";
import type { CommitInfo, FileDiff, RefInfo } from "../types";
import { ChangedFiles } from "./ChangedFiles";
import { t } from "../i18n";

interface Props {
  commit: CommitInfo;
  refs: RefInfo[];
  /** Changed files; `null` while loading. */
  files: FileDiff[] | null;
  color: string;
  isHead: boolean;
  busy: boolean;
  onClose(): void;
  onCheckout(branch: string): void;
  onCreateBranch(name: string, at: string): void;
  onSelect(id: string): void;
  onOpenFile(path: string): void;
  /** Right-click on a changed file. */
  onFileMenu?(path: string, x: number, y: number): void;
}

export function Inspector(props: Props) {
  const { commit, refs, files, color, isHead, busy, onClose, onCheckout, onCreateBranch, onSelect, onOpenFile } = props;
  const [name, setName] = useState("");
  const body = commit.message.split("\n").slice(1).join("\n").trim();
  const locals = refs.filter((r) => r.kind === "local");

  return (
    <aside className="panel inspector" style={{ ["--accent" as string]: color }}>
      <header>
        <div>
          <div className="eyebrow">
            {t("inspector.eyebrow")} {isHead && <span className="head-pill">HEAD</span>}
          </div>
          <h2>{commit.summary || t("common.noMessage")}</h2>
        </div>
        <button className="icon" onClick={onClose} title={t("common.closeEsc")}>
          <Icon name="close" />
        </button>
      </header>

      {refs.length > 0 && (
        <div className="refs">
          {refs.map((r) => (
            <span key={r.kind + r.name} className={`ref ref-${r.kind}`}>
              {r.kind === "remote" && <Icon name="cloud" size={12} />}
              {r.kind === "tag" && <Icon name="tag" size={11} />} {r.name}
            </span>
          ))}
        </div>
      )}

      {body && <pre className="body">{body}</pre>}

      <dl className="meta">
        <dt>{t("inspector.author")}</dt>
        <dd>
          {commit.author} <span className="muted">&lt;{commit.email}&gt;</span>
        </dd>
        <dt>{t("inspector.time")}</dt>
        <dd>{fmtTime(commit.time)}</dd>
        <dt>{t("inspector.commit")}</dt>
        <dd>
          <code className="sha" title={t("inspector.copy")} onClick={() => navigator.clipboard?.writeText(commit.id)}>
            {commit.id.slice(0, 12)}
          </code>
        </dd>
        {commit.parents.length > 0 && (
          <>
            <dt>{commit.parents.length > 1 ? t("inspector.parents") : t("inspector.parent")}</dt>
            <dd className="parents">
              {commit.parents.map((p) => (
                <code key={p} className="sha link" onClick={() => onSelect(p)}>
                  {p.slice(0, 7)}
                </code>
              ))}
            </dd>
          </>
        )}
      </dl>

      <ChangedFiles files={files} onOpen={onOpenFile} onMenu={props.onFileMenu} />

      {locals.length > 0 && (
        <div className="actions">
          {locals.map((r) => (
            <button key={r.name} disabled={busy} onClick={() => onCheckout(r.name)}>
              ⇢ {t("menu.checkoutName", { name: r.name })}
            </button>
          ))}
        </div>
      )}

      <form
        className="actions inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreateBranch(name.trim(), commit.id);
          setName("");
        }}
      >
        <input
          className="text"
          placeholder={t("menu.branchHere")}
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s+/g, "-"))}
        />
        <button type="submit" disabled={busy || !name.trim()}>
          {t("branch.new.go")}
        </button>
      </form>

      <p className="tip">{t("inspector.tip")}</p>
    </aside>
  );
}
