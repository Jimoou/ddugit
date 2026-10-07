//! Copying and undoing existing commits: cherry-pick and revert.

use serde::Deserialize;

use super::write::{conflict_aware, prepare_on};
use super::{err, git, open, OpResult, Result};

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PickOp {
    /// Copy the commit onto the target branch, recording where it came from (`-x`).
    CherryPick,
    /// New commit on the target that undoes the given one.
    Revert,
}

/// Apply `op` with `ids` in that order (oldest first to copy, newest first to undo)
/// on `target` (checked out first when it isn't HEAD). A merge commit is taken
/// relative to parent `mainline` (1-based, default the first); with several
/// commits it applies to every merge among them.
pub fn pick(
    path: &str,
    op: PickOp,
    ids: &[String],
    target: Option<&str>,
    mainline: Option<usize>,
) -> Result<OpResult> {
    if ids.is_empty() {
        return Err("No commits to apply".into());
    }
    // Fewest parents among the merges: the highest `mainline` every one of them has.
    let parents = {
        let repo = open(path)?;
        let mut fewest: Option<usize> = None;
        for id in ids {
            super::operand(id)?;
            let n = repo
                .revparse_single(id)
                .and_then(|o| o.peel_to_commit())
                .map_err(err)?
                .parent_count();
            if n > 1 {
                fewest = Some(fewest.map_or(n, |f| f.min(n)));
            }
        }
        fewest
    };
    let mainline = match (parents, mainline) {
        (None, Some(_)) => return Err("Only a merge commit takes a parent to compare with".into()),
        (Some(n), Some(m)) if m == 0 || m > n => {
            return Err(format!("A merge here has {n} parents, not {m}"))
        }
        (Some(_), m) => Some(m.unwrap_or(1).to_string()),
        (None, None) => None,
    };
    let dir = prepare_on(path, target)?;
    let name = match op {
        PickOp::CherryPick => "cherry-pick",
        PickOp::Revert => "revert",
    };
    // A list git left behind (stopped without anything in progress, or a stop
    // concluded by a plain commit) would make this one "already in progress".
    if leftover_list(path)? {
        git(&dir, &[name, "--quit"])?;
    }
    let mut args = match op {
        PickOp::CherryPick => vec![name, "-x"],
        PickOp::Revert => vec![name, "--no-edit"],
    };
    if let Some(m) = &mainline {
        args.extend(["-m", m]);
    }
    args.extend(ids.iter().map(String::as_str));
    let o = git(&dir, &args)?;
    // Failed part way (not a conflict, e.g. a file in the way): put back the
    // commits already applied, so it is all or nothing and nothing is left half done.
    if !o.ok && leftover_list(path)? {
        git(&dir, &[name, "--abort"])?;
    }
    Ok(conflict_aware(path, o))
}

/// A cherry-pick / revert list on disk with no step in progress.
fn leftover_list(path: &str) -> Result<bool> {
    let repo = open(path)?;
    Ok(repo.state() == git2::RepositoryState::Clean && repo.path().join("sequencer").is_dir())
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, run, s};
    use super::super::write::{abort, checkout, continue_op, create_branch, merge, MergeMode};
    use super::super::OpStatus;
    use super::*;
    use std::fs;

    fn head_id(p: &str) -> String {
        snapshot(p, 1).unwrap().head.target.unwrap()
    }

    #[test]
    fn several_commits_that_fail_part_way_leave_nothing_behind() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "one.txt", "1", "one");
        let one = head_id(p);
        commit_file(d.path(), "two.txt", "2", "two");
        let two = head_id(p);
        checkout(p, "main").unwrap();
        let before = head_id(p);
        // The second commit would overwrite a file that isn't tracked here.
        fs::write(d.path().join("two.txt"), "mine").unwrap();
        let ids = [one.clone(), two.clone()];
        let r = pick(p, PickOp::CherryPick, &ids, None, None).unwrap();
        assert_eq!(r.status, OpStatus::Failed, "{}", r.output);
        assert_eq!(head_id(p), before, "the first copy is put back");
        assert!(!d.path().join(".git/sequencer").exists());
        assert_eq!(fs::read_to_string(d.path().join("two.txt")).unwrap(), "mine");
        // Out of the way, it goes through.
        fs::remove_file(d.path().join("two.txt")).unwrap();
        let r = pick(p, PickOp::CherryPick, &ids, None, None).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
    }

    #[test]
    fn cherry_pick_onto_another_branch_records_origin() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "fix.txt", "fix", "important fix");
        let fix = head_id(p);

        let r = pick(
            p,
            PickOp::CherryPick,
            std::slice::from_ref(&fix),
            Some("main"),
            None,
        )
        .unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(p, 10).unwrap();
        assert_eq!(snap.head.branch.as_deref(), Some("main"));
        let top = &snap
            .commits
            .iter()
            .find(|c| c.id == snap.head.target.clone().unwrap())
            .unwrap();
        assert_eq!(top.summary, "important fix");
        assert!(top.message.contains(&format!("cherry picked from commit {fix}")));
        assert!(d.path().join("fix.txt").exists());
    }

    #[test]
    fn revert_undoes_a_commit_and_a_merge() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        commit_file(d.path(), "oops.txt", "x", "oops");
        let r = pick(p, PickOp::Revert, &[head_id(p)], None, None).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(!d.path().join("oops.txt").exists());

        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "f.txt", "f", "feature");
        checkout(p, "main").unwrap();
        merge(p, "feature", None, MergeMode::Commit, None).unwrap();
        assert!(d.path().join("f.txt").exists());
        let r = pick(p, PickOp::Revert, &[head_id(p)], None, None).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(!d.path().join("f.txt").exists());
    }

    /// Summaries of the current branch's last `n` commits, newest first.
    fn summaries(p: &str, n: usize) -> Vec<String> {
        let log = run(std::path::Path::new(p), &["log", "--format=%s", &format!("-{n}")]);
        log.lines().map(String::from).collect()
    }

    #[test]
    fn picks_and_reverts_several_commits_in_the_given_order() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "1\n", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "a.txt", "2\n", "two");
        let two = head_id(p);
        commit_file(d.path(), "b.txt", "b\n", "three");
        let three = head_id(p);
        commit_file(d.path(), "a.txt", "4\n", "four");
        let four = head_id(p);

        // Oldest first, skipping one: each lands in order on main.
        let ids = [two.clone(), four.clone()];
        let r = pick(p, PickOp::CherryPick, &ids, Some("main"), None).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(summaries(p, 3), ["four", "two", "base"]);
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "4\n");
        assert!(!d.path().join("b.txt").exists());

        // Newest first undoes them cleanly.
        checkout(p, "feature").unwrap();
        let ids = [four, three, two];
        let r = pick(p, PickOp::Revert, &ids, None, None).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "1\n");
        assert!(!d.path().join("b.txt").exists());
        assert_eq!(
            summaries(p, 3),
            ["Revert \"two\"", "Revert \"three\"", "Revert \"four\""]
        );

        assert!(pick(p, PickOp::Revert, &[], None, None).is_err());
        assert!(pick(p, PickOp::Revert, &["--hard".into()], None, None).is_err());
        // A parent to compare with is for merges only.
        assert!(pick(p, PickOp::Revert, &[head_id(p)], None, Some(1)).is_err());
    }

    #[test]
    fn reverts_a_merge_against_the_parent_chosen() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "f.txt", "f", "feature");
        checkout(p, "main").unwrap();
        commit_file(d.path(), "m.txt", "m", "main work");
        merge(p, "feature", None, MergeMode::Commit, None).unwrap();
        let merged = head_id(p);
        assert!(pick(p, PickOp::Revert, std::slice::from_ref(&merged), None, Some(3)).is_err());
        assert!(pick(p, PickOp::Revert, std::slice::from_ref(&merged), None, Some(0)).is_err());

        // Against the second parent (feature): what main brought in is undone instead.
        let r = pick(p, PickOp::Revert, &[merged], None, Some(2)).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(d.path().join("f.txt").exists());
        assert!(!d.path().join("m.txt").exists());
    }

    #[test]
    fn conflicting_cherry_pick_can_continue_or_abort() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "base", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "a.txt", "feature", "feature edit");
        let theirs = head_id(p);
        checkout(p, "main").unwrap();
        commit_file(d.path(), "a.txt", "main", "main edit");

        assert_eq!(
            pick(p, PickOp::CherryPick, std::slice::from_ref(&theirs), None, None)
                .unwrap()
                .status,
            OpStatus::Conflict
        );
        assert_eq!(snapshot(p, 1).unwrap().state, "cherry-pick");
        assert_eq!(abort(p).unwrap().status, OpStatus::Ok);
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");

        assert_eq!(
            pick(p, PickOp::CherryPick, std::slice::from_ref(&theirs), None, None)
                .unwrap()
                .status,
            OpStatus::Conflict
        );
        fs::write(d.path().join("a.txt"), "resolved").unwrap();
        let r = continue_op(p).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");
    }
}
