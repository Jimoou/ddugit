//! Undoing mistakes: move the current branch back (`reset`) and find where
//! HEAD has been (`reflog`), including commits no branch points at any more.

use git2::{Oid, Repository};
use serde::{Deserialize, Serialize};

use super::{err, git, in_progress, open, workdir, OpResult, Result};

/// What `reset` does with the changes of the commits it moves past.
#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ResetMode {
    /// Keep them staged, ready to commit again.
    Soft,
    /// Keep them in the working tree, unstaged.
    Mixed,
    /// Throw them away, along with any uncommitted changes.
    Hard,
}

/// Move the current branch (or detached HEAD) to `target`.
pub fn reset(path: &str, target: &str, mode: ResetMode) -> Result<OpResult> {
    super::operand(target)?;
    if in_progress(path) {
        return Err("Finish or cancel the operation in progress first".into());
    }
    let dir = workdir(&open(path)?)?;
    let flag = match mode {
        ResetMode::Soft => "--soft",
        ResetMode::Mixed => "--mixed",
        ResetMode::Hard => "--hard",
    };
    Ok(git(&dir, &["reset", "-q", flag, target, "--"])?.into())
}

/// One move of HEAD, newest first.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReflogEntry {
    /// Where HEAD went.
    pub id: String,
    /// Where it came from (all zeros for the first entry).
    pub prev: String,
    /// git's description, e.g. `commit: fix login` or `reset: moving to HEAD~1`.
    pub message: String,
    pub summary: String,
    pub time: i64,
    /// No branch, remote branch, tag or HEAD reaches `id`: only the reflog remembers it.
    pub lost: bool,
}

/// Is `id` unreachable from every ref and from HEAD?
fn is_lost(repo: &Repository, id: Oid) -> Result<bool> {
    let mut walk = repo.revwalk().map_err(err)?;
    walk.push(id).map_err(err)?;
    walk.hide_glob("refs/*").map_err(err)?;
    if let Ok(head) = repo.head() {
        if let Some(h) = head.target() {
            walk.hide(h).map_err(err)?;
        }
    }
    Ok(walk.next().is_some_and(|first| first.is_ok_and(|o| o == id)))
}

/// The last `limit` moves of HEAD.
pub fn reflog(path: &str, limit: usize) -> Result<Vec<ReflogEntry>> {
    let repo = open(path)?;
    let log = match repo.reflog("HEAD") {
        Ok(l) => l,
        Err(_) => return Ok(vec![]), // fresh repository: nothing yet
    };
    let mut out = Vec::new();
    for e in log.iter().take(limit) {
        let id = e.id_new();
        // Objects pruned by gc can't be recovered; skip them.
        let Ok(commit) = repo.find_commit(id) else {
            continue;
        };
        out.push(ReflogEntry {
            id: id.to_string(),
            prev: e.id_old().to_string(),
            message: e.message().unwrap_or("").to_string(),
            summary: commit.summary().unwrap_or("").to_string(),
            time: e.committer().when().seconds(),
            lost: is_lost(&repo, id)?,
        });
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::super::{git_ok, OpStatus};
    use super::*;

    fn head_id(p: &std::path::Path) -> String {
        git_ok(p, &["rev-parse", "HEAD"]).unwrap().trim().to_string()
    }

    #[test]
    fn soft_reset_undoes_the_last_commit_but_keeps_its_changes_staged() {
        let r = repo();
        commit_file(r.path(), "a.txt", "a", "first");
        let first = head_id(r.path());
        commit_file(r.path(), "b.txt", "b", "second");
        let res = reset(s(r.path()), "HEAD~1", ResetMode::Soft).unwrap();
        assert_eq!(res.status, OpStatus::Ok, "{}", res.output);
        assert_eq!(head_id(r.path()), first);
        let snap = snapshot(s(r.path()), 10).unwrap();
        let b = snap.changes.iter().find(|c| c.path == "b.txt").unwrap();
        assert!(b.staged.is_some() && b.unstaged.is_none());
    }

    #[test]
    fn mixed_keeps_changes_unstaged_and_hard_throws_them_away() {
        let r = repo();
        commit_file(r.path(), "a.txt", "a", "first");
        let first = head_id(r.path());
        commit_file(r.path(), "b.txt", "b", "second");
        reset(s(r.path()), &first, ResetMode::Mixed).unwrap();
        let snap = snapshot(s(r.path()), 10).unwrap();
        let b = snap.changes.iter().find(|c| c.path == "b.txt").unwrap();
        assert!(b.staged.is_none() && b.unstaged.is_some());

        commit_file(r.path(), "b.txt", "b", "second again");
        std::fs::write(r.path().join("a.txt"), "dirty").unwrap();
        reset(s(r.path()), &first, ResetMode::Hard).unwrap();
        assert!(snapshot(s(r.path()), 10).unwrap().changes.is_empty());
        assert_eq!(std::fs::read_to_string(r.path().join("a.txt")).unwrap(), "a");
    }

    #[test]
    fn reflog_remembers_commits_a_hard_reset_left_behind() {
        let r = repo();
        commit_file(r.path(), "a.txt", "a", "first");
        let first = head_id(r.path());
        commit_file(r.path(), "b.txt", "b", "second");
        let second = head_id(r.path());
        reset(s(r.path()), &first, ResetMode::Hard).unwrap();

        let log = reflog(s(r.path()), 50).unwrap();
        assert!(log[0].message.starts_with("reset:"), "{}", log[0].message);
        assert_eq!(log[0].id, first);
        assert!(!log[0].lost);
        let lost = log.iter().find(|e| e.id == second).unwrap();
        assert!(lost.lost);
        assert_eq!(lost.summary, "second");

        // Bring it back as a branch: no longer lost.
        git_ok(r.path(), &["branch", "rescued", &second]).unwrap();
        assert!(
            !reflog(s(r.path()), 50)
                .unwrap()
                .iter()
                .find(|e| e.id == second)
                .unwrap()
                .lost
        );
    }

    #[test]
    fn refuses_to_reset_mid_operation() {
        let r = repo();
        commit_file(r.path(), "a.txt", "a", "first");
        std::fs::write(r.path().join(".git/MERGE_HEAD"), head_id(r.path())).unwrap();
        assert!(reset(s(r.path()), "HEAD", ResetMode::Hard).is_err());
    }
}
