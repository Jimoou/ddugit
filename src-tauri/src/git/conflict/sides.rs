//! Why a file conflicts, in history: the commit that last changed it on each
//! side since the two sides parted. Read with libgit2, newest first, capped.

use std::collections::HashMap;
use std::path::Path;

use git2::{Commit, Oid, Repository};

use crate::git::read::TimeWalk;
use crate::git::search::SearchHit;

/// Refs naming the incoming commit, and whether that commit is the change being
/// applied (a pick, revert or rebase step) rather than the tip of a history to
/// look through (a merge). A `--rebase-merges` merge step has both MERGE_HEAD and
/// REBASE_HEAD: the merge comes first.
const INCOMING: [(&str, bool); 4] = [
    ("MERGE_HEAD", false),
    ("CHERRY_PICK_HEAD", true),
    ("REVERT_HEAD", true),
    ("REBASE_HEAD", true),
];

/// Commits read per side at most: a long history must not hold the sheet up.
const WALK_CAP: usize = 2000;

/// The commit that last changed `file` on HEAD's side and on the incoming side,
/// each counted from where the two sides parted (their merge base). The incoming
/// side is `None` when no ref names it (a squash merge, a stash pop, a plain patch).
pub(super) fn last_changes(repo: &Repository, file: &str) -> (Option<SearchHit>, Option<SearchHit>) {
    let head = repo.head().and_then(|h| h.peel_to_commit()).ok();
    let incoming = INCOMING.iter().find_map(|&(name, applied)| {
        let c = repo.revparse_single(name).and_then(|o| o.peel_to_commit()).ok()?;
        Some((c, applied))
    });
    let base = match (&head, &incoming) {
        (Some(h), Some((c, _))) => repo.merge_base(h.id(), c.id()).ok(),
        _ => None,
    };
    let file = Path::new(file);
    let ours = head.and_then(|h| last_change(repo, h, base, file));
    let theirs = incoming.and_then(|(c, applied)| {
        if applied {
            Some(hit(&c))
        } else {
            last_change(repo, c, base, file)
        }
    });
    (ours, theirs)
}

/// The newest commit (by commit time) from `tip` that changed `file`, leaving
/// out `base` and what it already has. A merge counts only when the file differs
/// from every parent, like `git log -- <file>`.
fn last_change(repo: &Repository, tip: Commit, base: Option<Oid>, file: &Path) -> Option<SearchHit> {
    let mut blobs: HashMap<Oid, Option<Oid>> = HashMap::new();
    let mut blob_in = |c: &Commit| {
        *blobs
            .entry(c.id())
            .or_insert_with(|| c.tree().ok()?.get_path(file).ok().map(|e| e.id()))
    };
    let base_time = base
        .and_then(|b| repo.find_commit(b).ok())
        .map(|b| b.time().seconds());
    let mut walk = TimeWalk::default();
    walk.push(tip);
    for _ in 0..WALK_CAP {
        let c = walk.pop()?;
        if Some(c.id()) == base {
            continue;
        }
        let here = blob_in(&c);
        let parents: Vec<Commit> = c.parents().collect();
        let changed = if parents.is_empty() {
            here.is_some()
        } else {
            parents.iter().all(|p| blob_in(p) != here)
        };
        if !changed {
            parents.into_iter().for_each(|p| walk.push(p));
            continue;
        }
        // Reached along another line to what the base already has: not this side's
        // change. Only an older commit can be (asking about a newer one would walk
        // the whole range), clock skew aside.
        let behind = base.zip(base_time).is_some_and(|(b, t)| {
            c.time().seconds() <= t && repo.graph_descendant_of(b, c.id()).unwrap_or(false)
        });
        if !behind {
            return Some(hit(&c));
        }
    }
    None
}

fn hit(c: &Commit) -> SearchHit {
    SearchHit {
        id: c.id().to_string(),
        summary: c.summary().unwrap_or("").to_string(),
        author: c.author().name().unwrap_or("").to_string(),
        time: c.time().seconds(),
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::super::{conflict_file, ConflictKind};
    use super::*;
    use crate::git::pick::{pick, PickOp};
    use crate::git::rebase::onto;
    use crate::git::testutil::{repo, run, s};
    use crate::git::write::{abort, checkout, create_branch, merge, MergeMode};
    use crate::git::OpStatus;

    /// Times in these tests are seconds after this (git reads small numbers as other dates).
    const EPOCH: i64 = 1_700_000_000;

    /// Write (or with `None` delete) `file`, then commit everything with both
    /// dates at `secs` after [`EPOCH`]: the tests compare commit times.
    fn commit_at(p: &Path, file: &str, content: Option<&str>, msg: &str, secs: i64) {
        match content {
            Some(text) => fs::write(p.join(file), text).unwrap(),
            None => fs::remove_file(p.join(file)).unwrap(),
        }
        run(p, &["add", "-A"]);
        let date = format!("{} +0000", EPOCH + secs);
        let out = std::process::Command::new("git")
            .current_dir(p)
            .args(["commit", "-q", "-m", msg])
            .env("GIT_AUTHOR_DATE", &date)
            .env("GIT_COMMITTER_DATE", &date)
            .output()
            .unwrap();
        assert!(out.status.success(), "{}", String::from_utf8_lossy(&out.stderr));
    }

    /// a.txt from "base"; feature gives it `feature` (None deletes it) at 3000,
    /// main edits it at 2000; each side then commits another file later.
    fn timed(feature: Option<&str>) -> tempfile::TempDir {
        let d = repo();
        let (p, dir) = (s(d.path()), d.path());
        commit_at(dir, "a.txt", Some("one\nbase\nthree\n"), "base", 1000);
        create_branch(p, "feature", None, true).unwrap();
        commit_at(dir, "a.txt", feature, "feature change", 3000);
        commit_at(dir, "b.txt", Some("b"), "feature other", 4000);
        checkout(p, "main").unwrap();
        commit_at(dir, "a.txt", Some("one\nmain\nthree\n"), "main edit", 2000);
        commit_at(dir, "c.txt", Some("c"), "main other", 5000);
        d
    }

    fn summary_time(h: Option<SearchHit>) -> Option<(String, i64)> {
        h.map(|h| (h.summary, h.time - EPOCH))
    }

    #[test]
    fn names_the_commit_that_last_changed_the_file_on_each_side() {
        let d = timed(Some("one\nfeature\nthree\n"));
        let p = s(d.path());
        let main_edit = Some(("main edit".to_string(), 2000));
        let feature_change = Some(("feature change".to_string(), 3000));
        assert_eq!(
            merge(p, "feature", None, MergeMode::Commit, None).unwrap().status,
            OpStatus::Conflict
        );
        let c = conflict_file(p, "a.txt").unwrap();
        assert_eq!(c.kind, ConflictKind::Content);
        assert_eq!(c.ours_change.as_ref().unwrap().author, "Test");
        assert_eq!(summary_time(c.ours_change), main_edit);
        assert_eq!(summary_time(c.theirs_change), feature_change);
        abort(p).unwrap();

        // A pick's incoming change is the commit being applied.
        let picked = run(d.path(), &["rev-parse", "feature~1"]).trim().to_string();
        let r = pick(p, PickOp::CherryPick, std::slice::from_ref(&picked), None, None).unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        let c = conflict_file(p, "a.txt").unwrap();
        assert_eq!(c.theirs_change.unwrap().id, picked);
        assert_eq!(summary_time(c.ours_change), main_edit);
        abort(p).unwrap();

        // A squash merge leaves no ref to the incoming side.
        let r = merge(p, "feature", None, MergeMode::Squash, None).unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        let c = conflict_file(p, "a.txt").unwrap();
        assert!(c.theirs_change.is_none());
        assert_eq!(summary_time(c.ours_change), main_edit);
        abort(p).unwrap();

        // A rebase: HEAD is the branch rebased onto, the incoming side the commit replayed.
        checkout(p, "feature").unwrap();
        let r = onto(p, "main").unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        let c = conflict_file(p, "a.txt").unwrap();
        assert_eq!(summary_time(c.ours_change), main_edit);
        assert_eq!(summary_time(c.theirs_change), feature_change);
    }

    #[test]
    fn tells_a_deleted_side_from_a_changed_one() {
        let d = timed(None);
        let p = s(d.path());
        assert_eq!(
            merge(p, "feature", None, MergeMode::Commit, None).unwrap().status,
            OpStatus::Conflict
        );
        let c = conflict_file(p, "a.txt").unwrap();
        assert_eq!(c.kind, ConflictKind::DeletedByThem);
        assert!(c.ours.is_some() && c.theirs.is_none());
        // The commit that deleted it is that side's last change.
        assert_eq!(
            summary_time(c.theirs_change),
            Some(("feature change".into(), 3000))
        );
        abort(p).unwrap();

        checkout(p, "feature").unwrap();
        assert_eq!(
            merge(p, "main", None, MergeMode::Commit, None).unwrap().status,
            OpStatus::Conflict
        );
        let c = conflict_file(p, "a.txt").unwrap();
        assert_eq!(c.kind, ConflictKind::DeletedByUs);
        assert_eq!(summary_time(c.ours_change), Some(("feature change".into(), 3000)));
        assert_eq!(summary_time(c.theirs_change), Some(("main edit".into(), 2000)));
    }
}
