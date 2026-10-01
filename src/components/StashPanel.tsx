import { fmtTime, stashTitle } from "../format";
import type { FileDiff, StashInfo } from "../types";
import { ChangedFiles } from "./ChangedFiles";

interface Props {
  stash: StashInfo;
  /** Changed tracked files; `null` while loading. */
  files: FileDiff[] | null;
  busy: boolean;
  onClose(): void;
  onSelectBase(): void;
  onOpenFile(path: string): void;
  onPop(): void;
  onApply(): void;
  onDrop(): void;
}

export function StashPanel({ stash, files, busy, onClose, onSelectBase, onOpenFile, onPop, onApply, onDrop }: Props) {
  return (
    <aside className="panel stash-panel" style={{ ["--accent" as string]: "var(--amber)" }}>
      <header>
        <div>
          <div className="eyebrow">스태시 · stash@{`{${stash.index}}`}</div>
          <h2>{stashTitle(stash.message)}</h2>
        </div>
        <button className="icon" onClick={onClose} title="닫기 (Esc)">
          ✕
        </button>
      </header>

      <dl className="meta">
        <dt>보관한 시간</dt>
        <dd>{fmtTime(stash.time, false)}</dd>
        <dt>기준 커밋</dt>
        <dd>
          <code className="sha link" onClick={onSelectBase}>
            {stash.base.slice(0, 7)}
          </code>
        </dd>
      </dl>

      <ChangedFiles files={files} onOpen={onOpenFile} />
      <p className="tip">추적하지 않던 새 파일은 목록에 나오지 않지만 함께 보관돼 있어요.</p>

      <div className="actions">
        <button className="primary" disabled={busy} onClick={onPop}>
          꺼내기 (pop)
        </button>
        <button disabled={busy} onClick={onApply}>
          적용만 하기 (apply · 보관 유지)
        </button>
        <button className="danger ghost" disabled={busy} onClick={onDrop}>
          삭제 (drop)
        </button>
      </div>
    </aside>
  );
}
