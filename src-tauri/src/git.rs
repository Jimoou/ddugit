//! Git access layer.
//!
//! Reads (history, refs, status) use libgit2 for speed. Writes (commit, merge,
//! checkout, branch) shell out to the user's `git` so hooks, credentials,
//! signing and LFS behave exactly as they do on the command line.

use std::path::{Path, PathBuf};
use std::process::Command;

use git2::{BranchType, Oid, Repository, RepositoryState, Sort, Status, StatusOptions};
use serde::Serialize;

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
pub struct RepoSnapshot {
    pub path: String,
    pub name: String,
    pub head: HeadInfo,
    pub commits: Vec<CommitInfo>,
    pub refs: Vec<RefInfo>,
    pub changes: Vec<FileChange>,
    /// `clean`, `merge`, `rebase`, `cherry-pick`, `revert`, ...
    pub state: String,
    /// True when history was cut at `limit`.
    pub truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub ok: bool,
    /// Merge stopped on conflicts; the repo is left mid-merge.
    pub conflict: bool,
    pub output: String,
}

pub type Result<T> = std::result::Result<T, String>;

fn err<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

fn open(path: &str) -> Result<Repository> {
    Repository::discover(path).map_err(|e| format!("Not a git repository: {path} ({})", e.message()))
}

fn workdir(repo: &Repository) -> Result<PathBuf> {
    repo.workdir()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Bare repositories are not supported yet".to_string())
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
        changes,
        state: state_name(repo.state()).to_string(),
        truncated,
    })
}

fn read_head(repo: &Repository) -> HeadInfo {
    match repo.head() {
        Ok(h) => HeadInfo {
            branch: if h.is_branch() { h.shorthand().map(str::to_string) } else { None },
            target: h.target().map(|o| o.to_string()),
        },
        // Unborn branch: HEAD points at refs/heads/<name> that doesn't exist yet.
        Err(_) => {
            let branch = repo
                .find_reference("HEAD")
                .ok()
                .and_then(|r| r.symbolic_target().map(str::to_string))
                .map(|t| t.trim_start_matches("refs/heads/").to_string());
            HeadInfo { branch, target: None }
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

fn state_name(s: RepositoryState) -> &'static str {
    match s {
        RepositoryState::Clean => "clean",
        RepositoryState::Merge => "merge",
        RepositoryState::Revert | RepositoryState::RevertSequence => "revert",
        RepositoryState::CherryPick | RepositoryState::CherryPickSequence => "cherry-pick",
        RepositoryState::Bisect => "bisect",
        RepositoryState::Rebase | RepositoryState::RebaseInteractive | RepositoryState::RebaseMerge => {
            "rebase"
        }
        RepositoryState::ApplyMailbox | RepositoryState::ApplyMailboxOrRebase => "am",
    }
}

// ---------------------------------------------------------------------------
// Writes (git CLI)
// ---------------------------------------------------------------------------

struct Output {
    ok: bool,
    text: String,
}

fn git(dir: &Path, args: &[&str]) -> Result<Output> {
    let mut cmd = Command::new("git");
    cmd.args(args)
        .current_dir(dir)
        // Never block on an interactive credential / editor prompt.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .env("LC_ALL", "C");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let out = cmd
        .output()
        .map_err(|e| format!("Failed to run git (is it installed and on PATH?): {e}"))?;
    let mut text = String::from_utf8_lossy(&out.stdout).into_owned();
    let stderr = String::from_utf8_lossy(&out.stderr);
    if !stderr.trim().is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(stderr.trim_end());
    }
    Ok(Output { ok: out.status.success(), text: text.trim().to_string() })
}

fn git_ok(dir: &Path, args: &[&str]) -> Result<String> {
    let o = git(dir, args)?;
    if o.ok {
        Ok(o.text)
    } else {
        Err(o.text)
    }
}

fn repo_dir(path: &str) -> Result<PathBuf> {
    workdir(&open(path)?)
}

/// Commit the given paths (exactly those, regardless of what else is staged).
/// An empty `paths` commits everything that has changed.
pub fn commit(path: &str, message: &str, paths: &[String]) -> Result<OpResult> {
    if message.trim().is_empty() {
        return Err("Commit message is empty".into());
    }
    let dir = repo_dir(path)?;
    let mut add: Vec<&str> = vec!["add", "-A", "--"];
    let mut commit: Vec<&str> = vec!["commit", "-m", message];
    if !paths.is_empty() {
        let ps: Vec<&str> = paths.iter().map(String::as_str).collect();
        add.extend(&ps);
        commit.push("--");
        commit.extend(&ps);
    }
    git_ok(&dir, &add)?;
    let o = git(&dir, &commit)?;
    Ok(OpResult { ok: o.ok, conflict: false, output: o.text })
}

/// Merge `source` (branch name or commit id) into `target` branch.
/// When `target` isn't the current branch it is checked out first.
pub fn merge(path: &str, source: &str, target: Option<&str>) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    if repo.state() != RepositoryState::Clean {
        return Err(format!(
            "Repository is in the middle of a {}; finish or abort it first",
            state_name(repo.state())
        ));
    }
    if let Some(t) = target {
        let current = read_head(&repo).branch;
        if current.as_deref() != Some(t) {
            git_ok(&dir, &["checkout", t])?;
        }
    }
    let o = git(&dir, &["merge", "--no-ff", "--no-edit", source])?;
    let conflict = !o.ok && open(path)?.state() == RepositoryState::Merge;
    Ok(OpResult { ok: o.ok, conflict, output: o.text })
}

pub fn merge_abort(path: &str) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    let o = git(&dir, &["merge", "--abort"])?;
    Ok(OpResult { ok: o.ok, conflict: false, output: o.text })
}

pub fn checkout(path: &str, target: &str) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    let o = git(&dir, &["checkout", target])?;
    Ok(OpResult { ok: o.ok, conflict: false, output: o.text })
}

pub fn create_branch(path: &str, name: &str, at: Option<&str>, switch: bool) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    if repo.find_branch(name, BranchType::Local).is_ok() {
        return Err(format!("Branch '{name}' already exists"));
    }
    let mut args = vec![if switch { "checkout" } else { "branch" }];
    if switch {
        args.push("-b");
    }
    args.push(name);
    if let Some(at) = at {
        // Validate early so the error is readable.
        Oid::from_str(at)
            .ok()
            .and_then(|o| repo.find_commit(o).ok())
            .or_else(|| repo.revparse_single(at).ok().and_then(|o| o.peel_to_commit().ok()))
            .ok_or_else(|| format!("Unknown commit '{at}'"))?;
        args.push(at);
    }
    let o = git(&dir, &args)?;
    Ok(OpResult { ok: o.ok, conflict: false, output: o.text })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn repo() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        let p = d.path();
        git_ok(p, &["init", "-q", "-b", "main"]).unwrap();
        git_ok(p, &["config", "user.name", "Test"]).unwrap();
        git_ok(p, &["config", "user.email", "t@example.com"]).unwrap();
        git_ok(p, &["config", "commit.gpgsign", "false"]).unwrap();
        d
    }

    fn s(p: &Path) -> &str {
        p.to_str().unwrap()
    }

    #[test]
    fn empty_repo_snapshot_has_unborn_head() {
        let d = repo();
        let snap = snapshot(s(d.path()), 100).unwrap();
        assert!(snap.commits.is_empty());
        assert_eq!(snap.head.branch.as_deref(), Some("main"));
        assert!(snap.head.target.is_none());
    }

    #[test]
    fn commit_only_selected_paths() {
        let d = repo();
        fs::write(d.path().join("a.txt"), "a").unwrap();
        fs::write(d.path().join("b.txt"), "b").unwrap();
        let r = commit(s(d.path()), "add a", &["a.txt".into()]).unwrap();
        assert!(r.ok, "{}", r.output);

        let snap = snapshot(s(d.path()), 100).unwrap();
        assert_eq!(snap.commits.len(), 1);
        assert_eq!(snap.commits[0].summary, "add a");
        assert_eq!(snap.changes.len(), 1);
        assert_eq!(snap.changes[0].path, "b.txt");
        assert_eq!(snap.changes[0].unstaged.as_deref(), Some("untracked"));
    }

    #[test]
    fn branch_and_merge_creates_merge_commit() {
        let d = repo();
        let p = s(d.path());
        fs::write(d.path().join("a.txt"), "a").unwrap();
        commit(p, "base", &[]).unwrap();
        create_branch(p, "feature", None, true).unwrap();
        fs::write(d.path().join("f.txt"), "f").unwrap();
        commit(p, "feature work", &[]).unwrap();
        checkout(p, "main").unwrap();
        fs::write(d.path().join("m.txt"), "m").unwrap();
        commit(p, "main work", &[]).unwrap();

        let r = merge(p, "feature", Some("main")).unwrap();
        assert!(r.ok, "{}", r.output);
        let snap = snapshot(p, 100).unwrap();
        assert_eq!(snap.commits[0].parents.len(), 2);
        assert_eq!(snap.head.branch.as_deref(), Some("main"));
        assert!(snap.refs.iter().any(|r| r.name == "feature" && r.kind == RefKind::Local));
    }

    #[test]
    fn merge_into_other_branch_checks_it_out() {
        let d = repo();
        let p = s(d.path());
        fs::write(d.path().join("a.txt"), "a").unwrap();
        commit(p, "base", &[]).unwrap();
        create_branch(p, "feature", None, true).unwrap();
        fs::write(d.path().join("f.txt"), "f").unwrap();
        commit(p, "feature work", &[]).unwrap();
        // HEAD is on feature; merge feature into main.
        let r = merge(p, "feature", Some("main")).unwrap();
        assert!(r.ok, "{}", r.output);
        assert_eq!(snapshot(p, 100).unwrap().head.branch.as_deref(), Some("main"));
    }

    #[test]
    fn conflicting_merge_reports_conflict_and_can_abort() {
        let d = repo();
        let p = s(d.path());
        fs::write(d.path().join("a.txt"), "base").unwrap();
        commit(p, "base", &[]).unwrap();
        create_branch(p, "feature", None, true).unwrap();
        fs::write(d.path().join("a.txt"), "feature").unwrap();
        commit(p, "feature edit", &[]).unwrap();
        checkout(p, "main").unwrap();
        fs::write(d.path().join("a.txt"), "main").unwrap();
        commit(p, "main edit", &[]).unwrap();

        let r = merge(p, "feature", None).unwrap();
        assert!(!r.ok);
        assert!(r.conflict);
        let snap = snapshot(p, 100).unwrap();
        assert_eq!(snap.state, "merge");
        assert!(snap.changes.iter().any(|c| c.conflicted));

        assert!(merge_abort(p).unwrap().ok);
        assert_eq!(snapshot(p, 100).unwrap().state, "clean");
    }

    #[test]
    fn history_limit_sets_truncated() {
        let d = repo();
        let p = s(d.path());
        for i in 0..5 {
            fs::write(d.path().join("a.txt"), i.to_string()).unwrap();
            commit(p, &format!("c{i}"), &[]).unwrap();
        }
        let snap = snapshot(p, 3).unwrap();
        assert_eq!(snap.commits.len(), 3);
        assert!(snap.truncated);
    }
}
