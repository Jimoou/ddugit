import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { GitOutput } from "./GitOutput";
import { Modal } from "./Modal";

interface Props {
  /** `diverged`: pull couldn't fast-forward. `rejected`: push refused. */
  kind: "diverged" | "rejected";
  /** git's own words, for the details. */
  output: string;
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

/** The upstream's commits: the trunk's colour, as the theme draws it. */
const THEIRS = "var(--cyan)";

/** Tiny fork diagram: shared base, my commits above, theirs below. */
function Fork({ ahead, behind, color }: { ahead: number; behind: number; color: string }) {
  const dots = (n: number, y: number, c: string) =>
    Array.from({ length: Math.min(n, 5) }, (_, i) => (
      <circle
        key={`${y}-${i}`}
        cx={70 + i * 34}
        cy={y}
        r={5}
        style={{ fill: "var(--bg)", stroke: c }}
        strokeWidth={2}
      />
    ));
  return (
    <svg className="fork" viewBox="0 0 260 80" role="img" aria-label={t("sync.fork", { ahead, behind })}>
      <path d="M14 40 C 40 40, 40 18, 66 18 L 240 18" style={{ stroke: color }} />
      <path d="M14 40 C 40 40, 40 62, 66 62 L 240 62" style={{ stroke: THEIRS }} />
      <circle cx={14} cy={40} r={5} style={{ fill: "var(--bg)", stroke: "var(--muted)" }} strokeWidth={2} />
      {dots(ahead, 18, color)}
      {dots(behind, 62, THEIRS)}
    </svg>
  );
}

export function SyncDialog(p: Props) {
  const andPush = p.kind === "rejected";
  return (
    <Modal
      onClose={p.onCancel}
      title={andPush ? t("sync.rejected") : t("sync.diverged")}
      actions={
        <>
          <button onClick={p.onCancel}>{t("common.cancel")}</button>
        </>
      }
    >
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
        <span style={{ color: THEIRS }}>{t("sync.theirs", { n: p.behind })}</span>
      </div>
      {p.output.trim() && <GitOutput text={p.output} />}
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
    </Modal>
  );
}
