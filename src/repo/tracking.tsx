// A branch and its remotes: which remote branch it follows, pushing or fast-forwarding it
// without checking it out, renaming it there too, and renaming or moving a remote.

import type { MenuItem } from "../components/ContextMenu";
import { t } from "../i18n";
import type { RefInfo } from "../types";
import { askName, refRun } from "./actions";
import type { Repo } from "./state";
import { defaultPushRemote, splitRemote } from "./useRemote";

/** A branch's upstream when its remote takes pushes (not fetch-only, not deleted there). */
function pushableUpstream(repo: Repo, r: RefInfo) {
  const up = r.upstream;
  if (!up || up.gone) return null;
  const { remote, branch } = splitRemote(repo.snap, up.name);
  return repo.snap.remotes.some((x) => x.name === remote && x.push) ? { remote, branch } : null;
}

/** Pick the remote branch `name` follows: the one of the same name first, the current one marked. */
function pickUpstream(repo: Repo, name: string, current: string | undefined) {
  const remotes = repo.snap.refs.filter((x) => x.kind === "remote").map((x) => x.name);
  const same = (n: string) => splitRemote(repo.snap, n).branch === name;
  const sorted = remotes.sort((a, b) => Number(same(b)) - Number(same(a)) || a.localeCompare(b));
  repo.setMenu({
    ...repo.menuAt(),
    title: t("track.pick", { branch: name }),
    items: sorted.map((up) => ({
      label: up,
      icon: "cloud" as const,
      hint: up === current ? t("track.current") : same(up) ? t("track.same") : undefined,
      disabled: up === current,
      onSelect: () =>
        void refRun(repo, t("track.done", { branch: name, upstream: up }), {
          kind: "setUpstream",
          branch: name,
          upstream: up,
        }),
    })),
  });
}

/** Why a branch can't be fast-forwarded to its upstream, or null when it can. */
function fastForwardBlock(repo: Repo, r: RefInfo): string | null {
  const up = r.upstream!;
  if (r.name === repo.snap.head.branch) return t("ff.head");
  if (up.gone) return t("ff.gone");
  if (up.ahead > 0 && up.behind > 0) return t("ff.diverged");
  if (up.behind === 0) return t("ff.upToDate");
  return null;
}

/** Local branch menu entries: push it, fast-forward it, choose or drop the remote branch it follows. */
export function trackingItems(repo: Repo, r: RefInfo): MenuItem[] {
  const up = r.upstream;
  // A push goes to the upstream's remote, else (no upstream, or a fetch-only one) the default remote.
  const remote = pushableUpstream(repo, r)?.remote ?? defaultPushRemote(repo.snap);
  const block = up ? fastForwardBlock(repo, r) : null;
  return [
    {
      label: t("branch.push", { branch: r.name }),
      hint: remote ? `→ ${remote}/${r.name}` : undefined,
      disabled: !remote,
      onSelect: () => void repo.pushTo(remote!, r.name, t("branch.pushed", { branch: r.name, remote: remote! })),
    },
    ...(up
      ? [
          {
            label: t("ff.menu", { upstream: up.name }),
            hint: block ?? undefined,
            disabled: !!block,
            onSelect: () =>
              void refRun(repo, t("ff.done", { branch: r.name, upstream: up.name }), {
                kind: "fastForward",
                branch: r.name,
              }).then((res) => {
                if (res.status === "diverged") repo.toast("err", res.output);
              }),
          },
        ]
      : []),
    {
      label: t("track.menu"),
      hint: up?.name,
      disabled: !repo.snap.refs.some((x) => x.kind === "remote"),
      onSelect: () => pickUpstream(repo, r.name, up?.name),
    },
    ...(up
      ? [
          {
            label: t("track.stop", { upstream: up.name }),
            onSelect: () =>
              void refRun(repo, t("track.stopped", { branch: r.name }), {
                kind: "setUpstream",
                branch: r.name,
                upstream: null,
              }),
          },
        ]
      : []),
  ];
}

/**
 * Rename a branch; when it follows the branch of the same name on a remote that takes pushes
 * (never a shared one like `origin/main` it happens to track), optionally there too:
 * push the new name (which it then follows) and delete the old one there. Says which step didn't happen.
 */
export const renameBranch = (repo: Repo, from: string) => {
  const r = repo.snap.refs.find((x) => x.kind === "local" && x.name === from);
  const up = r && pushableUpstream(repo, r);
  const there = up && up.branch === from ? up : null;
  askName(
    repo,
    {
      title: t("branch.rename.title"),
      placeholder: t("branch.rename.placeholder"),
      confirmLabel: t("branch.rename.go"),
      initial: from,
      check: there ? { label: t("branch.rename.remote", { remote: there.remote }) } : undefined,
    },
    async (to, _, also) => {
      const done = await refRun(repo, t("branch.rename.done", { name: to }), { kind: "renameBranch", from, to });
      if (done.status !== "ok" || !also || !there) return;
      const { remote, branch: old } = there;
      if (!(await repo.pushTo(remote, to, t("branch.pushed", { branch: to, remote }))))
        return repo.toast("err", t("branch.rename.notPushed", { name: to, remote }));
      const deleted = await repo.remoteRef(
        remote,
        { kind: "deleteBranch", name: old },
        t("branch.rename.remoteDone", { name: to, remote }),
      );
      if (!deleted) repo.toast("err", t("branch.rename.oldKept", { remote, old: `${remote}/${old}` }));
    },
  );
};

/** Remote menu entries: rename it, point it at another URL. */
export function remoteEditItems(repo: Repo, name: string): MenuItem[] {
  const info = repo.snap.remotes.find((x) => x.name === name);
  return [
    {
      label: t("menu.rename"),
      onSelect: () =>
        askName(
          repo,
          {
            title: t("remote.rename.title"),
            placeholder: "upstream",
            confirmLabel: t("branch.rename.go"),
            initial: name,
          },
          (to) => void refRun(repo, t("remote.rename.done", { name: to }), { kind: "renameRemote", from: name, to }),
        ),
    },
    {
      label: t("remote.url.menu"),
      disabled: !info,
      onSelect: () =>
        askName(
          repo,
          {
            title: t("remote.url.title", { name }),
            hint: info?.push === false ? t("remote.url.fetchOnly") : undefined,
            placeholder: t("remote.add.url"),
            confirmLabel: t("remote.url.go"),
            initial: info?.url,
            free: true,
          },
          (url) => void refRun(repo, t("remote.url.done", { name }), { kind: "setRemoteUrl", name, url }),
        ),
    },
  ];
}
