//! fetch / pull / push through the git CLI.

use git2::Repository;
use serde::{Deserialize, Serialize};

use super::read::read_head;
use super::write::conflict_aware;
use super::{git_streaming, open, workdir, OpResult, OpStatus, Result};

/// One progress update parsed from git's `--progress` output.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    /// git's phase name, e.g. `Receiving objects`.
    pub phase: String,
    pub percent: u8,
}

/// `[remote: ]Phase name:  45% (450/1000), 1.2 MiB | ...` → progress.
fn parse_progress(line: &str) -> Option<Progress> {
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

fn is_auth_failure(text: &str) -> bool {
    AUTH_FAILURES.iter().any(|p| text.contains(p))
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

pub fn remote(path: &str, op: RemoteOp, mut on_progress: impl FnMut(Progress)) -> Result<OpResult> {
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
    let o = git_streaming(&dir, &argv, |line| match parse_progress(line) {
        Some(p) => {
            on_progress(p);
            true
        }
        None => false,
    })?;
    if o.ok {
        return Ok(o.into());
    }

    let status = match op {
        _ if is_auth_failure(&o.text) => OpStatus::Auth,
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
}
