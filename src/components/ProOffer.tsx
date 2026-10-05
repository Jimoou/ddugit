import { t } from "../i18n";
import { openLink } from "../share";
import { closeProOffer, FREE_DASHBOARD, type ProFeature, useProOffer } from "../pro";
import { BUY_URL } from "./License";
import { closeOnScrim, useDialog } from "./useDialog";

/** "This is a Pro feature": what it unlocks, the price, and where to get it. */
export function ProOffer({ onLicense }: { onLicense(): void }) {
  const feature = useProOffer();
  return feature ? <Offer feature={feature} onLicense={onLicense} /> : null;
}

function Offer({ feature, onLicense }: { feature: ProFeature; onLicense(): void }) {
  const dialog = useDialog(closeProOffer);
  return (
    <div className="scrim" {...closeOnScrim(closeProOffer)}>
      <div className="dialog pro-offer" aria-label={t("pro.title")} onClick={(e) => e.stopPropagation()} {...dialog}>
        <h2 className="dialog-title">{t("pro.title")}</h2>
        <p>
          <b>{t(`pro.feature.${feature}`, { n: FREE_DASHBOARD })}</b>
        </p>
        <p className="muted">{t("pro.body")}</p>
        <ul className="pro-list">
          <li>{t("pro.list.pulls")}</li>
          <li>{t("pro.list.backport")}</li>
          <li>{t("pro.list.dashboard", { n: FREE_DASHBOARD })}</li>
          <li>{t("pro.list.transfer")}</li>
          <li>{t("pro.list.stack")}</li>
          <li>{t("pro.list.notes")}</li>
          <li>{t("pro.list.batch")}</li>
        </ul>
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
          <button className="primary" onClick={() => openLink(BUY_URL)}>
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
