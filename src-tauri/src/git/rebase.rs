//! Interactive rebase without an editor: the UI sends the finished todo list
//! (order + action per commit) and git reads it through `sequence.editor`,
//! which copies the prepared file over git's own todo.
//!
//! With merges in the range (`--rebase-merges`) git's own todo is the plan's
//! skeleton: it is captured first (an editor that saves it and fails, so git
//! starts nothing), the UI changes actions and the order within each run of
//! picks, and the merges, labels and resets stay as git wrote them.

use serde::{Deserialize, Serialize};

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

/// One line of git's `--rebase-merges` todo, as the UI shows it.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum TodoItem {
    Pick {
        id: String,
        summary: String,
    },
    /// Recreates a merge of `label` (the other side, rebuilt just before).
    Merge {
        id: Option<String>,
        label: String,
        summary: String,
    },
    Label {
        name: String,
    },
    /// Starts the next line of commits from `to` (a label, or `onto`: the base).
    Reset {
        to: String,
    },
}

fn is_pick(line: &str) -> bool {
    matches!(line.split_whitespace().next(), Some("pick" | "p"))
}

/// git's todo text → the lines the UI shows (comments, `update-ref`, ... left out).
pub fn parse_todo(todo: &str) -> Vec<TodoItem> {
    todo.lines()
        .filter_map(|line| {
            let line = line.trim();
            let (word, rest) = line.split_once(' ').unwrap_or((line, ""));
            let (rest, comment) = match rest.split_once(" # ") {
                Some((r, c)) => (r, c.trim()),
                None => (rest, ""),
            };
            let mut words = rest.split_whitespace();
            match word {
                "pick" | "p" => {
                    let id = words.next()?.to_string();
                    let summary = rest.trim_start()[id.len()..].trim().to_string();
                    Some(TodoItem::Pick { id, summary })
                }
                "merge" | "m" => {
                    let mut id = None;
                    let mut label = words.next()?;
                    if label == "-C" || label == "-c" {
                        id = words.next().map(str::to_string);
                        label = words.next()?;
                    }
                    Some(TodoItem::Merge {
                        id,
                        label: label.to_string(),
                        summary: comment.to_string(),
                    })
                }
                "label" | "l" => Some(TodoItem::Label {
                    name: words.next()?.to_string(),
                }),
                "reset" | "t" => Some(TodoItem::Reset {
                    to: words.next()?.to_string(),
                }),
                _ => None,
            }
        })
        .collect()
}

/// git's todo with `steps` applied: each pick gets its step's action, and each
/// run of consecutive picks (one line of history between merges) is reordered
/// as the steps are. Merges, labels and resets stay. Every pick must have
/// exactly one step, and a run can't start with squash / fixup (there would be
/// nothing on that line to meld into).
pub fn apply_plan(todo: &str, steps: &[RebaseStep]) -> Result<String> {
    let lines: Vec<&str> = todo.lines().collect();
    // Pick lines grouped into runs: (line index, id, rest of the line).
    let mut runs: Vec<Vec<(usize, &str, &str)>> = Vec::new();
    let mut in_run = false;
    for (i, line) in lines.iter().enumerate() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if is_pick(t) {
            let rest = t.split_once(' ').map(|x| x.1).unwrap_or("").trim_start();
            let (id, tail) = rest.split_once(' ').unwrap_or((rest, ""));
            if !in_run {
                runs.push(Vec::new());
            }
            runs.last_mut().unwrap().push((i, id, tail));
            in_run = true;
        } else {
            in_run = false;
        }
    }
    let position = |id: &str| steps.iter().position(|s| s.id == id);
    let mut wanted: Vec<&str> = steps.iter().map(|s| s.id.as_str()).collect();
    let mut have: Vec<&str> = runs.iter().flatten().map(|p| p.1).collect();
    wanted.sort_unstable();
    have.sort_unstable();
    if wanted != have {
        return Err("The plan must list every commit after the base exactly once".into());
    }
    let mut out: Vec<String> = lines.iter().map(|l| l.to_string()).collect();
    for run in &runs {
        let mut ordered = run.clone();
        ordered.sort_by_key(|p| position(p.1));
        let first = ordered
            .iter()
            .map(|p| steps[position(p.1).unwrap()].action)
            .find(|a| *a != RebaseAction::Drop);
        if matches!(first, Some(RebaseAction::Squash | RebaseAction::Fixup)) {
            return Err("A line of commits can't start with squash or fixup: there is nothing before it on that line to meld into".into());
        }
        for (slot, (_, id, tail)) in run.iter().map(|p| p.0).zip(ordered) {
            let word = steps[position(id).unwrap()].action.word();
            out[slot] = format!("{word} {id} {tail}").trim_end().to_string();
        }
    }
    Ok(out.join("\n") + "\n")
}

/// The todo git writes for `rebase -i --rebase-merges <base>`, without starting
/// it: the editor saves a copy and fails, so git stops before doing anything.
fn capture_todo(dir: &std::path::Path, path: &str, base: &str) -> Result<String> {
    let file = super::open(path)?.path().join("ddugit-rebase-capture");
    let _ = std::fs::remove_file(&file);
    let dst = file.to_string_lossy().replace('\\', "/").replace('\'', r"'\''");
    let editor = format!("sequence.editor=f() {{ cp \"$1\" '{dst}'; exit 1; }}; f");
    let o = git(
        dir,
        &[
            "-c",
            "core.abbrev=40",
            "-c",
            &editor,
            "rebase",
            "-i",
            "--rebase-merges",
            base,
        ],
    )?;
    let todo = std::fs::read_to_string(&file).map_err(|_| o.text.trim().to_string());
    let _ = std::fs::remove_file(&file);
    todo
}

/// The plan's skeleton for a range with merges (see the module docs).
pub fn todo(path: &str, base: &str) -> Result<Vec<TodoItem>> {
    super::operand(base)?;
    let dir = prepare_on(path, None)?;
    Ok(parse_todo(&capture_todo(&dir, path, base)?))
}

/// Run `rebase -i` with the prepared todo `text` (git's own is replaced by it).
fn run_todo(dir: &std::path::Path, path: &str, base: &str, text: &str, merges: bool) -> Result<OpResult> {
    // Kept inside .git so it never shows up as a working-tree change.
    let file = super::open(path)?.path().join("ddugit-rebase-todo");
    std::fs::write(&file, text).map_err(super::err)?;
    // git runs the editor through sh (Git for Windows ships one): forward
    // slashes and single quotes keep any path intact.
    let src = file.to_string_lossy().replace('\\', "/").replace('\'', r"'\''");
    let editor = format!("sequence.editor=cp '{src}'");
    let mut args = vec!["-c", "core.abbrev=40", "-c", &editor, "rebase", "-i"];
    if merges {
        args.push("--rebase-merges");
    }
    args.push(base);
    let o = git(dir, &args);
    let _ = std::fs::remove_file(&file);
    Ok(conflict_aware(path, o?))
}

/// Rewrite the commits after `base` on the current branch as `steps` say
/// (oldest first). Every commit in `base..HEAD` must appear exactly once;
/// leaving one out would silently drop it, so that is refused.
pub fn rebase(path: &str, base: &str, steps: &[RebaseStep]) -> Result<OpResult> {
    super::operand(base)?;
    let dir = prepare_on(path, None)?;
    let listed = super::git_ok(
        &dir,
        &["rev-list", "--reverse", "--no-merges", &format!("{base}..HEAD")],
    )?;
    let merges = super::git_ok(&dir, &["rev-list", "--merges", &format!("{base}..HEAD")])?;
    if !merges.is_empty() {
        let todo = apply_plan(&capture_todo(&dir, path, base)?, steps)?;
        return run_todo(&dir, path, base, &todo, true);
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
    run_todo(&dir, path, base, &todo, false)
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

    /// base → a → (side: s1 → s2) → b → merge side → d. Returns [a, s1, s2, b, d].
    fn with_merge() -> (tempfile::TempDir, [String; 5]) {
        let d = repo();
        let ids = {
            let p = d.path();
            let git = |args: &[&str]| super::super::git_ok(p, args).unwrap();
            commit_file(p, "base.txt", "base", "base");
            git(&["tag", "base"]);
            commit_file(p, "a.txt", "a", "a");
            git(&["checkout", "-q", "-b", "side"]);
            commit_file(p, "s1.txt", "s1", "s1");
            commit_file(p, "s2.txt", "s2", "s2");
            git(&["checkout", "-q", "main"]);
            commit_file(p, "b.txt", "b", "b");
            git(&["merge", "-q", "--no-ff", "side", "-m", "Merge side"]);
            commit_file(p, "d.txt", "d", "d");
            ["HEAD~3", "HEAD^^2~1", "HEAD^^2", "HEAD~2", "HEAD"].map(|r| sha(p, r))
        };
        (d, ids)
    }

    #[test]
    fn reads_the_todo_git_writes_for_merges() {
        let (d, [a, s1, s2, b, dd]) = with_merge();
        let items = todo(s(d.path()), "base").unwrap();
        let picks: Vec<&str> = items
            .iter()
            .filter_map(|i| match i {
                TodoItem::Pick { id, .. } => Some(id.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(
            picks,
            [a.as_str(), s1.as_str(), s2.as_str(), b.as_str(), dd.as_str()]
        );
        assert!(items
            .iter()
            .any(|i| matches!(i, TodoItem::Merge { id: Some(_), summary, .. } if summary == "Merge side")));
        assert!(items.contains(&TodoItem::Reset { to: "onto".into() }));
        assert_eq!(
            snapshot(s(d.path()), 5).unwrap().state,
            "clean",
            "capturing starts nothing"
        );
    }

    #[test]
    fn plans_apply_within_runs_and_keep_the_merges() {
        let todo = "label onto\nreset onto\npick 11 a\nlabel bp\npick 22 s1\npick 33 s2\nlabel side\n\
            reset bp # a\npick 44 b\nmerge -C 55 side # Merge side\npick 66 d\n";
        use RebaseAction::*;
        let plan = [
            step("11", Pick),
            step("33", Pick),
            step("22", Drop),
            step("44", Pick),
            step("66", Squash),
        ];
        // d squashes right after the merge: the run after a merge starts with it.
        assert!(apply_plan(todo, &plan).is_err());
        let plan = [
            step("11", Pick),
            step("33", Pick),
            step("22", Fixup),
            step("44", Pick),
            step("66", Drop),
        ];
        assert_eq!(
            apply_plan(todo, &plan).unwrap(),
            "label onto\nreset onto\npick 11 a\nlabel bp\npick 33 s2\nfixup 22 s1\nlabel side\n\
            reset bp # a\npick 44 b\nmerge -C 55 side # Merge side\ndrop 66 d\n"
        );
        assert!(apply_plan(todo, &plan[..4]).is_err(), "d missing");
        assert!(apply_plan(
            todo,
            &[
                step("22", Squash),
                step("11", Pick),
                step("33", Pick),
                step("44", Pick),
                step("66", Pick)
            ]
        )
        .is_err());
    }

    #[test]
    fn rewrites_a_range_with_a_merge() {
        use RebaseAction::*;
        let (d, [a, s1, s2, b, dd]) = with_merge();
        let p = s(d.path());
        // Swap the side commits, fold b into... nothing before it on its line: keep it; drop d.
        let plan = [
            step(&a, Pick),
            step(&s2, Pick),
            step(&s1, Pick),
            step(&b, Pick),
            step(&dd, Drop),
        ];
        let r = rebase(p, "base", &plan).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let git = |args: &[&str]| super::super::git_ok(d.path(), args).unwrap();
        assert_eq!(
            git(&["log", "-1", "--format=%s"]),
            "Merge side",
            "d dropped, the merge is the tip"
        );
        assert_eq!(
            git(&["log", "--format=%s", "HEAD^2", "-2"]),
            "s1\ns2",
            "side reordered"
        );
        assert_eq!(git(&["log", "-1", "--format=%s", "HEAD^1"]), "b");
        assert!(!d.path().join("d.txt").exists() && d.path().join("s1.txt").exists());
    }
}
