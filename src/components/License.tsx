import { useEffect, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { refreshPro, usePro } from "../pro";
import type { LicenseRefresh, LicenseStatus } from "../types";

/** Where to buy Pro: the pricing page (it links to the store once it opens). */
export const BUY_URL = "https://ddugit.com/pricing";

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
 * Settings → license. A Pro subscriber signs in on ddugit.com from here (the
 * browser hands the license back, `activate.rs`); an air-gapped or site license
 * is pasted. Either way it is then checked on this computer only.
 */
export function LicenseSection() {
  const pro = usePro();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [renewal, setRenewal] = useState<LicenseRefresh | null>(null);
  const [signingIn, setSigningIn] = useState(false);

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
      refreshPro();
      setText("");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  const signIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      setStatus(await api.licenseActivate());
      refreshPro();
    } catch (e) {
      if (String(e) !== "Cancelled") setError(String(e));
    } finally {
      setSigningIn(false);
    }
  };
  const lic = status?.license;
  const renew = async () => {
    setBusy(true);
    setError(null);
    try {
      setRenewal(await api.licenseRefresh());
      refreshPro();
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
      {pro && (
        <p className="license-plan">
          {pro.source === "trial"
            ? t("pro.plan.trial", { n: pro.trialDaysLeft ?? 0 })
            : pro.pro
              ? t("pro.plan.pro")
              : t("pro.plan.free")}
        </p>
      )}
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
              <div className="row">
                {signingIn ? (
                  <>
                    <span className="muted small license-waiting">{t("license.activating")}</span>
                    <button onClick={() => void api.licenseActivateCancel()}>{t("license.cancel")}</button>
                  </>
                ) : (
                  <>
                    <button className="primary" disabled={busy} onClick={() => void signIn()}>
                      {t("license.activate")}
                    </button>
                    {BUY_URL && <button onClick={() => void api.openUrl("", BUY_URL)}>{t("license.buy")}</button>}
                  </>
                )}
              </div>
              <p className="muted small">{t("license.or")}</p>
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
                  disabled={busy || signingIn || !text.trim()}
                  onClick={() => void act(() => api.licenseInstall(text))}
                >
                  {t("license.apply")}
                </button>
              </div>
            </>
          )}
        </>
      )}
      {error && <p className="note warn">{error}</p>}
    </section>
  );
}
