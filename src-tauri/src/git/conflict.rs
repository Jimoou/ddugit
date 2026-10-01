//! Merge conflict inspection and resolution for a single file.

use std::fs;

use git2::Repository;
use serde::{Deserialize, Serialize};

use super::{err, git_ok, open, workdir, OpResult, OpStatus, Result};

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

pub fn conflict_file(path: &str, file: &str) -> Result<ConflictFile> {
    let repo = open(path)?;
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
    let (base, b1) = blob_text(&repo, conflict.ancestor.as_ref());
    let (ours, b2) = blob_text(&repo, conflict.our.as_ref());
    let (theirs, b3) = blob_text(&repo, conflict.their.as_ref());
    let merged = fs::read(workdir(&repo)?.join(file))
        .map(|b| String::from_utf8_lossy(&b).into_owned())
        .unwrap_or_default();
    Ok(ConflictFile {
        path: file.to_string(),
        base,
        ours,
        theirs,
        merged,
        binary: b1 || b2 || b3,
    })
}

/// Resolve `file` and mark it resolved in the index. A side that deleted the
/// file resolves to a deletion.
pub fn resolve(path: &str, file: &str, how: &Resolution) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let side = match how {
        Resolution::Ours => Some(("--ours", conflict_file(path, file)?.ours.is_some())),
        Resolution::Theirs => Some(("--theirs", conflict_file(path, file)?.theirs.is_some())),
        Resolution::Content { .. } => None,
    };
    let out = match (how, side) {
        (_, Some((_, false))) => git_ok(&dir, &["rm", "-q", "--", file])?,
        (_, Some((flag, true))) => {
            git_ok(&dir, &["checkout", flag, "--", file])?;
            git_ok(&dir, &["add", "--", file])?
        }
        (Resolution::Content { text }, None) => {
            fs::write(dir.join(file), text).map_err(err)?;
            git_ok(&dir, &["add", "--", file])?
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
    use super::super::write::{checkout, create_branch, merge};
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
        assert_eq!(merge(p, "feature", None).unwrap().status, OpStatus::Conflict);
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
