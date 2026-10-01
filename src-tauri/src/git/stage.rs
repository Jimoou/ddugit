//! Partial staging: move individual hunks, or single lines of a hunk, between
//! the working tree and the index.

use git2::Patch;

use super::diff::{local_diff, DiffScope};
use super::{err, git_input, open, workdir, OpResult, Result};

/// Stage (or with `unstage`, unstage) the hunks of `file` at `hunks` — indices into
/// the hunk list `worktree_diff` shows for the unstaged (or staged) scope. With
/// `lines`, only those lines (indices into the one selected hunk's lines) move.
pub fn stage_hunks(
    path: &str,
    file: &str,
    hunks: &[usize],
    lines: Option<&[usize]>,
    unstage: bool,
) -> Result<OpResult> {
    if hunks.is_empty() {
        return Err("No hunks selected".into());
    }
    if lines.is_some() && hunks.len() != 1 {
        return Err("Lines can be picked from one hunk at a time".into());
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
    let mut partial = select_hunks(&text, hunks)?;
    if let Some(lines) = lines {
        partial = select_lines(&partial, lines, unstage)?;
    }

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

/// Narrow a single-hunk patch to the lines at `keep` (indices into the hunk
/// body, "\\ No newline" markers not counted). Unpicked changes must leave the
/// index as it is: when staging, an unpicked `-` stays as context and an
/// unpicked `+` is dropped; when unstaging (applied with `--reverse`) it is the
/// other way round.
fn select_lines(patch: &str, keep: &[usize], reverse: bool) -> Result<String> {
    let mut head = String::new();
    let mut body = String::new();
    let mut range: Option<HunkRange> = None;
    let (mut old_n, mut new_n, mut idx) = (0, 0, 0);
    let (mut picked, mut dropped_prev) = (false, false);
    for line in patch.split_inclusive('\n') {
        if range.is_none() {
            if line.starts_with("@@") {
                range = Some(HunkRange::parse(line)?);
            } else {
                head.push_str(line);
            }
            continue;
        }
        if line.starts_with('\\') {
            // "\ No newline at end of file" belongs to the line before it.
            if !dropped_prev {
                body.push_str(line);
            }
            continue;
        }
        let sign = line.chars().next().unwrap_or(' ');
        let chosen = keep.contains(&idx);
        idx += 1;
        let kept = match sign {
            '+' | '-' if chosen => {
                picked = true;
                Some(sign)
            }
            '+' if reverse => Some(' '),
            '-' if !reverse => Some(' '),
            '+' | '-' => None,
            _ => Some(' '),
        };
        dropped_prev = kept.is_none();
        let Some(c) = kept else { continue };
        body.push(c);
        body.push_str(&line[1..]);
        match c {
            '-' => old_n += 1,
            '+' => new_n += 1,
            _ => {
                old_n += 1;
                new_n += 1;
            }
        }
    }
    let r = range.ok_or("Patch has no hunk")?;
    if let Some(bad) = keep.iter().find(|&&i| i >= idx) {
        return Err(format!("Line {bad} does not exist (hunk has {idx})"));
    }
    if !picked {
        return Err("No changed lines selected".into());
    }
    Ok(format!(
        "{head}@@ -{} +{} @@{}\n{body}",
        HunkRange::side(r.old, old_n),
        HunkRange::side(r.new, new_n),
        r.section
    ))
}

/// The `@@ -a,b +c,d @@ section` line of a hunk.
struct HunkRange {
    old: (u32, u32),
    new: (u32, u32),
    section: String,
}

impl HunkRange {
    fn parse(line: &str) -> Result<Self> {
        let bad = || format!("Unexpected hunk header: {}", line.trim_end());
        let rest = line.strip_prefix("@@ -").ok_or_else(bad)?;
        let (ranges, section) = rest.split_once(" @@").ok_or_else(bad)?;
        let (old, new) = ranges.split_once(" +").ok_or_else(bad)?;
        let side = |s: &str| -> Option<(u32, u32)> {
            match s.split_once(',') {
                Some((a, b)) => Some((a.parse().ok()?, b.parse().ok()?)),
                None => Some((s.parse().ok()?, 1)),
            }
        };
        Ok(Self {
            old: side(old).ok_or_else(bad)?,
            new: side(new).ok_or_else(bad)?,
            section: section.trim_end_matches(['\n', '\r']).to_string(),
        })
    }

    /// `start,count` for a side whose line count changed. An empty side points
    /// at the line before the hunk, as git writes it.
    fn side((start, count): (u32, u32), n: u32) -> String {
        let start = match (count, n) {
            (0, 1..) => start + 1,
            (1.., 0) => start.saturating_sub(1),
            _ => start,
        };
        format!("{start},{n}")
    }
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

        let r = stage_hunks(p, "f.txt", &[1], None, false).unwrap();
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
        stage_hunks(p, "f.txt", &[0, 1], None, false).unwrap();
        assert_eq!(hunks(p, DiffScope::Unstaged), 0);
        let r = stage_hunks(p, "f.txt", &[0], None, true).unwrap();
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
        let r = stage_hunks(p, "new.txt", &[0], None, false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(
            worktree_diff(p, Some("new.txt"), DiffScope::Staged)
                .unwrap()
                .len(),
            1
        );
        assert!(stage_hunks(p, "new.txt", &[3], None, true).is_err());
    }

    #[test]
    fn select_hunks_keeps_header_and_chosen_blocks() {
        let patch = "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n@@ -9 +9 @@\n-y\n+z\n\\ No newline at end of file\n";
        let out = select_hunks(patch, &[1]).unwrap();
        assert!(out.starts_with("diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -9 +9 @@"));
        assert!(!out.contains("+b") && out.ends_with("No newline at end of file\n"));
    }

    /// Stage `pick` lines of `file`'s only hunk (or unstage), returning the index copy (trimmed).
    fn lines(d: &tempfile::TempDir, file: &str, pick: &[usize], unstage: bool) -> String {
        let r = stage_hunks(s(d.path()), file, &[0], Some(pick), unstage).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        super::super::git_ok(d.path(), &["show", &format!(":{file}")]).unwrap()
    }

    #[test]
    fn stage_and_unstage_single_lines() {
        let d = repo();
        commit_file(d.path(), "f.txt", "a\nb\nc\n", "base");
        fs::write(d.path().join("f.txt"), "A\nb\nC\n").unwrap();
        // Hunk lines: 0 -a, 1 +A, 2 " b", 3 -c, 4 +C.
        assert_eq!(lines(&d, "f.txt", &[0, 1], false), "A\nb\nc");
        // Indices refer to the diff as it is now: 0 " A", 1 " b", 2 -c, 3 +C.
        assert_eq!(lines(&d, "f.txt", &[2, 3], false), "A\nb\nC");
        // Staged hunk is now the same five lines; take the bottom change back out.
        assert_eq!(lines(&d, "f.txt", &[3, 4], true), "A\nb\nc");
    }

    #[test]
    fn stage_lines_of_additions_deletions_and_new_files() {
        let d = repo();
        commit_file(d.path(), "add.txt", "a\n", "base");
        commit_file(d.path(), "del.txt", "a\nb\n", "base 2");
        fs::write(d.path().join("add.txt"), "a\nx\ny\n").unwrap();
        fs::write(d.path().join("del.txt"), "").unwrap();
        fs::write(d.path().join("new.txt"), "1\n2\n3\n").unwrap();
        // add.txt: 0 " a", 1 +x, 2 +y.
        assert_eq!(lines(&d, "add.txt", &[2], false), "a\ny");
        // del.txt empties the file (-1,2 +0,0); deleting only "a" keeps one line.
        assert_eq!(lines(&d, "del.txt", &[0], false), "b");
        assert_eq!(lines(&d, "new.txt", &[1], false), "2");
    }

    #[test]
    fn line_selection_errors() {
        let d = repo();
        commit_file(d.path(), "f.txt", "a\nb\n", "base");
        fs::write(d.path().join("f.txt"), "a\nB\n").unwrap();
        let p = s(d.path());
        // Only context picked, an index past the hunk, two hunks at once.
        assert!(stage_hunks(p, "f.txt", &[0], Some(&[0]), false).is_err());
        assert!(stage_hunks(p, "f.txt", &[0], Some(&[9]), false).is_err());
        assert!(stage_hunks(p, "f.txt", &[0, 1], Some(&[1]), false).is_err());
    }

    #[test]
    fn select_lines_follows_no_newline_marker() {
        let patch = "--- a/f\n+++ b/f\n@@ -1 +1 @@ fn x\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n";
        // Staging only the addition: "-old" stays as context with its marker.
        assert_eq!(
            select_lines(patch, &[1], false).unwrap(),
            "--- a/f\n+++ b/f\n@@ -1,1 +1,2 @@ fn x\n old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n"
        );
        // Unstaging only the removal (applied in reverse): the unpicked "+new" stays as context.
        let rev = select_lines(patch, &[0], true).unwrap();
        assert!(rev.contains("@@ -1,2 +1,1 @@") && rev.contains("-old\n") && rev.contains(" new\n"));
    }
}
