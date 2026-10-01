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
  return (
    <div className="scrim" onClick={p.onCancel}>
      <div
        className="dialog"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === "Escape" && p.onCancel()}
      >
        <div className="eyebrow">병합</div>
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
          <b>{p.source}</b>의 체크포인트들을 <b>{p.target}</b>에 이어 붙여 새 병합 커밋을 만듭니다.
        </p>
        {p.switchesBranch && <p className="note">먼저 {p.target} 브랜치로 체크아웃한 뒤 병합해요.</p>}
        {p.dirty > 0 && (
          <p className="note warn">커밋하지 않은 변경 {p.dirty}개가 있어요. 충돌하면 git이 병합을 거부할 수 있습니다.</p>
        )}
        <div className="dialog-actions">
          <button onClick={p.onCancel}>취소</button>
          <button className="primary" autoFocus disabled={p.busy} onClick={p.onConfirm}>
            {p.busy ? "병합 중…" : "병합"}
          </button>
        </div>
      </div>
    </div>
  );
}
