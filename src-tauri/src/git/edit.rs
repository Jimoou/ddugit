//! Touching up a past commit on the current branch: its message, its author,
//! splitting it in two, and putting one file back the way a commit had it.
//!
//! Commit edits replay the branch from the commit's parent with an
//! interactive rebase whose todo picks everything and runs the edit right
//! after the target (`exec`), so later commits are rebuilt on top unchanged.

use serde::Deserialize;

use super::write::prepare_on;
use super::{err, git, git_ok, literal, open, operand, OpResult, OpStatus, Result, LITERAL};

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", rename_all_fields = "camelCase", tag = "kind")]
pub enum CommitEdit {
    Reword {
        message: String,
    },
    Author {
        name: String,
        email: String,
    },
    /// `first` (paths, old names of renames included) go into a first commit
    /// with `first_message`; the rest stay in a second one.
    Split {
        first: Vec<String>,
        first_message: String,
        second_message: String,
    },
}

/// Quote for the `sh` that runs `exec` lines (Git for Windows ships one too).
fn q(s: &str) -> String {
    format!("'{}'", s.replace('\'', r"'\''"))
}

pub fn edit_commit(path: &str, id: &str, edit: &CommitEdit) -> Result<OpResult> {
    let dir = prepare_on(path, None)?;
    let repo = open(path)?;
    let commit = repo
        .revparse_single(id)
        .and_then(|o| o.peel_to_commit())
        .map_err(err)?;
    let id = commit.id().to_string();
    let parent = commit.parent_id(0).ok().map(|p| p.to_string());
    let range = match &parent {
        Some(p) => format!("{p}..HEAD"),
        None => "HEAD".into(),
    };
    let merges = git_ok(&dir, &["rev-list", "--merges", &range])?;
    if !merges.is_empty() {
        return Err("There are merge commits after it; this can't be edited here".into());
    }
    let commits = git_ok(&dir, &["rev-list", "--reverse", &range])?;
    if !commits.lines().any(|c| c == id) {
        return Err("The commit isn't on the current branch".into());
    }

    // Scratch files live in .git so they never show up as changes.
    let scratch = repo.path().join("ddugit-edit");
    std::fs::create_dir_all(&scratch).map_err(err)?;
    let file = |name: &str, body: &str| -> Result<String> {
        let p = scratch.join(name);
        std::fs::write(&p, body).map_err(err)?;
        Ok(q(&p.to_string_lossy().replace('\\', "/")))
    };
    let exec = match edit {
        CommitEdit::Reword { message } => {
            if message.trim().is_empty() {
                return Err("The message is empty".into());
            }
            format!(
                "git commit -q --amend --only --allow-empty -F {}",
                file("msg", message)?
            )
        }
        CommitEdit::Author { name, email } => {
            if name.trim().is_empty() || !email.contains('@') {
                return Err("Enter a name and an email".into());
            }
            let who = format!("{} <{}>", name.trim(), email.trim());
            format!(
                "git commit -q --amend --only --allow-empty --no-edit --author={}",
                q(&who)
            )
        }
        CommitEdit::Split {
            first,
            first_message,
            second_message,
        } => {
            if first.is_empty() || first_message.trim().is_empty() || second_message.trim().is_empty() {
                return Err("Pick files for the first commit and write both messages".into());
            }
            // Paths go through a NUL-separated file, never the shell line: a file name may hold
            // quotes or newlines, and the todo this line ends up in is read one line per command.
            let mut list = Vec::new();
            for p in first {
                list.extend_from_slice(p.as_bytes());
                list.push(0);
            }
            let list_file = scratch.join("paths");
            std::fs::write(&list_file, list).map_err(err)?;
            format!(
                "git reset -q HEAD~1 && git --literal-pathspecs add -A --pathspec-from-file={} --pathspec-file-nul && git commit -q -F {} && git add -A && git commit -q -F {}",
                q(&list_file.to_string_lossy().replace('\\', "/")),
                file("msg1", first_message)?,
                file("msg2", second_message)?
            )
        }
    };

    // One command per todo line: anything that would spill onto another is refused.
    if exec.contains(['\n', '\r']) {
        let _ = std::fs::remove_dir_all(&scratch);
        return Err("A name or path holds a line break".into());
    }
    let mut todo = String::new();
    for c in commits.lines() {
        todo.push_str(&format!("pick {c}\n"));
        if c == id {
            todo.push_str(&format!("exec {exec}\n"));
        }
    }
    let todo_file = scratch.join("todo");
    std::fs::write(&todo_file, todo).map_err(err)?;
    let src = todo_file
        .to_string_lossy()
        .replace('\\', "/")
        .replace('\'', r"'\''");
    let editor = format!("sequence.editor=cp '{src}'");
    let mut args = vec!["-c", &editor, "rebase", "-i", "--autostash"];
    match &parent {
        Some(p) => args.push(p),
        None => args.push("--root"),
    }
    let o = git(&dir, &args);
    let _ = std::fs::remove_dir_all(&scratch);
    let o = o?;
    // Replaying the same commits can't conflict, so a stop means the edit
    // itself failed (a pre-commit or commit-msg hook said no). Put everything
    // back as it was, local changes included, and show what the hook said.
    if !o.ok && super::in_progress(path) {
        let undo = git(&dir, &["rebase", "--abort"])?;
        let mut out = OpResult::with(OpStatus::Failed, o);
        if !undo.ok {
            out.output = format!("{}\n{}", out.output, undo.text);
        }
        return Ok(out);
    }
    Ok(o.into())
}

/// Put `file` back the way commit `source` had it (deleting it if it didn't
/// exist there). The result is an uncommitted, staged change. A `source` that
/// doesn't name a commit is refused: it never turns into a deletion.
pub fn restore_file(path: &str, source: &str, file: &str) -> Result<OpResult> {
    operand(source)?;
    let dir = prepare_on(path, None)?;
    let repo = open(path)?;
    let commit = repo
        .revparse_single(source)
        .and_then(|o| o.peel_to_commit())
        .map_err(|_| format!("Unknown commit '{source}'"))?;
    let id = commit.id().to_string();
    let found = match commit.tree().and_then(|t| t.get_path(std::path::Path::new(file))) {
        Ok(_) => true,
        Err(e) if e.code() == git2::ErrorCode::NotFound => false,
        Err(e) => return Err(e.message().to_string()),
    };
    // `checkout` runs the post-checkout hook, so the path is spelled literal (see `LITERAL`).
    Ok(if found {
        git(&dir, &["checkout", &id, "--", &literal(file)])?
    } else {
        git(&dir, &[LITERAL, "rm", "-q", "-f", "--ignore-unmatch", "--", file])?
    }
    .into())
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::*;
    use std::path::Path;

    fn log(d: &Path, fmt: &str) -> Vec<String> {
        git_ok(d, &["log", &format!("--format={fmt}"), "--reverse"])
            .unwrap()
            .lines()
            .map(String::from)
            .collect()
    }
    fn sha(d: &Path, rev: &str) -> String {
        git_ok(d, &["rev-parse", rev]).unwrap().trim().to_string()
    }

    /// a → b → c, each adding its own file.
    fn three() -> tempfile::TempDir {
        let d = repo();
        for n in ["a", "b", "c"] {
            commit_file(d.path(), &format!("{n}.txt"), n, n);
        }
        d
    }

    #[test]
    fn a_hook_that_refuses_the_edit_leaves_everything_as_it_was() {
        let d = three();
        std::fs::write(d.path().join("c.txt"), "dirty").unwrap();
        let before = sha(d.path(), "HEAD");
        let hook = d.path().join(".git/hooks/pre-commit");
        std::fs::create_dir_all(hook.parent().unwrap()).unwrap();
        std::fs::write(&hook, "#!/bin/sh\necho 'no commits today' >&2\nexit 1\n").unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&hook, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        let b = sha(d.path(), "HEAD~1");
        for edit in [
            CommitEdit::Reword {
                message: "b, reworded".into(),
            },
            CommitEdit::Split {
                first: vec!["b.txt".into()],
                first_message: "one".into(),
                second_message: "two".into(),
            },
        ] {
            let r = edit_commit(s(d.path()), &b, &edit).unwrap();
            assert_eq!(r.status, OpStatus::Failed, "{}", r.output);
            assert!(r.output.contains("no commits today"), "{}", r.output);
            assert_eq!(snapshot(s(d.path()), 100).unwrap().state, "clean");
            assert_eq!(sha(d.path(), "HEAD"), before);
            assert_eq!(log(d.path(), "%s"), ["a", "b", "c"]);
            assert_eq!(std::fs::read_to_string(d.path().join("c.txt")).unwrap(), "dirty");
        }
    }

    #[test]
    fn rewords_an_older_commit_and_keeps_later_ones_and_local_changes() {
        let d = three();
        std::fs::write(d.path().join("c.txt"), "dirty").unwrap();
        let b = sha(d.path(), "HEAD~1");
        let r = edit_commit(
            s(d.path()),
            &b,
            &CommitEdit::Reword {
                message: "b: it's \"better\"\n\nbody".into(),
            },
        )
        .unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(log(d.path(), "%s"), ["a", "b: it's \"better\"", "c"]);
        // The uncommitted edit survived (autostash).
        assert_eq!(std::fs::read_to_string(d.path().join("c.txt")).unwrap(), "dirty");
    }

    #[test]
    fn rewords_the_root_commit() {
        let d = three();
        let a = sha(d.path(), "HEAD~2");
        let r = edit_commit(
            s(d.path()),
            &a,
            &CommitEdit::Reword {
                message: "first!".into(),
            },
        )
        .unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(log(d.path(), "%s"), ["first!", "b", "c"]);
    }

    #[test]
    fn changes_the_author_of_one_commit() {
        let d = three();
        let b = sha(d.path(), "HEAD~1");
        let edit = CommitEdit::Author {
            name: "Kim O'Neil".into(),
            email: "kim@example.com".into(),
        };
        assert_eq!(edit_commit(s(d.path()), &b, &edit).unwrap().status, OpStatus::Ok);
        assert_eq!(
            log(d.path(), "%an <%ae>"),
            [
                "Test <t@example.com>",
                "Kim O'Neil <kim@example.com>",
                "Test <t@example.com>"
            ]
        );
    }

    #[test]
    fn splits_a_commit_by_files() {
        let d = repo();
        commit_file(d.path(), "base.txt", "base", "base");
        std::fs::write(d.path().join("x.txt"), "x").unwrap();
        std::fs::write(d.path().join("y y.txt"), "y").unwrap();
        commit_file(d.path(), "base.txt", "base2", "everything");
        commit_file(d.path(), "after.txt", "z", "after");
        let target = sha(d.path(), "HEAD~1");
        let edit = CommitEdit::Split {
            first: vec!["y y.txt".into()],
            first_message: "just y".into(),
            second_message: "the rest".into(),
        };
        let r = edit_commit(s(d.path()), &target, &edit).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(log(d.path(), "%s"), ["base", "just y", "the rest", "after"]);
        let files = |rev: &str| git_ok(d.path(), &["show", "--name-only", "--format=", rev]).unwrap();
        assert_eq!(files("HEAD~2").trim(), "y y.txt");
        assert!(files("HEAD~1").contains("x.txt") && files("HEAD~1").contains("base.txt"));
        assert!(snapshot(s(d.path()), 10).unwrap().changes.is_empty());
    }

    /// A file name can hold a newline (macOS, Linux); it must not become a todo command.
    #[cfg(unix)]
    #[test]
    fn a_file_name_with_a_newline_cannot_inject_a_command() {
        let d = repo();
        commit_file(d.path(), "base.txt", "base", "base");
        let evil = "a\nexec touch PWNED #";
        std::fs::write(d.path().join(evil), "x").unwrap();
        std::fs::write(d.path().join("b.txt"), "y").unwrap();
        commit_file(d.path(), "base.txt", "base2", "both");
        let target = sha(d.path(), "HEAD");
        let edit = CommitEdit::Split {
            first: vec![evil.into()],
            first_message: "evil only".into(),
            second_message: "the rest".into(),
        };
        let r = edit_commit(s(d.path()), &target, &edit).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(!d.path().join("PWNED").exists());
        assert_eq!(log(d.path(), "%s"), ["base", "evil only", "the rest"]);
    }

    #[test]
    fn refuses_commits_off_the_branch_and_empty_input() {
        let d = three();
        git_ok(d.path(), &["switch", "-q", "-c", "side", "HEAD~1"]).unwrap();
        commit_file(d.path(), "s.txt", "s", "side");
        git_ok(d.path(), &["switch", "-q", "main"]).unwrap();
        let side = sha(d.path(), "side");
        assert!(edit_commit(s(d.path()), &side, &CommitEdit::Reword { message: "x".into() }).is_err());
        assert!(edit_commit(s(d.path()), "HEAD", &CommitEdit::Reword { message: " ".into() }).is_err());
    }

    #[test]
    fn reads_the_ui_shape() {
        let e: CommitEdit =
            serde_json::from_str(r#"{"kind":"split","first":["a"],"firstMessage":"x","secondMessage":"y"}"#)
                .unwrap();
        assert!(matches!(e, CommitEdit::Split { ref first_message, .. } if first_message == "x"));
    }

    #[test]
    fn restores_a_file_as_of_a_commit_or_removes_it() {
        let d = three();
        commit_file(d.path(), "a.txt", "changed", "change a");
        let first = sha(d.path(), "HEAD~3");
        assert_eq!(
            restore_file(s(d.path()), &first, "a.txt").unwrap().status,
            OpStatus::Ok
        );
        assert_eq!(std::fs::read_to_string(d.path().join("a.txt")).unwrap(), "a");
        // c.txt didn't exist in the first commit: restoring removes it.
        assert_eq!(
            restore_file(s(d.path()), &first, "c.txt").unwrap().status,
            OpStatus::Ok
        );
        assert!(!d.path().join("c.txt").exists());
        let snap = snapshot(s(d.path()), 10).unwrap();
        assert!(snap.changes.iter().all(|c| c.staged.is_some()));
    }

    #[test]
    fn restoring_from_an_unknown_source_deletes_nothing() {
        let d = three();
        for bad in ["nope", "--output=x", "HEAD~9"] {
            assert!(restore_file(s(d.path()), bad, "a.txt").is_err(), "{bad}");
        }
        assert!(d.path().join("a.txt").exists());
        assert!(snapshot(s(d.path()), 10).unwrap().changes.is_empty());
    }
}
