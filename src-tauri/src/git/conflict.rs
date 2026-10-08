//! Merge conflict inspection and resolution for a single file, and why it
//! conflicts: what each side did to it (index stages) and the commit that last
//! changed it (`sides`).

mod sides;

use std::fs;
use std::path::{Component, Path, PathBuf};

use git2::Repository;
use serde::{Deserialize, Serialize};

use super::search::SearchHit;
use super::{err, git_ok, literal, open, workdir, OpResult, OpStatus, Result, LITERAL};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConflictFile {
    pub path: String,
    /// Common ancestor version (`None` when the file was added on both sides).
    pub base: Option<String>,
    /// HEAD's side. During a rebase this is the branch being rebased onto.
    pub ours: Option<String>,
    /// The incoming side (merged branch / commit being picked or replayed).
    pub theirs: Option<String>,
    /// Working-tree file with conflict markers.
    pub merged: String,
    pub binary: bool,
    pub kind: ConflictKind,
    /// The last commit on HEAD's side that changed the file since the sides parted.
    pub ours_change: Option<SearchHit>,
    /// The same on the incoming side; for a pick, revert or rebase step, the commit
    /// being applied. `None` when no ref names the incoming commit (a squash merge,
    /// a stash pop, a plain patch).
    pub theirs_change: Option<SearchHit>,
}

/// What the index stages say the two sides did to the file.
#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ConflictKind {
    /// Both sides changed it (the same lines, or a binary file).
    Content,
    /// HEAD's side deleted it, the incoming side changed it.
    DeletedByUs,
    /// The incoming side deleted it, HEAD's side changed it.
    DeletedByThem,
    /// Both sides added a file at this path.
    AddedByBoth,
}

/// How to resolve one conflicted file; the frontend sends `{ kind, ... }`.
#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Resolution {
    Ours,
    Theirs,
    /// Write this text (e.g. picked per conflict block in the UI).
    Content {
        text: String,
    },
}

fn blob_text(repo: &Repository, entry: Option<&git2::IndexEntry>) -> (Option<String>, bool) {
    let Some(e) = entry else { return (None, false) };
    match repo.find_blob(e.id) {
        Ok(b) if b.is_binary() => (None, true),
        Ok(b) => (Some(String::from_utf8_lossy(b.content()).into_owned()), false),
        Err(_) => (None, false),
    }
}

/// `file` as a path inside the work tree: relative, no `..`, not through a symlink.
fn inside(dir: &Path, file: &str) -> Result<PathBuf> {
    let rel = Path::new(file);
    if file.is_empty() || rel.is_absolute() || rel.components().any(|c| !matches!(c, Component::Normal(_))) {
        return Err(format!("'{file}' is not a path inside the repository"));
    }
    let full = dir.join(rel);
    if full.symlink_metadata().is_ok_and(|m| m.file_type().is_symlink()) {
        return Err(format!(
            "'{file}' is a symbolic link; resolve it with Ours or Theirs"
        ));
    }
    Ok(full)
}

/// The conflicted `file` with each side's last change (see [`sides::last_changes`]).
pub fn conflict_file(path: &str, file: &str) -> Result<ConflictFile> {
    let repo = open(path)?;
    let mut c = read(&repo, file)?;
    (c.ours_change, c.theirs_change) = sides::last_changes(&repo, file);
    Ok(c)
}

/// The conflicted `file`'s stages and work-tree text, without looking through history.
fn read(repo: &Repository, file: &str) -> Result<ConflictFile> {
    let index = repo.index().map_err(err)?;
    let conflict = index
        .conflicts()
        .map_err(err)?
        .filter_map(|c| c.ok())
        .find(|c| {
            [&c.our, &c.their, &c.ancestor]
                .iter()
                .any(|e| e.as_ref().is_some_and(|e| e.path == file.as_bytes()))
        })
        .ok_or_else(|| format!("'{file}' is not in conflict"))?;
    let kind = match (&conflict.ancestor, &conflict.our, &conflict.their) {
        (Some(_), None, Some(_)) => ConflictKind::DeletedByUs,
        (Some(_), Some(_), None) => ConflictKind::DeletedByThem,
        (None, Some(_), Some(_)) => ConflictKind::AddedByBoth,
        _ => ConflictKind::Content,
    };
    let (base, b1) = blob_text(repo, conflict.ancestor.as_ref());
    let (ours, b2) = blob_text(repo, conflict.our.as_ref());
    let (theirs, b3) = blob_text(repo, conflict.their.as_ref());
    // A symlink in the work tree is not followed: its target may be anywhere.
    let merged = inside(&workdir(repo)?, file)
        .ok()
        .and_then(|p| fs::read(p).ok())
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default();
    Ok(ConflictFile {
        path: file.to_string(),
        base,
        ours,
        theirs,
        merged,
        binary: b1 || b2 || b3,
        kind,
        ours_change: None,
        theirs_change: None,
    })
}

/// Resolve `file` and mark it resolved in the index. A side that deleted the
/// file resolves to a deletion.
pub fn resolve(path: &str, file: &str, how: &Resolution) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let side = match how {
        Resolution::Ours => Some(("--ours", read(&repo, file)?.ours.is_some())),
        Resolution::Theirs => Some(("--theirs", read(&repo, file)?.theirs.is_some())),
        Resolution::Content { .. } => None,
    };
    let out = match (how, side) {
        (_, Some((_, false))) => git_ok(&dir, &[LITERAL, "rm", "-q", "--", file])?,
        (_, Some((flag, true))) => {
            git_ok(&dir, &["checkout", flag, "--", &literal(file)])?;
            git_ok(&dir, &[LITERAL, "add", "--", file])?
        }
        (Resolution::Content { text }, None) => {
            // Only a file that is in conflict, and only inside the work tree.
            read(&repo, file)?;
            fs::write(inside(&dir, file)?, text).map_err(err)?;
            git_ok(&dir, &[LITERAL, "add", "--", file])?
        }
        _ => unreachable!("sides only come from Ours / Theirs"),
    };
    Ok(OpResult {
        status: OpStatus::Ok,
        output: out,
    })
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::super::write::{checkout, create_branch, merge, MergeMode};
    use super::super::OpStatus;
    use super::*;

    /// main and feature both edit a.txt → merge feature into main conflicts.
    fn conflicted() -> tempfile::TempDir {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "one\nbase\nthree\n", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "a.txt", "one\nfeature\nthree\n", "feature edit");
        checkout(p, "main").unwrap();
        commit_file(d.path(), "a.txt", "one\nmain\nthree\n", "main edit");
        assert_eq!(
            merge(p, "feature", None, MergeMode::Commit, None).unwrap().status,
            OpStatus::Conflict
        );
        d
    }

    #[test]
    fn reads_all_three_sides_and_markers() {
        let d = conflicted();
        let c = conflict_file(s(d.path()), "a.txt").unwrap();
        assert_eq!(c.base.as_deref(), Some("one\nbase\nthree\n"));
        assert_eq!(c.ours.as_deref(), Some("one\nmain\nthree\n"));
        assert_eq!(c.theirs.as_deref(), Some("one\nfeature\nthree\n"));
        assert!(c.merged.contains("<<<<<<<") && c.merged.contains(">>>>>>>"));
        assert!(!c.binary);
        assert!(conflict_file(s(d.path()), "nope.txt").is_err());
    }

    #[test]
    fn writes_only_conflicted_files_inside_the_work_tree() {
        let d = conflicted();
        let p = s(d.path());
        let write = |file: &str| resolve(p, file, &Resolution::Content { text: "x".into() });
        assert!(write("../outside.txt").is_err());
        assert!(write("/tmp/outside.txt").is_err());
        // In the repository but not in conflict.
        std::fs::write(d.path().join("b.txt"), "b").unwrap();
        assert!(write("b.txt").is_err());
        assert!(!d.path().parent().unwrap().join("outside.txt").exists());
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_a_conflicted_symlink() {
        let d = conflicted();
        let outside = tempfile::NamedTempFile::new().unwrap();
        std::fs::write(outside.path(), "secret").unwrap();
        std::fs::remove_file(d.path().join("a.txt")).unwrap();
        std::os::unix::fs::symlink(outside.path(), d.path().join("a.txt")).unwrap();
        let p = s(d.path());
        assert_eq!(conflict_file(p, "a.txt").unwrap().merged, "");
        assert!(resolve(p, "a.txt", &Resolution::Content { text: "x".into() }).is_err());
        assert_eq!(std::fs::read_to_string(outside.path()).unwrap(), "secret");
    }

    #[test]
    fn resolve_with_each_choice_clears_the_conflict() {
        for (how, expect) in [
            (Resolution::Ours, "one\nmain\nthree\n"),
            (Resolution::Theirs, "one\nfeature\nthree\n"),
            (
                Resolution::Content {
                    text: "one\nboth\nthree\n".into(),
                },
                "one\nboth\nthree\n",
            ),
        ] {
            let d = conflicted();
            let p = s(d.path());
            let r = resolve(p, "a.txt", &how).unwrap();
            assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
            assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), expect);
            let snap = snapshot(p, 5).unwrap();
            assert!(snap.changes.iter().all(|c| !c.conflicted), "{how:?}");
            assert_eq!(snap.state, "merge"); // still needs the merge commit
        }
    }

    #[test]
    fn resolution_json_shape() {
        let r: Resolution = serde_json::from_str(r#"{"kind":"content","text":"x"}"#).unwrap();
        assert_eq!(r, Resolution::Content { text: "x".into() });
        let r: Resolution = serde_json::from_str(r#"{"kind":"theirs"}"#).unwrap();
        assert_eq!(r, Resolution::Theirs);
    }
}
