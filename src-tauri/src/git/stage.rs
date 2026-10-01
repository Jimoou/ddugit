//! Partial staging: move individual hunks between the working tree and the index.

use git2::Patch;

use super::diff::{local_diff, DiffScope};
use super::{err, git_input, open, workdir, OpResult, Result};

/// Stage (or with `unstage`, unstage) the hunks of `file` at `hunks` — indices into
/// the hunk list `worktree_diff` shows for the unstaged (or staged) scope.
pub fn stage_hunks(path: &str, file: &str, hunks: &[usize], unstage: bool) -> Result<OpResult> {
    if hunks.is_empty() {
        return Err("No hunks selected".into());
    }
    let repo = open(path)?;
    let scope = if unstage {
        DiffScope::Staged
    } else {
        DiffScope::Unstaged
    };
    let diff = local_diff(&repo, Some(file), scope)?;
    let mut patch = Patch::from_diff(&diff, 0).map_err(err)?.ok_or_else(|| {
        format!(
            "No textual changes to {} in '{file}'",
            if unstage { "unstage" } else { "stage" }
        )
    })?;
    let text = String::from_utf8_lossy(&patch.to_buf().map_err(err)?).into_owned();
    let partial = select_hunks(&text, hunks)?;

    let mut args = vec!["apply", "--cached", "--whitespace=nowarn"];
    if unstage {
        args.push("--reverse");
    }
    args.push("-");
    Ok(git_input(&workdir(&repo)?, &args, &partial)?.into())
}

/// Keep the file header and only the chosen `@@` hunks of a single-file patch.
fn select_hunks(patch: &str, keep: &[usize]) -> Result<String> {
    let mut out = String::new();
    let mut hunk: Option<usize> = None;
    for line in patch.split_inclusive('\n') {
        if line.starts_with("@@") {
            hunk = Some(hunk.map_or(0, |h| h + 1));
        }
        // Header lines (before the first hunk) and "\ No newline" lines follow their block.
        if hunk.is_none_or(|h| keep.contains(&h)) {
            out.push_str(line);
        }
    }
    let total = hunk.map_or(0, |h| h + 1);
    if let Some(bad) = keep.iter().find(|&&h| h >= total) {
        return Err(format!("Hunk {bad} does not exist (file has {total})"));
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::super::diff::worktree_diff;
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::super::write::commit_index;
    use super::super::OpStatus;
    use super::*;
    use std::fs;

    /// 30 lines with edits near the top and bottom → two separate hunks.
    fn two_hunk_repo() -> tempfile::TempDir {
        let d = repo();
        let base: String = (1..=30).map(|i| format!("line {i}\n")).collect();
        commit_file(d.path(), "f.txt", &base, "base");
        let edited = base.replace("line 2\n", "TOP\n").replace("line 29\n", "BOTTOM\n");
        fs::write(d.path().join("f.txt"), edited).unwrap();
        d
    }

    fn hunks(p: &str, scope: DiffScope) -> usize {
        worktree_diff(p, Some("f.txt"), scope)
            .unwrap()
            .first()
            .map_or(0, |f| f.hunks.len())
    }

    #[test]
    fn stage_one_hunk_and_commit_only_that() {
        let d = two_hunk_repo();
        let p = s(d.path());
        assert_eq!(hunks(p, DiffScope::Unstaged), 2);

        let r = stage_hunks(p, "f.txt", &[1], false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(hunks(p, DiffScope::Staged), 1);
        assert_eq!(hunks(p, DiffScope::Unstaged), 1);

        assert_eq!(
            commit_index(p, "bottom only", false).unwrap().status,
            OpStatus::Ok
        );
        let committed = super::super::git_ok(d.path(), &["show", "HEAD:f.txt"]).unwrap();
        assert!(committed.contains("BOTTOM") && !committed.contains("TOP"));
        // The other hunk is still a local change.
        assert_eq!(snapshot(p, 5).unwrap().changes.len(), 1);
    }

    #[test]
    fn unstage_a_hunk() {
        let d = two_hunk_repo();
        let p = s(d.path());
        stage_hunks(p, "f.txt", &[0, 1], false).unwrap();
        assert_eq!(hunks(p, DiffScope::Unstaged), 0);
        let r = stage_hunks(p, "f.txt", &[0], true).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(hunks(p, DiffScope::Staged), 1);
        assert_eq!(hunks(p, DiffScope::Unstaged), 1);
    }

    #[test]
    fn stage_untracked_file_and_reject_bad_index() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        fs::write(d.path().join("new.txt"), "hello\n").unwrap();
        let r = stage_hunks(p, "new.txt", &[0], false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(
            worktree_diff(p, Some("new.txt"), DiffScope::Staged)
                .unwrap()
                .len(),
            1
        );
        assert!(stage_hunks(p, "new.txt", &[3], true).is_err());
    }

    #[test]
    fn select_hunks_keeps_header_and_chosen_blocks() {
        let patch = "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n@@ -9 +9 @@\n-y\n+z\n\\ No newline at end of file\n";
        let out = select_hunks(patch, &[1]).unwrap();
        assert!(out.starts_with("diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -9 +9 @@"));
        assert!(!out.contains("+b") && out.ends_with("No newline at end of file\n"));
    }
}
