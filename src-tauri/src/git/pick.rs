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

/// Apply `op` with commit `id` on `target` (checked out first when it isn't HEAD).
/// Merge commits are taken relative to their first parent.
pub fn pick(path: &str, op: PickOp, id: &str, target: Option<&str>) -> Result<OpResult> {
    let is_merge = {
        let repo = open(path)?;
        let c = repo
            .revparse_single(id)
            .and_then(|o| o.peel_to_commit())
            .map_err(err)?;
        c.parent_count() > 1
    };
    let dir = prepare_on(path, target)?;
    let mut args = match op {
        PickOp::CherryPick => vec!["cherry-pick", "-x"],
        PickOp::Revert => vec!["revert", "--no-edit"],
    };
    if is_merge {
        args.extend(["-m", "1"]);
    }
    args.push(id);
    Ok(conflict_aware(path, git(&dir, &args)?))
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::super::write::{abort, checkout, continue_op, create_branch, merge};
    use super::super::OpStatus;
    use super::*;
    use std::fs;

    fn head_id(p: &str) -> String {
        snapshot(p, 1).unwrap().head.target.unwrap()
    }

    #[test]
    fn cherry_pick_onto_another_branch_records_origin() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "fix.txt", "fix", "important fix");
        let fix = head_id(p);

        let r = pick(p, PickOp::CherryPick, &fix, Some("main")).unwrap();
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
        let r = pick(p, PickOp::Revert, &head_id(p), None).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(!d.path().join("oops.txt").exists());

        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "f.txt", "f", "feature");
        checkout(p, "main").unwrap();
        merge(p, "feature", None).unwrap();
        assert!(d.path().join("f.txt").exists());
        let r = pick(p, PickOp::Revert, &head_id(p), None).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(!d.path().join("f.txt").exists());
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
            pick(p, PickOp::CherryPick, &theirs, None).unwrap().status,
            OpStatus::Conflict
        );
        assert_eq!(snapshot(p, 1).unwrap().state, "cherry-pick");
        assert_eq!(abort(p).unwrap().status, OpStatus::Ok);
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");

        assert_eq!(
            pick(p, PickOp::CherryPick, &theirs, None).unwrap().status,
            OpStatus::Conflict
        );
        fs::write(d.path().join("a.txt"), "resolved").unwrap();
        let r = continue_op(p).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");
    }
}
