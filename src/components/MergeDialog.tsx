import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { useDialog } from "./useDialog";

interface Props {
  source: string;
  target: string;
  sourceColor: string;
  targetColor: string;
  switchesBranch: boolean;
  dirty: number;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}

export function MergeDialog(p: Props) {
  const dialog = useDialog(p.onCancel);
  return (
    <div className="scrim" onClick={p.onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} {...dialog}>
        <div className="eyebrow">{t("merge.title")}</div>
        <div className="merge-flow">
          <span className="chip-lg" style={{ ["--c" as string]: p.sourceColor }}>
            {p.source}
          </span>
          <span className="flow-arrow" aria-hidden>
            <i />
          </span>
          <span className="chip-lg" style={{ ["--c" as string]: p.targetColor }}>
            {p.target}
          </span>
        </div>
        <p>
          <Rich k="merge.body" vars={{ source: p.source, target: p.target }} />
        </p>
        {p.switchesBranch && <p className="note">{t("merge.switch", { target: p.target })}</p>}
        {p.dirty > 0 && <p className="note warn">{t("merge.dirty", { n: p.dirty })}</p>}
        <div className="dialog-actions">
          <button onClick={p.onCancel}>{t("common.cancel")}</button>
          <button className="primary" autoFocus disabled={p.busy} onClick={p.onConfirm}>
            {p.busy ? t("merge.going") : t("merge.go")}
          </button>
        </div>
      </div>
    </div>
  );
}
