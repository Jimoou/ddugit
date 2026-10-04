import { api } from "../api";
import { t } from "../i18n";
import { closeProOffer, FREE_DASHBOARD, usePro, useProOffer } from "../pro";
import { BUY_URL } from "./License";

/** "This is a Pro feature": what it unlocks, the trial, and where to get it. */
export function ProOffer({ onLicense }: { onLicense(): void }) {
  const feature = useProOffer();
  const status = usePro();
  if (!feature) return null;
  return (
    <div className="scrim" onClick={closeProOffer}>
      <div
        className="dialog pro-offer"
        role="dialog"
        aria-label={t("pro.title")}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && closeProOffer()}
      >
        <div className="eyebrow">{t("pro.title")}</div>
        <p>
          <b>{t(`pro.feature.${feature}`, { n: FREE_DASHBOARD })}</b>
        </p>
        <p className="muted">{t("pro.body")}</p>
        <ul className="pro-list">
          <li>{t("pro.list.pulls")}</li>
          <li>{t("pro.list.backport")}</li>
          <li>{t("pro.list.dashboard")}</li>
          <li>{t("pro.list.transfer")}</li>
        </ul>
        {status?.source === "free" && <p className="note">{t("pro.trialOver")}</p>}
        <div className="dialog-actions">
          <button onClick={closeProOffer}>{t("common.close")}</button>
          <button
            onClick={() => {
              closeProOffer();
              onLicense();
            }}
          >
            {t("pro.haveLicense")}
          </button>
          <button className="primary" onClick={() => void api.openUrl("", BUY_URL)}>
            {t("pro.buy")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A small lock beside a Pro control while Pro is closed. */
export function ProBadge() {
  return (
    <span className="pro-badge" title={t("pro.title")}>
      PRO
    </span>
  );
}
