//! Local writes through the git CLI: commit/amend, merge, abort/continue, checkout, branch.

use std::path::PathBuf;

use git2::{BranchType, Oid, RepositoryState};

use super::literal;
use super::read::read_head;
use super::{
    git, git_ok, in_progress, open, operand, repo_dir, state_name, workdir, OpResult, OpStatus, Output,
    Result, LITERAL,
};

/// Commit the given paths (exactly those, regardless of what else is staged).
/// An empty `paths` commits everything that has changed — except with `amend`,
/// where it means "only reword the last commit".
pub fn commit(path: &str, message: &str, paths: &[String], amend: bool) -> Result<OpResult> {
    if message.trim().is_empty() {
        return Err("Commit message is empty".into());
    }
    let dir = repo_dir(path)?;
    let ps: Vec<&str> = paths.iter().map(String::as_str).collect();
    // `commit` runs hooks, so its paths are spelled literal one by one (see `LITERAL`).
    let specs: Vec<String> = ps.iter().map(|p| literal(p)).collect();
    let mut commit: Vec<&str> = vec!["commit", "-m", message];
    if amend {
        commit.push("--amend");
    }
    if amend && ps.is_empty() {
        commit.push("--only"); // reword: ignore whatever is staged
    } else {
        let mut add = vec![LITERAL, "add", "-A", "--"];
        add.extend(&ps);
        git_ok(&dir, &add)?;
        if !ps.is_empty() {
            commit.push("--");
            commit.extend(specs.iter().map(String::as_str));
        }
    }
    Ok(git(&dir, &commit)?.into())
}

/// Commit exactly what is staged in the index (after hunk staging).
pub fn commit_index(path: &str, message: &str, amend: bool) -> Result<OpResult> {
    if message.trim().is_empty() {
        return Err("Commit message is empty".into());
    }
    let mut args = vec!["commit", "-m", message];
    if amend {
        args.push("--amend");
    }
    Ok(git(&repo_dir(path)?, &args)?.into())
}

/// Refuse to start while another operation is half-done.
fn require_clean(repo: &git2::Repository) -> Result<()> {
    match repo.state() {
        RepositoryState::Clean => Ok(()),
        state => Err(format!(
            "Repository is in the middle of a {}; finish or abort it first",
            state_name(state)
        )),
    }
}

/// Refuse to start while another operation is half-done, then check out
/// `target` if it isn't already HEAD. Shared by merge and cherry-pick.
pub(super) fn prepare_on(path: &str, target: Option<&str>) -> Result<PathBuf> {
    target.map(operand).transpose()?;
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    require_clean(&repo)?;
    if let Some(t) = target {
        if read_head(&repo).branch.as_deref() != Some(t) {
            git_ok(&dir, &["checkout", t, "--"])?;
        }
    }
    Ok(dir)
}

/// Merge `source` (branch name or commit id) into `target` branch.
/// When `target` isn't the current branch it is checked out first.
pub fn merge(path: &str, source: &str, target: Option<&str>) -> Result<OpResult> {
    operand(source)?;
    let dir = prepare_on(path, target)?;
    let o = git(&dir, &["merge", "--no-ff", "--no-edit", source])?;
    Ok(conflict_aware(path, o))
}

/// Failed and left mid-operation → `Conflict`, otherwise the plain result.
pub(super) fn conflict_aware(path: &str, o: Output) -> OpResult {
    if o.ok || !in_progress(path) {
        return o.into();
    }
    // Stopped with nothing in conflict: the commit's change is already here.
    let conflicted = open(path)
        .and_then(|r| r.index().map_err(super::err))
        .is_ok_and(|i| i.has_conflicts());
    if !conflicted && o.text.contains("now empty") {
        OpResult::with(OpStatus::Empty, o)
    } else {
        OpResult::with(OpStatus::Conflict, o)
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

/// Continue a rebase / cherry-pick / revert after conflicts were resolved
/// (stages the tracked files first: conflicted paths are always tracked, and an
/// unrelated untracked file such as `.env` must not slip into the rewritten
/// commit). A merge is concluded by committing instead.
pub fn continue_op(path: &str) -> Result<OpResult> {
    let repo = open(path)?;
    let state = state_name(repo.state());
    if !matches!(state, "rebase" | "cherry-pick" | "revert") {
        return Err(format!("Nothing to continue ({state})"));
    }
    let dir = workdir(&repo)?;
    git_ok(&dir, &["add", "-u"])?;
    let o = git(&dir, &[state, "--continue"])?;
    Ok(conflict_aware(path, o))
}

/// Drop the step a cherry-pick / revert / rebase stopped on and go on with the rest.
pub fn skip(path: &str) -> Result<OpResult> {
    let repo = open(path)?;
    let state = state_name(repo.state());
    if !matches!(state, "rebase" | "cherry-pick" | "revert") {
        return Err(format!("Nothing to skip ({state})"));
    }
    let o = git(&workdir(&repo)?, &[state, "--skip"])?;
    Ok(conflict_aware(path, o))
}

/// Check out branch or commit `target`. The `--` makes it a revision only: a
/// name that isn't one (a branch deleted from a terminal) fails instead of
/// checking out a file of that name over its local edits. A remote branch's
/// name still makes a local branch that follows it.
pub fn checkout(path: &str, target: &str) -> Result<OpResult> {
    operand(target)?;
    let dir = repo_dir(path)?;
    Ok(git(&dir, &["checkout", target, "--"])?.into())
}

pub fn create_branch(path: &str, name: &str, at: Option<&str>, switch: bool) -> Result<OpResult> {
    operand(name)?;
    at.map(operand).transpose()?;
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
    if switch {
        args.push("--");
    }
    Ok(git(&dir, &args)?.into())
}

/// How `switch_or_create` got onto the branch.
#[derive(Debug, serde::Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Switched {
    /// It already was the current branch.
    Already,
    /// An existing local branch.
    Local,
    /// A new local branch following a remote one (`origin` first).
    Tracked,
    /// A new branch at the current commit.
    Created,
}

#[derive(Debug, serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SwitchResult {
    pub result: OpResult,
    /// Set when it worked.
    pub how: Option<Switched>,
}

/// Get onto branch `name` the same way in every repository of a batch: the local
/// branch if there is one, else a remote's branch of that name, else a new branch
/// here. Refuses mid-operation; git itself refuses when local changes would be lost.
pub fn switch_or_create(path: &str, name: &str) -> Result<SwitchResult> {
    let name = operand(name.trim())?;
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    require_clean(&repo)?;
    let done = |o: Output, how: Switched| {
        let ok = o.ok;
        SwitchResult {
            result: o.into(),
            how: ok.then_some(how),
        }
    };
    if repo.find_branch(name, BranchType::Local).is_ok() {
        if read_head(&repo).branch.as_deref() == Some(name) {
            let o = Output {
                ok: true,
                text: format!("Already on '{name}'"),
            };
            return Ok(done(o, Switched::Already));
        }
        return Ok(done(git(&dir, &["checkout", name, "--"])?, Switched::Local));
    }
    let mut remotes: Vec<String> = repo
        .remotes()
        .map_err(super::err)?
        .iter()
        .flatten()
        .map(String::from)
        .collect();
    remotes.sort_by_key(|r| r != "origin");
    let tracked = remotes
        .iter()
        .map(|r| format!("{r}/{name}"))
        .find(|r| repo.find_branch(r, BranchType::Remote).is_ok());
    Ok(match tracked {
        Some(r) => done(
            git(&dir, &["checkout", "-b", name, "--track", &r, "--"])?,
            Switched::Tracked,
        ),
        None => done(git(&dir, &["checkout", "-b", name, "--"])?, Switched::Created),
    })
}

#[cfg(test)]
mod tests {
    use super::super::read::{snapshot, RefKind};
    use super::super::testutil::{commit_file, repo, s};
    use super::*;
    use std::fs;

    #[test]
    fn switch_or_create_takes_local_then_remote_then_makes_one() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        let how = |name: &str| {
            let r = switch_or_create(p, name).unwrap();
            assert_eq!(r.result.status, OpStatus::Ok, "{}", r.result.output);
            r.how.unwrap()
        };
        assert_eq!(how("main"), Switched::Already);
        assert_eq!(how("release"), Switched::Created);
        assert_eq!(how("main"), Switched::Local);

        // A branch that only exists on the remote is followed, not created afresh.
        let bare = tempfile::tempdir().unwrap();
        git_ok(bare.path(), &["init", "-q", "--bare"]).unwrap();
        git_ok(d.path(), &["remote", "add", "origin", s(bare.path())]).unwrap();
        git_ok(d.path(), &["push", "-q", "origin", "release:hotfix"]).unwrap();
        git_ok(d.path(), &["fetch", "-q", "origin"]).unwrap();
        assert_eq!(how("hotfix"), Switched::Tracked);
        let upstream = git_ok(d.path(), &["rev-parse", "--abbrev-ref", "hotfix@{upstream}"]).unwrap();
        assert_eq!(upstream.trim(), "origin/hotfix");

        // Local changes that a switch would overwrite: git refuses, nothing is lost.
        commit_file(d.path(), "a.txt", "b", "on hotfix");
        fs::write(d.path().join("a.txt"), "dirty").unwrap();
        let r = switch_or_create(p, "main").unwrap();
        assert_eq!(r.result.status, OpStatus::Failed);
        assert_eq!(r.how, None);
        assert!(switch_or_create(p, "--orphan").is_err());
    }

    /// A name that is no branch any more but is a file: the file's edits stay.
    #[test]
    fn checkout_of_a_name_that_is_only_a_file_keeps_its_edits() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "gone", "committed", "base");
        fs::write(d.path().join("gone"), "my edit").unwrap();
        assert_eq!(checkout(p, "gone").unwrap().status, OpStatus::Failed);
        assert!(switch_or_create(p, "gone").is_ok());
        git_ok(d.path(), &["checkout", "-q", "main"]).unwrap();
        assert_eq!(fs::read_to_string(d.path().join("gone")).unwrap(), "my edit");
    }

    /// `checkout <name> --` still makes a local branch following `origin/<name>`.
    #[test]
    fn checkout_of_a_remote_only_branch_tracks_it() {
        let origin = repo();
        commit_file(origin.path(), "a.txt", "a", "base");
        git_ok(origin.path(), &["branch", "feat"]).unwrap();
        let d = tempfile::tempdir().unwrap();
        git_ok(d.path(), &["clone", "-q", s(origin.path()), "."]).unwrap();
        let r = checkout(s(d.path()), "feat").unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(s(d.path()), 5).unwrap();
        assert_eq!(snap.head.branch.as_deref(), Some("feat"));
        assert_eq!(snap.head.upstream.as_deref(), Some("origin/feat"));
    }

    /// Continue stages the resolved files but not an unrelated untracked one.
    #[test]
    fn continue_leaves_untracked_files_out() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "base", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "a.txt", "feature", "feature edit");
        checkout(p, "main").unwrap();
        commit_file(d.path(), "a.txt", "main", "main edit");
        let feat = git_ok(d.path(), &["rev-parse", "feature"]).unwrap();
        let r =
            super::super::pick::pick(p, super::super::pick::PickOp::CherryPick, feat.trim(), None).unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        fs::write(d.path().join("a.txt"), "resolved").unwrap();
        fs::write(d.path().join(".env"), "SECRET=1").unwrap();
        let r = continue_op(p).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let files = git_ok(d.path(), &["show", "--name-only", "--format=", "HEAD"]).unwrap();
        assert_eq!(files.trim(), "a.txt");
        assert!(d.path().join(".env").exists());
    }

    #[test]
    fn commit_only_selected_paths() {
        let d = repo();
        fs::write(d.path().join("a.txt"), "a").unwrap();
        fs::write(d.path().join("b.txt"), "b").unwrap();
        let r = commit(s(d.path()), "add a", &["a.txt".into()], false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);

        let snap = snapshot(s(d.path()), 100).unwrap();
        assert_eq!(snap.commits.len(), 1);
        assert_eq!(snap.commits[0].summary, "add a");
        assert_eq!(snap.changes.len(), 1);
        assert_eq!(snap.changes[0].path, "b.txt");
        assert_eq!(snap.changes[0].unstaged.as_deref(), Some("untracked"));
    }

    #[cfg(unix)] // `?` can't be in a Windows file name
    #[test]
    fn commit_takes_paths_literally() {
        let d = repo();
        fs::write(d.path().join("a?.txt"), "a").unwrap();
        fs::write(d.path().join("ab.txt"), "b").unwrap();
        let r = commit(s(d.path()), "only a?", &["a?.txt".into()], false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(s(d.path()), 100).unwrap();
        assert_eq!(snap.changes.len(), 1);
        assert_eq!(snap.changes[0].path, "ab.txt");
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

    #[test]
    fn amend_rewords_or_adds_files() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "first");
        commit_file(d.path(), "b.txt", "b", "typo mesage");
        fs::write(d.path().join("c.txt"), "c").unwrap();

        // Reword only: the untracked c.txt must not sneak in.
        assert_eq!(commit(p, "typo message", &[], true).unwrap().status, OpStatus::Ok);
        let snap = snapshot(p, 10).unwrap();
        assert_eq!(snap.commits.len(), 2);
        assert_eq!(snap.commits[0].summary, "typo message");
        assert_eq!(snap.changes.len(), 1);

        // Amend with a file.
        assert_eq!(
            commit(p, "typo message", &["c.txt".into()], true).unwrap().status,
            OpStatus::Ok
        );
        let snap = snapshot(p, 10).unwrap();
        assert_eq!(snap.commits.len(), 2);
        assert!(snap.changes.is_empty());
    }

    #[test]
    fn a_new_branch_in_an_empty_repository_becomes_its_first_branch() {
        let d = repo();
        let p = s(d.path());
        let r = create_branch(p, "trunk", None, true).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        commit_file(d.path(), "a.txt", "a", "first");
        let snap = snapshot(p, 5).unwrap();
        assert_eq!(snap.head.branch.as_deref(), Some("trunk"));
    }

    #[test]
    fn a_new_branch_in_an_empty_repository_can_start_from_a_fetched_remote() {
        // `init` + add remote + fetch: no local branch, HEAD on an unborn `main`.
        let origin = repo();
        commit_file(origin.path(), "a.txt", "a", "theirs");
        let d = repo();
        let p = s(d.path());
        super::super::git_ok(d.path(), &["remote", "add", "origin", s(origin.path())]).unwrap();
        super::super::git_ok(d.path(), &["fetch", "-q", "origin"]).unwrap();

        let r = create_branch(p, "feat", Some("origin/main"), true).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(p, 5).unwrap();
        assert_eq!(snap.head.branch.as_deref(), Some("feat"));
        assert_eq!(snap.head.upstream.as_deref(), Some("origin/main"));
        assert_eq!(snap.commits.len(), 1);
        assert!(d.path().join("a.txt").exists());
    }
}
