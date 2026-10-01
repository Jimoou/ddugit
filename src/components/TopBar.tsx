import { isTauri } from "../api";
import type { HeadInfo, Progress, RemoteOp } from "../types";

interface Props {
  repoName: string;
  repoPath: string;
  head: HeadInfo;
  headColor: string;
  changeCount: number;
  busy: boolean;
  /** Remote operation currently running, for its spinner. */
  remoteBusy: RemoteOp | null;
  progress: Progress | null;
  animate: boolean;
  onOpenRepo(): void;
  onCompose(): void;
  onRefresh(): void;
  onRemote(op: RemoteOp): void;
  onToggleAnimate(): void;
}

/** git's progress phases in Korean; unknown phases are shown as-is. */
const PHASE: Record<string, string> = {
  "Enumerating objects": "목록 작성",
  "Counting objects": "개수 세는 중",
  "Compressing objects": "압축 중",
  "Writing objects": "올리는 중",
  "Receiving objects": "받는 중",
  "Resolving deltas": "정리 중",
  "Updating files": "파일 갱신",
};

const REMOTE: { op: RemoteOp; icon: string; label: string; title: string }[] = [
  { op: "fetch", icon: "⟳", label: "Fetch", title: "원격의 새 커밋을 가져오기만 합니다 (작업 트리는 그대로)" },
  { op: "pull", icon: "↓", label: "Pull", title: "원격 커밋을 받아 현재 브랜치에 반영합니다" },
  { op: "push", icon: "↑", label: "Push", title: "내 커밋을 원격에 올립니다" },
];

export function TopBar(p: Props) {
  const { head } = p;
  const badge = (op: RemoteOp) => (op === "pull" ? head.behind : op === "push" ? head.ahead : 0);

  return (
    <header className="topbar">
      <h1 className="wordmark small">
        otgit<span>옷깃</span>
      </h1>
      <button className="repo" onClick={p.onOpenRepo} title={p.repoPath}>
        {p.repoName} <span className="muted">▾</span>
      </button>
      <span className="branch-now" style={{ ["--c" as string]: p.headColor }}>
        ◉ {head.branch ?? (head.target ? `detached @ ${head.target.slice(0, 7)}` : "빈 저장소")}
      </span>
      {head.upstream && <span className="upstream muted">⇄ {head.upstream}</span>}
      {!isTauri && <span className="demo-pill">데모 모드</span>}
      <div className="spacer" />

      <div className="remote-group">
        {REMOTE.map(({ op, icon, label, title }) => {
          const n = badge(op);
          const running = p.remoteBusy === op || (op === "pull" && p.remoteBusy?.startsWith("pull"));
          return (
            <button
              key={op}
              className={`ghost remote ${running ? "running" : ""}`}
              disabled={p.busy}
              title={op === "push" && !head.upstream ? "처음 push: 원격에 브랜치를 만들고 연결합니다" : title}
              onClick={() => p.onRemote(op)}
            >
              <span className="ico">{icon}</span>{" "}
              {running && p.progress ? `${PHASE[p.progress.phase] ?? p.progress.phase} ${p.progress.percent}%` : label}
              {n > 0 && !running && <span className={`count ${op}`}>{n}</span>}
              {running && p.progress && (
                <span className="progress" title={p.progress.phase}>
                  <i style={{ width: `${p.progress.percent}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <button className="ghost" onClick={p.onCompose} disabled={p.busy}>
        ＋ 커밋 {p.changeCount > 0 && <span className="count">{p.changeCount}</span>}
      </button>
      <button className="ghost" onClick={p.onRefresh} title="새로고침">
        ⟲
      </button>
      <button className={`ghost ${p.animate ? "on" : ""}`} title="반짝임 효과" onClick={p.onToggleAnimate}>
        ✦
      </button>
    </header>
  );
}
