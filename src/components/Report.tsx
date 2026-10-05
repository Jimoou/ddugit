// Settings → About, the problem report / question dialog, and the "git can't be
// found" notice. Nothing is sent until the user presses Send, and they see (and can
// edit) every word first.

import { useEffect, useState } from "react";
import { api } from "../api";
import { getLocale, t } from "../i18n";
import { usePro } from "../pro";
import { diagnostics, recentLog, reportText } from "../report";
import type { AppInfo, ReportKind } from "../types";
import { Segmented } from "./Segmented";
import { closeOnScrim, useDialog } from "./useDialog";

const SITE_URL = "https://ddugit.com";
const PRIVACY_URL = "https://ddugit.com/privacy";
const GIT_DOWNLOAD_URL = "https://git-scm.com/download";

const open = (url: string) => void api.openUrl("", url);

/** Settings → About: version, plan, and where to go next. */
export function AboutSection({ onReport }: { onReport(): void }) {
  const pro = usePro();
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    let live = true;
    api.appInfo().then(
      (i) => live && setInfo(i),
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return (
    <section className="about">
      <h4>{t("about.title")}</h4>
      <dl className="about-facts">
        <dt>{t("about.version")}</dt>
        <dd>{info?.version ?? "…"}</dd>
        <dt>{t("about.plan")}</dt>
        <dd>{pro ? t(pro.pro ? "pro.plan.pro" : "pro.plan.free") : "…"}</dd>
      </dl>
      <div className="row">
        <button className="primary" onClick={onReport}>
          {t("about.report")}
        </button>
        <button onClick={() => open(SITE_URL)}>ddugit.com</button>
        <button onClick={() => open(PRIVACY_URL)}>{t("about.privacy")}</button>
      </div>
      <p className="muted small">{t("about.reportHint")}</p>
    </section>
  );
}

/** Everything a report says about this computer, redacted (see `report.ts`). */
async function gather(lastError: string | null): Promise<string> {
  const [info, git, pro] = await Promise.all([
    api.appInfo().catch(() => null),
    api.gitVersion().catch((e: unknown) => `not found (${String(e)})`),
    api.proStatus().catch(() => null),
  ]);
  return diagnostics({
    version: info?.version ?? "?",
    os: info?.os ?? "?",
    osVersion: info?.osVersion ?? "",
    arch: info?.arch ?? "?",
    git,
    locale: `${navigator.language} (app: ${getLocale()})`,
    plan: pro ? (pro.pro ? "Pro" : "Free") : "?",
    lastError,
    log: recentLog(),
  });
}

interface ReportProps {
  /** The error toast it was opened from, if any. */
  lastError: string | null;
  onSent(): void;
  onClose(): void;
}

const KINDS: ReportKind[] = ["bug", "question"];

/**
 * A problem report or a question for ddugit.com: the message, an optional reply
 * address, and the diagnostics (shown and editable; on by default for a problem only).
 */
export function ReportDialog({ lastError, onSent, onClose }: ReportProps) {
  const dialog = useDialog(onClose);
  const [kind, setKind] = useState<ReportKind>("bug");
  const [what, setWhat] = useState("");
  const [email, setEmail] = useState("");
  const [withDiag, setWithDiag] = useState(true);
  const [diag, setDiag] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let live = true;
    void gather(lastError).then((d) => live && setDiag(d));
    return () => {
      live = false;
    };
  }, [lastError]);

  const diagnostics = withDiag ? diag : null;
  const copy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(reportText(what, email, diagnostics ?? ""));
      setCopied(true);
    } catch (e) {
      setError(t("report.copyFailed", { error: String(e) }));
    }
  };
  const send = async () => {
    setSending(true);
    setError(null);
    try {
      await api.sendReport({ kind, message: what, email: email.trim() || null, diagnostics });
      onSent();
    } catch (e) {
      setError(t("report.sendFailed", { error: String(e) }));
    } finally {
      setSending(false);
    }
  };
  const ready = !!what.trim() && !(withDiag && diag === null) && !sending;

  return (
    <div className="scrim" {...closeOnScrim(onClose)}>
      <div className="dialog report" onClick={(e) => e.stopPropagation()} {...dialog}>
        <h2 className="dialog-title">{t(kind === "bug" ? "report.title" : "report.askTitle")}</h2>
        <Segmented
          label={t("report.kind")}
          value={kind}
          onChange={(k) => {
            setKind(k);
            setWithDiag(k === "bug");
          }}
          options={KINDS.map((k) => ({ value: k, label: t(k === "bug" ? "report.title" : "report.ask") }))}
        />
        <label className="field col">
          {t(kind === "bug" ? "report.what" : "report.question")}
          <textarea
            rows={4}
            autoFocus
            placeholder={kind === "bug" ? t("report.whatHint") : undefined}
            value={what}
            onChange={(e) => setWhat(e.target.value)}
          />
        </label>
        <label className="field col">
          {t("report.email")}
          <input
            className="text"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={withDiag} onChange={(e) => setWithDiag(e.target.checked)} />
          {t("report.withDiag")}
        </label>
        {withDiag && (
          <>
            <textarea
              className="report-diag"
              aria-label={t("report.diag")}
              rows={8}
              spellCheck={false}
              value={diag ?? t("report.gathering")}
              disabled={diag === null}
              onChange={(e) => setDiag(e.target.value)}
            />
            <p className="muted small">{t("report.diagHint")}</p>
          </>
        )}
        {error && (
          <p className="note warn" role="alert">
            {error}
          </p>
        )}
        {copied && !error && (
          <p className="note" role="status">
            {t("report.copied")}
          </p>
        )}
        <div className="dialog-actions">
          <button onClick={onClose}>{t("common.close")}</button>
          <button disabled={!what.trim()} onClick={() => void copy()}>
            {t("report.copy")}
          </button>
          <button className="primary" disabled={!ready} onClick={() => void send()}>
            {sending ? t("report.sending") : t("report.send")}
          </button>
        </div>
      </div>
    </div>
  );
}

interface GitMissingProps {
  /** Why `git --version` failed. */
  error: string;
  onRecheck(): void;
  onSetPath(): void;
  onClose(): void;
}

/** Shown at startup when git can't be run: ddugit reads with libgit2 but writes with the git CLI. */
export function GitMissing({ error, onRecheck, onSetPath, onClose }: GitMissingProps) {
  const dialog = useDialog(onClose);
  return (
    <div className="scrim" {...closeOnScrim(onClose)}>
      <div className="dialog git-missing" onClick={(e) => e.stopPropagation()} {...dialog}>
        <h2 className="dialog-title">{t("gitMissing.title")}</h2>
        <p>{t("gitMissing.body")}</p>
        <p className="muted small">
          <code>{error}</code>
        </p>
        <div className="dialog-actions">
          <button onClick={onClose}>{t("common.close")}</button>
          <button onClick={onRecheck}>{t("gitMissing.recheck")}</button>
          <button onClick={onSetPath}>{t("gitMissing.setPath")}</button>
          <button className="primary" autoFocus onClick={() => open(GIT_DOWNLOAD_URL)}>
            {t("gitMissing.download")}
          </button>
        </div>
      </div>
    </div>
  );
}
