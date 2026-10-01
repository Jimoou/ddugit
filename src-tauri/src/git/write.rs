//! Local writes through the git CLI: commit, merge, abort/continue, checkout, branch.

use git2::{BranchType, Oid, RepositoryState};

use super::read::read_head;
use super::{
    git, git_ok, in_progress, open, repo_dir, state_name, workdir, OpResult, OpStatus, Output, Result,
};

/// Commit the given paths (exactly those, regardless of what else is staged).
/// An empty `paths` commits everything that has changed.
pub fn commit(path: &str, message: &str, paths: &[String]) -> Result<OpResult> {
    if message.trim().is_empty() {
        return Err("Commit message is empty".into());
    }
    let dir = repo_dir(path)?;
    let mut add: Vec<&str> = vec!["add", "-A", "--"];
    let mut commit: Vec<&str> = vec!["commit", "-m", message];
    if !paths.is_empty() {
        let ps: Vec<&str> = paths.iter().map(String::as_str).collect();
        add.extend(&ps);
        commit.push("--");
        commit.extend(&ps);
    }
    git_ok(&dir, &add)?;
    Ok(git(&dir, &commit)?.into())
}

/// Merge `source` (branch name or commit id) into `target` branch.
/// When `target` isn't the current branch it is checked out first.
pub fn merge(path: &str, source: &str, target: Option<&str>) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    if repo.state() != RepositoryState::Clean {
        return Err(format!(
            "Repository is in the middle of a {}; finish or abort it first",
            state_name(repo.state())
        ));
    }
    if let Some(t) = target {
        let current = read_head(&repo).branch;
        if current.as_deref() != Some(t) {
            git_ok(&dir, &["checkout", t])?;
        }
    }
    let o = git(&dir, &["merge", "--no-ff", "--no-edit", source])?;
    Ok(conflict_aware(path, o))
}

/// Failed and left mid-operation → `Conflict`, otherwise the plain result.
pub(super) fn conflict_aware(path: &str, o: Output) -> OpResult {
    if !o.ok && in_progress(path) {
        OpResult::with(OpStatus::Conflict, o)
    } else {
        o.into()
    }
}

/// Abort the merge / rebase / cherry-pick / revert in progress.
pub fn abort(path: &str) -> Result<OpResult> {
    let repo = open(path)?;
    let state = state_name(repo.state());
    if state == "clean" {
        return Err("Nothing to abort".into());
    }
    let args: &[&str] = if state == "bisect" {
        &["bisect", "reset"]
    } else {
        &[state, "--abort"]
    };
    Ok(git(&workdir(&repo)?, args)?.into())
}

/// Continue a rebase after conflicts were resolved (stages everything first).
/// A merge is concluded by committing instead.
pub fn continue_rebase(path: &str) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    git_ok(&dir, &["add", "-A"])?;
    let o = git(&dir, &["rebase", "--continue"])?;
    Ok(conflict_aware(path, o))
}

pub fn checkout(path: &str, target: &str) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    Ok(git(&dir, &["checkout", target])?.into())
}

pub fn create_branch(path: &str, name: &str, at: Option<&str>, switch: bool) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    if repo.find_branch(name, BranchType::Local).is_ok() {
        return Err(format!("Branch '{name}' already exists"));
    }
    let mut args = vec![if switch { "checkout" } else { "branch" }];
    if switch {
        args.push("-b");
    }
    args.push(name);
    if let Some(at) = at {
        // Validate early so the error is readable.
        Oid::from_str(at)
            .ok()
            .and_then(|o| repo.find_commit(o).ok())
            .or_else(|| {
                repo.revparse_single(at)
                    .ok()
                    .and_then(|o| o.peel_to_commit().ok())
            })
            .ok_or_else(|| format!("Unknown commit '{at}'"))?;
        args.push(at);
    }
    Ok(git(&dir, &args)?.into())
}

#[cfg(test)]
mod tests {
    use super::super::read::{snapshot, RefKind};
    use super::super::testutil::{commit_file, repo, s};
    use super::*;
    use std::fs;

    #[test]
    fn commit_only_selected_paths() {
        let d = repo();
        fs::write(d.path().join("a.txt"), "a").unwrap();
        fs::write(d.path().join("b.txt"), "b").unwrap();
        let r = commit(s(d.path()), "add a", &["a.txt".into()]).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);

        let snap = snapshot(s(d.path()), 100).unwrap();
        assert_eq!(snap.commits.len(), 1);
        assert_eq!(snap.commits[0].summary, "add a");
        assert_eq!(snap.changes.len(), 1);
        assert_eq!(snap.changes[0].path, "b.txt");
        assert_eq!(snap.changes[0].unstaged.as_deref(), Some("untracked"));
    }

    #[test]
    fn branch_and_merge_creates_merge_commit() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "f.txt", "f", "feature work");
        checkout(p, "main").unwrap();
        commit_file(d.path(), "m.txt", "m", "main work");

        let r = merge(p, "feature", Some("main")).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(p, 100).unwrap();
        assert_eq!(snap.commits[0].parents.len(), 2);
        assert_eq!(snap.head.branch.as_deref(), Some("main"));
        assert!(snap
            .refs
            .iter()
            .any(|r| r.name == "feature" && r.kind == RefKind::Local));
    }

    #[test]
    fn merge_into_other_branch_checks_it_out() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "f.txt", "f", "feature work");
        // HEAD is on feature; merge feature into main.
        let r = merge(p, "feature", Some("main")).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(snapshot(p, 100).unwrap().head.branch.as_deref(), Some("main"));
    }

    #[test]
    fn conflicting_merge_reports_conflict_and_can_abort() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "base", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "a.txt", "feature", "feature edit");
        checkout(p, "main").unwrap();
        commit_file(d.path(), "a.txt", "main", "main edit");

        let r = merge(p, "feature", None).unwrap();
        assert_eq!(r.status, OpStatus::Conflict);
        let snap = snapshot(p, 100).unwrap();
        assert_eq!(snap.state, "merge");
        assert!(snap.changes.iter().any(|c| c.conflicted));

        assert_eq!(abort(p).unwrap().status, OpStatus::Ok);
        assert_eq!(snapshot(p, 100).unwrap().state, "clean");
    }
}
