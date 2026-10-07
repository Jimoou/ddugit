//! Commits as patches: one commit written out the way `git format-patch` mails it,
//! and a patch file applied to the current branch. A mailed patch (format-patch,
//! an mbox) goes through `git am --3way` and becomes commits; a plain diff goes
//! through `git apply --3way` and is left in the working tree to commit.

use std::path::Path;

use super::history::save_target;
use super::write::{conflict_aware, has_conflicts, prepare_on};
use super::{command, err, git, open, operand, workdir, OpResult, OpStatus, Result, SPAWN_ERR};

/// Patch files bigger than this are refused (a wrong file picked, not a patch).
const MAX_PATCH: u64 = 64 * 1024 * 1024;

/// Commit `id` as `git format-patch` writes it (headers, message, diff), bytes as git gave them.
fn patch_bytes(path: &str, id: &str) -> Result<Vec<u8>> {
    operand(id)?;
    let repo = open(path)?;
    let commit = repo
        .revparse_single(id)
        .and_then(|o| o.peel_to_commit())
        .map_err(err)?;
    if commit.parent_count() > 1 {
        return Err("A merge commit has no single patch".into());
    }
    let sha = commit.id().to_string();
    let out = command(
        &workdir(&repo)?,
        &["format-patch", "-1", "--stdout", "--binary", &sha],
    )
    .output()
    .map_err(|e| format!("{SPAWN_ERR}: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(out.stdout)
}

/// Commit `id` as patch text (for the clipboard).
pub fn commit_patch(path: &str, id: &str) -> Result<String> {
    Ok(String::from_utf8_lossy(&patch_bytes(path, id)?).into_owned())
}

/// Write commit `id` as a patch file to `dest` (from a save dialog; never into a `.git` folder).
pub fn save_patch(path: &str, id: &str, dest: &str) -> Result<OpResult> {
    let bytes = patch_bytes(path, id)?;
    let target = save_target(&open(path)?, Path::new(dest))?;
    std::fs::write(&target, bytes).map_err(|e| format!("Can't write {dest}: {e}"))?;
    Ok(OpResult {
        status: OpStatus::Ok,
        output: dest.to_string(),
    })
}

/// A mailed patch: starts like an mbox (`From <sha> <date>`), or with mail headers
/// (`From:` and `Subject:`) before the first blank line. Anything else is a plain diff.
fn is_mail(text: &str) -> bool {
    if text.starts_with("From ") {
        return true;
    }
    let headers: Vec<&str> = text.lines().take_while(|l| !l.trim().is_empty()).collect();
    let has = |name: &str| headers.iter().any(|l| l.starts_with(name));
    has("From:") && has("Subject:")
}

/// Apply patch file `file` (an absolute path from an open dialog) to the current
/// branch. Refused while another operation is half-done. Conflicts come back as
/// `Conflict`: a mailed patch stops `am` part-way (continue, skip or abort it), a
/// plain diff leaves the conflicted files to resolve with nothing in progress.
pub fn apply_patch(path: &str, file: &str) -> Result<OpResult> {
    let p = Path::new(file);
    if !p.is_absolute() {
        return Err(format!("Not an absolute path: {file}"));
    }
    let size = std::fs::metadata(p)
        .ok()
        .filter(|m| m.is_file())
        .ok_or_else(|| format!("No such file: {file}"))?
        .len();
    if size > MAX_PATCH {
        return Err(format!("{file} is too big for a patch"));
    }
    let text = std::fs::read(p).map_err(|e| format!("Can't read {file}: {e}"))?;
    let mail = is_mail(&String::from_utf8_lossy(&text[..text.len().min(8192)]));
    let dir = prepare_on(path, None)?;
    if mail {
        return Ok(conflict_aware(path, git(&dir, &["am", "--3way", file])?));
    }
    let o = git(&dir, &["apply", "--3way", file])?;
    let status = match (o.ok, has_conflicts(path)) {
        (true, _) => OpStatus::Ok,
        (false, true) => OpStatus::Conflict,
        (false, false) => OpStatus::Failed,
    };
    Ok(OpResult {
        status,
        output: o.text,
    })
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, run, s};
    use super::super::write::{abort, checkout, continue_op, create_branch, merge, skip, MergeMode};
    use super::*;
    use std::fs;

    fn head_id(p: &str) -> String {
        snapshot(p, 1).unwrap().head.target.unwrap()
    }

    fn top_summary(p: &str) -> String {
        snapshot(p, 1).unwrap().commits[0].summary.clone()
    }

    /// main with `a.txt`, and branch `feature` one commit ahead changing it to `feature`.
    fn forked() -> (tempfile::TempDir, String) {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "base\n", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "a.txt", "feature\n", "feature edit");
        let id = head_id(p);
        checkout(p, "main").unwrap();
        (d, id)
    }

    #[test]
    fn saves_a_commit_as_a_patch_file() {
        let (d, id) = forked();
        let p = s(d.path());
        let out = tempfile::tempdir().unwrap();
        let dest = out.path().join("0001-feature-edit.patch");
        let r = save_patch(p, &id, s(&dest)).unwrap();
        assert_eq!(r.status, OpStatus::Ok);
        let text = fs::read_to_string(&dest).unwrap();
        assert!(text.starts_with(&format!("From {id} ")), "{text}");
        assert!(text.contains("Subject: [PATCH] feature edit"));
        assert!(text.contains("-base\n+feature\n"));
        assert_eq!(commit_patch(p, &id).unwrap(), text);
        // The first commit has a patch too.
        let root = snapshot(p, 5).unwrap().commits.last().unwrap().id.clone();
        assert!(commit_patch(p, &root).unwrap().contains("+base"));

        assert!(save_patch(p, &id, s(&d.path().join(".git/hooks/pre-commit"))).is_err());
        assert!(save_patch(p, &id, "relative.patch").is_err());
        assert!(save_patch(p, "--output=x", s(&dest)).is_err());
        merge(p, "feature", None, MergeMode::Commit, None).unwrap();
        assert!(
            commit_patch(p, &head_id(p)).is_err(),
            "a merge has no single patch"
        );
    }

    #[test]
    fn applies_a_mailed_patch_as_a_commit() {
        let (d, id) = forked();
        let p = s(d.path());
        let out = tempfile::tempdir().unwrap();
        let file = out.path().join("fix.patch");
        save_patch(p, &id, s(&file)).unwrap();
        // Onto main, which doesn't have it yet: a new commit with the same message and author.
        commit_file(d.path(), "other.txt", "x", "unrelated");
        let r = apply_patch(p, s(&file)).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(top_summary(p), "feature edit");
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "feature\n");
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");
        assert!(apply_patch(p, "relative.patch").is_err());
        assert!(apply_patch(p, s(&out.path().join("missing.patch"))).is_err());
    }

    #[test]
    fn a_conflicting_mailed_patch_stops_am_to_continue_skip_or_abort() {
        let (d, id) = forked();
        let p = s(d.path());
        let out = tempfile::tempdir().unwrap();
        let file = out.path().join("fix.patch");
        save_patch(p, &id, s(&file)).unwrap();
        commit_file(d.path(), "a.txt", "main\n", "main edit");
        let before = head_id(p);

        let r = apply_patch(p, s(&file)).unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        assert_eq!(snapshot(p, 1).unwrap().state, "am");
        assert!(has_conflicts(p));
        // Another one can't start meanwhile.
        assert!(apply_patch(p, s(&file)).is_err());
        assert_eq!(abort(p).unwrap().status, OpStatus::Ok);
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");
        assert_eq!(head_id(p), before);
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "main\n");

        // Resolved and continued: the patch's commit, with the resolution.
        assert_eq!(apply_patch(p, s(&file)).unwrap().status, OpStatus::Conflict);
        fs::write(d.path().join("a.txt"), "both\n").unwrap();
        let r = continue_op(p).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");
        assert_eq!(top_summary(p), "feature edit");

        // Skipped: nothing applied, nothing in progress.
        run(d.path(), &["reset", "--hard", &before]);
        assert_eq!(apply_patch(p, s(&file)).unwrap().status, OpStatus::Conflict);
        assert_eq!(skip(p).unwrap().status, OpStatus::Ok);
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");
        assert_eq!(head_id(p), before);
    }

    #[test]
    fn applies_a_plain_diff_to_the_working_tree() {
        let (d, id) = forked();
        let p = s(d.path());
        let out = tempfile::tempdir().unwrap();
        let file = out.path().join("change.diff");
        fs::write(&file, run(d.path(), &["diff", "main", &id]) + "\n").unwrap();
        let before = head_id(p);

        let r = apply_patch(p, s(&file)).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(head_id(p), before, "a plain diff makes no commit");
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "feature\n");

        // On top of a conflicting change: conflicted files, nothing in progress.
        run(d.path(), &["checkout", "--", "."]);
        commit_file(d.path(), "a.txt", "main\n", "main edit");
        let r = apply_patch(p, s(&file)).unwrap();
        assert_eq!(r.status, OpStatus::Conflict, "{}", r.output);
        assert!(has_conflicts(p));
        assert_eq!(snapshot(p, 1).unwrap().state, "clean");
        assert!(fs::read_to_string(d.path().join("a.txt"))
            .unwrap()
            .contains("<<<<<<<"));
    }

    #[test]
    fn tells_mail_from_a_plain_diff() {
        assert!(is_mail("From 1234 Mon Sep 17 00:00:00 2001\nFrom: A <a@b>\n"));
        assert!(is_mail("From: A <a@b>\nSubject: [PATCH] x\n\nbody\n"));
        assert!(!is_mail("diff --git a/x b/x\n--- a/x\n+++ b/x\n"));
        assert!(!is_mail("Subject: only\n\ndiff --git a/x b/x\n"));
    }
}
