//! One file's story: the commits that touched it (following renames) and,
//! line by line, the commit that last changed each line (blame).

use std::path::Path;

use git2::BlameOptions;
use serde::Serialize;

use super::{err, git_ok, open, workdir, Result};

/// A commit that changed the file, and the file's path in that commit.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct FileTouch {
    pub id: String,
    pub path: String,
}

/// Consecutive lines last changed by the same commit.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BlameHunk {
    pub commit: String,
    /// Index of the hunk's first line in `Blame::lines`.
    pub start: usize,
    pub len: usize,
    pub author: String,
    /// Commit time, seconds since the epoch.
    pub time: i64,
    pub summary: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Blame {
    pub lines: Vec<String>,
    pub hunks: Vec<BlameHunk>,
}

const MAX_TOUCHES: &str = "--max-count=2000";
/// Each record starts with this byte, then the id; the path follows on its own line.
const MARK: char = '\u{1}';

/// Commits reachable from `rev` that changed `file`, newest first. Uses the
/// CLI because libgit2 has no `--follow`.
pub fn file_log(path: &str, rev: &str, file: &str) -> Result<Vec<FileTouch>> {
    super::operand(rev)?;
    let dir = workdir(&open(path)?)?;
    let out = git_ok(
        &dir,
        &[
            "log",
            "--follow",
            MAX_TOUCHES,
            "--format=%x01%H",
            "--name-only",
            rev,
            "--",
            file,
        ],
    )?;
    let mut touches: Vec<FileTouch> = Vec::new();
    for line in out.lines().filter(|l| !l.is_empty()) {
        if let Some(id) = line.strip_prefix(MARK) {
            touches.push(FileTouch {
                id: id.to_string(),
                path: file.to_string(),
            });
        } else if let Some(last) = touches.last_mut() {
            last.path = line.to_string();
        }
    }
    Ok(touches)
}

/// Who last changed each line of `file` as of commit `rev`.
pub fn blame(path: &str, rev: &str, file: &str) -> Result<Blame> {
    let repo = open(path)?;
    let commit = repo
        .revparse_single(rev)
        .and_then(|o| o.peel_to_commit())
        .map_err(err)?;
    let entry = commit
        .tree()
        .and_then(|t| t.get_path(Path::new(file)))
        .map_err(|_| format!("'{file}' is not in {}", short(&commit.id().to_string())))?;
    let blob = repo.find_blob(entry.id()).map_err(err)?;
    if blob.is_binary() {
        return Err(format!("'{file}' is a binary file"));
    }
    let lines = String::from_utf8_lossy(blob.content())
        .lines()
        .map(str::to_string)
        .collect();
    let mut opts = BlameOptions::new();
    opts.newest_commit(commit.id());
    let b = repo.blame_file(Path::new(file), Some(&mut opts)).map_err(err)?;
    let mut hunks = Vec::new();
    for h in b.iter() {
        let id = h.final_commit_id();
        let (author, time, summary) = match repo.find_commit(id) {
            Ok(c) => (
                c.author().name().unwrap_or("").to_string(),
                c.time().seconds(),
                c.summary().unwrap_or("").to_string(),
            ),
            Err(_) => (String::new(), 0, String::new()),
        };
        hunks.push(BlameHunk {
            commit: id.to_string(),
            start: h.final_start_line().saturating_sub(1),
            len: h.lines_in_hunk(),
            author,
            time,
            summary,
        });
    }
    Ok(Blame { lines, hunks })
}

fn short(id: &str) -> &str {
    &id[..id.len().min(7)]
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;

    fn head(p: &Path) -> String {
        git_ok(p, &["rev-parse", "HEAD"]).unwrap().trim().to_string()
    }

    #[test]
    fn follows_the_file_across_a_rename() {
        let d = repo();
        commit_file(d.path(), "a.txt", "one\n", "add a");
        let first = head(d.path());
        commit_file(d.path(), "other.txt", "x\n", "unrelated");
        git_ok(d.path(), &["mv", "a.txt", "b.txt"]).unwrap();
        git_ok(d.path(), &["commit", "-qm", "rename"]).unwrap();
        let renamed = head(d.path());
        commit_file(d.path(), "b.txt", "one\ntwo\n", "grow b");
        let grown = head(d.path());

        let log = file_log(s(d.path()), "HEAD", "b.txt").unwrap();
        let ids: Vec<&str> = log.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, [grown.as_str(), renamed.as_str(), first.as_str()]);
        assert_eq!(log[2].path, "a.txt");
        assert_eq!(log[0].path, "b.txt");
    }

    #[test]
    fn blames_each_line_on_the_commit_that_last_changed_it() {
        let d = repo();
        commit_file(d.path(), "f.txt", "a\nb\nc\n", "first");
        let first = head(d.path());
        commit_file(d.path(), "f.txt", "a\nB\nc\nd\n", "second");
        let second = head(d.path());

        let b = blame(s(d.path()), "HEAD", "f.txt").unwrap();
        assert_eq!(b.lines, ["a", "B", "c", "d"]);
        let owner = |line: usize| {
            b.hunks
                .iter()
                .find(|h| (h.start..h.start + h.len).contains(&line))
                .map(|h| h.commit.clone())
                .unwrap()
        };
        assert_eq!(owner(0), first);
        assert_eq!(owner(1), second);
        assert_eq!(owner(2), first);
        assert_eq!(owner(3), second);
        assert!(b.hunks.iter().any(|h| h.summary == "second" && h.time > 0));

        // As of the first commit, every line is the first commit's.
        let old = blame(s(d.path()), &first, "f.txt").unwrap();
        assert_eq!(old.lines, ["a", "b", "c"]);
        assert!(old.hunks.iter().all(|h| h.commit == first));
        assert!(blame(s(d.path()), &first, "missing.txt").is_err());
    }
}
