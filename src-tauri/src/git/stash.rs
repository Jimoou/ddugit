//! Working-tree housekeeping: discard changes and the stash.

use git2::Repository;
use serde::{Deserialize, Serialize};

use super::read::read_changes;
use super::{err, git, git_ok, literal, open, workdir, OpResult, OpStatus, Result, LITERAL};

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
            vec![
                LITERAL,
                "restore",
                "--source=HEAD",
                "--staged",
                "--worktree",
                "--",
            ]
        } else {
            // Unborn branch: nothing to restore from; just unstage, then delete below.
            vec![LITERAL, "rm", "-r", "-q", "-f", "--"]
        };
        args.extend(&tracked);
        out.push(git_ok(&dir, &args)?);
    }
    if !untracked.is_empty() {
        let mut args = vec![LITERAL, "clean", "-f", "-q", "--"];
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
    // Not `LITERAL`: stash's own internal pathspecs need magic, so each path is spelled literal.
    let specs: Vec<String> = paths.iter().map(|p| literal(p)).collect();
    let mut args = vec!["stash", "push", "--include-untracked"];
    if !message.trim().is_empty() {
        args.extend(["-m", message.trim()]);
    }
    if !paths.is_empty() {
        args.push("--");
        args.extend(specs.iter().map(String::as_str));
    }
    Ok(git(&dir, &args)?.into())
}

/// Apply, pop or drop the stash whose commit is `id`. Its position is looked up
/// right before acting: a stash pushed or dropped meanwhile (a terminal, an IDE)
/// shifts `stash@{n}`, and acting on a stale position would drop another one.
pub fn stash(path: &str, op: StashOp, id: &str) -> Result<OpResult> {
    let mut repo = open(path)?;
    let dir = workdir(&repo)?;
    let mut index = None;
    repo.stash_foreach(|i, _, oid| {
        let hit = oid.to_string() == id;
        if hit {
            index = Some(i);
        }
        !hit
    })
    .map_err(err)?;
    let index = index.ok_or("That stash no longer exists; the list has been refreshed")?;
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

    /// File names are not globs: discarding `u?` must not delete `ux`, and a
    /// file named `*` or `:(top)x` is just that file.
    #[test]
    fn discard_and_stash_take_paths_literally() {
        // `[x]` is a pathspec glob that matches `x` and is a legal file name on every OS.
        let d = repo();
        commit_file(d.path(), "t[x].txt", "t", "base");
        commit_file(d.path(), "tx.txt", "t", "base2");
        for n in ["u[x]", "ux"] {
            fs::write(d.path().join(n), "u").unwrap();
        }
        fs::write(d.path().join("t[x].txt"), "edit").unwrap();
        fs::write(d.path().join("tx.txt"), "edit").unwrap();
        discard(s(d.path()), &["u[x]".into()]).unwrap();
        assert!(!d.path().join("u[x]").exists());
        assert!(d.path().join("ux").exists());
        discard(s(d.path()), &["t[x].txt".into()]).unwrap();
        assert_eq!(fs::read_to_string(d.path().join("t[x].txt")).unwrap(), "t");
        assert_eq!(fs::read_to_string(d.path().join("tx.txt")).unwrap(), "edit");
        if cfg!(unix) {
            // Pathspec magic in a name: only possible where `:` is allowed in file names.
            fs::write(d.path().join(":(top)x"), "u").unwrap();
            let r = stash_push(s(d.path()), "", &[":(top)x".into()]).unwrap();
            assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
            assert!(!d.path().join(":(top)x").exists());
            assert!(d.path().join("ux").exists());
        }
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

        assert_eq!(
            stash(s(d.path()), StashOp::Pop, &list[0].id).unwrap().status,
            OpStatus::Ok
        );
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
        let id = read_stashes(s(d.path())).unwrap()[0].id.clone();

        assert_eq!(
            stash(s(d.path()), StashOp::Apply, &id).unwrap().status,
            OpStatus::Ok
        );
        assert!(d.path().join("u.txt").exists());
        assert_eq!(read_stashes(s(d.path())).unwrap().len(), 1); // apply keeps it
        assert_eq!(
            stash(s(d.path()), StashOp::Drop, &id).unwrap().status,
            OpStatus::Ok
        );
        assert!(read_stashes(s(d.path())).unwrap().is_empty());
        assert!(stash(s(d.path()), StashOp::Drop, &id).is_err());
    }

    /// A stash pushed from a terminal shifts `stash@{n}`; acting by id still hits the one shown.
    #[test]
    fn acts_on_the_stash_by_id_after_another_was_pushed() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "base");
        fs::write(d.path().join("a.txt"), "first").unwrap();
        stash_push(s(d.path()), "first", &[]).unwrap();
        let shown = read_stashes(s(d.path())).unwrap()[0].id.clone();
        fs::write(d.path().join("a.txt"), "second").unwrap();
        git_ok(d.path(), &["stash", "push", "-q", "-m", "second"]).unwrap();

        let r = stash(s(d.path()), StashOp::Drop, &shown).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let left = read_stashes(s(d.path())).unwrap();
        assert_eq!(left.len(), 1);
        assert!(left[0].message.contains("second"));
        assert!(stash(s(d.path()), StashOp::Pop, &shown).is_err());
        assert!(stash(s(d.path()), StashOp::Pop, "not-an-id").is_err());
    }

    #[test]
    fn conflicting_pop_reports_conflict_and_keeps_stash() {
        let d = repo();
        commit_file(d.path(), "a.txt", "base", "base");
        fs::write(d.path().join("a.txt"), "stashed").unwrap();
        stash_push(s(d.path()), "x", &[]).unwrap();
        commit_file(d.path(), "a.txt", "committed", "other");

        let id = read_stashes(s(d.path())).unwrap()[0].id.clone();
        let r = stash(s(d.path()), StashOp::Pop, &id).unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        assert_eq!(read_stashes(s(d.path())).unwrap().len(), 1);
    }
}
