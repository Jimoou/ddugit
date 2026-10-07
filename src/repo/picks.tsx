// Acting on several commits at once (picked with ⌘/Ctrl- and Shift-click in the graph):
// cherry-pick them onto the current branch or revert them. And reverting a merge
// against the parent the user chooses, instead of always the first.

import { useState } from "react";
import { api } from "../api";
import type { MenuItem } from "../components/ContextMenu";
import { t } from "../i18n";
import type { CommitInfo } from "../types";
import { confirmThen, richBody } from "./actions";
import { inHistoryOrder } from "./pickList";
import type { Repo } from "./state";

/** `ids` as the snapshot lists them, oldest first or newest first. */
const ordered = (repo: Repo, ids: string[], oldestFirst: boolean) =>
  inHistoryOrder(ids, new Map(repo.snap.commits.map((c, i) => [c.id, i])), oldestFirst);

/** Menu entries for the picked commits, when `id` is one of two or more picked. */
export function pickedItems(repo: Repo, id: string): MenuItem[] {
  const { snap, picked } = repo;
  if (picked.length < 2 || !picked.includes(id)) return [];
  const n = picked.length;
  const branch = snap.head.branch;
  const clean = snap.state === "clean";
  const onHead = picked.filter((x) => repo.isAncestor(x, snap.head.target));
  return [
    {
      label: t("picks.pick", { n, branch: branch ?? "HEAD" }),
      icon: "cherry",
      hint: onHead.length ? t("picks.onHead", { n: onHead.length }) : undefined,
      disabled: !clean || !branch || onHead.length > 0,
      onSelect: () => confirmMany(repo, "cherryPick", ordered(repo, picked, true), branch!),
    },
    {
      label: t("picks.revert", { n }),
      icon: "undo",
      disabled: !clean || onHead.length < n,
      onSelect: () => confirmMany(repo, "revert", ordered(repo, picked, false), branch ?? "HEAD"),
    },
    { label: t("picks.clear", { n }), onSelect: () => repo.setPicked([]) },
    "separator",
  ];
}

/** Cherry-pick (oldest first) or revert (newest first) `ids` on the current branch, after confirming. */
function confirmMany(repo: Repo, op: "cherryPick" | "revert", ids: string[], branch: string) {
  const n = ids.length;
  const pick = op === "cherryPick";
  confirmThen(
    repo,
    {
      title: pick ? "cherry-pick" : "revert",
      confirmLabel: pick ? t("pick.copy") : t("revert.go"),
      body: (
        <>
          {richBody(pick ? "picks.pick.body" : "picks.revert.body", { n, branch })}
          <ul>
            {ids.map((id) => (
              <li key={id}>
                <code>{id.slice(0, 7)}</code> {repo.commitById.get(id)?.summary}
              </li>
            ))}
          </ul>
        </>
      ),
    },
    () =>
      void repo.run(
        pick ? t("picks.picked", { n, branch }) : t("picks.reverted", { n }),
        () => api.pick(repo.path, op, ids, null),
        () => repo.setPicked([]),
      ),
  );
}

/** Revert a merge commit, keeping the side of the parent the user picks (`-m <n>`). */
export function confirmRevertMerge(repo: Repo, merge: CommitInfo) {
  const choice = { mainline: 1 };
  confirmThen(
    repo,
    {
      title: t("revertMerge.title"),
      confirmLabel: t("revert.go"),
      body: (
        <>
          {richBody("revertMerge.body", { summary: merge.summary, branch: repo.snap.head.branch ?? "HEAD" })}
          <ParentChoice repo={repo} parents={merge.parents} onChange={(m) => (choice.mainline = m)} />
        </>
      ),
    },
    () => void repo.run(t("revert.done"), () => api.pick(repo.path, "revert", [merge.id], null, choice.mainline)),
  );
}

/** One radio per parent: its short id, summary and the branches there. */
function ParentChoice({ repo, parents, onChange }: { repo: Repo; parents: string[]; onChange(m: number): void }) {
  const [on, setOn] = useState(1);
  return (
    <fieldset className="parent-choice">
      <legend>{t("revertMerge.keep")}</legend>
      {parents.map((id, i) => {
        const names = repo.snap.refs.filter((r) => r.target === id && r.kind !== "tag").map((r) => r.name);
        return (
          <label key={id}>
            <input
              type="radio"
              name="mainline"
              checked={on === i + 1}
              onChange={() => {
                setOn(i + 1);
                onChange(i + 1);
              }}
            />
            <span>
              {t("revertMerge.parent", { n: i + 1 })} <code>{id.slice(0, 7)}</code>{" "}
              {repo.commitById.get(id)?.summary ?? ""}
              {names.length > 0 && <span className="muted"> ({names.join(", ")})</span>}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
