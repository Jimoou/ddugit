import { NEON } from "../graph/scene";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { useDialog } from "./useDialog";

interface Props {
  /** `diverged`: pull couldn't fast-forward. `rejected`: push refused. */
  kind: "diverged" | "rejected";
  branch: string;
  upstream: string;
  ahead: number;
  behind: number;
  color: string;
  busy: boolean;
  onMerge(): void;
  onRebase(): void;
  /** Rejected push only: overwrite the upstream with `--force-with-lease`. */
  onForce(): void;
  onCancel(): void;
}

/** Tiny fork diagram: shared base, my commits above, theirs below. */
function Fork({ ahead, behind, color }: { ahead: number; behind: number; color: string }) {
  const dots = (n: number, y: number, c: string) =>
    Array.from({ length: Math.min(n, 5) }, (_, i) => (
      <circle key={`${y}-${i}`} cx={70 + i * 34} cy={y} r={5} fill="#0a0814" stroke={c} strokeWidth={2} />
    ));
  return (
    <svg className="fork" viewBox="0 0 260 80" role="img" aria-label={t("sync.fork", { ahead, behind })}>
      <path d="M14 40 C 40 40, 40 18, 66 18 L 240 18" stroke={color} />
      <path d="M14 40 C 40 40, 40 62, 66 62 L 240 62" stroke={NEON[0]} />
      <circle cx={14} cy={40} r={5} fill="#0a0814" stroke="#aaa" strokeWidth={2} />
      {dots(ahead, 18, color)}
      {dots(behind, 62, NEON[0])}
    </svg>
  );
}

export function SyncDialog(p: Props) {
  const andPush = p.kind === "rejected";
  const dialog = useDialog(p.onCancel);
  return (
    <div className="scrim" onClick={p.onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} {...dialog}>
        <h2 className="dialog-title">{andPush ? t("sync.rejected") : t("sync.diverged")}</h2>
        <p>
          {p.kind === "rejected" ? (
            <>
              <Rich k="sync.rejected.body" vars={{ upstream: p.upstream }} />
            </>
          ) : (
            <>
              <Rich k="sync.diverged.body" vars={{ branch: p.branch, upstream: p.upstream }} />
            </>
          )}
        </p>
        <Fork ahead={p.ahead} behind={p.behind} color={p.color} />
        <div className="legend">
          <span style={{ color: p.color }}>{t("sync.mine", { n: p.ahead })}</span>
          <span style={{ color: NEON[0] }}>{t("sync.theirs", { n: p.behind })}</span>
        </div>
        <div className="choices">
          <button disabled={p.busy} onClick={p.onMerge}>
            <b>{andPush ? t("sync.mergePush") : t("sync.merge")}</b>
            <span className="muted">{t("sync.merge.hint")}</span>
          </button>
          <button disabled={p.busy} onClick={p.onRebase}>
            <b>{andPush ? t("sync.rebasePush") : t("sync.rebase")}</b>
            <span className="muted">{t("sync.rebase.hint")}</span>
          </button>
          {p.kind === "rejected" && (
            <button className="danger ghost" disabled={p.busy} onClick={p.onForce}>
              <b>{t("sync.force")}</b>
              <span className="muted">{t("sync.force.hint", { n: p.behind, upstream: p.upstream })}</span>
            </button>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={p.onCancel}>{t("common.cancel")}</button>
        </div>
      </div>
    </div>
  );
}
