import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";

/** How often a long-running window looks again. */
const EVERY = 6 * 60 * 60 * 1000;

/**
 * The "new version" notice: checks at startup and every few hours (release
 * builds; the demo when `__ddugitDemo.update` is set) and installs on request.
 * "Later" hides that version until the next start.
 */
export function UpdateNotice({ onError }: { onError: (text: string) => void }) {
  const [version, setVersion] = useState<string | null>(null);
  const [later, setLater] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // An unreachable or broken manifest just means no notice.
    const check = () =>
      api.updateCheck().then(
        (u) => setVersion(u?.version ?? null),
        () => {},
      );
    void check();
    const timer = setInterval(check, EVERY);
    return () => clearInterval(timer);
  }, []);

  if (!version || version === later) return null;
  const install = () => {
    setBusy(true);
    api.updateInstall().then(
      () => setVersion(null),
      (e) => {
        setBusy(false);
        onError(t("update.failed", { error: String(e) }));
      },
    );
  };
  return (
    <div className="update-notice" role="status">
      <span>{t("update.available", { version })}</span>
      <button className="primary" disabled={busy} onClick={install}>
        {busy ? t("update.installing") : t("update.install")}
      </button>
      {!busy && (
        <button className="ghost" onClick={() => setLater(version)}>
          {t("update.later")}
        </button>
      )}
    </div>
  );
}
