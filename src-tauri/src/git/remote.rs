//! fetch / pull / push through the git CLI.

use git2::Repository;
use serde::Deserialize;

use super::read::read_head;
use super::write::conflict_aware;
use super::{git, open, workdir, OpResult, OpStatus, Result};

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RemoteOp {
    Fetch,
    /// Fast-forward only; reports `Diverged` instead of creating a merge.
    Pull,
    PullMerge,
    PullRebase,
    Push,
}

impl RemoteOp {
    /// Fixed git arguments per operation. Push without an upstream is the one
    /// case that needs computed arguments (see `push_args`).
    fn args(self) -> &'static [&'static str] {
        match self {
            RemoteOp::Fetch => &["fetch", "--all", "--prune"],
            RemoteOp::Pull => &["pull", "--ff-only"],
            RemoteOp::PullMerge => &["pull", "--no-rebase", "--no-edit"],
            RemoteOp::PullRebase => &["pull", "--rebase"],
            RemoteOp::Push => &["push"],
        }
    }

    fn needs_upstream(self) -> bool {
        matches!(self, RemoteOp::Pull | RemoteOp::PullMerge | RemoteOp::PullRebase)
    }
}

/// Remote used when the branch has no upstream yet: `origin`, else the only/first one.
fn default_remote(repo: &Repository) -> Option<String> {
    let names = repo.remotes().ok()?;
    let names: Vec<&str> = names.iter().flatten().collect();
    names
        .iter()
        .find(|n| **n == "origin")
        .or(names.first())
        .map(|s| s.to_string())
}

pub fn remote(path: &str, op: RemoteOp) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let head = read_head(&repo);

    let mut args: Vec<String> = op.args().iter().map(|s| s.to_string()).collect();
    if op != RemoteOp::Fetch {
        let branch = head
            .branch
            .clone()
            .ok_or("HEAD is detached; check out a branch first")?;
        if head.upstream.is_none() {
            if op.needs_upstream() {
                return Err(format!("'{branch}' has no upstream branch; push it first"));
            }
            let remote = default_remote(&repo).ok_or("No remote configured")?;
            args.extend(["-u".into(), remote, branch]);
        }
    }
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let o = git(&dir, &argv)?;
    if o.ok {
        return Ok(o.into());
    }

    let status = match op {
        RemoteOp::Push if o.text.contains("[rejected]") => OpStatus::Rejected,
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
        let r = remote(s(a.path()), RemoteOp::Push).unwrap();
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
        assert_eq!(remote(s(b.path()), RemoteOp::Push).unwrap().status, OpStatus::Ok);

        assert_eq!(remote(s(a.path()), RemoteOp::Fetch).unwrap().status, OpStatus::Ok);
        assert_eq!(head(&a).behind, 1);
        assert_eq!(remote(s(a.path()), RemoteOp::Pull).unwrap().status, OpStatus::Ok);
        assert_eq!(head(&a).behind, 0);
        assert!(a.path().join("b.txt").exists());
    }

    #[test]
    fn diverged_pull_and_rejected_push() {
        let (_o, a, b) = setup();
        commit_file(b.path(), "b.txt", "b", "from b");
        remote(s(b.path()), RemoteOp::Push).unwrap();
        commit_file(a.path(), "a.txt", "a", "from a");

        assert_eq!(
            remote(s(a.path()), RemoteOp::Push).unwrap().status,
            OpStatus::Rejected
        );
        assert_eq!(
            remote(s(a.path()), RemoteOp::Pull).unwrap().status,
            OpStatus::Diverged
        );

        let r = remote(s(a.path()), RemoteOp::PullMerge).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let h = head(&a);
        assert_eq!((h.ahead, h.behind), (2, 0)); // own commit + merge commit
        assert_eq!(remote(s(a.path()), RemoteOp::Push).unwrap().status, OpStatus::Ok);
    }

    #[test]
    fn rebase_pull_keeps_history_linear() {
        let (_o, a, b) = setup();
        commit_file(b.path(), "b.txt", "b", "from b");
        remote(s(b.path()), RemoteOp::Push).unwrap();
        commit_file(a.path(), "a.txt", "a", "from a");

        let r = remote(s(a.path()), RemoteOp::PullRebase).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(s(a.path()), 100).unwrap();
        assert!(snap.commits.iter().all(|c| c.parents.len() <= 1));
        assert_eq!((snap.head.ahead, snap.head.behind), (1, 0));
    }

    #[test]
    fn conflicting_rebase_pull_reports_conflict() {
        let (_o, a, b) = setup();
        commit_file(b.path(), "base.txt", "theirs", "edit b");
        remote(s(b.path()), RemoteOp::Push).unwrap();
        commit_file(a.path(), "base.txt", "ours", "edit a");

        let r = remote(s(a.path()), RemoteOp::PullRebase).unwrap();
        assert_eq!(r.status, OpStatus::Conflict);
        assert_eq!(snapshot(s(a.path()), 100).unwrap().state, "rebase");
        assert_eq!(
            super::super::write::abort(s(a.path())).unwrap().status,
            OpStatus::Ok
        );
        assert_eq!(snapshot(s(a.path()), 100).unwrap().state, "clean");
    }

    #[test]
    fn pull_without_upstream_is_an_error() {
        let d = repo();
        commit_file(d.path(), "x.txt", "x", "x");
        assert!(remote(s(d.path()), RemoteOp::Pull).is_err());
    }
}
