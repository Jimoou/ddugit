// What's left on screen when rendering throws: a tab shows a short notice in
// its place (the other tabs keep working), and a crash outside any tab shows
// the same over the whole window. Either way the error goes to the session log
// and can be reported from here, since the rest of the UI may be gone.

import { Component, type ReactNode, useState } from "react";
import { t } from "../i18n";
import { logError } from "../report";
import { ReportDialog } from "./Report";

interface BoundaryProps {
  children: ReactNode;
  fallback(error: Error, reset: () => void): ReactNode;
}

/** Catches what its children throw while rendering. A class: React has no hook for this. */
export class Boundary extends Component<BoundaryProps, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown) {
    logError("render", error);
  }

  render() {
    const { error } = this.state;
    return error ? this.props.fallback(error, () => this.setState({ error: null })) : this.props.children;
  }
}

interface TabCrashProps {
  error: Error;
  active: boolean;
  /** Mount the tab again from scratch. */
  onReload(): void;
  onReport(error: string): void;
}

/** A tab whose view threw: say so, and offer to start it again or report it. */
export function TabCrash({ error, active, onReload, onReport }: TabCrashProps) {
  return (
    <div className="welcome crashed" hidden={!active} role="alert">
      <p>{t("crash.tab")}</p>
      <p className="muted small">{t("crash.tabHint")}</p>
      <div className="row">
        <button className="primary" onClick={onReload}>
          {t("crash.reloadTab")}
        </button>
        <button onClick={() => onReport(String(error))}>{t("report.title")}</button>
      </div>
    </div>
  );
}

/** The whole window threw: only reloading (or reporting) is left. */
export function AppCrash({ error }: { error: Error }) {
  const [reporting, setReporting] = useState(false);
  const [sent, setSent] = useState(false);
  return (
    <div className="welcome crashed" role="alert">
      <p>{t("crash.app")}</p>
      {sent && <p className="note">{t("report.sent")}</p>}
      <div className="row">
        <button className="primary" onClick={() => window.location.reload()}>
          {t("crash.reload")}
        </button>
        <button onClick={() => setReporting(true)}>{t("report.title")}</button>
      </div>
      {reporting && (
        <ReportDialog
          lastError={String(error)}
          onSent={() => {
            setReporting(false);
            setSent(true);
          }}
          onClose={() => setReporting(false)}
        />
      )}
    </div>
  );
}
