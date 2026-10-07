// Keyboard shortcuts for repository commands (`COMMAND_KEYS` in settings.ts): fetch, pull,
// push, a new branch, stash everything, the commit box. Only the visible tab listens.

import { useEffect } from "react";
import { t } from "../i18n";
import { isTypingTarget } from "../keys";
import { commandOf } from "../settings";
import type { RemoteOp } from "../types";
import { askNewBranch } from "./actions";
import { saveStash } from "./changes";
import type { Repo } from "./state";

interface Props {
  repo: Repo;
  active: boolean;
  onRemote(op: RemoteOp): void;
}

/** Renders nothing; listens for the command keys while its tab is on screen. */
export function CommandKeys({ repo, active, onRemote }: Props) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const k = commandOf(e);
      // A field's own keys stay its own; a dialog over the tab owns the keyboard.
      if (!k || e.defaultPrevented || isTypingTarget(e.target)) return;
      if ((e.target as Element).closest?.("[aria-modal]")) return;
      e.preventDefault();
      // Running work refuses another (with a word) in `run`.
      if (k === "fetch" || k === "pull" || k === "push") onRemote(k);
      else if (k === "newBranch") askNewBranch(repo);
      else if (k === "commit") repo.show({ composer: true });
      else if (!repo.snap.changes.length) repo.toast("err", t("keys.stash.nothing"));
      else void saveStash(repo, "", [], { untracked: true, keepIndex: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return null;
}
