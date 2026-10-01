import { NEON } from "../graph/scene";

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
    <svg className="fork" viewBox="0 0 260 80" role="img" aria-label={`내 커밋 ${ahead}개, 원격 커밋 ${behind}개`}>
      <path d="M14 40 C 40 40, 40 18, 66 18 L 240 18" stroke={color} />
      <path d="M14 40 C 40 40, 40 62, 66 62 L 240 62" stroke={NEON[0]} />
      <circle cx={14} cy={40} r={5} fill="#0a0814" stroke="#aaa" strokeWidth={2} />
      {dots(ahead, 18, color)}
      {dots(behind, 62, NEON[0])}
    </svg>
  );
}

export function SyncDialog(p: Props) {
  const then = p.kind === "rejected" ? "하고 Push" : "";
  return (
    <div className="scrim" onClick={p.onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">{p.kind === "rejected" ? "Push 거부됨" : "갈라진 이력"}</div>
        <p>
          {p.kind === "rejected" ? (
            <>
              <b>{p.upstream}</b>에 내가 아직 받지 않은 커밋이 있어서 push가 거부됐어요. 어떻게 올릴까요?
            </>
          ) : (
            <>
              <b>{p.branch}</b>와 <b>{p.upstream}</b>이 갈라졌어요. 어떻게 합칠까요?
            </>
          )}
        </p>
        <Fork ahead={p.ahead} behind={p.behind} color={p.color} />
        <div className="legend">
          <span style={{ color: p.color }}>● 내 커밋 {p.ahead}개</span>
          <span style={{ color: NEON[0] }}>● 원격 커밋 {p.behind}개</span>
        </div>
        <div className="choices">
          <button disabled={p.busy} onClick={p.onMerge}>
            <b>병합{then}</b>
            <span className="muted">두 갈래를 병합 커밋으로 잇습니다. 이력이 그대로 남아요.</span>
          </button>
          <button disabled={p.busy} onClick={p.onRebase}>
            <b>리베이스{then}</b>
            <span className="muted">내 커밋을 원격 위로 옮겨 일직선으로 만듭니다. 이미 공유한 커밋이면 피하세요.</span>
          </button>
          {p.kind === "rejected" && (
            <button className="danger ghost" disabled={p.busy} onClick={p.onForce}>
              <b>덮어쓰기 (강제 push)</b>
              <span className="muted">
                원격에만 있는 커밋 {p.behind}개를 지우고 {p.upstream}을(를) 내 이력으로 바꿉니다. 커밋을
                정리(rebase·amend)해서 생긴 이전 버전들이라면 이게 맞아요. 다른 사람의 커밋이 섞여 있으면 병합이나
                리베이스를 고르세요. 이 창을 연 뒤에 누가 또 올리면 git이 거부합니다(--force-with-lease).
              </span>
            </button>
          )}
        </div>
        <div className="dialog-actions">
          <button onClick={p.onCancel}>취소</button>
        </div>
      </div>
    </div>
  );
}
