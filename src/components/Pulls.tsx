import { Icon } from "./Icon";
import { SideSection } from "./Sidebar";
import { useState } from "react";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { offerPro } from "../pro";
import { ProBadge } from "./ProOffer";
import type { ForgeKind, ForgeStatus, PrReport, PullRequest, RefInfo } from "../types";
import { useDialog } from "./useDialog";

export const FORGE_NAME: Record<ForgeKind, string> = { github: "GitHub", gitlab: "GitLab" };
/** What the forge calls a pull request. */
export const prNoun = (kind: ForgeKind) => (kind === "gitlab" ? "MR" : "PR");
/** The noun for a repository's forges together: "MR" only when they are all GitLab. */
export const nounOf = (forges: Pick<ForgeStatus, "kind">[]) =>
  prNoun(forges.length > 0 && forges.every((f) => f.kind === "gitlab") ? "gitlab" : "github");
/** The CLI whose login a forge can borrow. */
const CLI: Record<ForgeKind, string> = { github: "gh", gitlab: "glab" };

/** `#12` on GitHub, `!12` on GitLab; prefixed with the remote when several forges are in play. */
export function prLabel(pr: PullRequest, report: PrReport): string {
  const kind = report.forges.find((f) => f.remote === pr.remote)?.kind ?? "github";
  const tag = `${kind === "gitlab" ? "!" : "#"}${pr.number}`;
  return report.forges.length > 1 ? `${pr.remote} ${tag}` : tag;
}

/** Open pull requests as graph labels on their head commits (only those in the loaded history). */
export function prRefs(report: PrReport | null, has: (id: string) => boolean): RefInfo[] {
  if (!report) return [];
  return report.prs
    .filter((p) => p.state === "open" && has(p.sha))
    .map((p) => ({
      name: prLabel(p, report),
      kind: "pr",
      target: p.sha,
      checks: p.checks,
      review: p.review,
    }));
}

/** The pull request a `pr` label stands for. */
export function prOf(report: PrReport | null, ref: RefInfo): PullRequest | undefined {
  return report?.prs.find((p) => p.sha === ref.target && prLabel(p, report) === ref.name);
}

/** A forge we can't read yet: no token, or the token was refused. */
export function needsToken(report: PrReport | null): ForgeStatus | undefined {
  return report?.forges.find((f) => f.token === "none" || f.unauthorized);
}

/** Where to make a token that can read and open pull / merge requests (GitLab: `api`, as `read_api` can't write). */
export function tokenPage(f: Pick<ForgeStatus, "kind" | "host">): string {
  return f.kind === "github"
    ? `https://${f.host}/settings/tokens/new?scopes=repo&description=ddugit`
    : `https://${f.host}/-/user_settings/personal_access_tokens?name=ddugit&scopes=api`;
}

/** Sidebar section: open pull requests (the merged and closed ones in a fold below), or a way to connect the forge. */
export function PullSection(p: {
  report: PrReport | null;
  onShow(pr: PullRequest): void;
  onMenu(pr: PullRequest, x: number, y: number): void;
  onOpen(pr: PullRequest): void;
  onConnect(forge: ForgeStatus): void;
  /** Open a new pull request from the current branch. */
  onCreate(): void;
}) {
  const { report } = p;
  if (!report?.forges.length) return null;
  const blocked = needsToken(report);
  const failed = report.forges.find((f) => f.error);
  // A private or self-hosted repository without Pro.
  const locked = report.forges.find((f) => f.locked);
  const saved = report.forges.find((f) => f.token === "keychain");
  const open = report.prs.filter((pr) => pr.state === "open");
  const done = report.prs.filter((pr) => pr.state !== "open");
  const noun = nounOf(report.forges);
  const row = (pr: PullRequest) => (
    <li
      key={`${pr.remote}:${pr.number}`}
      className={pr.state}
      title={`${pr.title}\n${pr.branch} · ${pr.author}`}
      onClick={() => p.onShow(pr)}
      onDoubleClick={() => p.onOpen(pr)}
      onContextMenu={(e) => {
        e.preventDefault();
        p.onMenu(pr, e.clientX, e.clientY);
      }}
    >
      {pr.state === "open" ? (
        <span className={`pr-ci ${pr.checks ?? "none"}`} title={t(`pr.checks.${pr.checks ?? "none"}`)} />
      ) : (
        <span className={`pr-ci ${pr.state}`} />
      )}
      <span className="pr-num">{prLabel(pr, report)}</span>
      <span className="name">{pr.title}</span>
      {pr.state !== "open" && <span className={`chip pr-state ${pr.state}`}>{t(`pr.state.${pr.state}`)}</span>}
      {pr.state === "open" && pr.review && pr.review !== "required" && (
        <span className={`chip review ${pr.review}`}>{t(`pr.review.${pr.review}`)}</span>
      )}
      {pr.state === "open" && pr.draft && <span className="chip">{t("pr.draft")}</span>}
    </li>
  );
  return (
    <SideSection
      id="pulls"
      className="pulls"
      title={t("pr.section", { noun })}
      count={open.length}
      actions={
        <>
          {
            // A saved token can be replaced or forgotten; a CLI login is managed by `gh` / `glab` itself.
            saved && !blocked && (
              <button
                className="h3-add"
                title={t("pr.token.manage")}
                aria-label={t("pr.token.manage")}
                onClick={() => p.onConnect(saved)}
              >
                <Icon name="key" />
              </button>
            )
          }
          <button
            className="h3-add"
            title={t("pr.new.button", { noun })}
            aria-label={t("pr.new.button", { noun })}
            onClick={p.onCreate}
          >
            <Icon name="plus" size={12} />
          </button>
        </>
      }
    >
      {blocked && (
        <div className="pr-connect">
          <p className="muted">
            {blocked.unauthorized
              ? t("pr.refused", { forge: FORGE_NAME[blocked.kind] })
              : t("pr.hint", { forge: FORGE_NAME[blocked.kind], noun: prNoun(blocked.kind) })}
          </p>
          <button onClick={() => p.onConnect(blocked)}>{t("pr.connect", { forge: FORGE_NAME[blocked.kind] })}</button>
        </div>
      )}
      {locked && !blocked && (
        <div className="pr-connect pr-locked">
          <p className="muted">{t("pr.locked", { forge: FORGE_NAME[locked.kind] })}</p>
          <button onClick={() => offerPro("pulls")}>
            {t("pro.unlock")} <ProBadge />
          </button>
        </div>
      )}
      {failed && <p className="muted pr-error">{t("pr.failed", { noun, error: failed.error ?? "" })}</p>}
      {!blocked && !failed && !locked && open.length === 0 && (
        <p className="muted pr-empty">{t("pr.none", { noun })}</p>
      )}
      <ul>{open.map(row)}</ul>
      {done.length > 0 && (
        <SideSection id="pulls-done" className="sub" title={t("pr.done")} count={done.length}>
          <ul>{done.map(row)}</ul>
        </SideSection>
      )}
    </SideSection>
  );
}

/** What the token dialog needs to know about a forge. */
export type TokenForge = Pick<ForgeStatus, "kind" | "host" | "public" | "token">;

/** Paste a token for a forge (kept in the OS keychain); or forget the saved one. */
export function TokenDialog(p: {
  /** A pull request forge, or the host the repository picker lists. */
  forge: TokenForge;
  busy: boolean;
  onSave(token: string | null): void;
  onOpenPage(url: string): void;
  /** Use the `gh` / `glab` login for this (not github.com / gitlab.com) host. */
  onTrustCli(): void;
  onCancel(): void;
}) {
  const [token, setToken] = useState("");
  const name = FORGE_NAME[p.forge.kind];
  const page = tokenPage(p.forge);
  const dialog = useDialog(p.onCancel);
  return (
    <div className="scrim" onClick={p.onCancel}>
      <div
        className="dialog token-dialog"
        aria-label={t("pr.token.title", { forge: name })}
        onClick={(e) => e.stopPropagation()}
        {...dialog}
      >
        <div className="eyebrow">{t("pr.token.title", { forge: name })}</div>
        {!p.forge.public && (
          // Only the remote URL says this host is a GitHub / GitLab: make sure before a token goes there.
          <p className="note warn">
            <Rich k="pr.token.foreign" vars={{ host: p.forge.host }} />
          </p>
        )}
        <p>
          <Rich k={p.forge.kind === "github" ? "pr.token.cli.gh" : "pr.token.cli.glab"} vars={{ host: p.forge.host }} />
        </p>
        {!p.forge.public && p.forge.token !== "cli" && (
          <button onClick={p.onTrustCli}>
            {t("pr.token.trustCli", { host: p.forge.host, cli: CLI[p.forge.kind] })}
          </button>
        )}
        <p className="muted">{t("pr.token.paste", { noun: prNoun(p.forge.kind) })}</p>
        <button className="token-page" onClick={() => p.onOpenPage(page)}>
          {t("pr.token.make")} <Icon name="external" size={12} />
        </button>
        <input
          className="text"
          type="password"
          autoFocus
          aria-label={t("pr.token.label")}
          placeholder={p.forge.kind === "github" ? "ghp_… / github_pat_…" : "glpat-…"}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && token.trim() && p.onSave(token.trim())}
        />
        <div className="dialog-actions">
          {p.forge.token === "keychain" && (
            <button className="danger" disabled={p.busy} onClick={() => p.onSave(null)}>
              {t("pr.token.forget")}
            </button>
          )}
          <button onClick={p.onCancel}>{t("common.cancel")}</button>
          <button className="primary" disabled={p.busy || !token.trim()} onClick={() => p.onSave(token.trim())}>
            {t("pr.token.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
