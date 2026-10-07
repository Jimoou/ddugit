//! fetch / pull / push through the git CLI.

use git2::Repository;
use serde::{Deserialize, Serialize};

use super::read::read_head;
use super::write::conflict_aware;
use std::path::Path;

use super::{git_streaming, open, workdir, OpResult, OpStatus, Output, Result};

/// One progress update parsed from git's `--progress` output.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// git's phase name, e.g. `Receiving objects`.
    pub phase: String,
    pub percent: u8,
}

/// `[remote: ]Phase name:  45% (450/1000), 1.2 MiB | ...` → progress.
pub(super) fn parse_progress(line: &str) -> Option<Progress> {
    let line = line.trim().trim_start_matches("remote:").trim();
    let (phase, rest) = line.split_once(':')?;
    let digits: String = rest
        .trim_start()
        .chars()
        .take_while(char::is_ascii_digit)
        .collect();
    let after = rest.trim_start().get(digits.len()..)?;
    if digits.is_empty()
        || !after.starts_with('%')
        || !phase.chars().all(|c| c.is_ascii_alphabetic() || c == ' ')
    {
        return None;
    }
    Some(Progress {
        phase: phase.trim().to_string(),
        percent: digits.parse::<u8>().ok()?.min(100),
    })
}

/// Output fragments (with `LC_ALL=C`) that mean credentials or host trust are missing.
const AUTH_FAILURES: &[&str] = &[
    "Authentication failed",
    "could not read Username",
    "could not read Password",
    "terminal prompts disabled",
    "Invalid username or password",
    "HTTP Basic: Access denied",
    "Permission denied (publickey",
    "Host key verification failed",
    "returned error: 403",
];

pub(super) fn is_auth_failure(text: &str) -> bool {
    AUTH_FAILURES.iter().any(|p| text.contains(p))
}

/// Run remote work (fetch, push, clone) in `dir`: git's progress lines go to
/// `on_progress` instead of the output text.
pub(super) fn stream_remote(
    dir: &Path,
    args: &[&str],
    mut on_progress: impl FnMut(Progress),
) -> Result<Output> {
    git_streaming(dir, args, |line| match parse_progress(line) {
        Some(p) => {
            on_progress(p);
            true
        }
        None => false,
    })
}

/// How remote work ended, apart from what is particular to one operation:
/// missing credentials, and (for a push) a rejected update.
pub(super) fn remote_status(o: &Output, push: bool) -> OpStatus {
    if o.ok {
        OpStatus::Ok
    } else if is_auth_failure(&o.text) {
        OpStatus::Auth
    } else if push && o.text.contains("[rejected]") {
        OpStatus::Rejected
    } else {
        OpStatus::Failed
    }
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RemoteOp {
    Fetch,
    /// Fast-forward only; reports `Diverged` instead of creating a merge.
    Pull,
    PullMerge,
    PullRebase,
    Push,
    /// Replace the upstream branch with ours (after a rebase or amend), but
    /// only if it still is what we last fetched: `--force-with-lease` refuses
    /// when someone pushed in the meantime instead of throwing their work away.
    ForcePush,
}

impl RemoteOp {
    /// Fixed git arguments per operation. Push without an upstream is the one
    /// case that needs computed arguments (`-u <remote> <branch>`).
    fn args(self) -> &'static [&'static str] {
        match self {
            RemoteOp::Fetch => &["fetch", "--all", "--prune", "--progress"],
            RemoteOp::Pull => &["pull", "--ff-only", "--progress"],
            RemoteOp::PullMerge => &["pull", "--no-rebase", "--no-edit", "--progress"],
            RemoteOp::PullRebase => &["pull", "--rebase", "--progress"],
            RemoteOp::Push => &["push", "--progress"],
            RemoteOp::ForcePush => &["push", "--force-with-lease", "--progress"],
        }
    }

    fn needs_upstream(self) -> bool {
        matches!(self, RemoteOp::Pull | RemoteOp::PullMerge | RemoteOp::PullRebase)
    }
}

/// A remote that may be pushed to (not made fetch-only).
fn pushable(repo: &Repository, name: &str) -> bool {
    repo.find_remote(name)
        .is_ok_and(|r| r.pushurl() != Some(super::NO_PUSH))
}

/// Remote used when the branch has no upstream yet: `origin`, else the first
/// one that may be pushed to.
fn default_remote(repo: &Repository) -> Option<String> {
    let names = repo.remotes().ok()?;
    let names: Vec<&str> = names.iter().flatten().filter(|n| pushable(repo, n)).collect();
    names
        .iter()
        .find(|n| **n == "origin")
        .or(names.first())
        .map(|s| s.to_string())
}

pub fn remote(path: &str, op: RemoteOp, on_progress: impl FnMut(Progress)) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let head = read_head(&repo);

    let mut args: Vec<String> = op.args().iter().map(|s| s.to_string()).collect();
    if op != RemoteOp::Fetch {
        let branch = head
            .branch
            .clone()
            .ok_or("HEAD is detached; check out a branch first")?;
        // Never push to a fetch-only remote (e.g. the original project of a fork).
        let up_remote = head.upstream.as_deref().and_then(|u| upstream_remote(&repo, u));
        if !op.needs_upstream() {
            if let Some(r) = up_remote.as_deref().filter(|r| !pushable(&repo, r)) {
                return Ok(OpResult {
                    status: OpStatus::Failed,
                    output: format!(
                        "'{branch}' follows {}, and {r} is fetch-only: nothing is pushed there. \
                         Push it to another remote instead.",
                        head.upstream.as_deref().unwrap_or(r)
                    ),
                });
            }
        }
        if head.upstream.is_none() {
            if op.needs_upstream() {
                return Err(format!("'{branch}' has no upstream branch; push it first"));
            }
            let remote = default_remote(&repo).ok_or("No remote configured")?;
            super::operand(&remote)?;
            args.extend(["-u".into(), remote, heads_refspec(&branch)]);
        }
    }
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let o = stream_remote(&dir, &argv, on_progress)?;
    let status = remote_status(&o, matches!(op, RemoteOp::Push | RemoteOp::ForcePush));
    if status != OpStatus::Failed {
        return Ok(OpResult::with(status, o));
    }

    let status = match op {
        RemoteOp::Pull => {
            // ff-only failed: diverged if both sides have new commits after the pull's fetch.
            let h = read_head(&open(path)?);
            if h.ahead > 0 && h.behind > 0 {
                OpStatus::Diverged
            } else {
                OpStatus::Failed
            }
        }
        RemoteOp::PullMerge | RemoteOp::PullRebase => return Ok(conflict_aware(path, o)),
        _ => OpStatus::Failed,
    };
    Ok(OpResult::with(status, o))
}

/// `refs/heads/b:refs/heads/b`: a branch name as a refspec is read by git, and
/// a branch named `+main` (a legal name) would mean "force-push main".
fn heads_refspec(branch: &str) -> String {
    format!("refs/heads/{branch}:refs/heads/{branch}")
}

/// The remote of an upstream like `upstream/main` (remote names may hold slashes).
fn upstream_remote(repo: &Repository, upstream: &str) -> Option<String> {
    let names = repo.remotes().ok()?;
    let found = names
        .iter()
        .flatten()
        .filter(|n| upstream.starts_with(&format!("{n}/")))
        .max_by_key(|n| n.len())
        .map(str::to_string);
    found
}

/// Push `branch` (default: the current one) to `remote` and make it the
/// branch's upstream (e.g. `origin`, when it followed the original project's
/// branch, or before opening a pull request from it).
pub fn push_to(
    path: &str,
    remote: &str,
    branch: Option<&str>,
    on_progress: impl FnMut(Progress),
) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let branch = match branch {
        Some(b) => b.to_string(),
        None => read_head(&repo)
            .branch
            .ok_or("HEAD is detached; check out a branch first")?,
    };
    if !pushable(&repo, super::operand(remote)?) {
        return Err(format!("{remote} is fetch-only"));
    }
    let spec = heads_refspec(super::operand(&branch)?);
    let args = ["push", "--progress", "-u", remote, &spec];
    let o = stream_remote(&dir, &args, on_progress)?;
    Ok(OpResult::with(remote_status(&o, true), o))
}

/// A ref sent to, or deleted on, a remote named by the user (not HEAD's upstream).
#[derive(Debug, Deserialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RemoteRefOp {
    /// Delete a branch there; git drops its remote-tracking branch with it. Local branches stay.
    DeleteBranch {
        name: String,
    },
    PushTag {
        name: String,
    },
    /// Delete a tag there; the local tag stays.
    DeleteTag {
        name: String,
    },
    /// Every local tag (`--tags`).
    PushTags,
}

/// `git push <remote> …` for one `RemoteRefOp`. A fetch-only remote refuses.
pub fn remote_ref(
    path: &str,
    remote: &str,
    op: &RemoteRefOp,
    on_progress: impl FnMut(Progress),
) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    if !pushable(&repo, super::operand(remote)?) {
        return Err(format!("{remote} is fetch-only"));
    }
    // Full ref names: a name can't be read as an option, nor as a refspec (`+v1` would force it).
    let (flag, target) = match op {
        RemoteRefOp::DeleteBranch { name } => {
            (Some("--delete"), format!("refs/heads/{}", super::operand(name)?))
        }
        RemoteRefOp::PushTag { name } => {
            let name = super::operand(name)?;
            (None, format!("refs/tags/{name}:refs/tags/{name}"))
        }
        RemoteRefOp::DeleteTag { name } => (Some("--delete"), format!("refs/tags/{}", super::operand(name)?)),
        RemoteRefOp::PushTags => (Some("--tags"), String::new()),
    };
    let mut args = vec!["push", "--progress"];
    args.extend(flag);
    args.push(remote);
    if !target.is_empty() {
        args.push(&target);
    }
    let o = stream_remote(&dir, &args, on_progress)?;
    Ok(OpResult::with(remote_status(&o, true), o))
}

/// Fetch one remote (e.g. one just added), not all of them.
pub fn fetch_one(path: &str, name: &str, on_progress: impl FnMut(Progress)) -> Result<OpResult> {
    let dir = workdir(&open(path)?)?;
    let args = ["fetch", "--prune", "--progress", super::operand(name)?];
    let o = stream_remote(&dir, &args, on_progress)?;
    Ok(OpResult::with(remote_status(&o, false), o))
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, identity, repo, s};
    use super::super::{git_ok, OpStatus};
    use super::*;

    /// (origin bare repo, clone A with one pushed commit, clone B of the same).
    fn setup() -> (tempfile::TempDir, tempfile::TempDir, tempfile::TempDir) {
        let origin = tempfile::tempdir().unwrap();
        git_ok(origin.path(), &["init", "-q", "--bare", "-b", "main"]).unwrap();
        let a = repo();
        git_ok(a.path(), &["remote", "add", "origin", s(origin.path())]).unwrap();
        commit_file(a.path(), "base.txt", "base", "base");
        // No upstream yet → push sets it with -u.
        let r = remote(s(a.path()), RemoteOp::Push, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);

        let b = tempfile::tempdir().unwrap();
        git_ok(b.path(), &["clone", "-q", s(origin.path()), "."]).unwrap();
        identity(b.path());
        (origin, a, b)
    }

    fn head(p: &tempfile::TempDir) -> super::super::read::HeadInfo {
        snapshot(s(p.path()), 100).unwrap().head
    }

    #[test]
    fn first_push_sets_upstream() {
        let (_o, a, _b) = setup();
        let h = head(&a);
        assert_eq!(h.upstream.as_deref(), Some("origin/main"));
        assert_eq!((h.ahead, h.behind), (0, 0));
    }

    #[test]
    fn fetch_then_fast_forward_pull() {
        let (_o, a, b) = setup();
        commit_file(b.path(), "b.txt", "b", "from b");
        assert_eq!(
            remote(s(b.path()), RemoteOp::Push, |_| {}).unwrap().status,
            OpStatus::Ok
        );

        assert_eq!(
            remote(s(a.path()), RemoteOp::Fetch, |_| {}).unwrap().status,
            OpStatus::Ok
        );
        assert_eq!(head(&a).behind, 1);
        assert_eq!(
            remote(s(a.path()), RemoteOp::Pull, |_| {}).unwrap().status,
            OpStatus::Ok
        );
        assert_eq!(head(&a).behind, 0);
        assert!(a.path().join("b.txt").exists());
    }

    #[test]
    fn diverged_pull_and_rejected_push() {
        let (_o, a, b) = setup();
        commit_file(b.path(), "b.txt", "b", "from b");
        remote(s(b.path()), RemoteOp::Push, |_| {}).unwrap();
        commit_file(a.path(), "a.txt", "a", "from a");

        assert_eq!(
            remote(s(a.path()), RemoteOp::Push, |_| {}).unwrap().status,
            OpStatus::Rejected
        );
        assert_eq!(
            remote(s(a.path()), RemoteOp::Pull, |_| {}).unwrap().status,
            OpStatus::Diverged
        );

        let r = remote(s(a.path()), RemoteOp::PullMerge, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let h = head(&a);
        assert_eq!((h.ahead, h.behind), (2, 0)); // own commit + merge commit
        assert_eq!(
            remote(s(a.path()), RemoteOp::Push, |_| {}).unwrap().status,
            OpStatus::Ok
        );
    }

    #[test]
    fn force_push_replaces_rewritten_history_but_not_unseen_work() {
        let (_origin, a, b) = setup();
        let pa = s(a.path());
        // A rewrites its pushed commit: a plain push is rejected, a forced one lands.
        git_ok(a.path(), &["commit", "--amend", "-q", "-m", "base (reworded)"]).unwrap();
        assert_eq!(
            remote(pa, RemoteOp::Push, |_| {}).unwrap().status,
            OpStatus::Rejected
        );
        let r = remote(pa, RemoteOp::ForcePush, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);

        // B pushes on top of the new history; A, without fetching, rewrites again.
        git_ok(b.path(), &["pull", "-q", "--rebase"]).unwrap();
        commit_file(b.path(), "b.txt", "b", "from B");
        git_ok(b.path(), &["push", "-q"]).unwrap();
        git_ok(a.path(), &["commit", "--amend", "-q", "-m", "base (again)"]).unwrap();
        let r = remote(pa, RemoteOp::ForcePush, |_| {}).unwrap();
        assert_eq!(
            r.status,
            OpStatus::Rejected,
            "lease protects B's commit: {}",
            r.output
        );
    }

    #[test]
    fn rebase_pull_keeps_history_linear() {
        let (_o, a, b) = setup();
        commit_file(b.path(), "b.txt", "b", "from b");
        remote(s(b.path()), RemoteOp::Push, |_| {}).unwrap();
        commit_file(a.path(), "a.txt", "a", "from a");

        let r = remote(s(a.path()), RemoteOp::PullRebase, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(s(a.path()), 100).unwrap();
        assert!(snap.commits.iter().all(|c| c.parents.len() <= 1));
        assert_eq!((snap.head.ahead, snap.head.behind), (1, 0));
    }

    #[test]
    fn conflicting_rebase_pull_reports_conflict() {
        let (_o, a, b) = setup();
        commit_file(b.path(), "base.txt", "theirs", "edit b");
        remote(s(b.path()), RemoteOp::Push, |_| {}).unwrap();
        commit_file(a.path(), "base.txt", "ours", "edit a");

        let r = remote(s(a.path()), RemoteOp::PullRebase, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Conflict);
        assert_eq!(snapshot(s(a.path()), 100).unwrap().state, "rebase");
        assert_eq!(
            super::super::write::abort(s(a.path())).unwrap().status,
            OpStatus::Ok
        );
        assert_eq!(snapshot(s(a.path()), 100).unwrap().state, "clean");
    }

    #[test]
    fn deletes_a_branch_on_the_remote_and_its_tracking_ref() {
        let (origin, a, b) = setup();
        git_ok(b.path(), &["push", "-q", "origin", "HEAD:refs/heads/old-feature"]).unwrap();
        remote(s(a.path()), RemoteOp::Fetch, |_| {}).unwrap();
        git_ok(a.path(), &["branch", "-q", "old-feature", "origin/old-feature"]).unwrap();
        let tracking = |p: &tempfile::TempDir| {
            git_ok(p.path(), &["branch", "-r", "--list", "origin/old-feature"]).unwrap()
        };
        assert!(!tracking(&a).trim().is_empty());

        let op = RemoteRefOp::DeleteBranch {
            name: "old-feature".into(),
        };
        let r = remote_ref(s(a.path()), "origin", &op, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let left = git_ok(origin.path(), &["branch", "--list", "old-feature"]).unwrap();
        assert!(left.trim().is_empty(), "still on the remote: {left}");
        assert!(tracking(&a).trim().is_empty(), "tracking ref kept");
        // The local branch of the same name stays.
        let local = git_ok(a.path(), &["branch", "--list", "old-feature"]).unwrap();
        assert!(!local.trim().is_empty());
    }

    #[test]
    fn remote_refs_refuse_odd_names_and_fetch_only_remotes() {
        let (_o, a, _b) = setup();
        let del = |name: &str| RemoteRefOp::DeleteBranch { name: name.into() };
        let tag = RemoteRefOp::PushTag { name: "-v1".into() };
        assert!(remote_ref(s(a.path()), "origin", &del("--all"), |_| {}).is_err());
        assert!(remote_ref(s(a.path()), "origin", &tag, |_| {}).is_err());
        assert!(remote_ref(s(a.path()), "--all", &RemoteRefOp::PushTags, |_| {}).is_err());
        git_ok(
            a.path(),
            &["remote", "set-url", "--push", "origin", super::super::NO_PUSH],
        )
        .unwrap();
        assert!(remote_ref(s(a.path()), "origin", &del("main"), |_| {}).is_err());
        assert!(remote_ref(s(a.path()), "origin", &RemoteRefOp::PushTags, |_| {}).is_err());
    }

    #[test]
    fn pushes_and_deletes_tags_on_the_remote() {
        let (origin, a, _b) = setup();
        let pa = s(a.path());
        let on_origin = || git_ok(origin.path(), &["tag", "--list"]).unwrap();
        git_ok(a.path(), &["tag", "v1"]).unwrap();
        git_ok(a.path(), &["tag", "-a", "v2", "-m", "second"]).unwrap();

        let push = RemoteRefOp::PushTag { name: "v1".into() };
        let r = remote_ref(pa, "origin", &push, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(on_origin().trim(), "v1", "only the one tag goes");

        let r = remote_ref(pa, "origin", &RemoteRefOp::PushTags, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(on_origin().split_whitespace().collect::<Vec<_>>(), ["v1", "v2"]);

        // The same name moved locally: git won't replace a tag on the remote without force.
        git_ok(a.path(), &["tag", "-d", "v1"]).unwrap();
        commit_file(a.path(), "c.txt", "c", "later");
        git_ok(a.path(), &["tag", "v1"]).unwrap();
        let r = remote_ref(pa, "origin", &push, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Rejected, "{}", r.output);

        let del = RemoteRefOp::DeleteTag { name: "v1".into() };
        let r = remote_ref(pa, "origin", &del, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(on_origin().trim(), "v2");
        // The local tag stays.
        assert_eq!(git_ok(a.path(), &["tag", "--list", "v1"]).unwrap().trim(), "v1");
    }

    #[test]
    fn pull_without_upstream_is_an_error() {
        let d = repo();
        commit_file(d.path(), "x.txt", "x", "x");
        assert!(remote(s(d.path()), RemoteOp::Pull, |_| {}).is_err());
    }

    #[test]
    fn parses_progress_lines() {
        let p = |s| parse_progress(s);
        assert_eq!(
            p("Receiving objects:  45% (450/1000), 1.20 MiB | 2.3 MiB/s"),
            Some(Progress {
                phase: "Receiving objects".into(),
                percent: 45
            })
        );
        assert_eq!(
            p("remote: Compressing objects: 100% (3/3), done.")
                .unwrap()
                .percent,
            100
        );
        assert_eq!(p("Writing objects: 7% (1/14)").unwrap().phase, "Writing objects");
        assert_eq!(p("To /tmp/origin.git"), None);
        assert_eq!(p("error: failed to push some refs to 'x'"), None);
        assert_eq!(p("hint: Updates were rejected: 50% sure"), None);
    }

    #[test]
    fn push_reports_progress_and_keeps_it_out_of_output() {
        let (_o, a, _b) = setup();
        for i in 0..20 {
            commit_file(
                a.path(),
                &format!("f{i}.txt"),
                &"x".repeat(2000 + i),
                &format!("c{i}"),
            );
        }
        let mut seen = Vec::new();
        let r = remote(s(a.path()), RemoteOp::Push, |p| seen.push(p)).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(seen.iter().any(|p| p.phase == "Writing objects"), "{seen:?}");
        assert!(!r.output.contains('%'), "{}", r.output);
    }

    #[test]
    fn missing_credentials_are_classified_as_auth() {
        assert!(is_auth_failure(
            "fatal: could not read Username for 'https://github.com': terminal prompts disabled"
        ));
        assert!(is_auth_failure("git@github.com: Permission denied (publickey)."));
        assert!(!is_auth_failure("fatal: couldn't find remote ref nope"));
        // End to end: an https remote that needs credentials we can't prompt for.
        let d = repo();
        commit_file(d.path(), "x.txt", "x", "x");
        super::super::git_ok(
            d.path(),
            &["remote", "add", "origin", "https://127.0.0.1:9/none.git"],
        )
        .unwrap();
        let r = remote(s(d.path()), RemoteOp::Fetch, |_| {}).unwrap();
        assert_eq!(
            r.status,
            OpStatus::Failed,
            "connection refused is not an auth problem: {}",
            r.output
        );
    }

    #[test]
    fn fetches_one_remote_only() {
        let (_origin, a, b) = setup();
        let other = repo();
        commit_file(other.path(), "o.txt", "o", "other work");
        let pb = s(b.path());
        git_ok(b.path(), &["remote", "add", "other", s(other.path())]).unwrap();
        // A new commit on origin that fetching `other` must not bring.
        commit_file(a.path(), "a2.txt", "a2", "more");
        remote(s(a.path()), RemoteOp::Push, |_| {}).unwrap();

        let r = fetch_one(pb, "other", |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let refs = snapshot(pb, 100).unwrap().refs;
        assert!(refs.iter().any(|r| r.name == "other/main"));
        assert_eq!(head(&b).behind, 0, "origin wasn't fetched");
        assert_eq!(fetch_one(pb, "nope", |_| {}).unwrap().status, OpStatus::Failed);
        assert!(fetch_one(pb, "--all", |_| {}).is_err());
    }

    #[test]
    fn a_fetch_only_remote_is_never_pushed_to_and_push_to_moves_the_upstream() {
        use super::super::refs::{apply, RefOp};
        let (origin, a, b) = setup();
        // `b` gets the original project as `upstream`, fetch-only, and follows it.
        let pb = s(b.path());
        let add = RefOp::AddRemote {
            name: "upstream".into(),
            url: s(a.path()).into(),
            fetch_only: true,
        };
        assert_eq!(apply(pb, &add).unwrap().status, OpStatus::Ok);
        let remotes = snapshot(pb, 1).unwrap().remotes;
        assert!(!remotes.iter().find(|r| r.name == "upstream").unwrap().push);
        assert!(remotes.iter().find(|r| r.name == "origin").unwrap().push);
        git_ok(b.path(), &["fetch", "-q", "upstream"]).unwrap();
        git_ok(b.path(), &["branch", "-q", "-u", "upstream/main"]).unwrap();
        commit_file(b.path(), "b.txt", "b", "backported fix");

        let r = remote(pb, RemoteOp::Push, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Failed);
        assert!(r.output.contains("fetch-only"), "{}", r.output);
        assert!(push_to(pb, "upstream", None, |_| {}).is_err());
        // The original project never got the commit.
        assert_ne!(
            git_ok(a.path(), &["rev-parse", "main"]).unwrap(),
            git_ok(b.path(), &["rev-parse", "HEAD"]).unwrap()
        );

        let r = push_to(pb, "origin", None, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(head(&b).upstream.as_deref(), Some("origin/main"));
        assert_eq!(
            git_ok(origin.path(), &["rev-parse", "main"]).unwrap(),
            git_ok(b.path(), &["rev-parse", "HEAD"]).unwrap()
        );

        // A branch that isn't checked out goes up too, and follows its new remote copy.
        git_ok(b.path(), &["branch", "-q", "topic"]).unwrap();
        let r = push_to(pb, "origin", Some("topic"), |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(
            git_ok(b.path(), &["rev-parse", "--abbrev-ref", "topic@{upstream}"])
                .unwrap()
                .trim(),
            "origin/topic"
        );
        assert_eq!(head(&b).upstream.as_deref(), Some("origin/main"));
        assert!(push_to(pb, "origin", Some("--all"), |_| {}).is_err());

        // A branch named `+main` is pushed as itself, never as a forced push of main.
        let main_before = git_ok(origin.path(), &["rev-parse", "main"]).unwrap();
        git_ok(b.path(), &["branch", "-q", "+main", "HEAD~1"]).unwrap();
        let r = push_to(pb, "origin", Some("+main"), |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(
            git_ok(origin.path(), &["rev-parse", "main"]).unwrap(),
            main_before
        );
        assert!(git_ok(origin.path(), &["rev-parse", "--verify", "refs/heads/+main"]).is_ok());

        // Pushing can be allowed again.
        let allow = RefOp::SetPushable {
            name: "upstream".into(),
            pushable: true,
        };
        assert_eq!(apply(pb, &allow).unwrap().status, OpStatus::Ok);
        assert!(snapshot(pb, 1).unwrap().remotes.iter().all(|r| r.push));
    }
}
