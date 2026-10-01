import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { fmtTime } from "../format";
import type { BackportItem, BackportState, BackportTally } from "../types";

interface Props {
  path: string;
  /** Local and remote branch names to compare. */
  branches: string[];
  /** Branches listed in the per-target overview (local ones: each customer's line). */
  targets: string[];
  source: string;
  target: string;
  /** With fewer than two remotes, explain how to add the other repository. */
  remoteCount: number;
  onAddRemote(): void;
  /** Changes whenever the repository does, so the list reloads. */
  version: unknown;
  busy: boolean;
  onPair(source: string, target: string): void;
  onSelect(id: string): void;
  /** Ids oldest first, the order they must be applied in. */
  onApply(ids: string[]): void;
  onExport(ids: string[]): void;
  onClose(): void;
}

const STATE: Record<BackportState["kind"], string> = {
  missing: "미반영",
  applied: "반영됨",
  picked: "반영됨 (-x)",
  ignored: "제외",
};

/**
 * Commits of `source` the `target` doesn't have yet (e.g. the original repo's
 * fixes vs a customer fork), with ports recognised by patch or `-x` trailer.
 */
export function BackportSheet(p: Props) {
  const { path, source, target, version } = p;
  const [items, setItems] = useState<BackportItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [view, setView] = useState<"missing" | "all" | "targets">("missing");
  const all = view === "all";
  const [reload, setReload] = useState(0);
  // Overview rows belong to one source (and repo state); others are stale.
  const tallyKey = `${source}\n${p.targets.join("\n")}`;
  const [tallies, setTallies] = useState<{ key: string; version: unknown; rows: BackportTally[] } | null>(null);
  const rows = tallies && tallies.key === tallyKey && tallies.version === version ? tallies.rows : null;

  useEffect(() => {
    if (view !== "targets") return;
    let live = true;
    api.backportSummary(path, source, p.targets).then(
      (r) => live && setTallies({ key: tallyKey, version, rows: r }),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [view, path, source, p.targets, tallyKey, version]);

  useEffect(() => {
    let live = true;
    api.backportCompare(path, source, target).then(
      (list) => {
        if (!live) return;
        setItems(list);
        setError(null);
        // Keep only selections that are still missing.
        setPicked((s) => new Set(list.filter((i) => s.has(i.id) && i.state.kind === "missing").map((i) => i.id)));
      },
      (e) => {
        if (!live) return;
        setItems([]);
        setError(String(e));
      },
    );
    return () => {
      live = false;
    };
  }, [path, source, target, version, reload]);

  const count = useMemo(() => {
    const c = { missing: 0, applied: 0, ignored: 0 };
    for (const i of items ?? []) c[i.state.kind === "picked" ? "applied" : i.state.kind]++;
    return c;
  }, [items]);
  const shown = (items ?? []).filter((i) => all || i.state.kind === "missing" || i.state.kind === "ignored");
  const missing = shown.filter((i) => i.state.kind === "missing");
  // Oldest first for cherry-pick / format-patch.
  const chosen = () =>
    (items ?? [])
      .filter((i) => picked.has(i.id))
      .reverse()
      .map((i) => i.id);
  const toggle = (id: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (!n.delete(id)) n.add(id);
      return n;
    });
  const ignore = (id: string, on: boolean) =>
    api.backportIgnore(path, target, id, on).then(
      () => setReload((r) => r + 1),
      (e) => setError(String(e)),
    );

  const select = (name: string, value: string, onChange: (v: string) => void) => (
    <select aria-label={name} value={value} onChange={(e) => onChange(e.target.value)}>
      {(p.branches.includes(value) ? p.branches : [value, ...p.branches]).map((b) => (
        <option key={b}>{b}</option>
      ))}
    </select>
  );

  return (
    <section className="diff-sheet backport-sheet" style={{ height: "50vh" }}>
      <header>
        <div className="title">
          <span className="eyebrow">백포트</span>
          {select("가져올 쪽", source, (s) => p.onPair(s, target))}
          <span className="muted">→</span>
          {select("받는 쪽", target, (t) => p.onPair(source, t))}
          {items && (
            <span className="muted">
              미반영 <b className="bp-missing">{count.missing}</b> · 반영됨 {count.applied} · 제외 {count.ignored}
            </span>
          )}
        </div>
        <div className="scope-tabs" role="tablist">
          {(
            [
              ["missing", "미반영"],
              ["all", "전체"],
              ["targets", "대상별"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={view === v ? "on" : ""}
              onClick={() => setView(v)}
            >
              {label}
            </button>
          ))}
        </div>
        <button className="icon" onClick={p.onClose} title="닫기">
          ✕
        </button>
      </header>

      <div className="bp-body">
        {error && <p className="note warn">{error}</p>}
        {view === "targets" ? (
          <Overview
            source={source}
            current={target}
            rows={rows}
            onOpen={(t) => {
              p.onPair(source, t);
              setView("missing");
            }}
          />
        ) : (
          <>
            {!items && !error && <p className="muted pad">비교하는 중…</p>}
            {items && !error && shown.length === 0 && (
              <p className="muted pad">
                {target}에 {source}의 커밋이 모두 반영돼 있어요.
                {items.length > 0 && " (전체 탭에서 반영된 커밋을 볼 수 있어요)"}
              </p>
            )}
            {shown.length > 0 && (
              <table className="bp-list">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        aria-label="미반영 모두 선택"
                        disabled={missing.length === 0}
                        checked={missing.length > 0 && missing.every((i) => picked.has(i.id))}
                        onChange={(e) => setPicked(new Set(e.target.checked ? missing.map((i) => i.id) : []))}
                      />
                    </th>
                    <th>상태</th>
                    <th>커밋</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((i) => (
                    <tr key={i.id} className={`bp-${i.state.kind}`}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`${i.summary} 선택`}
                          disabled={i.state.kind !== "missing"}
                          checked={picked.has(i.id)}
                          onChange={() => toggle(i.id)}
                        />
                      </td>
                      <td>
                        <span
                          className={`chip bp-${i.state.kind}`}
                          title={i.state.kind === "picked" ? `${i.state.by.slice(0, 7)}에서 -x로 가져옴` : undefined}
                        >
                          {STATE[i.state.kind]}
                        </span>
                      </td>
                      <td className="bp-commit" onClick={() => p.onSelect(i.id)} title="그래프에서 보기">
                        <code>{i.id.slice(0, 7)}</code> <span className="summary">{i.summary}</span>
                        <span className="muted">
                          {" "}
                          · {i.author} · {fmtTime(i.time, false)}
                        </span>
                      </td>
                      <td className="bp-actions">
                        {i.state.kind === "missing" && <button onClick={() => void ignore(i.id, true)}>제외</button>}
                        {i.state.kind === "ignored" && (
                          <button onClick={() => void ignore(i.id, false)}>제외 취소</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
        {p.remoteCount < 2 && (
          <p className="note bp-hint">
            다른 저장소(예: 원본 프로젝트 ↔ 고객사 저장소)와 비교하려면 그 저장소를 원격으로 추가하세요. 가져온 뒤
            가져올 쪽에서 <code>upstream/main</code> 같은 브랜치를 고르면 됩니다.{" "}
            <button onClick={p.onAddRemote}>원격 추가…</button>
          </p>
        )}
      </div>

      {view !== "targets" && (
        <footer className="conflict-foot">
          <span className="muted">
            {picked.size
              ? `${picked.size}개 선택 · 오래된 것부터 적용`
              : `제외: ${target}에 필요 없는 커밋 (받는 쪽마다 따로, 이 저장소에만 기록)`}
          </span>
          <button disabled={p.busy || picked.size === 0} onClick={() => p.onExport(chosen())}>
            패치로 내보내기…
          </button>
          <button className="primary" disabled={p.busy || picked.size === 0} onClick={() => p.onApply(chosen())}>
            {target}에 cherry-pick
          </button>
        </footer>
      )}
    </section>
  );
}

/** One row per target branch: how much of `source` each still lacks. */
function Overview(props: {
  source: string;
  current: string;
  rows: BackportTally[] | null;
  onOpen(target: string): void;
}) {
  const { rows } = props;
  if (!rows) return <p className="muted pad">브랜치마다 비교하는 중…</p>;
  if (rows.length === 0) return <p className="muted pad">비교할 다른 로컬 브랜치가 없어요.</p>;
  const sorted = [...rows].sort((a, b) => b.missing - a.missing || a.target.localeCompare(b.target));
  return (
    <table className="bp-list bp-overview">
      <thead>
        <tr>
          <th>받는 쪽 ({props.source}에서)</th>
          <th>미반영</th>
          <th>반영됨</th>
          <th>제외</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((r) => (
          <tr
            key={r.target}
            className={r.target === props.current ? "on" : ""}
            onClick={() => props.onOpen(r.target)}
            title="이 브랜치의 미반영 목록 보기"
          >
            <td className="bp-commit">{r.target}</td>
            <td>{r.missing > 0 ? <b className="bp-missing">{r.missing}</b> : <span className="muted">0</span>}</td>
            <td>{r.applied}</td>
            <td>{r.ignored}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
