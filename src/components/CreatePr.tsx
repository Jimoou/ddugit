// Open a pull request (GitHub) / merge request (GitLab) from a local branch:
// where it goes, what it brings, and a push first when the forge lacks the branch.

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { offerPro } from "../pro";
import { commitsBetween, defaultBody, defaultTitle, pickBase, pushNeed, remoteBranches } from "../prDraft";
import { FORGE_NAME, prNoun } from "./Pulls";
import { ProBadge } from "./ProOffer";
import type { ForgeKind, ForgeStatus, PrTarget, RepoSnapshot } from "../types";
import { useDialog } from "./useDialog";

/** `#12` / `!12`. */
export const prTag = (kind: ForgeKind, n: number) => `${kind === "gitlab" ? "!" : "#"}${n}`;

/** Shown in the commit list before "and n more". */
const LISTED = 8;

interface Props {
  path: string;
  snap: RepoSnapshot;
  /** Forge remotes, one per project (from the pull request report). */
  forges: ForgeStatus[];
  /** The branch the request starts from. */
  branch: string;
  trusted: string[];
  /** Changes after a token is saved: ask the forge again. */
  retry: number;
  /** Push `branch` to `remote` (tracking it there); false when it didn't go up. */
  onPush(remote: string, branch: string): Promise<boolean>;
  onCreated(kind: ForgeKind, number: number, url: string): void;
  onConnect(target: PrTarget): void;
  onOpenUrl(url: string): void;
  onCancel(): void;
}

type Problem = { kind: "exists"; number: number; url: string } | { kind: "refused" | "error"; message: string };

export function CreatePr(p: Props) {
  const { snap } = p;
  const [remote, setRemote] = useState(() => (p.forges.find((f) => f.remote === "origin") ?? p.forges[0]).remote);
  const [head, setHead] = useState(p.branch);
  const [base, setBase] = useState<string | null>(null);
  // Typed text; null follows the defaults (which change with the branches).
  const [title, setTitle] = useState<string | null>(null);
  const [body, setBody] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  // Asked again after a token is saved (`retry`); the last answer for this remote stays up meanwhile.
  const [loaded, setLoaded] = useState<{ remote: string; target: PrTarget | null; error: string | null } | null>(null);
  useEffect(() => {
    let live = true;
    api.prTarget(p.path, remote, p.trusted).then(
      (target) => live && setLoaded({ remote, target, error: null }),
      (e) => live && setLoaded({ remote, target: null, error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, [p.path, remote, p.trusted, p.retry]);
  const current = loaded && loaded.remote === remote ? loaded : null;
  const target = current?.target ?? null;
  const ready = !!target && !target.needsToken && !target.locked;
  const blocked = !!target && !ready;

  const locals = useMemo(() => snap.refs.filter((r) => r.kind === "local").map((r) => r.name), [snap]);
  const bases = useMemo(() => {
    const there = remoteBranches(snap.refs, remote);
    const d = target?.defaultBranch;
    return d && !there.includes(d) ? [d, ...there] : there;
  }, [snap, remote, target]);
  const chosenBase =
    base && bases.includes(base) && base !== head ? base : pickBase(bases, head, target?.defaultBranch ?? null);
  const tipOf = (kind: "local" | "remote", name: string) =>
    snap.refs.find((r) => r.kind === kind && r.name === name)?.target ?? null;
  const headTip = tipOf("local", head);
  const baseTip = chosenBase ? tipOf("remote", `${remote}/${chosenBase}`) : null;
  const commits = useMemo(
    () => (headTip && baseTip ? commitsBetween(snap.commits, headTip, baseTip) : []),
    [snap, headTip, baseTip],
  );
  const need = pushNeed(snap.commits, snap.refs, remote, head);
  const finalTitle = title ?? defaultTitle(head, commits);
  const finalBody = body ?? defaultBody(commits);
  const kind = target?.kind ?? p.forges.find((f) => f.remote === remote)?.kind ?? "github";
  const noun = prNoun(kind);
  const empty = !!baseTip && commits.length === 0;
  const canSend = ready && !sending && !!chosenBase && !empty && !!finalTitle.trim();

  const submit = async () => {
    if (!canSend || !chosenBase) return;
    setSending(true);
    setProblem(null);
    try {
      if (need.kind !== "none" && !(await p.onPush(remote, head))) return;
      const req = { base: chosenBase, head, title: finalTitle.trim(), body: finalBody, draft };
      const out = await api.createPr(p.path, remote, p.trusted, req);
      if (out.kind === "created") p.onCreated(kind, out.number, out.url);
      else setProblem(out);
    } catch (e) {
      setProblem({ kind: "error", message: String(e) });
    } finally {
      setSending(false);
    }
  };

  const dialog = useDialog(p.onCancel);
  return (
    <div className="scrim" onClick={p.onCancel}>
      <form
        className="dialog create-pr"
        aria-label={t("pr.new.title", { noun })}
        onClick={(e) => e.stopPropagation()}
        {...dialog}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <h2 className="dialog-title">{t("pr.new.title", { noun })}</h2>
        {target?.needsToken && (
          <div className="note warn pr-connect">
            <p>
              {target.unauthorized
                ? t("pr.refused", { forge: FORGE_NAME[target.kind] })
                : t("pr.new.connect", { forge: FORGE_NAME[target.kind], noun })}
            </p>
            <button type="button" onClick={() => p.onConnect(target)}>
              {t("pr.connect", { forge: FORGE_NAME[target.kind] })}
            </button>
          </div>
        )}
        {target?.locked && (
          <div className="note pr-connect pr-locked">
            <p>{t("pr.locked", { forge: FORGE_NAME[target.kind] })}</p>
            <button type="button" onClick={() => offerPro("pulls")}>
              {t("pro.unlock")} <ProBadge />
            </button>
          </div>
        )}

        <div className="pr-route">
          {p.forges.length > 1 && (
            <label>
              <span className="muted small">{t("pr.new.remote")}</span>
              <select value={remote} onChange={(e) => setRemote(e.target.value)}>
                {p.forges.map((f) => (
                  <option key={f.remote} value={f.remote}>
                    {f.remote} · {f.slug}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <span className="muted small">{t("pr.new.head")}</span>
            <select value={head} onChange={(e) => setHead(e.target.value)}>
              {locals.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          <span className="pr-arrow" aria-hidden>
            →
          </span>
          <label>
            <span className="muted small">{t("pr.new.base")}</span>
            <select value={chosenBase ?? ""} disabled={!bases.length} onChange={(e) => setBase(e.target.value)}>
              {bases
                .filter((b) => b !== head)
                .map((b) => (
                  <option key={b}>{b}</option>
                ))}
            </select>
          </label>
        </div>

        {!current && (
          <p className="muted small">
            {t("pr.new.loading", { host: p.forges.find((f) => f.remote === remote)?.host ?? "" })}
          </p>
        )}
        {current?.error && <p className="note warn">{t("pr.new.unreadable", { error: current.error })}</p>}
        {/* Without a token or Pro the form can't go anywhere: dim it under the blocker above. */}
        <fieldset className="pr-fields" disabled={blocked}>
          <label className="field col">
            {t("pr.new.titleLabel")}
            <input className="text" value={finalTitle} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="field col">
            {t("pr.new.body")}
            <textarea className="pr-body" rows={5} value={finalBody} onChange={(e) => setBody(e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={draft} onChange={(e) => setDraft(e.target.checked)} />
            {t("pr.new.draft")}
          </label>
          {baseTip && (
            <div className="pr-commits">
              <div className="muted small">
                {empty ? t("pr.new.noCommits", { base: chosenBase ?? "" }) : t("pr.new.commits", { n: commits.length })}
              </div>
              {!empty && (
                <ul>
                  {commits.slice(0, LISTED).map((c) => (
                    <li key={c.id}>
                      <code>{c.id.slice(0, 7)}</code> {c.summary}
                    </li>
                  ))}
                  {commits.length > LISTED && (
                    <li className="muted">{t("pr.new.more", { n: commits.length - LISTED })}</li>
                  )}
                </ul>
              )}
            </div>
          )}
        </fieldset>
        {need.kind !== "none" && (
          <p className="note warn">
            {need.kind === "missing" ? (
              <Rich k="pr.new.missing" vars={{ branch: head, remote }} />
            ) : (
              <Rich k="pr.new.ahead" vars={{ branch: head, remote, n: need.n }} />
            )}
          </p>
        )}
        {problem?.kind === "exists" && (
          <div className="note pr-problem">
            <span>{t("pr.new.exists", { label: `${noun} ${prTag(kind, problem.number)}` })}</span>
            <button type="button" onClick={() => p.onOpenUrl(problem.url)}>
              {t("pr.open")}
            </button>
          </div>
        )}
        {problem?.kind === "refused" && target && (
          <div className="note warn pr-problem">
            <span>{t("pr.new.refused", { forge: FORGE_NAME[target.kind], error: problem.message })}</span>
            <button type="button" onClick={() => p.onConnect(target)}>
              {t("pr.connect", { forge: FORGE_NAME[target.kind] })}
            </button>
          </div>
        )}
        {problem?.kind === "error" && (
          <p className="note warn">{t("pr.new.failed", { noun, error: problem.message })}</p>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={p.onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={!canSend}>
            {need.kind === "none" ? t("pr.new.go", { noun }) : t("pr.new.pushGo", { noun })}
          </button>
        </div>
      </form>
    </div>
  );
}
