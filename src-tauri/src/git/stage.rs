//! Staging: move whole files, individual hunks, or single lines of a hunk
//! between the working tree and the index, or throw hunks and lines away.

use git2::{Patch, Repository};

use super::diff::{hunk_key, local_diff, DiffScope};
use super::{err, git, git_input, open, workdir, OpResult, Result, LITERAL};

/// Stage (or with `unstage`, unstage) whole files; an empty `paths` means every change.
/// Staging takes deletions and new files too (`add -A`); unstaging puts the index back
/// to HEAD, or empties it for those paths on a branch with no commit yet.
pub fn stage_files(path: &str, paths: &[String], unstage: bool) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let mut args = match (unstage, repo.head().is_ok()) {
        (false, _) => vec![LITERAL, "add", "-A"],
        (true, true) => vec![LITERAL, "restore", "--staged"],
        (true, false) => vec![LITERAL, "rm", "--cached", "-r", "-q", "--ignore-unmatch"],
    };
    args.push("--");
    if paths.is_empty() {
        args.push("."); // run at the top of the working tree: everything
    } else {
        args.extend(paths.iter().map(String::as_str));
    }
    Ok(git(&dir, &args)?.into())
}

/// Stage (or with `unstage`, unstage) the hunks of `file` whose `key`s are given —
/// the keys `worktree_diff` showed for the unstaged (or staged) scope. A key that
/// no longer matches (the file changed since) is refused rather than staging
/// something else. With `lines`, only those lines (indices into the one
/// selected hunk's lines) move.
pub fn stage_hunks(
    path: &str,
    file: &str,
    keys: &[String],
    lines: Option<&[usize]>,
    unstage: bool,
) -> Result<OpResult> {
    let repo = open(path)?;
    let scope = if unstage {
        DiffScope::Staged
    } else {
        DiffScope::Unstaged
    };
    let partial = picked_patch(&repo, file, keys, lines, scope, unstage)?;
    let mut args = vec!["apply", "--cached", "--whitespace=nowarn"];
    if unstage {
        args.push("--reverse");
    }
    args.push("-");
    Ok(git_input(&workdir(&repo)?, &args, &partial)?.into())
}

/// Throw away the unstaged hunks of `file` whose `key`s are given (or, with `lines`,
/// those lines of the one hunk): the working tree goes back to the index there. The
/// index is not touched. Discarding a whole new file deletes it; discarding some of
/// its lines keeps the file without them.
pub fn discard_hunks(path: &str, file: &str, keys: &[String], lines: Option<&[usize]>) -> Result<OpResult> {
    let repo = open(path)?;
    let mut partial = picked_patch(&repo, file, keys, lines, DiffScope::Unstaged, true)?;
    if lines.is_some() {
        partial = in_place(&partial);
    }
    let args = ["apply", "--reverse", "--whitespace=nowarn", "-"];
    Ok(git_input(&workdir(&repo)?, &args, &partial)?.into())
}

/// The patch of `file`'s hunks with the given keys in `scope` (unstaged: index → work
/// tree, staged: HEAD → index), narrowed to `lines` of the one hunk when given.
/// `reverse`: it will be applied in reverse, which decides what an unpicked line becomes.
fn picked_patch(
    repo: &Repository,
    file: &str,
    keys: &[String],
    lines: Option<&[usize]>,
    scope: DiffScope,
    reverse: bool,
) -> Result<Vec<u8>> {
    if keys.is_empty() {
        return Err("No hunks selected".into());
    }
    if lines.is_some() && keys.len() != 1 {
        return Err("Lines can be picked from one hunk at a time".into());
    }
    let diff = local_diff(repo, Some(file), scope)?;
    let mut patch = Patch::from_diff(&diff, 0)
        .map_err(err)?
        .ok_or_else(|| format!("No textual changes in '{file}'"))?;
    let now = (0..patch.num_hunks())
        .map(|h| hunk_key(&patch, h))
        .collect::<Result<Vec<_>>>()?;
    let hunks = keys
        .iter()
        .map(|k| now.iter().position(|n| n == k))
        .collect::<Option<Vec<usize>>>()
        .ok_or_else(|| format!("'{file}' changed since its diff was shown; look at it again and retry"))?;
    // Bytes throughout: a file in a legacy encoding (CP949, Latin-1) must reach the index unchanged.
    let buf = patch.to_buf().map_err(err)?;
    let mut partial = select_hunks(&buf, &hunks)?;
    if let Some(lines) = lines {
        partial = select_lines(&partial, lines, reverse)?;
    }
    Ok(partial)
}

/// A patch that creates a file, rewritten to change the file in place: taking back
/// some lines of a new file must leave the rest, not delete the file.
fn in_place(patch: &[u8]) -> Vec<u8> {
    // The new side's name, `b/name` (or `"b/name"` when quoted), spelled as an old side: `a/name`.
    let old_side = lines_of(patch).find_map(|l| {
        let new = l.strip_prefix(b"+++ ")?;
        let (quote, name) = match new.strip_prefix(b"\"b/") {
            Some(name) => (&b"\""[..], name),
            None => (&b""[..], new.strip_prefix(b"b/")?),
        };
        Some([b"--- ", quote, b"a/", name].concat())
    });
    let Some(old_side) = old_side else {
        return patch.to_vec();
    };
    let mut out = Vec::new();
    let mut head = true;
    for line in lines_of(patch) {
        head &= !line.starts_with(b"@@");
        if head && line.starts_with(b"new file mode") {
            continue;
        }
        if head && line.starts_with(b"--- /dev/null") {
            out.extend_from_slice(&old_side);
        } else {
            out.extend_from_slice(line);
        }
    }
    out
}

/// `patch` split after each `\n`, the last piece kept even without one.
fn lines_of(patch: &[u8]) -> impl Iterator<Item = &[u8]> {
    patch.split_inclusive(|&b| b == b'\n')
}

/// Keep the file header and only the chosen `@@` hunks of a single-file patch.
fn select_hunks(patch: &[u8], keep: &[usize]) -> Result<Vec<u8>> {
    let mut out = Vec::new();
    let mut hunk: Option<usize> = None;
    for line in lines_of(patch) {
        if line.starts_with(b"@@") {
            hunk = Some(hunk.map_or(0, |h| h + 1));
        }
        // Header lines (before the first hunk) and "\ No newline" lines follow their block.
        if hunk.is_none_or(|h| keep.contains(&h)) {
            out.extend_from_slice(line);
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
fn select_lines(patch: &[u8], keep: &[usize], reverse: bool) -> Result<Vec<u8>> {
    let mut head = Vec::new();
    let mut body = Vec::new();
    let mut range: Option<HunkRange> = None;
    let (mut old_n, mut new_n, mut idx) = (0, 0, 0);
    let (mut picked, mut dropped_prev) = (false, false);
    for line in lines_of(patch) {
        if range.is_none() {
            if line.starts_with(b"@@") {
                range = Some(HunkRange::parse(line)?);
            } else {
                head.extend_from_slice(line);
            }
            continue;
        }
        if line.starts_with(b"\\") {
            // "\ No newline at end of file" belongs to the line before it.
            if !dropped_prev {
                body.extend_from_slice(line);
            }
            continue;
        }
        let sign = line.first().copied().unwrap_or(b' ');
        let chosen = keep.contains(&idx);
        idx += 1;
        let kept = match sign {
            b'+' | b'-' if chosen => {
                picked = true;
                Some(sign)
            }
            b'+' if reverse => Some(b' '),
            b'-' if !reverse => Some(b' '),
            b'+' | b'-' => None,
            _ => Some(b' '),
        };
        dropped_prev = kept.is_none();
        let Some(c) = kept else { continue };
        body.push(c);
        body.extend_from_slice(line.get(1..).unwrap_or_default());
        match c {
            b'-' => old_n += 1,
            b'+' => new_n += 1,
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
    let mut out = head;
    out.extend_from_slice(
        format!(
            "@@ -{} +{} @@",
            HunkRange::side(r.old, old_n),
            HunkRange::side(r.new, new_n)
        )
        .as_bytes(),
    );
    out.extend_from_slice(&r.section);
    out.push(b'\n');
    out.extend_from_slice(&body);
    Ok(out)
}

/// The `@@ -a,b +c,d @@ section` line of a hunk. The ranges are ASCII; the
/// section is a line of the file and kept as bytes.
struct HunkRange {
    old: (u32, u32),
    new: (u32, u32),
    section: Vec<u8>,
}

impl HunkRange {
    fn parse(line: &[u8]) -> Result<Self> {
        let bad = || {
            format!(
                "Unexpected hunk header: {}",
                String::from_utf8_lossy(line).trim_end()
            )
        };
        let rest = line.strip_prefix(b"@@ -").ok_or_else(bad)?;
        let end = rest.windows(3).position(|w| w == b" @@").ok_or_else(bad)?;
        let ranges = std::str::from_utf8(&rest[..end]).map_err(|_| bad())?;
        let mut section = &rest[end + 3..];
        while let [head @ .., b'\n' | b'\r'] = section {
            section = head;
        }
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
            section: section.to_vec(),
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

    /// `stage_hunks` with the keys the UI got for hunks `at` (a missing index gets a key that matches nothing).
    fn stage(p: &str, file: &str, at: &[usize], lines: Option<&[usize]>, unstage: bool) -> Result<OpResult> {
        let scope = if unstage {
            DiffScope::Staged
        } else {
            DiffScope::Unstaged
        };
        let diff = worktree_diff(p, Some(file), scope).unwrap();
        let keys: Vec<String> = at
            .iter()
            .map(|&i| {
                diff.first()
                    .and_then(|f| f.hunks.get(i))
                    .map_or("none".into(), |h| h.key.clone())
            })
            .collect();
        stage_hunks(p, file, &keys, lines, unstage)
    }

    #[test]
    fn a_hunk_that_changed_since_it_was_shown_is_refused() {
        let d = two_hunk_repo();
        let p = s(d.path());
        let shown = worktree_diff(p, Some("f.txt"), DiffScope::Unstaged).unwrap();
        let bottom = shown[0].hunks[1].key.clone();
        // An editor saves again: a new hunk above, and the shown one edited.
        let now = fs::read_to_string(d.path().join("f.txt")).unwrap();
        fs::write(d.path().join("f.txt"), now.replace("line 15\n", "MIDDLE\n")).unwrap();
        // The bottom hunk is unchanged, only its index moved: it is still found.
        let r = stage_hunks(p, "f.txt", &[bottom], None, false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let staged = super::super::git_ok(d.path(), &["show", ":f.txt"]).unwrap();
        assert!(staged.contains("BOTTOM") && !staged.contains("MIDDLE") && !staged.contains("TOP"));
        // The top hunk as shown no longer exists.
        let now = fs::read_to_string(d.path().join("f.txt")).unwrap();
        fs::write(d.path().join("f.txt"), now.replace("TOP\n", "TOP!\n")).unwrap();
        let top = shown[0].hunks[0].key.clone();
        assert!(stage_hunks(p, "f.txt", std::slice::from_ref(&top), None, false)
            .unwrap_err()
            .contains("changed since"));
        assert!(stage_hunks(p, "f.txt", &[top], Some(&[1]), false).is_err());
        let staged = super::super::git_ok(d.path(), &["show", ":f.txt"]).unwrap();
        assert!(!staged.contains("TOP") && !staged.contains("MIDDLE"));
    }

    /// A legacy-encoded (CP949) file: its bytes reach the index unchanged.
    #[test]
    fn stages_hunks_and_lines_of_non_utf8_files_byte_for_byte() {
        let d = repo();
        let p = s(d.path());
        let han = b"\xc7\xd1\xb1\xdb"; // "한글" in CP949
        let mut base = b"a\n".to_vec();
        base.extend_from_slice(han);
        base.extend_from_slice(b" old\nz\n");
        fs::write(d.path().join("k.txt"), &base).unwrap();
        super::super::git_ok(d.path(), &["add", "k.txt"]).unwrap();
        super::super::git_ok(d.path(), &["commit", "-qm", "base"]).unwrap();
        let mut edited = b"a\n".to_vec();
        edited.extend_from_slice(han);
        edited.extend_from_slice(b" new\n");
        edited.extend_from_slice(han);
        edited.extend_from_slice(b" more\nz\n");
        fs::write(d.path().join("k.txt"), &edited).unwrap();
        let index = || {
            let out = std::process::Command::new("git")
                .args(["show", ":k.txt"])
                .current_dir(d.path())
                .output()
                .unwrap();
            out.stdout
        };
        // Lines: 0 " a", 1 -han old, 2 +han new, 3 +han more, 4 " z". Stage only "+han more".
        let r = stage(p, "k.txt", &[0], Some(&[3]), false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let mut expect = b"a\n".to_vec();
        expect.extend_from_slice(han);
        expect.extend_from_slice(b" old\n");
        expect.extend_from_slice(han);
        expect.extend_from_slice(b" more\nz\n");
        assert_eq!(index(), expect);
        // The rest as a whole hunk: the index now equals the work tree.
        let r = stage(p, "k.txt", &[0], None, false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(index(), edited);
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

        let r = stage(p, "f.txt", &[1], None, false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(hunks(p, DiffScope::Staged), 1);
        assert_eq!(hunks(p, DiffScope::Unstaged), 1);

        assert_eq!(
            commit_index(p, "bottom only", false, Default::default())
                .unwrap()
                .status,
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
        stage(p, "f.txt", &[0, 1], None, false).unwrap();
        assert_eq!(hunks(p, DiffScope::Unstaged), 0);
        let r = stage(p, "f.txt", &[0], None, true).unwrap();
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
        let r = stage(p, "new.txt", &[0], None, false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(
            worktree_diff(p, Some("new.txt"), DiffScope::Staged)
                .unwrap()
                .len(),
            1
        );
        assert!(stage(p, "new.txt", &[3], None, true).is_err());
    }

    #[test]
    fn select_hunks_keeps_header_and_chosen_blocks() {
        let patch = "diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -1 +1 @@\n-a\n+b\n@@ -9 +9 @@\n-y\n+z\n\\ No newline at end of file\n";
        let out = String::from_utf8(select_hunks(patch.as_bytes(), &[1]).unwrap()).unwrap();
        assert!(out.starts_with("diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -9 +9 @@"));
        assert!(!out.contains("+b") && out.ends_with("No newline at end of file\n"));
    }

    /// Stage `pick` lines of `file`'s only hunk (or unstage), returning the index copy (trimmed).
    fn lines(d: &tempfile::TempDir, file: &str, pick: &[usize], unstage: bool) -> String {
        let r = stage(s(d.path()), file, &[0], Some(pick), unstage).unwrap();
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
        assert!(stage(p, "f.txt", &[0], Some(&[0]), false).is_err());
        assert!(stage(p, "f.txt", &[0], Some(&[9]), false).is_err());
        assert!(stage(p, "f.txt", &[0, 1], Some(&[1]), false).is_err());
    }

    fn staged_paths(d: &tempfile::TempDir) -> Vec<String> {
        snapshot(s(d.path()), 5)
            .unwrap()
            .changes
            .into_iter()
            .filter(|c| c.staged.is_some())
            .map(|c| c.path)
            .collect()
    }

    #[test]
    fn stage_and_unstage_whole_files() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        commit_file(d.path(), "gone.txt", "g", "base 2");
        fs::write(d.path().join("a.txt"), "edit").unwrap();
        fs::write(d.path().join("new[1].txt"), "n").unwrap();
        fs::remove_file(d.path().join("gone.txt")).unwrap();

        let r = stage_files(p, &["new[1].txt".into(), "gone.txt".into()], false).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(staged_paths(&d), vec!["gone.txt", "new[1].txt"]);
        let r = stage_files(p, &["gone.txt".into()], true).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(staged_paths(&d), vec!["new[1].txt"]);
        // Everything, then nothing.
        stage_files(p, &[], false).unwrap();
        assert_eq!(staged_paths(&d).len(), 3);
        stage_files(p, &[], true).unwrap();
        assert!(staged_paths(&d).is_empty());
        assert_eq!(fs::read_to_string(d.path().join("a.txt")).unwrap(), "edit");
    }

    #[test]
    fn unstage_files_before_the_first_commit() {
        let d = repo();
        let p = s(d.path());
        fs::write(d.path().join("a.txt"), "a").unwrap();
        fs::write(d.path().join("b.txt"), "b").unwrap();
        stage_files(p, &[], false).unwrap();
        assert_eq!(staged_paths(&d).len(), 2);
        let r = stage_files(p, &["a.txt".into()], true).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(staged_paths(&d), vec!["b.txt"]);
        assert!(d.path().join("a.txt").exists());
        stage_files(p, &[], true).unwrap();
        assert!(staged_paths(&d).is_empty());
    }

    /// `discard_hunks` with the keys of the unstaged hunks `at`.
    fn discard(p: &str, file: &str, at: &[usize], lines: Option<&[usize]>) -> OpResult {
        let diff = worktree_diff(p, Some(file), DiffScope::Unstaged).unwrap();
        let keys: Vec<String> = at.iter().map(|&i| diff[0].hunks[i].key.clone()).collect();
        let r = discard_hunks(p, file, &keys, lines).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        r
    }

    #[test]
    fn discard_one_hunk_keeps_the_other_and_the_index() {
        let d = two_hunk_repo();
        let p = s(d.path());
        // Stage the top hunk first: discarding works against the index.
        stage(p, "f.txt", &[0], None, false).unwrap();
        fs::write(
            d.path().join("f.txt"),
            fs::read_to_string(d.path().join("f.txt"))
                .unwrap()
                .replace("line 15\n", "MIDDLE\n"),
        )
        .unwrap();
        assert_eq!(hunks(p, DiffScope::Unstaged), 2);
        discard(p, "f.txt", &[0], None);
        let now = fs::read_to_string(d.path().join("f.txt")).unwrap();
        assert!(now.contains("TOP") && !now.contains("MIDDLE") && now.contains("BOTTOM"));
        let staged = super::super::git_ok(d.path(), &["show", ":f.txt"]).unwrap();
        assert!(staged.contains("TOP") && !staged.contains("BOTTOM"));
    }

    #[test]
    fn discard_single_lines() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "f.txt", "a\nb\nc\n", "base");
        fs::write(d.path().join("f.txt"), "A\nb\nC\n").unwrap();
        // Hunk lines: 0 -a, 1 +A, 2 " b", 3 -c, 4 +C. Take back the bottom change only.
        discard(p, "f.txt", &[0], Some(&[3, 4]));
        assert_eq!(fs::read_to_string(d.path().join("f.txt")).unwrap(), "A\nb\nc\n");
        // Only the addition of the top change: "a" stays deleted, "A" goes.
        discard(p, "f.txt", &[0], Some(&[1]));
        assert_eq!(fs::read_to_string(d.path().join("f.txt")).unwrap(), "b\nc\n");
    }

    #[test]
    fn discard_lines_or_all_of_a_new_file() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        fs::write(d.path().join("new.txt"), "1\n2\n3\n").unwrap();
        discard(p, "new.txt", &[0], Some(&[1]));
        assert_eq!(fs::read_to_string(d.path().join("new.txt")).unwrap(), "1\n3\n");
        discard(p, "new.txt", &[0], None);
        assert!(!d.path().join("new.txt").exists());
        // A stale key is refused, like staging.
        fs::write(d.path().join("a.txt"), "b").unwrap();
        assert!(discard_hunks(p, "a.txt", &["stale".into()], None).is_err());
    }

    #[test]
    fn in_place_turns_a_creation_into_an_edit() {
        let patch = b"diff --git a/n b/n\nnew file mode 100644\nindex 0000000..1\n--- /dev/null\n+++ b/n\n@@ -1,2 +1,3 @@\n 1\n+2\n 3\n";
        let out = String::from_utf8(in_place(patch)).unwrap();
        assert_eq!(
            out,
            "diff --git a/n b/n\nindex 0000000..1\n--- a/n\n+++ b/n\n@@ -1,2 +1,3 @@\n 1\n+2\n 3\n"
        );
        let quoted = in_place(b"--- /dev/null\n+++ \"b/\\303\\251\"\n@@ -1 +1 @@\n");
        assert!(quoted.starts_with(b"--- \"a/\\303\\251\"\n"));
    }

    #[test]
    fn select_lines_follows_no_newline_marker() {
        let patch = "--- a/f\n+++ b/f\n@@ -1 +1 @@ fn x\n-old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n";
        // Staging only the addition: "-old" stays as context with its marker.
        let sel = |keep: &[usize], rev| {
            String::from_utf8(select_lines(patch.as_bytes(), keep, rev).unwrap()).unwrap()
        };
        assert_eq!(
            sel(&[1], false),
            "--- a/f\n+++ b/f\n@@ -1,1 +1,2 @@ fn x\n old\n\\ No newline at end of file\n+new\n\\ No newline at end of file\n"
        );
        // Unstaging only the removal (applied in reverse): the unpicked "+new" stays as context.
        let rev = sel(&[0], true);
        assert!(rev.contains("@@ -1,2 +1,1 @@") && rev.contains("-old\n") && rev.contains(" new\n"));
    }
}
