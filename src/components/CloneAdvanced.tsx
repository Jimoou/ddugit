import { useState } from "react";
import type { CloneDraft } from "../cloneOptions";
import { t } from "../i18n";

interface Props {
  value: CloneDraft;
  onChange(next: CloneDraft): void;
  disabled: boolean;
  /** What is wrong with the draft, said under it. */
  error: string | null;
}

/** The clone dialog's "Advanced" part: which branch, how much history, submodules. Closed unless used. */
export function CloneAdvanced({ value, onChange, disabled, error }: Props) {
  const set = (patch: Partial<CloneDraft>) => onChange({ ...value, ...patch });
  // Open from the start when coming back with options set (a retry after signing in).
  const [startOpen] = useState(
    () => value.branch.trim() !== "" || value.shallow || value.singleBranch || value.submodules,
  );
  return (
    <details className="clone-advanced" open={startOpen}>
      <summary>{t("clone.adv")}</summary>
      <label className="field col">
        {t("clone.adv.branch")}
        <input
          className="text"
          value={value.branch}
          placeholder={t("clone.adv.branch.placeholder")}
          disabled={disabled}
          spellCheck={false}
          onChange={(e) => set({ branch: e.target.value })}
        />
      </label>
      <div className="row">
        <label className="check">
          <input
            type="checkbox"
            checked={value.shallow}
            disabled={disabled}
            onChange={(e) => set({ shallow: e.target.checked })}
          />
          <span>{t("clone.adv.shallow")}</span>
        </label>
        {value.shallow && (
          <label className="row depth">
            <input
              className="text"
              inputMode="numeric"
              aria-label={t("clone.adv.depth")}
              value={value.depth}
              disabled={disabled}
              onChange={(e) => set({ depth: e.target.value })}
            />
            <span className="muted">{t("clone.adv.depth")}</span>
          </label>
        )}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={value.singleBranch}
          disabled={disabled}
          onChange={(e) => set({ singleBranch: e.target.checked })}
        />
        <span>{t("clone.adv.single")}</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={value.submodules}
          disabled={disabled}
          onChange={(e) => set({ submodules: e.target.checked })}
        />
        <span>{t("clone.adv.submodules")}</span>
      </label>
      {error && <p className="note warn">{error}</p>}
    </details>
  );
}
