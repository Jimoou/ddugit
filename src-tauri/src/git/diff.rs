//! Diffs via libgit2: a commit against its first parent, two revisions against
//! each other, or local changes (all / unstaged / staged) against HEAD and the index.

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
    /// Fingerprint of the hunk's header and every line (see `hunk_key`): staging
    /// names hunks by it, so a file that changed since is refused, not mis-staged.
    pub key: String,
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

/// Changes from `from` to `to`. With `merge_base`, from their merge base instead of
/// `from` itself (`git diff from...to`): what `to` adds since the two went apart.
pub fn range_diff(path: &str, from: &str, to: &str, merge_base: bool) -> Result<Vec<FileDiff>> {
    let repo = open(path)?;
    let commit = |rev: &str| {
        repo.revparse_single(rev)
            .and_then(|o| o.peel_to_commit())
            .map_err(err)
    };
    let (a, b) = (commit(from)?, commit(to)?);
    let base = if merge_base {
        let id = repo
            .merge_base(a.id(), b.id())
            .map_err(|_| format!("{from} and {to} have no common history"))?;
        repo.find_commit(id).map_err(err)?
    } else {
        a
    };
    let mut diff = repo
        .diff_tree_to_tree(
            Some(&base.tree().map_err(err)?),
            Some(&b.tree().map_err(err)?),
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
                            key: hunk_key(&patch, h)?,
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
                key: hunk_key(&patch, h)?,
                lines,
            });
        }
        budget -= taken;
        out.push(file);
    }
    Ok(out)
}

/// SHA-256 (hex, shortened) over hunk `h`'s raw header and lines, origins
/// included: the same hunk always gets the same key, any edit to it a new one.
pub(super) fn hunk_key(patch: &Patch, h: usize) -> Result<String> {
    use sha2::{Digest, Sha256};
    let (hunk, n) = patch.hunk(h).map_err(err)?;
    let mut sha = Sha256::new();
    sha.update(hunk.header());
    for l in 0..n {
        let line = patch.line_in_hunk(h, l).map_err(err)?;
        sha.update([line.origin() as u8]);
        sha.update(line.content());
    }
    Ok(super::hex(&sha.finalize()[..12]))
}

fn header(h: &git2::DiffHunk) -> String {
    String::from_utf8_lossy(h.header()).trim_end().to_string()
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, run, s};
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

    fn head(p: &std::path::Path) -> String {
        run(p, &["rev-parse", "HEAD"]).trim().to_string()
    }

    #[test]
    fn range_diff_between_two_commits() {
        let d = repo();
        commit_file(d.path(), "a.txt", "one\n", "first");
        let first = head(d.path());
        commit_file(d.path(), "b.txt", "two\n", "second");
        commit_file(d.path(), "a.txt", "one\nmore\n", "third");

        let files = range_diff(s(d.path()), &first, "HEAD", false).unwrap();
        let got: Vec<(&str, &str, usize)> = files
            .iter()
            .map(|f| (f.path.as_str(), f.status.as_str(), f.additions))
            .collect();
        assert_eq!(got, [("a.txt", "modified", 1), ("b.txt", "added", 1)]);
        // Swapped: the same changes, undone.
        let back = range_diff(s(d.path()), "HEAD", &first, false).unwrap();
        assert_eq!(back[1].status, "deleted");
        assert!(range_diff(s(d.path()), "HEAD", "HEAD", false).unwrap().is_empty());
        assert!(range_diff(s(d.path()), "nope", "HEAD", false).is_err());
    }

    #[test]
    fn range_diff_from_the_merge_base_shows_only_what_the_branch_adds() {
        let d = repo();
        commit_file(d.path(), "base.txt", "base\n", "base");
        run(d.path(), &["checkout", "-qb", "feature"]);
        commit_file(d.path(), "feature.txt", "f\n", "feature work");
        run(d.path(), &["checkout", "-q", "main"]);
        commit_file(d.path(), "main.txt", "m\n", "main moves on");

        let paths = |files: Vec<FileDiff>| files.into_iter().map(|f| f.path).collect::<Vec<_>>();
        let direct = range_diff(s(d.path()), "main", "feature", false).unwrap();
        assert_eq!(paths(direct), ["feature.txt", "main.txt"]);
        let added = range_diff(s(d.path()), "main", "feature", true).unwrap();
        assert_eq!(added[0].status, "added");
        assert_eq!(paths(added), ["feature.txt"]);
        let other_way = range_diff(s(d.path()), "feature", "main", true).unwrap();
        assert_eq!(paths(other_way), ["main.txt"]);
    }

    #[test]
    fn range_diff_finds_renames() {
        let d = repo();
        let body: String = (0..20).map(|i| format!("line {i}\n")).collect();
        commit_file(d.path(), "old.txt", &body, "add");
        let first = head(d.path());
        run(d.path(), &["mv", "old.txt", "new.txt"]);
        commit_file(d.path(), "other.txt", "x\n", "rename and more");

        let files = range_diff(s(d.path()), &first, "HEAD", false).unwrap();
        assert_eq!(files.len(), 2);
        let renamed = files.iter().find(|f| f.path == "new.txt").unwrap();
        assert_eq!(renamed.status, "renamed");
        assert_eq!(renamed.old_path.as_deref(), Some("old.txt"));
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
        crate::git::write::commit(s(d.path()), "bin", &[], false, Default::default()).unwrap();
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
