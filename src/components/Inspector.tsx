import { Icon } from "./Icon";
import { useEffect, useState } from "react";
import { api } from "../api";
import { fmtAgo, fmtTime } from "../format";
import type { CommitInfo, FileDiff, RefInfo, Signature } from "../types";
import { ChangedFiles } from "./ChangedFiles";
import type { MenuItem } from "./ContextMenu";
import { t } from "../i18n";
import { copyText } from "../share";

interface Props {
  path: string;
  commit: CommitInfo;
  /** Refs on this commit (pull requests included, as graph labels). */
  refs: RefInfo[];
  /** Branches whose history holds this commit (local first). */
  containedIn: RefInfo[];
  /** Changed files; `null` while loading. */
  files: FileDiff[] | null;
  color: string;
  isHead: boolean;
  /** The commit's menu: entries with an icon make the toolbar, all of them are under "more". */
  actions: MenuItem[];
  onMore(x: number, y: number): void;
  onClose(): void;
  onSelect(id: string): void;
  onOpenFile(path: string): void;
  /** Right-click on a changed file. */
  onFileMenu?(path: string, x: number, y: number): void;
}

const SIG_LABEL = { verified: "sig.verified", unverified: "sig.unverified", bad: "sig.bad" } as const;
const SIG_TONE = { verified: "ok", unverified: "muted", bad: "danger" } as const;

/** The commit's signature, checked on demand (not part of the snapshot: it runs gpg / ssh-keygen). */
function useSignature(path: string, id: string): Signature | null {
  const [loaded, setLoaded] = useState<{ id: string; sig: Signature } | null>(null);
  useEffect(() => {
    let live = true;
    api.signature(path, id).then(
      (sig) => live && setLoaded({ id, sig }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [path, id]);
  return loaded && loaded.id === id ? loaded.sig : null;
}

/** "Signed" and the like, with who signed on hover; nothing for an unsigned commit. */
function SignatureBadge({ sig }: { sig: Signature | null }) {
  if (!sig || sig.status === "none") return null;
  const who = sig.signer || sig.key;
  return (
    <span
      className={`badge signature ${SIG_TONE[sig.status]}`}
      title={who ? t("sig.title", { signer: sig.signer || "?", key: sig.key || "?" }) : t("sig.unknown")}
    >
      <Icon name={sig.status === "bad" ? "close" : "check"} size={10} />
      {t(SIG_LABEL[sig.status])}
    </span>
  );
}

/** Up to this many containing branches are listed; the rest are counted. */
const CONTAINED = 6;

/**
 * The selected commit, read first: its whole message, then who and when in a
 * line, where it sits (parents, branches that hold it, its pull request), what
 * can be done with it as a toolbar, and the files it changed by folder.
 */
export function Inspector(props: Props) {
  const { commit, refs, containedIn, files, color, isHead, onClose, onSelect, onOpenFile } = props;
  const [copied, setCopied] = useState(false);
  const signature = useSignature(props.path, commit.id);
  const body = commit.message.split("\n").slice(1).join("\n").trim();
  const tools = props.actions.filter((a): a is Exclude<MenuItem, "separator"> => a !== "separator" && !!a.icon);
  const copy = () => {
    copyText(commit.id, () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  };

  return (
    <aside className="panel inspector" style={{ ["--accent" as string]: color }}>
      <header>
        <div>
          <div className="eyebrow">
            {t("inspector.eyebrow")} {isHead && <span className="badge head">HEAD</span>}
          </div>
          <h2>{commit.summary || t("common.noMessage")}</h2>
        </div>
        <button className="icon" onClick={onClose} title={t("common.closeEsc")} aria-label={t("common.close")}>
          <Icon name="close" />
        </button>
      </header>

      {body && <pre className="body">{body}</pre>}

      <div className="byline">
        <span className="avatar" aria-hidden>
          {commit.author.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="who" title={commit.email}>
          {commit.author}
        </span>
        <span className="muted" title={fmtTime(commit.time)}>
          · {fmtAgo(commit.time)}
        </span>
        <SignatureBadge sig={signature} />
      </div>
      <div className="ids">
        <button className="sha" onClick={copy} title={t("inspector.copy")}>
          <code>{commit.id.slice(0, 10)}</code>
          <Icon name={copied ? "check" : "copy"} size={12} />
        </button>
        {commit.parents.map((p) => (
          <button
            key={p}
            className="sha parent"
            onClick={() => onSelect(p)}
            title={commit.parents.length > 1 ? t("inspector.parents") : t("inspector.parent")}
          >
            <Icon name="arrowLeft" size={12} />
            <code>{p.slice(0, 7)}</code>
          </button>
        ))}
      </div>

      {(refs.length > 0 || containedIn.length > 0) && (
        <div className="where">
          {refs.map((r) => (
            <span key={r.kind + r.name} className={`badge ref ref-${r.kind}`}>
              {r.kind === "remote" && <Icon name="cloud" size={12} />}
              {r.kind === "tag" && <Icon name="tag" size={11} />}
              {r.kind === "pr" && <span className={`pr-ci ${r.checks ?? "none"}`} />} {r.name}
              {r.kind === "pr" && r.review === "approved" && <Icon name="check" size={11} />}
            </span>
          ))}
          {containedIn.length > 0 && (
            <div className="contained muted">
              {t("inspector.containedIn")}{" "}
              {containedIn.slice(0, CONTAINED).map((r, i) => (
                <span key={r.kind + r.name}>
                  {i > 0 && ", "}
                  <span className={r.kind === "local" ? "local" : ""}>{r.name}</span>
                </span>
              ))}
              {containedIn.length > CONTAINED && ` ${t("inspector.andMore", { n: containedIn.length - CONTAINED })}`}
            </div>
          )}
        </div>
      )}

      <div className="toolbar" role="toolbar" aria-label={t("inspector.actions")}>
        {tools.map((a) => (
          <button
            key={a.label}
            className="tool"
            disabled={a.disabled}
            onClick={a.onSelect}
            title={a.label}
            aria-label={a.label}
          >
            <Icon name={a.icon!} />
          </button>
        ))}
        <span className="spacer" />
        <button
          className="tool"
          title={t("inspector.more")}
          aria-label={t("inspector.more")}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            props.onMore(r.left, r.bottom + 4);
          }}
        >
          <Icon name="more" />
        </button>
      </div>

      <ChangedFiles files={files} onOpen={onOpenFile} onMenu={props.onFileMenu} />
    </aside>
  );
}
