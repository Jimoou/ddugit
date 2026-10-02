import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import type { LicenseStatus } from "../types";

/** The store page (Lemon Squeezy). Empty until the store opens: then no buy button shows. */
export const BUY_URL = "";

/**
 * Settings → license. Free for personal and open-source use; a company pastes
 * the license text it bought. It is checked on this computer only, with no
 * account and no network (so air-gapped sites work the same), and nothing is
 * ever locked without one.
 */
export function LicenseSection() {
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.licenseStatus().then(
      (s) => live && setStatus(s),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  const act = async (f: () => Promise<LicenseStatus>) => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await f());
      setText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const lic = status?.license;

  return (
    <section className="license">
      <h4>{t("license.title")}</h4>
      {lic ? (
        <>
          <p>
            <b>{lic.name}</b> · {t(lic.kind === "site" ? "license.kind.site" : "license.kind.commercial")} ·{" "}
            {t("license.seats", { n: lic.seats })}
          </p>
          <p className="muted small">{t("license.updates", { date: lic.updatesUntil, email: lic.email })}</p>
          {status?.newerThanLicense && <p className="note">{t("license.newer", { date: lic.updatesUntil })}</p>}
          <button className="danger" disabled={busy} onClick={() => void act(() => api.licenseRemove())}>
            {t("license.remove")}
          </button>
        </>
      ) : (
        <>
          <p className="muted small">{t("license.free")}</p>
          {status && !status.checkable ? (
            <p className="note">{t("license.devBuild")}</p>
          ) : (
            <>
              <textarea
                className="license-text"
                rows={3}
                aria-label={t("license.paste")}
                placeholder="DDUGIT1.…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="row">
                <button
                  className="primary"
                  disabled={busy || !text.trim()}
                  onClick={() => void act(() => api.licenseInstall(text))}
                >
                  {t("license.apply")}
                </button>
                {BUY_URL && <button onClick={() => void api.openUrl("", BUY_URL)}>{t("license.buy")}</button>}
              </div>
            </>
          )}
        </>
      )}
      {error && <p className="note warn">{error}</p>}
    </section>
  );
}
