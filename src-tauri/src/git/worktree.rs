//! Worktrees: more than one branch checked out at once, each in its own folder
//! (`git worktree`). Listing reads libgit2; adding and removing go through git.

use std::path::{Path, PathBuf};

use git2::{Repository, WorktreeLockStatus};
use serde::{Deserialize, Serialize};

use super::read::read_head;
use super::{git, open, operand, workdir, OpResult, OpStatus, Result};

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeInfo {
    pub path: String,
    /// The branch checked out there; `None` when detached.
    pub branch: Option<String>,
    pub head: Option<String>,
    /// The repository's original working tree (can't be removed).
    pub main: bool,
    /// The one this snapshot was read from.
    pub current: bool,
    pub locked: bool,
    /// Its folder is gone; `prune` forgets it.
    pub missing: bool,
}

#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WorktreeOp {
    /// Check out `branch` (an existing local branch) in a new folder `dir`, or,
    /// with `new_branch`, create that branch at `at` (default HEAD) there.
    Add {
        dir: String,
        branch: Option<String>,
        new_branch: Option<String>,
        at: Option<String>,
    },
    /// Without `force`, git refuses a worktree with changes (`Unmerged`).
    Remove { dir: String, force: bool },
    /// Forget worktrees whose folders were deleted.
    Prune,
}

/// Same folder, however it was spelled (symlinks, trailing separators, `\\?\`).
fn same(a: &Path, b: &Path) -> bool {
    match (dunce(a), dunce(b)) {
        (Some(a), Some(b)) => a == b,
        _ => a == b,
    }
}

fn dunce(p: &Path) -> Option<PathBuf> {
    let c = p.canonicalize().ok()?;
    #[cfg(windows)]
    if let Some(s) = c.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        return Some(PathBuf::from(s));
    }
    Some(c)
}

fn info(repo: &Repository, path: &Path, here: &Path, main: bool) -> WorktreeInfo {
    let head = read_head(repo);
    WorktreeInfo {
        path: path.to_string_lossy().trim_end_matches(['/', '\\']).to_string(),
        branch: head.branch,
        head: head.target,
        main,
        current: same(path, here),
        locked: false,
        missing: false,
    }
}

/// Every working tree of the repository `repo` belongs to, the main one first.
pub(super) fn list(repo: &Repository) -> Vec<WorktreeInfo> {
    let Some(here) = repo.workdir() else {
        return Vec::new();
    };
    // From a linked worktree, the main one is the repository its common dir belongs to.
    let main = if repo.is_worktree() {
        Repository::open(repo.commondir()).ok()
    } else {
        None
    };
    let main = main.as_ref().unwrap_or(repo);
    let mut out: Vec<WorktreeInfo> = main
        .workdir()
        .map(|w| info(main, w, here, true))
        .into_iter()
        .collect();
    let Ok(names) = main.worktrees() else {
        return out;
    };
    for name in names.iter().flatten() {
        let Ok(wt) = main.find_worktree(name) else {
            continue;
        };
        let locked = matches!(wt.is_locked(), Ok(WorktreeLockStatus::Locked(_)));
        let mut item = match Repository::open_from_worktree(&wt) {
            Ok(r) if wt.validate().is_ok() => info(&r, wt.path(), here, false),
            _ => WorktreeInfo {
                path: wt.path().to_string_lossy().into_owned(),
                branch: None,
                head: None,
                main: false,
                current: false,
                locked,
                missing: true,
            },
        };
        item.locked = locked;
        out.push(item);
    }
    out
}

pub fn apply(path: &str, op: &WorktreeOp) -> Result<OpResult> {
    let dir = workdir(&open(path)?)?;
    let mut args: Vec<&str> = vec!["worktree"];
    match op {
        WorktreeOp::Add {
            dir: target,
            branch,
            new_branch,
            at,
        } => {
            args.push("add");
            if let Some(b) = new_branch {
                args.extend(["-b", operand(b)?]);
            }
            args.push(operand(target)?);
            match (new_branch, branch, at) {
                (Some(_), _, Some(at)) => args.push(operand(at)?),
                (None, Some(b), _) => args.push(operand(b)?),
                (Some(_), _, None) => {}
                (None, None, _) => return Err("Choose a branch for the new worktree".into()),
            }
        }
        WorktreeOp::Remove { dir: target, force } => {
            args.push("remove");
            if *force {
                args.push("--force");
            }
            args.push(operand(target)?);
        }
        WorktreeOp::Prune => args.push("prune"),
    }
    let o = git(&dir, &args)?;
    if !o.ok && o.text.contains("use --force") {
        return Ok(OpResult::with(OpStatus::Unmerged, o));
    }
    Ok(o.into())
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;

    fn op(p: &Path, op: WorktreeOp) -> OpResult {
        apply(s(p), &op).unwrap()
    }

    #[test]
    fn adds_lists_and_removes_worktrees() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "a");
        let side = tempfile::tempdir().unwrap();
        let wt = side.path().join("feature-wt");
        let add = WorktreeOp::Add {
            dir: s(&wt).into(),
            branch: None,
            new_branch: Some("feature".into()),
            at: None,
        };
        assert_eq!(op(d.path(), add).status, OpStatus::Ok);

        let all = list(&open(s(d.path())).unwrap());
        assert_eq!(all.len(), 2);
        assert!(all[0].main && all[0].current);
        assert_eq!(all[0].branch.as_deref(), Some("main"));
        assert_eq!(all[1].branch.as_deref(), Some("feature"));
        assert!(!all[1].current && !all[1].missing);
        // Read from the linked one: the same list, it is the current one.
        let from_linked = list(&open(s(&wt)).unwrap());
        assert_eq!(from_linked.len(), 2);
        assert!(from_linked[0].main && !from_linked[0].current);
        assert!(from_linked[1].current);

        // A worktree with changes is refused unless forced.
        std::fs::write(wt.join("a.txt"), "dirty").unwrap();
        let rm = |force| WorktreeOp::Remove {
            dir: s(&wt).into(),
            force,
        };
        assert_eq!(op(d.path(), rm(false)).status, OpStatus::Unmerged);
        assert_eq!(op(d.path(), rm(true)).status, OpStatus::Ok);
        assert_eq!(list(&open(s(d.path())).unwrap()).len(), 1);
    }

    #[test]
    fn an_existing_branch_goes_out_and_a_deleted_folder_is_pruned() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "a");
        super::super::write::create_branch(s(d.path()), "topic", None, false).unwrap();
        let side = tempfile::tempdir().unwrap();
        let wt = side.path().join("topic");
        let add = WorktreeOp::Add {
            dir: s(&wt).into(),
            branch: Some("topic".into()),
            new_branch: None,
            at: None,
        };
        assert_eq!(op(d.path(), add.clone()).status, OpStatus::Ok);
        // The same branch can't be checked out twice.
        let again = WorktreeOp::Add {
            dir: s(&side.path().join("again")).into(),
            branch: Some("topic".into()),
            new_branch: None,
            at: None,
        };
        assert_eq!(op(d.path(), again).status, OpStatus::Failed);

        std::fs::remove_dir_all(&wt).unwrap();
        let all = list(&open(s(d.path())).unwrap());
        assert!(all[1].missing);
        assert_eq!(op(d.path(), WorktreeOp::Prune).status, OpStatus::Ok);
        assert_eq!(list(&open(s(d.path())).unwrap()).len(), 1);
        assert!(apply(
            s(d.path()),
            &WorktreeOp::Remove {
                dir: "--force".into(),
                force: false
            }
        )
        .is_err());
    }
}
