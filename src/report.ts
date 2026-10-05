// Problem reports: an in-memory log of what went wrong this session (backend
// command errors and uncaught frontend errors), and the text a report is made
// of. Nothing here leaves the computer by itself; the report dialog shows the
// text first and sends it to ddugit.com only when asked, and everything that came from the user's machine is redacted.

import { redact } from "./redact";

/** Lines of the log a report carries. */
export const REPORT_LINES = 50;
/** Entries kept; older ones fall off. */
const KEEP = 200;
/** A toast this soon after a command failed with the same text is that failure. */
const FRESH_MS = 10_000;

export interface LogEntry {
  at: number;
  /** `cmd:<name>` for a backend command, `window` for an uncaught error. */
  source: string;
  text: string;
}

const entries: LogEntry[] = [];

/** Keep `err` in the session log (raw; redacted only when a report is made). */
export function logError(source: string, err: unknown, at = Date.now()) {
  const text = errorText(err);
  if (!text) return;
  entries.push({ at, source, text });
  if (entries.length > KEEP) entries.splice(0, entries.length - KEEP);
}

/** The newest `n` entries, oldest first. */
export const recentLog = (n = REPORT_LINES): LogEntry[] => entries.slice(-n);

export function clearLog() {
  entries.length = 0;
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.stack && !err.stack.startsWith(err.message) ? err.stack : String(err);
  return String(err ?? "").trim();
}

/** Rejections that are answers, not faults: nothing to report. */
const EXPECTED = [/^Cancelled$/, /ddugit Pro feature/];

/**
 * An error toast's text is an unexpected failure (worth a report) when a backend
 * command just failed with it. git's own refusals come back as results, not
 * failures, and never match; neither do cancellations and the Pro line.
 */
export function isUnexpected(toastText: string, now = Date.now()): boolean {
  return entries.some(
    (e) =>
      e.source.startsWith("cmd:") &&
      now - e.at < FRESH_MS &&
      toastText.includes(e.text) &&
      !EXPECTED.some((re) => re.test(e.text)),
  );
}

/** Uncaught errors and rejections go to the log (they are not shown as toasts). */
export function captureErrors(target: Window) {
  target.addEventListener("error", (e) => logError("window", e.error ?? e.message));
  target.addEventListener("unhandledrejection", (e) => logError("window", e.reason));
}

export interface Facts {
  version: string;
  os: string;
  osVersion: string;
  arch: string;
  /** `git --version`, or why it couldn't run. */
  git: string;
  /** The system's language tag and the app's language. */
  locale: string;
  plan: string;
  lastError: string | null;
  log: LogEntry[];
}

/** The diagnostics block of a report: plain lines, redacted, nothing that names the user's work. */
export function diagnostics(f: Facts): string {
  const lines = [
    `ddugit ${f.version}`,
    `OS: ${f.os} ${f.osVersion} (${f.arch})`,
    `Git: ${redact(f.git)}`,
    `Locale: ${f.locale}`,
    `Plan: ${f.plan}`,
  ];
  if (f.lastError) lines.push("", "Last error:", redact(f.lastError));
  if (f.log.length) {
    lines.push("", `Log (last ${f.log.length}):`);
    for (const e of f.log) {
      const one = redact(e.text).replace(/\s*\n\s*/g, " | ");
      lines.push(`${new Date(e.at).toISOString()} [${e.source}] ${one}`);
    }
  }
  return lines.join("\n");
}

/** The whole report as text: what happened, the reply address, then diagnostics. */
export function reportText(what: string, email: string, diag: string): string {
  return [what.trim(), email.trim() && `Reply to: ${email.trim()}`, "---", diag].filter(Boolean).join("\n\n");
}
