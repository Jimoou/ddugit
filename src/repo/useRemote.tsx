import { type RefObject, useState } from "react";
import { api } from "../api";
import { AddRemoteDialog } from "../components/AddRemote";
import { AuthDialog } from "../components/AuthDialog";
import { JobCard } from "../components/JobCard";
import { SyncConfirm } from "../components/SyncConfirm";
import { SyncDialog } from "../components/SyncDialog";
import { type Key, t } from "../i18n";
import type { MissionId } from "../missions";
import type { Settings } from "../settings";
import { type SyncOp, syncPlan } from "../sync";
import type { OpStatus, Progress, RemoteOp, RepoSnapshot } from "../types";
import type { Repo, Run, Toast } from "./state";

const REMOTE_DONE: Record<RemoteOp, Key> = {
  fetch: "remote.done.fetch",
  pull: "remote.done.pull",
  pullMerge: "remote.done.pullMerge",
  pullRebase: "remote.done.pullRebase",
  push: "remote.done.push",
  forcePush: "remote.done.forcePush",
};

/** What the progress card says while a remote operation runs. */
const JOB: Record<RemoteOp, Key> = {
  fetch: "job.fetch",
  pull: "job.pull",
  pullMerge: "job.pull",
  pullRebase: "job.pull",
  push: "job.push",
  forcePush: "job.push",
};

/** URL of the remote behind HEAD's upstream (else `origin`, else the first remote). */
function upstreamUrl(snap: RepoSnapshot): string | null {
  const name = snap.head.upstream?.split("/")[0];
  const r =
    snap.remotes.find((x) => x.name === name) ?? snap.remotes.find((x) => x.name === "origin") ?? snap.remotes[0];
  return r?.url ?? null;
}

/** `upstream/feature/x` → remote `upstream`, branch `feature/x` (remote names may hold slashes too). */
export function splitRemote(snap: RepoSnapshot | null, name: string) {
  const remote = snap?.remotes.map((x) => x.name).find((n) => name.startsWith(`${n}/`)) ?? name.split("/")[0];
  return { remote, branch: name.slice(remote.length + 1) };
}

/**
 * Where a push goes: the upstream's remote (or the default one for a first push),
 * whether that remote is fetch-only, and the alternative to offer instead.
 */
function pushTargetOf(snap: RepoSnapshot | null) {
  if (!snap) return null;
  const name = snap.head.upstream
    ? splitRemote(snap, snap.head.upstream).remote
    : (snap.remotes.find((r) => r.name === "origin" && r.push) ?? snap.remotes.find((r) => r.push))?.name;
  const info = snap.remotes.find((r) => r.name === name);
  if (!info) return null;
  const alt = (snap.remotes.find((r) => r.name === "origin" && r.push) ?? snap.remotes.find((r) => r.push))?.name;
  return { remote: info.name, url: info.url, fetchOnly: !info.push, alt: alt && alt !== info.name ? alt : null };
}

/** The remote flows' own dialog: one at a time, each leads to the next. */
type RemoteDialog =
  /** Remote work waiting for the user's go-ahead (see `SyncConfirm`). */
  | { kind: "ask"; op: SyncOp }
  | { kind: "sync"; sync: "diverged" | "rejected" }
  | { kind: "auth"; op: RemoteOp; output: string }
  | { kind: "add" };

interface Options {
  path: string;
  snap: RepoSnapshot | null;
  latest: RefObject<RepoSnapshot | null>;
  busy: boolean;
  run: Run;
  refuseBusy(): boolean;
  toast: Toast;
  settings: Settings;
  onChangeSettings(patch: Partial<Settings>): void;
  mission(id: MissionId): void;
  playAfterDraw: Repo["playAfterDraw"];
  /** Remote work may have opened or closed pull requests: read them again. */
  onPulled(): void;
}

/** Fetch, pull, push and remotes: the progress card, and the dialogs that ask first or explain what went wrong. */
export function useRemote(o: Options) {
  const { path, snap, latest, run, refuseBusy, toast } = o;
  const [remoteBusy, setRemoteBusy] = useState<RemoteOp | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  /** A remote being fetched on its own (just added, or from its menu), shown on the progress card. */
  const [fetchingRemote, setFetchingRemote] = useState<string | null>(null);
  const [open, setOpen] = useState<RemoteDialog | null>(null);
  const pushTarget = pushTargetOf(snap);

  /**
   * Push to `name` (e.g. origin) instead of a fetch-only upstream, and follow it there from now on.
   * `branch` defaults to the current one (another goes up before a pull request is opened from it).
   */
  const pushTo = async (name: string, branch: string | null = null) => {
    // Before the progress card changes: it belongs to the operation still running.
    if (refuseBusy()) return false;
    setRemoteBusy("push");
    setProgress(null);
    try {
      const r = await run(t("remote.pushedTo", { name }), () => api.pushTo(path, name, setProgress, branch));
      if (r.status === "auth") setOpen({ kind: "auth", op: "push", output: r.output });
      // Another branch than HEAD: the pull-then-push dialog doesn't apply, so just say why.
      if (r.status === "rejected") {
        if (branch) toast("err", r.output);
        else setOpen({ kind: "sync", sync: "rejected" });
      }
      return r.status === "ok";
    } finally {
      setRemoteBusy(null);
      setProgress(null);
    }
  };

  const remote = async (op: RemoteOp): Promise<OpStatus> => {
    if (refuseBusy()) return "failed";
    setRemoteBusy(op);
    setProgress(null);
    const pushing = op === "push" || op === "forcePush";
    const known = new Set(latest.current?.commits.map((c) => c.id));
    try {
      const r = await run(t(REMOTE_DONE[op]), async () => {
        const r = await api.remote(path, op, setProgress);
        // A rejected push says nothing about how far behind we are; fetch so the dialog can show it.
        if (r.status === "rejected") await api.remote(path, "fetch").catch(() => {});
        return r;
      });
      if (r.status === "ok") {
        o.onPulled();
        if (pushing) o.mission("push");
        const head = latest.current?.head.target;
        const fresh = pushing ? [] : (latest.current?.commits ?? []).filter((c) => !known.has(c.id));
        o.playAfterDraw((at) => {
          if (pushing) {
            const from = at(head);
            return from && { kind: "launch", from };
          }
          const to = fresh.flatMap((c) => at(c.id) ?? []);
          return to.length ? { kind: "meteors", to } : null;
        });
      }
      if (r.status === "auth") setOpen({ kind: "auth", op, output: r.output });
      if (r.status === "diverged" || r.status === "rejected") setOpen({ kind: "sync", sync: r.status });
      return r.status;
    } finally {
      setRemoteBusy(null);
      setProgress(null);
    }
  };

  /** Resolve a diverged pull or rejected push with merge/rebase (then push for the latter). */
  const resolveSync = async (op: "pullMerge" | "pullRebase") => {
    const wasRejected = open?.kind === "sync" && open.sync === "rejected";
    setOpen(null);
    if ((await remote(op)) === "ok" && wasRejected) await remote("push");
  };

  /** The top bar's buttons: pull and push ask first when the settings say so (or the upstream is fetch-only). */
  const onRemote = (op: RemoteOp) =>
    op === "fetch" || op === "pull" || op === "push"
      ? o.settings.confirmRemote[op] || (op === "push" && pushTarget?.fetchOnly)
        ? setOpen({ kind: "ask", op })
        : void remote(op)
      : void remote(op);

  /** Delete `branch` on remote `name`; missing credentials open the same help as a push. */
  const deleteRemoteBranch = async (name: string, branch: string) => {
    if (refuseBusy()) return;
    setRemoteBusy("push");
    setProgress(null);
    try {
      const r = await run(t("remoteBranch.delete.done", { name: `${name}/${branch}` }), () =>
        api.deleteRemoteBranch(path, name, branch, setProgress),
      );
      if (r.status === "auth") setOpen({ kind: "auth", op: "push", output: r.output });
    } finally {
      setRemoteBusy(null);
      setProgress(null);
    }
  };

  /** Fetch one remote with the progress card up, then say what came: its branch count. */
  const fetchOne = async (name: string) => {
    if (refuseBusy()) return;
    setFetchingRemote(name);
    setProgress(null);
    try {
      // Quiet: what to say (how many branches came) is known only after the refresh.
      const r = await run(
        t("job.fetchRemote", { name }),
        () => api.fetchRemote(path, name, setProgress),
        undefined,
        true,
      );
      const n = latest.current?.refs.filter((x) => x.kind === "remote" && x.name.startsWith(`${name}/`)).length ?? 0;
      if (r.status === "ok") {
        o.onPulled();
        toast("ok", n ? t("remote.fetched", { name, n }) : t("remote.fetchedNone", { name }));
      } else if (r.status === "auth") setOpen({ kind: "auth", op: "fetch", output: r.output });
    } finally {
      setFetchingRemote(null);
      setProgress(null);
    }
  };

  /** Add another repository (e.g. the original project) as a remote and fetch it. */
  const askRemote = () => setOpen({ kind: "add" });
  const addRemote = async (name: string, url: string) => {
    setOpen(null);
    // Added quietly; what the user waits for is the fetch, shown on the progress card.
    // Anything but `origin` is someone else's project (the original of a fork): fetch only.
    const fetchOnly = name !== "origin";
    const r = await run(
      t("remote.add.title"),
      () => api.ref(path, { kind: "addRemote", name, url, fetchOnly }),
      undefined,
      true,
    );
    if (r.status !== "ok") return;
    if (fetchOnly) toast("ok", t("remote.addedFetchOnly", { name }));
    await fetchOne(name);
  };

  const jobCard = (fetchingRemote || remoteBusy) && (
    <JobCard
      title={fetchingRemote ? t("job.fetchRemote", { name: fetchingRemote }) : t(JOB[remoteBusy!])}
      progress={progress}
    />
  );

  const dialogs = (headColor: string) =>
    snap && (
      <>
        {open?.kind === "add" && (
          <AddRemoteDialog
            path={path}
            remotes={snap.remotes.map((r) => r.name)}
            busy={o.busy}
            onSubmit={(name, url) => void addRemote(name, url)}
            onCancel={() => setOpen(null)}
          />
        )}
        {open?.kind === "ask" && (
          <SyncConfirm
            plan={syncPlan(snap, open.op)}
            branch={snap.head.branch}
            target={open.op === "push" ? pushTarget : null}
            onPushTo={(name) => {
              setOpen(null);
              void pushTo(name);
            }}
            busy={o.busy}
            onGo={() => {
              setOpen(null);
              void remote(open.op);
            }}
            onNeverAsk={() => o.onChangeSettings({ confirmRemote: { ...o.settings.confirmRemote, [open.op]: false } })}
            onCancel={() => setOpen(null)}
          />
        )}
        {open?.kind === "sync" && snap.head.branch && snap.head.upstream && (
          <SyncDialog
            kind={open.sync}
            branch={snap.head.branch}
            upstream={snap.head.upstream}
            ahead={snap.head.ahead}
            behind={snap.head.behind}
            color={headColor}
            busy={o.busy}
            onMerge={() => void resolveSync("pullMerge")}
            onForce={() => {
              setOpen(null);
              void remote("forcePush");
            }}
            onRebase={() => void resolveSync("pullRebase")}
            onCancel={() => setOpen(null)}
          />
        )}
        {open?.kind === "auth" && (
          <AuthDialog
            url={upstreamUrl(snap)}
            output={open.output}
            repoPath={snap.path}
            busy={o.busy}
            onClose={() => setOpen(null)}
            onRetry={() => {
              const op = open.op;
              setOpen(null);
              void remote(op);
            }}
          />
        )}
      </>
    );

  return { remoteBusy, progress, onRemote, pushTo, fetchOne, deleteRemoteBranch, askRemote, jobCard, dialogs };
}
