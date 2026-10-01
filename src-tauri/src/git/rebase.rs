//! Interactive rebase without an editor: the UI sends the finished todo list
//! (order + action per commit) and git reads it through `sequence.editor`,
//! which copies the prepared file over git's own todo.

use serde::Deserialize;

use super::write::{conflict_aware, prepare_on};
use super::{git, OpResult, Result};

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RebaseAction {
    Pick,
    /// Meld into the previous commit, keeping both messages.
    Squash,
    /// Meld into the previous commit, dropping this message.
    Fixup,
    Drop,
}

impl RebaseAction {
    fn word(self) -> &'static str {
        match self {
            RebaseAction::Pick => "pick",
            RebaseAction::Squash => "squash",
            RebaseAction::Fixup => "fixup",
            RebaseAction::Drop => "drop",
        }
    }
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RebaseStep {
    pub id: String,
    pub action: RebaseAction,
}

/// Rewrite the commits after `base` on the current branch as `steps` say
/// (oldest first). Every commit in `base..HEAD` must appear exactly once;
/// leaving one out would silently drop it, so that is refused.
pub fn rebase(path: &str, base: &str, steps: &[RebaseStep]) -> Result<OpResult> {
    let dir = prepare_on(path, None)?;
    let listed = super::git_ok(
        &dir,
        &["rev-list", "--reverse", "--no-merges", &format!("{base}..HEAD")],
    )?;
    let merges = super::git_ok(&dir, &["rev-list", "--merges", &format!("{base}..HEAD")])?;
    if !merges.is_empty() {
        return Err("Commits after the base include merges; reorder them with a regular rebase".into());
    }
    let want: Vec<&str> = listed.lines().collect();
    let mut given: Vec<&str> = steps.iter().map(|s| s.id.as_str()).collect();
    given.sort_unstable();
    let mut have = want.clone();
    have.sort_unstable();
    if given != have {
        return Err("The plan must list every commit after the base exactly once".into());
    }
    match steps.iter().find(|s| s.action != RebaseAction::Drop) {
        Some(s) if matches!(s.action, RebaseAction::Squash | RebaseAction::Fixup) => {
            return Err(
                "The first kept commit can't be squashed: there is nothing before it to meld into".into(),
            );
        }
        _ => {}
    }

    let todo: String = steps
        .iter()
        .map(|s| format!("{} {}\n", s.action.word(), s.id))
        .collect();
    // Kept inside .git so it never shows up as a working-tree change.
    let file = super::open(path)?.path().join("otgit-rebase-todo");
    std::fs::write(&file, todo).map_err(super::err)?;
    // git runs the editor through sh (Git for Windows ships one): forward
    // slashes and single quotes keep any path intact.
    let src = file.to_string_lossy().replace('\\', "/").replace('\'', r"'\''");
    let editor = format!("sequence.editor=cp '{src}'");
    let o = git(&dir, &["-c", &editor, "rebase", "-i", base]);
    let _ = std::fs::remove_file(&file);
    Ok(conflict_aware(path, o?))
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::super::OpStatus;
    use super::*;
    use std::path::Path;

    fn sha(d: &Path, rev: &str) -> String {
        super::super::git_ok(d, &["rev-parse", rev]).unwrap()
    }
    fn subjects(d: &Path) -> Vec<String> {
        let log = super::super::git_ok(d, &["log", "--format=%s", "--reverse", "base..HEAD"]).unwrap();
        log.lines().map(String::from).collect()
    }
    fn step(id: &str, action: RebaseAction) -> RebaseStep {
        RebaseStep {
            id: id.into(),
            action,
        }
    }

    /// base → a → b → c, each touching its own file.
    fn three() -> (tempfile::TempDir, [String; 3]) {
        let d = repo();
        commit_file(d.path(), "base.txt", "base", "base");
        super::super::git_ok(d.path(), &["tag", "base"]).unwrap();
        for n in ["a", "b", "c"] {
            commit_file(d.path(), &format!("{n}.txt"), n, n);
        }
        let ids = [
            sha(d.path(), "HEAD~2"),
            sha(d.path(), "HEAD~1"),
            sha(d.path(), "HEAD"),
        ];
        (d, ids)
    }

    #[test]
    fn reorder_squash_and_drop() {
        use RebaseAction::*;
        let (d, [a, b, c]) = three();
        let p = s(d.path());
        let r = rebase(p, "base", &[step(&c, Pick), step(&a, Pick), step(&b, Fixup)]).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(subjects(d.path()), ["c", "a"]);
        assert!(d.path().join("b.txt").exists(), "fixup keeps the changes");

        let (d, [a, b, c]) = three();
        let p = s(d.path());
        let r = rebase(p, "base", &[step(&a, Pick), step(&b, Drop), step(&c, Squash)]).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(subjects(d.path()), ["a"]);
        assert!(!d.path().join("b.txt").exists() && d.path().join("c.txt").exists());
        let msg = super::super::git_ok(d.path(), &["log", "-1", "--format=%B"]).unwrap();
        assert!(
            msg.contains('a') && msg.contains('c'),
            "squash keeps both messages: {msg}"
        );
    }

    #[test]
    fn refuses_incomplete_or_headless_plans() {
        use RebaseAction::*;
        let (d, [a, b, c]) = three();
        let p = s(d.path());
        assert!(
            rebase(p, "base", &[step(&a, Pick), step(&b, Pick)]).is_err(),
            "c missing"
        );
        assert!(rebase(p, "base", &[step(&a, Squash), step(&b, Pick), step(&c, Pick)]).is_err());
        assert!(rebase(p, "base", &[step(&a, Drop), step(&b, Fixup), step(&c, Pick)]).is_err());
        assert_eq!(subjects(d.path()), ["a", "b", "c"], "nothing changed");
    }

    #[test]
    fn reordering_into_a_conflict_stops_mid_rebase() {
        use RebaseAction::*;
        let d = repo();
        commit_file(d.path(), "f.txt", "0\n", "base");
        super::super::git_ok(d.path(), &["tag", "base"]).unwrap();
        commit_file(d.path(), "f.txt", "1\n", "one");
        commit_file(d.path(), "f.txt", "2\n", "two");
        let (one, two) = (sha(d.path(), "HEAD~1"), sha(d.path(), "HEAD"));
        let p = s(d.path());
        let r = rebase(p, "base", &[step(&two, Pick), step(&one, Pick)]).unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        assert_eq!(snapshot(p, 5).unwrap().state, "rebase");
    }
}
