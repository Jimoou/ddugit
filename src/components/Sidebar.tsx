import { useMemo, useState } from "react";
import { stashTitle } from "../format";
import type { RefInfo, StashInfo } from "../types";

interface Props {
  refs: RefInfo[];
  headBranch: string | null;
  colorOf(target: string): string;
  focused: string | null;
  onFocus(ref: RefInfo | null): void;
  onCheckout(name: string): void;
  stashes: StashInfo[];
  selectedStash: number | null;
  onStash(index: number): void;
}

const GROUPS: { kind: RefInfo["kind"]; title: string }[] = [
  { kind: "local", title: "브랜치" },
  { kind: "remote", title: "원격" },
  { kind: "tag", title: "태그" },
];

export function Sidebar(props: Props) {
  const { refs, headBranch, colorOf, focused, onFocus, onCheckout, stashes, selectedStash, onStash } = props;
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () =>
      refs.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name)),
    [refs, q],
  );

  return (
    <nav className="sidebar">
      <input className="text search" placeholder="브랜치 찾기" value={q} onChange={(e) => setQ(e.target.value)} />
      {GROUPS.map((g) => {
        const items = filtered.filter((r) => r.kind === g.kind);
        if (!items.length) return null;
        return (
          <section key={g.kind}>
            <h3>
              {g.title} <span className="muted">{items.length}</span>
            </h3>
            <ul>
              {items.map((r) => {
                const key = `${r.kind}:${r.name}`;
                const isHead = r.kind === "local" && r.name === headBranch;
                return (
                  <li
                    key={key}
                    className={`${focused === key ? "focused" : ""} ${isHead ? "head" : ""}`}
                    title={r.kind === "local" ? "클릭: 집중해서 보기 · 더블클릭: 체크아웃" : "클릭: 집중해서 보기"}
                    onClick={() => onFocus(focused === key ? null : r)}
                    onDoubleClick={() => r.kind === "local" && onCheckout(r.name)}
                  >
                    <span className="dot" style={{ background: colorOf(r.target), color: colorOf(r.target) }} />
                    <span className="name">{r.name}</span>
                    {isHead && <span className="head-pill">HEAD</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {stashes.length > 0 && (
        <section>
          <h3>
            스태시 <span className="muted">{stashes.length}</span>
          </h3>
          <ul>
            {stashes.map((st) => (
              <li
                key={st.id}
                className={selectedStash === st.index ? "focused" : ""}
                title={st.message}
                onClick={() => onStash(st.index)}
              >
                <span className="diamond" />
                <span className="name">{stashTitle(st.message)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </nav>
  );
}
