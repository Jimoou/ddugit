import { useEffect, useState } from "react";
import { api } from "../api";
import { type Key, t } from "../i18n";
import { copyText, openLink } from "../share";
import { refreshPro, usePro } from "../pro";
import type { LicenseStatus } from "../types";

/** Where to buy Pro: the pricing page (it links to the store once it opens). */
export const BUY_URL = "https://ddugit.com/pricing";

/** The account page, where the devices of a license are managed. */
const ACCOUNT_URL = "https://ddugit.com/account";

/** `updatesUntil` of a lifetime license: every update. */
export const LIFETIME_UPDATES = "9999-12-31";

/** How often a running app asks ddugit.com about its license again. */
const CHECK_EVERY = 24 * 3_600_000;

/**
 * At startup and about once a day: a device-bound license asks ddugit.com whether
 * it still holds, so a device removed on the website (or a refunded license) stops
 * here too. Site licenses are never asked about. Offline changes nothing.
 */
export function useLicenseCheck(remind: (text: string) => void) {
  useEffect(() => {
    let live = true;
    const check = async () => {
      const s = await api.licenseStatus().catch(() => null);
      const lic = s?.license;
      if (!lic || !live) return;
      if (!lic.device && lic.plan !== "lifetime") return;
      const r = await api.licenseRefresh().catch(() => null);
      if (!live) return;
      if (r === "removed" || r === "revoked") refreshPro();
      if (r === "removed") remind(t("license.removedToast"));
      else if (r === "revoked") remind(t("license.revokedToast"));
    };
    void check();
    const timer = setInterval(() => void check(), CHECK_EVERY);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [remind]);
}

/** Server answers (short English sentences) that have a clearer text here; others are shown as they come. */
const KNOWN: [RegExp, Key][] = [
  [/already on \d+ devices/, "license.full"],
  [/belongs to another computer/, "license.otherDevice"],
];
const explain = (e: unknown) => {
  const text = String(e);
  const known = KNOWN.find(([m]) => m.test(text));
  return known ? t(known[1]) : text;
};

const KIND: Record<string, Key> = {
  personal: "license.kind.personal",
  commercial: "license.kind.commercial",
  site: "license.kind.site",
};

/**
 * Settings → license. A buyer signs in on ddugit.com from here (the browser hands
 * back a license signed for this device, `activate.rs`) and can remove this device
 * again; an air-gapped or site license is pasted. Either way it is then checked on
 * this computer only.
 */
export function LicenseSection() {
  const pro = usePro();
  const [status, setStatus] = useState<LicenseStatus | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [asking, setAsking] = useState(false);
  // This computer's code for offline activation: read when the paste section is first opened.
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Read again whenever Pro changes (e.g. the daily check removed the license).
  useEffect(() => {
    let live = true;
    api.licenseStatus().then(
      (s) => live && setStatus(s),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [pro]);

  const act = async (f: () => Promise<LicenseStatus>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setStatus(await f());
      refreshPro();
      setText("");
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  };
  const signIn = async () => {
    setSigningIn(true);
    setError(null);
    setNotice(null);
    try {
      setStatus(await api.licenseActivate());
      refreshPro();
    } catch (e) {
      if (String(e) !== "Cancelled") setError(explain(e));
    } finally {
      setSigningIn(false);
    }
  };
  const deactivate = () =>
    act(async () => {
      const d = await api.licenseDeactivate();
      setAsking(false);
      setNotice(
        d.confirmed
          ? t("license.deactivated")
          : d.error
            ? t("license.deactivatedError", { error: d.error })
            : t("license.deactivatedOffline"),
      );
      return d.status;
    });
  const lic = status?.license;

  return (
    <section className="license">
      <h4>{t("license.title")}</h4>
      {pro && <p className="license-plan">{pro.pro ? t("pro.plan.pro") : t("pro.plan.free")}</p>}
      {lic ? (
        <>
          <p>
            <b>{lic.name}</b> · {t(KIND[lic.kind] ?? "license.kind.commercial")}
            {lic.kind !== "personal" && <> · {t("license.seats", { n: lic.seats })}</>}
          </p>
          <p className="muted small">
            {lic.expires
              ? t("license.until", { date: lic.expires, email: lic.email })
              : lic.updatesUntil === LIFETIME_UPDATES
                ? t("license.updatesLifetime", { email: lic.email })
                : t("license.updates", { date: lic.updatesUntil, email: lic.email })}
          </p>
          {lic.device && <p className="muted small license-devices">{t("license.devices")}</p>}
          {status?.otherDevice && <p className="note warn license-other">{t("license.otherDevice")}</p>}
          {status?.expired && <p className="note license-lapsed">{t("license.lapsed", { date: lic.expires ?? "" })}</p>}
          {!lic.expires && status?.newerThanLicense && (
            <p className="note">{t("license.newer", { date: lic.updatesUntil })}</p>
          )}
          {asking && <p className="note license-ask">{t("license.deactivateAsk")}</p>}
          <div className="row">
            {!lic.device ? (
              <button className="danger" disabled={busy} onClick={() => void act(() => api.licenseRemove())}>
                {t("license.remove")}
              </button>
            ) : asking ? (
              <>
                <button className="danger" disabled={busy} onClick={() => void deactivate()}>
                  {t("license.deactivateYes")}
                </button>
                <button disabled={busy} onClick={() => setAsking(false)}>
                  {t("license.cancel")}
                </button>
              </>
            ) : (
              <>
                <button className="danger" disabled={busy} onClick={() => setAsking(true)}>
                  {t("license.deactivate")}
                </button>
                <button onClick={() => openLink(ACCOUNT_URL)}>{t("license.account")}</button>
              </>
            )}
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
                    {BUY_URL && <button onClick={() => openLink(BUY_URL)}>{t("license.buy")}</button>}
                  </>
                )}
              </div>
              {/* Air-gapped and site licenses only: out of the way of the usual sign-in. */}
              <details
                className="license-paste"
                onToggle={(e) => {
                  if (e.currentTarget.open && code === null)
                    api.licenseDeviceCode().then(setCode, (err) => setError(String(err)));
                }}
              >
                <summary>{t("license.paste")}</summary>
                <p className="muted small">{t("license.offline")}</p>
                {code && (
                  <div className="row license-code">
                    <code aria-label={t("license.deviceCode")}>{code}</code>
                    <button onClick={() => copyText(code, () => setCopied(true))}>
                      {copied ? t("license.copied") : t("license.copyCode")}
                    </button>
                  </div>
                )}
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
              </details>
            </>
          )}
        </>
      )}
      {notice && <p className="note license-notice">{notice}</p>}
      {error && <p className="note warn">{error}</p>}
    </section>
  );
}
