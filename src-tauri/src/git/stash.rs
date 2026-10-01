//! Working-tree housekeeping: discard changes and the stash.

use git2::Repository;
use serde::{Deserialize, Serialize};

use super::read::read_changes;
use super::{err, git, git_ok, open, workdir, OpResult, OpStatus, Result};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct StashInfo {
    /// Position in the stash list: `stash@{index}`.
    pub index: usize,
    pub message: String,
    pub id: String,
    /// Commit the stash was taken on (its first parent).
    pub base: String,
    pub time: i64,
}

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum StashOp {
    Apply,
    Pop,
    Drop,
}

impl StashOp {
    fn verb(self) -> &'static str {
        match self {
            StashOp::Apply => "apply",
            StashOp::Pop => "pop",
            StashOp::Drop => "drop",
        }
    }
}

pub(super) fn read_stashes(path: &str) -> Result<Vec<StashInfo>> {
    let mut repo = open(path)?;
    let mut raw = Vec::new();
    repo.stash_foreach(|i, msg, oid| {
        raw.push((i, msg.to_string(), *oid));
        true
    })
    .map_err(err)?;
    let repo: &Repository = &repo;
    Ok(raw
        .into_iter()
        .filter_map(|(index, message, oid)| {
            let c = repo.find_commit(oid).ok()?;
            Some(StashInfo {
                index,
                message,
                id: oid.to_string(),
                base: c.parent_id(0).ok()?.to_string(),
                time: c.time().seconds(),
            })
        })
        .collect())
}

/// Throw away changes to `paths` (index and working tree). Untracked files are deleted.
pub fn discard(path: &str, paths: &[String]) -> Result<OpResult> {
    if paths.is_empty() {
        return Err("No files selected".into());
    }
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let changes = read_changes(&repo)?;
    let (untracked, tracked): (Vec<&str>, Vec<&str>) = paths.iter().map(String::as_str).partition(|p| {
        changes
            .iter()
            .any(|c| c.path == *p && c.staged.is_none() && c.unstaged.as_deref() == Some("untracked"))
    });

    let mut out = Vec::new();
    if !tracked.is_empty() {
        let mut args = if repo.head().is_ok() {
            // Paths missing from HEAD (newly added) are removed, matching the source.
            vec!["restore", "--source=HEAD", "--staged", "--worktree", "--"]
        } else {
            // Unborn branch: nothing to restore from; just unstage, then delete below.
            vec!["rm", "-r", "-q", "-f", "--"]
        };
        args.extend(&tracked);
        out.push(git_ok(&dir, &args)?);
    }
    if !untracked.is_empty() {
        let mut args = vec!["clean", "-f", "-q", "--"];
        args.extend(&untracked);
        out.push(git_ok(&dir, &args)?);
    }
    Ok(OpResult {
        status: OpStatus::Ok,
        output: out.join("\n").trim().to_string(),
    })
}

/// Stash `paths` (all changes when empty), including untracked files.
pub fn stash_push(path: &str, message: &str, paths: &[String]) -> Result<OpResult> {
    let dir = workdir(&open(path)?)?;
    let mut args = vec!["stash", "push", "--include-untracked"];
    if !message.trim().is_empty() {
        args.extend(["-m", message.trim()]);
    }
    if !paths.is_empty() {
        args.push("--");
        args.extend(paths.iter().map(String::as_str));
    }
    Ok(git(&dir, &args)?.into())
}

pub fn stash(path: &str, op: StashOp, index: usize) -> Result<OpResult> {
    let dir = workdir(&open(path)?)?;
    let name = format!("stash@{{{index}}}");
    let o = git(&dir, &["stash", op.verb(), &name])?;
    // Apply/pop conflicts leave unmerged paths but no repository state to detect.
    if o.text.contains("CONFLICT") {
        return Ok(OpResult::with(OpStatus::Conflict, o));
    }
    Ok(o.into())
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::*;
    use std::fs;

    fn changed(d: &tempfile::TempDir) -> Vec<String> {
        snapshot(s(d.path()), 100)
            .unwrap()
            .changes
            .into_iter()
            .map(|c| c.path)
            .collect()
    }

    #[test]
    fn discard_handles_modified_untracked_and_staged_new() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "base");
        fs::write(d.path().join("a.txt"), "changed").unwrap();
        fs::write(d.path().join("u.txt"), "untracked").unwrap();
        fs::write(d.path().join("n.txt"), "new").unwrap();
        git_ok(d.path(), &["add", "n.txt"]).unwrap();
        fs::write(d.path().join("keep.txt"), "keep").unwrap();

        let r = discard(s(d.path()), &["a.txt".into(), "u.txt".into(), "n.txt".into()]).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "a");
        assert!(!d.path().join("u.txt").exists());
        assert!(!d.path().join("n.txt").exists());
        assert_eq!(changed(&d), vec!["keep.txt"]);
    }

    #[test]
    fn discard_on_unborn_branch() {
        let d = repo();
        fs::write(d.path().join("x.txt"), "x").unwrap();
        git_ok(d.path(), &["add", "x.txt"]).unwrap();
        let r = discard(s(d.path()), &["x.txt".into()]).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(changed(&d).is_empty());
    }

    #[test]
    fn partial_stash_then_pop() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "base");
        fs::write(d.path().join("a.txt"), "edit").unwrap();
        fs::write(d.path().join("b.txt"), "new").unwrap();

        let r = stash_push(s(d.path()), "wip a", &["a.txt".into()]).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(changed(&d), vec!["b.txt"]);

        let list = read_stashes(s(d.path())).unwrap();
        assert_eq!(list.len(), 1);
        assert!(list[0].message.contains("wip a"));
        let head = snapshot(s(d.path()), 1).unwrap().head.target.unwrap();
        assert_eq!(list[0].base, head);

        assert_eq!(stash(s(d.path()), StashOp::Pop, 0).unwrap().status, OpStatus::Ok);
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "edit");
        assert!(read_stashes(s(d.path())).unwrap().is_empty());
    }

    #[test]
    fn stash_everything_including_untracked_then_apply_and_drop() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "base");
        fs::write(d.path().join("a.txt"), "edit").unwrap();
        fs::write(d.path().join("u.txt"), "u").unwrap();
        stash_push(s(d.path()), "", &[]).unwrap();
        assert!(changed(&d).is_empty());

        assert_eq!(
            stash(s(d.path()), StashOp::Apply, 0).unwrap().status,
            OpStatus::Ok
        );
        assert!(d.path().join("u.txt").exists());
        assert_eq!(read_stashes(s(d.path())).unwrap().len(), 1); // apply keeps it
        assert_eq!(stash(s(d.path()), StashOp::Drop, 0).unwrap().status, OpStatus::Ok);
        assert!(read_stashes(s(d.path())).unwrap().is_empty());
    }

    #[test]
    fn conflicting_pop_reports_conflict_and_keeps_stash() {
        let d = repo();
        commit_file(d.path(), "a.txt", "base", "base");
        fs::write(d.path().join("a.txt"), "stashed").unwrap();
        stash_push(s(d.path()), "x", &[]).unwrap();
        commit_file(d.path(), "a.txt", "committed", "other");

        let r = stash(s(d.path()), StashOp::Pop, 0).unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        assert_eq!(read_stashes(s(d.path())).unwrap().len(), 1);
    }
}
