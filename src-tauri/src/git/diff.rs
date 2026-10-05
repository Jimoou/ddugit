//! Diffs via libgit2: a commit against its first parent, or local changes
//! (all / unstaged / staged) against HEAD and the index.

use git2::{Delta, Diff, DiffFindOptions, DiffOptions, Patch, Repository};
use serde::{Deserialize, Serialize};

use super::{err, open, Result};

/// Per-file line cap; beyond it the file is marked `truncated`. The diff
/// sheet draws only the rows on screen, so this bounds the payload, not the page.
const MAX_FILE_LINES: usize = 50_000;
/// Whole-diff line cap; later files get headers and stats only.
const MAX_TOTAL_LINES: usize = 100_000;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    /// `+`, `-` or ` `.
    pub kind: char,
    pub old: Option<u32>,
    pub new: Option<u32>,
    pub text: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffHunk {
    pub header: String,
    pub lines: Vec<DiffLine>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileDiff {
    pub path: String,
    /// Set for renames / copies.
    pub old_path: Option<String>,
    /// added / deleted / modified / renamed / copied / typechange / untracked
    pub status: String,
    pub additions: usize,
    pub deletions: usize,
    pub binary: bool,
    pub truncated: bool,
    pub hunks: Vec<DiffHunk>,
}

/// Changes introduced by `id` (against its first parent; root commits against an empty tree).
pub fn commit_diff(path: &str, id: &str) -> Result<Vec<FileDiff>> {
    let repo = open(path)?;
    let commit = repo
        .revparse_single(id)
        .and_then(|o| o.peel_to_commit())
        .map_err(err)?;
    let parent_tree = match commit.parent(0) {
        Ok(p) => Some(p.tree().map_err(err)?),
        Err(_) => None,
    };
    let mut diff = repo
        .diff_tree_to_tree(
            parent_tree.as_ref(),
            Some(&commit.tree().map_err(err)?),
            Some(&mut options()),
        )
        .map_err(err)?;
    find_renames(&mut diff)?;
    collect(&mut diff)
}

/// Which local changes a working-tree diff shows.
#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DiffScope {
    /// HEAD → working tree (staged and unstaged together).
    All,
    /// Index → working tree: what `git add` would still pick up.
    Unstaged,
    /// HEAD → index: what the next commit contains.
    Staged,
}

/// Local changes in `scope`, optionally limited to one path. Untracked files show as added.
pub fn worktree_diff(path: &str, file: Option<&str>, scope: DiffScope) -> Result<Vec<FileDiff>> {
    let repo = open(path)?;
    let mut diff = local_diff(&repo, file, scope)?;
    collect(&mut diff)
}

/// Raw diff behind `worktree_diff`. Hunk indices are shared with it, so staging
/// code can pick hunks the UI showed.
pub(super) fn local_diff<'r>(repo: &'r Repository, file: Option<&str>, scope: DiffScope) -> Result<Diff<'r>> {
    let head = head_tree(repo)?;
    let mut opts = options();
    if scope != DiffScope::Staged {
        opts.include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);
    }
    if let Some(f) = file {
        opts.pathspec(f).disable_pathspec_match(true);
    }
    let mut diff = match scope {
        DiffScope::All => repo.diff_tree_to_workdir_with_index(head.as_ref(), Some(&mut opts)),
        DiffScope::Unstaged => repo.diff_index_to_workdir(None, Some(&mut opts)),
        DiffScope::Staged => repo.diff_tree_to_index(head.as_ref(), None, Some(&mut opts)),
    }
    .map_err(err)?;
    find_renames(&mut diff)?;
    Ok(diff)
}

fn head_tree(repo: &Repository) -> Result<Option<git2::Tree<'_>>> {
    match repo.head() {
        Ok(h) => Ok(Some(h.peel_to_tree().map_err(err)?)),
        Err(_) => Ok(None), // unborn branch
    }
}

fn options() -> DiffOptions {
    let mut o = DiffOptions::new();
    o.context_lines(3).ignore_submodules(true);
    o
}

fn status_name(d: Delta) -> &'static str {
    match d {
        Delta::Added => "added",
        Delta::Deleted => "deleted",
        Delta::Renamed => "renamed",
        Delta::Copied => "copied",
        Delta::Typechange => "typechange",
        Delta::Untracked => "untracked",
        Delta::Conflicted => "conflicted",
        _ => "modified",
    }
}

fn find_renames(diff: &mut Diff) -> Result<()> {
    diff.find_similar(Some(DiffFindOptions::new().renames(true)))
        .map_err(err)
}

fn collect(diff: &mut Diff) -> Result<Vec<FileDiff>> {
    let mut out = Vec::new();
    let mut budget = MAX_TOTAL_LINES;
    for idx in 0..diff.deltas().len() {
        let delta = diff.get_delta(idx).ok_or("diff delta out of range")?;
        let new_path = delta.new_file().path().or(delta.old_file().path());
        let path = new_path
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_default();
        let old_path = delta.old_file().path().map(|p| p.to_string_lossy().into_owned());
        let mut file = FileDiff {
            old_path: old_path.filter(|o| *o != path),
            path,
            status: status_name(delta.status()).to_string(),
            additions: 0,
            deletions: 0,
            binary: false,
            truncated: false,
            hunks: Vec::new(),
        };

        let Some(patch) = Patch::from_diff(diff, idx).map_err(err)? else {
            file.binary = true;
            out.push(file);
            continue;
        };
        file.binary = patch.delta().flags().is_binary();
        let (_, adds, dels) = patch.line_stats().map_err(err)?;
        file.additions = adds;
        file.deletions = dels;

        let cap = MAX_FILE_LINES.min(budget);
        let mut taken = 0;
        'hunks: for h in 0..patch.num_hunks() {
            let (hunk, n) = patch.hunk(h).map_err(err)?;
            let mut lines = Vec::with_capacity(n);
            for l in 0..n {
                if taken >= cap {
                    file.truncated = true;
                    if !lines.is_empty() {
                        file.hunks.push(DiffHunk {
                            header: header(&hunk),
                            lines,
                        });
                    }
                    break 'hunks;
                }
                let line = patch.line_in_hunk(h, l).map_err(err)?;
                let kind = match line.origin() {
                    '+' | '-' | ' ' => line.origin(),
                    _ => continue, // "\ No newline at end of file" and file headers
                };
                taken += 1;
                lines.push(DiffLine {
                    kind,
                    old: line.old_lineno(),
                    new: line.new_lineno(),
                    text: String::from_utf8_lossy(line.content())
                        .trim_end_matches(['\n', '\r'])
                        .to_string(),
                });
            }
            file.hunks.push(DiffHunk {
                header: header(&hunk),
                lines,
            });
        }
        budget -= taken;
        out.push(file);
    }
    Ok(out)
}

fn header(h: &git2::DiffHunk) -> String {
    String::from_utf8_lossy(h.header()).trim_end().to_string()
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;
    use std::fs;

    #[test]
    fn commit_diff_against_parent_and_root() {
        let d = repo();
        commit_file(d.path(), "a.txt", "one\ntwo\nthree\n", "base");
        commit_file(d.path(), "a.txt", "one\n2\nthree\n", "edit");

        let files = commit_diff(s(d.path()), "HEAD").unwrap();
        assert_eq!(files.len(), 1);
        let f = &files[0];
        assert_eq!((f.path.as_str(), f.status.as_str()), ("a.txt", "modified"));
        assert_eq!((f.additions, f.deletions), (1, 1));
        let kinds: String = f.hunks[0].lines.iter().map(|l| l.kind).collect();
        assert_eq!(kinds, " -+ ");
        let added = f.hunks[0].lines.iter().find(|l| l.kind == '+').unwrap();
        assert_eq!((added.text.as_str(), added.new, added.old), ("2", Some(2), None));

        let root = commit_diff(s(d.path()), "HEAD~1").unwrap();
        assert_eq!(root[0].status, "added");
        assert_eq!(root[0].additions, 3);
    }

    #[test]
    fn worktree_diff_includes_untracked_and_filters_by_path() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a\n", "base");
        fs::write(d.path().join("a.txt"), "a\nb\n").unwrap();
        fs::write(d.path().join("new.txt"), "hello\n").unwrap();

        let all = worktree_diff(s(d.path()), None, DiffScope::All).unwrap();
        assert_eq!(all.len(), 2);
        let only = worktree_diff(s(d.path()), Some("new.txt"), DiffScope::All).unwrap();
        assert_eq!(only.len(), 1);
        assert_eq!(only[0].additions, 1);
        assert_eq!(only[0].hunks[0].lines[0].text, "hello");
    }

    #[test]
    fn worktree_diff_on_unborn_branch() {
        let d = repo();
        fs::write(d.path().join("first.txt"), "x\n").unwrap();
        let files = worktree_diff(s(d.path()), None, DiffScope::All).unwrap();
        assert_eq!(files.len(), 1);
    }

    #[test]
    fn binary_files_have_no_hunks() {
        let d = repo();
        fs::write(d.path().join("bin.dat"), [0u8, 1, 2, 0, 255]).unwrap();
        crate::git::write::commit(s(d.path()), "bin", &[], false).unwrap();
        let files = commit_diff(s(d.path()), "HEAD").unwrap();
        assert!(files[0].binary);
        assert!(files[0].hunks.is_empty());
    }

    #[test]
    fn large_files_are_truncated() {
        let d = repo();
        let big: String = (0..MAX_FILE_LINES + 50).map(|i| format!("{i}\n")).collect();
        commit_file(d.path(), "big.txt", &big, "big");
        let f = &commit_diff(s(d.path()), "HEAD").unwrap()[0];
        assert!(f.truncated);
        assert_eq!(f.additions, MAX_FILE_LINES + 50);
        let shown: usize = f.hunks.iter().map(|h| h.lines.len()).sum();
        assert_eq!(shown, MAX_FILE_LINES);
    }

    /// Timing of big commit diffs (see docs/PERF.md): `DDUGIT_BENCH_REPO=<repo>
    /// DDUGIT_BENCH_DIFFS=<rev>,<rev> cargo test --release --lib diff_bench -- --ignored --nocapture`.
    /// With `DDUGIT_BENCH_OUT=<dir>` it also writes each diff as JSON for the web benchmarks.
    #[test]
    #[ignore]
    fn diff_bench() {
        let (Ok(path), Ok(revs)) = (
            std::env::var("DDUGIT_BENCH_REPO"),
            std::env::var("DDUGIT_BENCH_DIFFS"),
        ) else {
            return;
        };
        for (i, rev) in revs.split(',').enumerate() {
            let t = std::time::Instant::now();
            let files = commit_diff(&path, rev).unwrap();
            let ms = t.elapsed().as_secs_f64() * 1000.0;
            let lines: usize = files.iter().flat_map(|f| &f.hunks).map(|h| h.lines.len()).sum();
            let json = serde_json::to_string(&files).unwrap();
            println!(
                "{rev}: {} files, {lines} lines sent, {ms:.1} ms, json {:.1} MB",
                files.len(),
                json.len() as f64 / 1e6
            );
            if let Ok(dir) = std::env::var("DDUGIT_BENCH_OUT") {
                std::fs::write(format!("{dir}/diff-{i}.json"), json).unwrap();
            }
        }
    }
}
