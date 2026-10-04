import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import type { LicenseRefresh, LicenseStatus } from "../types";

/** The store page (Lemon Squeezy). Empty until the store opens: then no buy button shows. */
export const BUY_URL = "";

/** The account page, where subscriptions are bought and renewed. */
const ACCOUNT_URL = "https://ddugit.com/account";

/**
 * At startup: a subscription license near or past its expiry asks ddugit.com
 * for a renewed one, quietly. Offline or lapsed changes nothing but a reminder;
 * nothing is ever locked.
 */
export function useLicenseRenewal(remind: (text: string) => void) {
  useEffect(() => {
    let live = true;
    void (async () => {
      const s = await api.licenseStatus().catch(() => null);
      const expires = s?.license?.expires;
      if (!expires || !live) return;
      const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10);
      if (!s.expired && expires > soon) return;
      const r = await api.licenseRefresh().catch(() => null);
      if (live && s.expired && r !== "renewed") remind(t("license.lapsedToast", { date: expires }));
    })();
    return () => {
      live = false;
    };
  }, [remind]);
}

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
  const [renewal, setRenewal] = useState<LicenseRefresh | null>(null);

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
  const renew = async () => {
    setBusy(true);
    setError(null);
    try {
      setRenewal(await api.licenseRefresh());
      setStatus(await api.licenseStatus());
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="license">
      <h4>{t("license.title")}</h4>
      {lic ? (
        <>
          <p>
            <b>{lic.name}</b> · {t(lic.kind === "site" ? "license.kind.site" : "license.kind.commercial")} ·{" "}
            {t("license.seats", { n: lic.seats })}
          </p>
          {lic.expires ? (
            <p className="muted small">
              {t(lic.plan === "yearly" ? "license.plan.yearly" : "license.plan.monthly")} ·{" "}
              {t("license.until", { date: lic.expires, email: lic.email })}
            </p>
          ) : (
            <p className="muted small">{t("license.updates", { date: lic.updatesUntil, email: lic.email })}</p>
          )}
          {status?.expired && <p className="note license-lapsed">{t("license.lapsed", { date: lic.expires ?? "" })}</p>}
          {!lic.expires && status?.newerThanLicense && (
            <p className="note">{t("license.newer", { date: lic.updatesUntil })}</p>
          )}
          {renewal && <p className="muted small license-renewal">{t(`license.refresh.${renewal}`)}</p>}
          <div className="row">
            {lic.expires && (
              <button disabled={busy} onClick={() => void renew()}>
                {t("license.refresh")}
              </button>
            )}
            {status?.expired && (
              <button onClick={() => void api.openUrl("", ACCOUNT_URL)}>{t("license.account")}</button>
            )}
            <button className="danger" disabled={busy} onClick={() => void act(() => api.licenseRemove())}>
              {t("license.remove")}
            </button>
          </div>
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
