import { t } from "../i18n";
import { openLink } from "../share";
import { closeProOffer, FREE_DASHBOARD, type ProFeature, useProOffer } from "../pro";
import { BUY_URL } from "./License";
import { Modal } from "./Modal";

/** "This is a Pro feature": what it unlocks, the price, and where to get it. */
export function ProOffer({ onLicense }: { onLicense(): void }) {
  const feature = useProOffer();
  return feature ? <Offer feature={feature} onLicense={onLicense} /> : null;
}

function Offer({ feature, onLicense }: { feature: ProFeature; onLicense(): void }) {
  return (
    <Modal
      onClose={closeProOffer}
      className="pro-offer"
      label={t("pro.title")}
      title={t("pro.title")}
      actions={
        <>
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
        </>
      }
    >
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
    </Modal>
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
