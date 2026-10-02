//! A quick look at many repositories at once (the galaxy dashboard): where each
//! one stands, without reading its history. Read-only, libgit2 only.

use git2::{Repository, StatusOptions};
use serde::Serialize;

use super::read::read_head;
use super::{state_name, workdir};

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LastCommit {
    pub summary: String,
    pub author: String,
    /// Seconds since the Unix epoch.
    pub time: i64,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RepoGlance {
    /// The path asked about, unchanged (the dashboard keys on it).
    pub path: String,
    /// Why it couldn't be read (moved, deleted, not a repository any more).
    pub error: Option<String>,
    pub branch: Option<String>,
    pub upstream: Option<String>,
    pub ahead: usize,
    pub behind: usize,
    /// Files with any change, untracked included.
    pub changes: usize,
    pub conflicts: usize,
    /// `clean`, `merge`, `rebase`, ...
    pub state: String,
    pub stashes: usize,
    pub remotes: usize,
    /// URL of `origin` (else the first remote): who owns it, for grouping suggestions.
    pub origin: Option<String>,
    pub last: Option<LastCommit>,
}

impl RepoGlance {
    fn failed(path: &str, error: String) -> Self {
        RepoGlance {
            path: path.to_string(),
            error: Some(error),
            branch: None,
            upstream: None,
            ahead: 0,
            behind: 0,
            changes: 0,
            conflicts: 0,
            state: "clean".into(),
            stashes: 0,
            remotes: 0,
            origin: None,
            last: None,
        }
    }
}

fn one(path: &str) -> RepoGlance {
    // `open` (not `discover`): a folder that stopped being a repository must not
    // silently report the repository above it.
    let mut repo = match Repository::open(path) {
        Ok(r) => r,
        Err(e) => return RepoGlance::failed(path, e.message().to_string()),
    };
    if let Err(e) = workdir(&repo) {
        return RepoGlance::failed(path, e);
    }
    let mut stashes = 0;
    let _ = repo.stash_foreach(|_, _, _| {
        stashes += 1;
        true
    });
    let head = read_head(&repo);
    let mut opts = StatusOptions::new();
    // Counting only: untracked folders count once, unread.
    opts.include_untracked(true).recurse_untracked_dirs(false);
    let (changes, conflicts) = repo
        .statuses(Some(&mut opts))
        .map(|s| {
            let s: Vec<_> = s.iter().filter(|e| !e.status().is_ignored()).collect();
            let conflicts = s.iter().filter(|e| e.status().is_conflicted()).count();
            (s.len(), conflicts)
        })
        .unwrap_or((0, 0));
    let last = repo
        .head()
        .ok()
        .and_then(|h| h.peel_to_commit().ok())
        .map(|c| LastCommit {
            summary: c.summary().unwrap_or("").to_string(),
            author: c.author().name().unwrap_or("").to_string(),
            time: c.time().seconds(),
        });
    RepoGlance {
        path: path.to_string(),
        error: None,
        branch: head.branch,
        upstream: head.upstream,
        ahead: head.ahead,
        behind: head.behind,
        changes,
        conflicts,
        state: state_name(repo.state()).to_string(),
        stashes,
        remotes: repo.remotes().map(|r| r.len()).unwrap_or(0),
        origin: origin_url(&repo),
        last,
    }
}

fn origin_url(repo: &Repository) -> Option<String> {
    let names = repo.remotes().ok()?;
    let name = names
        .iter()
        .flatten()
        .find(|n| *n == "origin")
        .or_else(|| names.iter().flatten().next())?
        .to_string();
    repo.find_remote(&name).ok()?.url().map(str::to_string)
}

/// Every path in order, read side by side (status walks are the slow part).
pub fn glance(paths: &[String]) -> Vec<RepoGlance> {
    std::thread::scope(|s| {
        let jobs: Vec<_> = paths.iter().map(|p| s.spawn(move || one(p))).collect();
        jobs.into_iter()
            .zip(paths)
            .map(|(j, p)| {
                j.join()
                    .unwrap_or_else(|_| RepoGlance::failed(p, "crashed".into()))
            })
            .collect()
    })
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;

    #[test]
    fn reads_where_each_repository_stands() {
        let a = repo();
        commit_file(a.path(), "a.txt", "1", "first");
        commit_file(a.path(), "a.txt", "2", "second");
        std::fs::write(a.path().join("a.txt"), "dirty").unwrap();
        std::fs::create_dir(a.path().join("new")).unwrap();
        std::fs::write(a.path().join("new/x"), "x").unwrap();
        std::fs::write(a.path().join("new/y"), "y").unwrap();
        let empty = repo();
        let plain = tempfile::tempdir().unwrap();
        let paths = [s(a.path()), s(empty.path()), s(plain.path())].map(String::from);

        let [a, empty, plain] = <[RepoGlance; 3]>::try_from(glance(&paths)).unwrap();
        assert_eq!(a.path, paths[0]);
        assert_eq!(a.branch.as_deref(), Some("main"));
        assert_eq!(a.changes, 2, "one modified file, one untracked folder");
        assert_eq!(a.conflicts, 0);
        assert_eq!(a.state, "clean");
        assert_eq!(a.last.as_ref().unwrap().summary, "second");
        assert!(a.error.is_none());

        assert_eq!(empty.branch.as_deref(), Some("main"));
        assert!(empty.last.is_none());
        assert!(plain.error.is_some(), "a plain folder is not a repository");
    }

    #[test]
    fn counts_upstream_distance_and_stashes() {
        let origin = repo();
        commit_file(origin.path(), "a.txt", "1", "one");
        let parent = tempfile::tempdir().unwrap();
        let clone = parent.path().join("c");
        super::super::git_ok(parent.path(), &["clone", "-q", s(origin.path()), s(&clone)]).unwrap();
        super::super::testutil::identity(&clone);
        commit_file(origin.path(), "a.txt", "2", "theirs");
        super::super::git_ok(&clone, &["fetch", "-q"]).unwrap();
        commit_file(&clone, "b.txt", "b", "mine");
        std::fs::write(clone.join("b.txt"), "stash me").unwrap();
        super::super::git_ok(&clone, &["stash", "-q"]).unwrap();

        let g = &glance(&[s(&clone).to_string()])[0];
        assert_eq!(g.upstream.as_deref(), Some("origin/main"));
        assert_eq!((g.ahead, g.behind), (1, 1));
        assert_eq!(g.stashes, 1);
        assert_eq!(g.changes, 0);
        assert_eq!(g.remotes, 1);
        assert_eq!(g.origin.as_deref(), Some(s(origin.path())));
    }
}
