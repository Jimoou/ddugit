//! Repository snapshot: history, refs, HEAD (with upstream tracking) and status.

use git2::{BranchType, Repository, Sort, Status, StatusOptions};
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
    /// `clean`, `merge`, `rebase`, `cherry-pick`, `revert`, ...
    pub state: String,
    /// True when history was cut at `limit`.
    pub truncated: bool,
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
        state: state_name(repo.state()).to_string(),
        truncated,
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
            })
        })
        .collect()
}

fn read_commits(repo: &Repository, limit: usize) -> Result<(Vec<CommitInfo>, bool)> {
    let mut walk = repo.revwalk().map_err(err)?;
    walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME).map_err(err)?;
    let _ = walk.push_head();
    for pattern in ["refs/heads", "refs/remotes", "refs/tags"] {
        let _ = walk.push_glob(pattern);
    }

    let mut commits = Vec::new();
    let mut truncated = false;
    for oid in walk {
        if commits.len() >= limit {
            truncated = true;
            break;
        }
        let oid = oid.map_err(err)?;
        let c = repo.find_commit(oid).map_err(err)?;
        let author = c.author();
        commits.push(CommitInfo {
            id: oid.to_string(),
            parents: c.parent_ids().map(|p| p.to_string()).collect(),
            summary: c.summary().unwrap_or("").to_string(),
            message: c.message().unwrap_or("").to_string(),
            author: author.name().unwrap_or("").to_string(),
            email: author.email().unwrap_or("").to_string(),
            time: c.time().seconds(),
        });
    }
    Ok((commits, truncated))
}

fn read_changes(repo: &Repository) -> Result<Vec<FileChange>> {
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
}
