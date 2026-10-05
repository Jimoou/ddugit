//! Repository snapshot: history, refs, HEAD (with upstream tracking) and status.

use git2::{BranchType, Repository, Status, StatusOptions};
use serde::Serialize;

use super::{err, open, state_name, workdir, Result};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CommitInfo {
    pub id: String,
    pub parents: Vec<String>,
    pub summary: String,
    pub message: String,
    pub author: String,
    pub email: String,
    /// Seconds since the Unix epoch.
    pub time: i64,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum RefKind {
    Local,
    Remote,
    Tag,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RefInfo {
    /// Short name, e.g. `main`, `origin/main`, `v1.0`.
    pub name: String,
    pub kind: RefKind,
    pub target: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HeadInfo {
    /// Branch name, `None` when detached or unborn without a name.
    pub branch: Option<String>,
    /// Commit id, `None` on an unborn branch (fresh repo).
    pub target: Option<String>,
    /// Upstream tracking branch, e.g. `origin/main`.
    pub upstream: Option<String>,
    /// Commits on HEAD not on the upstream.
    pub ahead: usize,
    /// Commits on the upstream not on HEAD.
    pub behind: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    /// Change already in the index: added / modified / deleted / renamed / typechange.
    pub staged: Option<String>,
    /// Change only in the working tree: untracked / modified / deleted / ...
    pub unstaged: Option<String>,
    pub conflicted: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RemoteInfo {
    pub name: String,
    pub url: String,
    /// False for a fetch-only remote (its push URL is disabled).
    pub push: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepoSnapshot {
    pub path: String,
    pub name: String,
    pub head: HeadInfo,
    pub commits: Vec<CommitInfo>,
    pub refs: Vec<RefInfo>,
    pub remotes: Vec<RemoteInfo>,
    pub changes: Vec<FileChange>,
    pub stashes: Vec<super::stash::StashInfo>,
    /// `clean`, `merge`, `rebase`, `cherry-pick`, `revert`, ...
    pub state: String,
    /// Commit being brought in by a stopped merge / cherry-pick / revert
    /// (`MERGE_HEAD`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`).
    pub incoming: Option<String>,
    /// True when history was cut at `limit`.
    pub truncated: bool,
    /// Every working tree of the repository, the main one first.
    pub worktrees: Vec<super::worktree::WorktreeInfo>,
    pub submodules: Vec<super::submodule::SubmoduleInfo>,
}

pub fn snapshot(path: &str, limit: usize) -> Result<RepoSnapshot> {
    let repo = open(path)?;
    let root = workdir(&repo)?;

    let head = read_head(&repo);
    let refs = read_refs(&repo)?;
    let (commits, truncated) = read_commits(&repo, limit)?;
    let changes = read_changes(&repo)?;

    Ok(RepoSnapshot {
        name: root
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| root.to_string_lossy().into_owned()),
        path: root.to_string_lossy().into_owned(),
        head,
        commits,
        refs,
        remotes: read_remotes(&repo),
        changes,
        stashes: super::stash::read_stashes(path)?,
        state: state_name(repo.state()).to_string(),
        incoming: incoming(&repo),
        truncated,
        worktrees: super::worktree::list(&repo),
        submodules: super::submodule::list(&repo),
    })
}

pub(super) fn read_head(repo: &Repository) -> HeadInfo {
    match repo.head() {
        Ok(h) => {
            let branch = if h.is_branch() {
                h.shorthand().map(str::to_string)
            } else {
                None
            };
            let mut info = HeadInfo {
                target: h.target().map(|o| o.to_string()),
                branch,
                upstream: None,
                ahead: 0,
                behind: 0,
            };
            track(repo, &mut info);
            info
        }
        // Unborn branch: HEAD points at refs/heads/<name> that doesn't exist yet.
        Err(_) => {
            let branch = repo
                .find_reference("HEAD")
                .ok()
                .and_then(|r| r.symbolic_target().map(str::to_string))
                .map(|t| t.trim_start_matches("refs/heads/").to_string());
            HeadInfo {
                branch,
                target: None,
                upstream: None,
                ahead: 0,
                behind: 0,
            }
        }
    }
}

fn track(repo: &Repository, info: &mut HeadInfo) {
    let Some(name) = info.branch.as_deref() else {
        return;
    };
    let Ok(local) = repo.find_branch(name, BranchType::Local) else {
        return;
    };
    let Ok(up) = local.upstream() else { return };
    info.upstream = up.name().ok().flatten().map(str::to_string);
    if let (Some(a), Some(b)) = (local.get().target(), up.get().target()) {
        if let Ok((ahead, behind)) = repo.graph_ahead_behind(a, b) {
            info.ahead = ahead;
            info.behind = behind;
        }
    }
}

fn read_refs(repo: &Repository) -> Result<Vec<RefInfo>> {
    let mut out = Vec::new();
    for r in repo.references().map_err(err)? {
        let r = r.map_err(err)?;
        let Some(full) = r.name() else { continue };
        let kind = if r.is_branch() {
            RefKind::Local
        } else if r.is_remote() {
            RefKind::Remote
        } else if r.is_tag() {
            RefKind::Tag
        } else {
            continue;
        };
        // `origin/HEAD` is a symbolic alias, not a real branch.
        if kind == RefKind::Remote && full.ends_with("/HEAD") {
            continue;
        }
        let Ok(commit) = r.peel_to_commit() else { continue };
        out.push(RefInfo {
            name: r.shorthand().unwrap_or(full).to_string(),
            kind,
            target: commit.id().to_string(),
        });
    }
    Ok(out)
}

fn read_remotes(repo: &Repository) -> Vec<RemoteInfo> {
    let Ok(names) = repo.remotes() else {
        return Vec::new();
    };
    names
        .iter()
        .flatten()
        .filter_map(|n| {
            let r = repo.find_remote(n).ok()?;
            Some(RemoteInfo {
                name: n.to_string(),
                url: r.url()?.to_string(),
                push: r.pushurl() != Some(super::NO_PUSH),
            })
        })
        .collect()
}

/// The newest `limit` commits of every ref, children before parents.
///
/// libgit2's sorted revwalks read the whole history before they yield the
/// first commit (over a second on 100k commits), so this walks newest first
/// by commit time itself, stopping at `limit`, and `children_first` puts the
/// few commits a skewed clock moved ahead of a child back after it.
fn read_commits(repo: &Repository, limit: usize) -> Result<(Vec<CommitInfo>, bool)> {
    let mut walk = TimeWalk::default();
    let refs = repo.references().map_err(err)?.flatten().filter(|r| {
        r.name().is_some_and(|n| {
            ["refs/heads/", "refs/remotes/", "refs/tags/"]
                .iter()
                .any(|p| n.starts_with(p))
        })
    });
    for r in repo.head().ok().into_iter().chain(refs) {
        if let Ok(c) = r.peel_to_commit() {
            walk.push(c);
        }
    }
    // A merged-in SHA may not be on any ref; keep it visible while the merge is pending.
    for special in IN_PROGRESS_HEADS {
        if let Ok(c) = repo.revparse_single(special).and_then(|o| o.peel_to_commit()) {
            walk.push(c);
        }
    }

    let mut commits = Vec::new();
    while let Some(c) = walk.pop() {
        if commits.len() >= limit {
            return Ok((children_first(commits), true));
        }
        for p in c.parents() {
            walk.push(p);
        }
        let author = c.author();
        commits.push(CommitInfo {
            id: c.id().to_string(),
            parents: c.parent_ids().map(|p| p.to_string()).collect(),
            summary: c.summary().unwrap_or("").to_string(),
            message: c.message().unwrap_or("").to_string(),
            author: author.name().unwrap_or("").to_string(),
            email: author.email().unwrap_or("").to_string(),
            time: c.time().seconds(),
        });
    }
    Ok((children_first(commits), false))
}

/// Commits newest first by commit time, each once; ties in the order found.
#[derive(Default)]
struct TimeWalk<'r> {
    seen: std::collections::HashSet<git2::Oid>,
    found: Vec<Option<git2::Commit<'r>>>,
    queue: std::collections::BinaryHeap<(i64, std::cmp::Reverse<usize>)>,
}

impl<'r> TimeWalk<'r> {
    fn push(&mut self, c: git2::Commit<'r>) {
        if self.seen.insert(c.id()) {
            self.queue
                .push((c.time().seconds(), std::cmp::Reverse(self.found.len())));
            self.found.push(Some(c));
        }
    }

    fn pop(&mut self) -> Option<git2::Commit<'r>> {
        let (_, std::cmp::Reverse(i)) = self.queue.pop()?;
        self.found[i].take()
    }
}

/// Stable topological order: every commit after all its children in the list,
/// otherwise the order it came in (Kahn's algorithm, earliest ready first).
fn children_first(commits: Vec<CommitInfo>) -> Vec<CommitInfo> {
    use std::cmp::Reverse;
    use std::collections::{BinaryHeap, HashMap};
    let index: HashMap<&str, usize> = commits
        .iter()
        .enumerate()
        .map(|(i, c)| (c.id.as_str(), i))
        .collect();
    let mut waiting = vec![0usize; commits.len()];
    for c in &commits {
        for p in &c.parents {
            if let Some(&i) = index.get(p.as_str()) {
                waiting[i] += 1;
            }
        }
    }
    let mut ready: BinaryHeap<Reverse<usize>> = (0..commits.len())
        .filter(|&i| waiting[i] == 0)
        .map(Reverse)
        .collect();
    let mut order = Vec::with_capacity(commits.len());
    while let Some(Reverse(i)) = ready.pop() {
        order.push(i);
        for p in &commits[i].parents {
            if let Some(&j) = index.get(p.as_str()) {
                waiting[j] -= 1;
                if waiting[j] == 0 {
                    ready.push(Reverse(j));
                }
            }
        }
    }
    drop(index);
    if order.iter().enumerate().all(|(at, &i)| at == i) {
        return commits;
    }
    let mut slots: Vec<Option<CommitInfo>> = commits.into_iter().map(Some).collect();
    order.into_iter().filter_map(|i| slots[i].take()).collect()
}

const IN_PROGRESS_HEADS: [&str; 3] = ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD"];

fn incoming(repo: &Repository) -> Option<String> {
    IN_PROGRESS_HEADS
        .iter()
        .find_map(|r| repo.revparse_single(r).ok())
        .map(|o| o.id().to_string())
}

pub(super) fn read_changes(repo: &Repository) -> Result<Vec<FileChange>> {
    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true);
    let statuses = repo.statuses(Some(&mut opts)).map_err(err)?;

    let mut out = Vec::new();
    for e in statuses.iter() {
        let s = e.status();
        if s.is_ignored() {
            continue;
        }
        let Some(path) = e.path() else { continue };
        let staged = if s.is_index_new() {
            Some("added")
        } else if s.is_index_modified() {
            Some("modified")
        } else if s.is_index_deleted() {
            Some("deleted")
        } else if s.is_index_renamed() {
            Some("renamed")
        } else if s.is_index_typechange() {
            Some("typechange")
        } else {
            None
        };
        let unstaged = if s.is_wt_new() {
            Some("untracked")
        } else if s.is_wt_modified() {
            Some("modified")
        } else if s.is_wt_deleted() {
            Some("deleted")
        } else if s.is_wt_renamed() {
            Some("renamed")
        } else if s.is_wt_typechange() {
            Some("typechange")
        } else {
            None
        };
        out.push(FileChange {
            path: path.to_string(),
            staged: staged.map(str::to_string),
            unstaged: unstaged.map(str::to_string),
            conflicted: s.contains(Status::CONFLICTED),
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;

    #[test]
    fn empty_repo_snapshot_has_unborn_head() {
        let d = repo();
        let snap = snapshot(s(d.path()), 100).unwrap();
        assert!(snap.commits.is_empty());
        assert_eq!(snap.head.branch.as_deref(), Some("main"));
        assert!(snap.head.target.is_none());
        assert!(snap.head.upstream.is_none());
    }

    #[test]
    fn history_limit_sets_truncated() {
        let d = repo();
        for i in 0..5 {
            commit_file(d.path(), "a.txt", &i.to_string(), &format!("c{i}"));
        }
        let snap = snapshot(s(d.path()), 3).unwrap();
        assert_eq!(snap.commits.len(), 3);
        assert!(snap.truncated);
    }

    fn info(id: &str, parents: &[&str]) -> CommitInfo {
        CommitInfo {
            id: id.into(),
            parents: parents.iter().map(|p| p.to_string()).collect(),
            summary: String::new(),
            message: String::new(),
            author: String::new(),
            email: String::new(),
            time: 0,
        }
    }

    #[test]
    fn children_first_moves_a_parent_after_its_skewed_child() {
        // `b`'s clock ran behind: by time it comes after its parent `a`.
        let list = vec![
            info("m", &["a", "b"]),
            info("a", &["root"]),
            info("b", &["a"]),
            info("root", &[]),
        ];
        let ids: Vec<_> = children_first(list).into_iter().map(|c| c.id).collect();
        assert_eq!(ids, ["m", "b", "a", "root"]);
        // Already in order: kept as is (parents outside the list are ignored).
        let list = vec![info("c", &["b"]), info("x", &["gone"]), info("b", &[])];
        let ids: Vec<_> = children_first(list).into_iter().map(|c| c.id).collect();
        assert_eq!(ids, ["c", "x", "b"]);
    }

    #[test]
    fn stopped_merge_reports_incoming_commit() {
        use super::super::write::{checkout, create_branch, merge};
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "base", "base");
        create_branch(p, "feature", None, true).unwrap();
        commit_file(d.path(), "a.txt", "feature", "feature");
        let feature = snapshot(p, 1).unwrap().head.target.unwrap();
        checkout(p, "main").unwrap();
        assert!(snapshot(p, 5).unwrap().incoming.is_none());
        commit_file(d.path(), "a.txt", "main", "main");
        merge(p, "feature", None).unwrap();
        assert_eq!(
            snapshot(p, 5).unwrap().incoming.as_deref(),
            Some(feature.as_str())
        );
    }

    /// Timing on a big repository (see docs/PERF.md):
    /// `DDUGIT_BENCH_REPO=<repo> cargo test --release --lib snapshot_bench -- --ignored --nocapture`.
    /// With `DDUGIT_BENCH_OUT=<dir>` it also writes the snapshot as JSON for the web benchmarks.
    #[test]
    #[ignore]
    fn snapshot_bench() {
        let Ok(path) = std::env::var("DDUGIT_BENCH_REPO") else {
            return;
        };
        for limit in [1000, 3000, 10_000, 100_000] {
            let mut best = f64::MAX;
            let mut snap = None;
            for _ in 0..3 {
                let t = std::time::Instant::now();
                let s = snapshot(&path, limit).unwrap();
                best = best.min(t.elapsed().as_secs_f64() * 1000.0);
                snap = Some(s);
            }
            let snap = snap.unwrap();
            let json = serde_json::to_string(&snap).unwrap();
            println!(
                "limit {limit:>6}: {:>6} commits, {} refs, {best:>8.1} ms, json {:.1} MB",
                snap.commits.len(),
                snap.refs.len(),
                json.len() as f64 / 1e6
            );
            if let Ok(dir) = std::env::var("DDUGIT_BENCH_OUT") {
                std::fs::write(format!("{dir}/snapshot-{limit}.json"), json).unwrap();
            }
        }
        let repo = open(&path).unwrap();
        let ms = |f: &dyn Fn()| {
            let t = std::time::Instant::now();
            f();
            t.elapsed().as_secs_f64() * 1000.0
        };
        println!(
            "parts: commits(3000) {:.1} ms, refs {:.1} ms, head {:.1} ms, status {:.1} ms, stashes {:.1} ms",
            ms(&|| drop(read_commits(&repo, 3000).unwrap())),
            ms(&|| drop(read_refs(&repo).unwrap())),
            ms(&|| drop(read_head(&repo))),
            ms(&|| drop(read_changes(&repo).unwrap())),
            ms(&|| drop(super::super::stash::read_stashes(&path).unwrap())),
        );
    }
}
