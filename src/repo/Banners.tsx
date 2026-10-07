// Banners over the graph: a bisect hunt, a file's trail through history, a commit picked to
// compare, and an operation in progress (merge, rebase, pick, revert) with its continue / skip / cancel.

import { api } from "../api";
import { Icon } from "../components/Icon";
import { isKey, t } from "../i18n";
import { Rich } from "../i18n/Rich";
import type { FileTouch } from "../types";
import { showCommit } from "./actions";
import { headSide, openCompare } from "./compare";
import type { CompareSide, Repo } from "./state";

export function BisectBanner({ repo }: { repo: Repo }) {
  const { bisect, bisectDraft, busy, commitById } = repo;
  if (!bisect && !bisectDraft) return null;
  const judge = (kind: "good" | "bad" | "skip") =>
    void repo.run(t(`bisect.judged.${kind}`), () => api.bisect(repo.path, { kind }));
  return (
    <div className="banner bisect-banner">
      <span>
        <b className="bisect-eye">
          <Icon name="telescope" /> bisect
        </b>{" "}
        {!bisect && bisectDraft && (
          <>
            {t("bisect.draft")} <span className={bisectDraft.bad ? "ok" : "muted"}>{t("bisect.draft.bad")}</span>
            {" · "}
            <span className={bisectDraft.good ? "ok" : "muted"}>{t("bisect.draft.good")}</span>
          </>
        )}
        {bisect && bisect.culprit && (
          <Rich
            k="bisect.found"
            vars={{
              sha: bisect.culprit.slice(0, 7),
              summary: commitById.get(bisect.culprit)?.summary ?? "",
            }}
          />
        )}
        {bisect && !bisect.culprit && (
          <>
            {t("bisect.left", {
              n: bisect.candidates.length,
              steps: Math.max(1, Math.ceil(Math.log2(Math.max(bisect.candidates.length, 2)))),
            })}{" "}
            {bisect.current && (
              <Rich
                k="bisect.test"
                vars={{
                  sha: bisect.current.slice(0, 7),
                  summary: commitById.get(bisect.current)?.summary ?? "",
                }}
              />
            )}
          </>
        )}
      </span>
      <span className="row">
        {bisect && !bisect.culprit && (
          <>
            <button className="good" disabled={busy} onClick={() => judge("good")}>
              {t("bisect.good")}
            </button>
            <button className="bad" disabled={busy} onClick={() => judge("bad")}>
              {t("bisect.bad")}
            </button>
            <button disabled={busy} onClick={() => judge("skip")}>
              {t("bisect.skip")}
            </button>
          </>
        )}
        {bisect?.culprit && <button onClick={() => showCommit(repo, bisect.culprit!)}>{t("bisect.show")}</button>}
        <button
          disabled={busy}
          onClick={() =>
            bisect ? void repo.run(t("bisect.done"), () => api.abort(repo.path)) : repo.setBisectDraft(null)
          }
        >
          {bisect ? t("bisect.finish") : t("common.cancel")}
        </button>
      </span>
    </div>
  );
}

export function TrailBanner({ repo, trail }: { repo: Repo; trail: { file: string; touches: FileTouch[] } }) {
  const { selected } = repo;
  /** Step to the next older (+1) or newer (-1) commit on the file's trail. */
  const step = (dir: 1 | -1) => {
    const ids = trail.touches.map((x) => x.id).filter((id) => repo.commitById.has(id));
    if (!ids.length) return;
    const i = selected ? ids.indexOf(selected) : -1;
    showCommit(repo, i < 0 ? ids[0] : ids[Math.min(ids.length - 1, Math.max(0, i + dir))]);
  };
  const onTrail = !!selected && trail.touches.some((x) => x.id === selected);
  return (
    <div className="banner trail-banner">
      <span>
        <b className="trail-eye">
          <Icon name="sparkle" /> {t("history.trail.eyebrow")}
        </b>{" "}
        <Rich k="history.trail.count" vars={{ file: trail.file, n: trail.touches.length }} />
      </span>
      <span className="row">
        <button onClick={() => step(-1)} title={t("history.trail.newer")}>
          <Icon name="arrowLeft" /> {t("history.trail.newer")}
        </button>
        <button onClick={() => step(1)} title={t("history.trail.older")}>
          {t("history.trail.older")} <Icon name="arrowRight" />
        </button>
        <button
          onClick={() =>
            repo.setSheet({
              kind: "blame",
              rev: onTrail && selected ? selected : (trail.touches[0]?.id ?? "HEAD"),
              file: trail.touches.find((x) => x.id === selected)?.path ?? trail.touches[0]?.path ?? trail.file,
            })
          }
        >
          {t("history.blame.short")}
        </button>
        <button onClick={() => repo.setTrail(null)}>{t("common.close")}</button>
      </span>
    </div>
  );
}

/** A commit picked to compare with: say how to pick the other one, or compare it with HEAD. */
export function CompareBanner({ repo, base }: { repo: Repo; base: CompareSide }) {
  const head = headSide(repo);
  return (
    <div className="banner compare-banner">
      <span>
        <Rich k="compare.banner" vars={{ sha: base.name, summary: repo.commitById.get(base.id)?.summary ?? "" }} />
      </span>
      <span className="row">
        <button
          disabled={!head || head.id === base.id}
          onClick={() => {
            repo.setCompareBase(null);
            if (head) openCompare(repo, base, head, false);
          }}
        >
          {t("compare.withHead", { name: "HEAD" })}
        </button>
        <button onClick={() => repo.setCompareBase(null)}>{t("common.cancel")}</button>
      </span>
    </div>
  );
}

/** In-progress operations (`state.<name>` and `.hint` in the dictionary) and whether "continue" applies. */
const IN_PROGRESS: Record<string, { canContinue: boolean }> = {
  merge: { canContinue: false },
  rebase: { canContinue: true },
  "cherry-pick": { canContinue: true },
  revert: { canContinue: true },
};

/** Banner name and hint for a repository state; unknown states show as-is. */
const stateText = (state: string) => {
  const name = `state.${state}`;
  const hint = `state.${state}.hint`;
  return { name: isKey(name) ? t(name) : state, hint: isKey(hint) ? t(hint) : "" };
};

/** An operation stopped half-way: what it is, how many conflicts, and the ways out. */
export function StateBanner({ repo }: { repo: Repo }) {
  const { snap, busy, path } = repo;
  if (snap.state === "clean" || snap.state === "bisect") return null;
  const conflicts = snap.changes.filter((c) => c.conflicted).length;
  const canContinue = IN_PROGRESS[snap.state]?.canContinue;
  const { name, hint } = stateText(snap.state);
  return (
    <div className="banner">
      <span>
        {t("state.banner", { name })}
        {conflicts > 0 && t("state.conflicts", { n: conflicts })}.{" "}
        {conflicts === 0 && canContinue ? t("state.nothing") : hint}
      </span>
      <span className="row">
        {conflicts > 0 && <button onClick={() => repo.setConflict({})}>{t("state.resolve")}</button>}
        {canContinue && (
          <button disabled={busy} onClick={() => repo.run(t("state.continued"), () => api.continueOp(path))}>
            {t("state.continue")}
          </button>
        )}
        {canContinue && (
          <button
            disabled={busy}
            title={t("state.skip.hint")}
            onClick={() => repo.run(t("empty.skipped"), () => api.skip(path))}
          >
            {t("state.skip")}
          </button>
        )}
        <button disabled={busy} onClick={() => repo.run(t("state.aborted"), () => api.abort(path))}>
          {t("common.cancel")}
        </button>
      </span>
    </div>
  );
}
