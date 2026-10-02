import { Icon } from "./Icon";
import { SideSection } from "./Sidebar";
import { useState } from "react";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import type { ForgeKind, ForgeStatus, PrReport, PullRequest, RefInfo } from "../types";

export const FORGE_NAME: Record<ForgeKind, string> = { github: "GitHub", gitlab: "GitLab" };

/** `#12` on GitHub, `!12` on GitLab; prefixed with the remote when several forges are in play. */
export function prLabel(pr: PullRequest, report: PrReport): string {
  const kind = report.forges.find((f) => f.remote === pr.remote)?.kind ?? "github";
  const tag = `${kind === "gitlab" ? "!" : "#"}${pr.number}`;
  return report.forges.length > 1 ? `${pr.remote} ${tag}` : tag;
}

/** Pull requests as graph labels on their head commits (only those in the loaded history). */
export function prRefs(report: PrReport | null, has: (id: string) => boolean): RefInfo[] {
  if (!report) return [];
  return report.prs
    .filter((p) => has(p.sha))
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

/** Where to make a token with just enough access to read pull requests. */
export function tokenPage(f: Pick<ForgeStatus, "kind" | "host">): string {
  return f.kind === "github"
    ? `https://${f.host}/settings/tokens/new?scopes=repo&description=ddugit`
    : `https://${f.host}/-/user_settings/personal_access_tokens?name=ddugit&scopes=read_api`;
}

/** Sidebar section: open pull requests, or a way to connect the forge. */
export function PullSection(p: {
  report: PrReport | null;
  onShow(pr: PullRequest): void;
  onMenu(pr: PullRequest, x: number, y: number): void;
  onOpen(pr: PullRequest): void;
  onConnect(forge: ForgeStatus): void;
}) {
  const { report } = p;
  if (!report?.forges.length) return null;
  const blocked = needsToken(report);
  const failed = report.forges.find((f) => f.error);
  const saved = report.forges.find((f) => f.token === "keychain");
  return (
    <SideSection
      id="pulls"
      className="pulls"
      title={t("pr.section")}
      count={report.prs.length}
      actions={
        // A saved token can be replaced or forgotten; a CLI login is managed by `gh` / `glab` itself.
        saved &&
        !blocked && (
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
    >
      {blocked && (
        <div className="pr-connect">
          <p className="muted">
            {blocked.unauthorized
              ? t("pr.refused", { forge: FORGE_NAME[blocked.kind] })
              : t("pr.hint", { forge: FORGE_NAME[blocked.kind] })}
          </p>
          <button onClick={() => p.onConnect(blocked)}>{t("pr.connect", { forge: FORGE_NAME[blocked.kind] })}</button>
        </div>
      )}
      {failed && <p className="muted pr-error">{t("pr.failed", { error: failed.error ?? "" })}</p>}
      {!blocked && !failed && report.prs.length === 0 && <p className="muted pr-empty">{t("pr.none")}</p>}
      <ul>
        {report.prs.map((pr) => (
          <li
            key={`${pr.remote}:${pr.number}`}
            title={`${pr.title}\n${pr.branch} · ${pr.author}`}
            onClick={() => p.onShow(pr)}
            onDoubleClick={() => p.onOpen(pr)}
            onContextMenu={(e) => {
              e.preventDefault();
              p.onMenu(pr, e.clientX, e.clientY);
            }}
          >
            <span className={`pr-ci ${pr.checks ?? "none"}`} title={t(`pr.checks.${pr.checks ?? "none"}`)} />
            <span className="pr-num">{prLabel(pr, report)}</span>
            <span className="name">{pr.title}</span>
            {pr.review && pr.review !== "required" && (
              <span className={`chip review ${pr.review}`}>{t(`pr.review.${pr.review}`)}</span>
            )}
            {pr.draft && <span className="chip">{t("pr.draft")}</span>}
          </li>
        ))}
      </ul>
    </SideSection>
  );
}

/** Paste a token for a forge (kept in the OS keychain); or forget the saved one. */
export function TokenDialog(p: {
  forge: ForgeStatus;
  busy: boolean;
  onSave(token: string | null): void;
  onOpenPage(url: string): void;
  onCancel(): void;
}) {
  const [token, setToken] = useState("");
  const name = FORGE_NAME[p.forge.kind];
  const page = tokenPage(p.forge);
  return (
    <div className="scrim" onClick={p.onCancel}>
      <div
        className="dialog token-dialog"
        role="dialog"
        aria-label={t("pr.token.title", { forge: name })}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && p.onCancel()}
      >
        <div className="eyebrow">{t("pr.token.title", { forge: name })}</div>
        <p>
          <Rich k={p.forge.kind === "github" ? "pr.token.cli.gh" : "pr.token.cli.glab"} vars={{ host: p.forge.host }} />
        </p>
        <p className="muted">{t("pr.token.paste", { host: p.forge.host })}</p>
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
