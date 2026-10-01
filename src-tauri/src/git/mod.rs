//! Git access layer.
//!
//! Reads (history, refs, status, diffs) use libgit2 for speed. Writes (commit,
//! merge, checkout, branch, fetch/pull/push) shell out to the user's `git` so
//! hooks, credentials, signing and LFS behave exactly as on the command line.

pub mod diff;
pub mod read;
pub mod remote;
pub mod write;

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use git2::{Repository, RepositoryState};
use serde::Serialize;

pub type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum OpStatus {
    Ok,
    Failed,
    /// Stopped on conflicts; the repo is left mid-merge / mid-rebase.
    Conflict,
    /// Pull can't fast-forward: local and upstream both have new commits.
    Diverged,
    /// Push refused because the remote has commits we don't.
    Rejected,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpResult {
    pub status: OpStatus,
    pub output: String,
}

impl OpResult {
    fn with(status: OpStatus, o: Output) -> Self {
        OpResult {
            status,
            output: o.text,
        }
    }
}

impl From<Output> for OpResult {
    fn from(o: Output) -> Self {
        let status = if o.ok { OpStatus::Ok } else { OpStatus::Failed };
        OpResult::with(status, o)
    }
}

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

fn repo_dir(path: &str) -> Result<PathBuf> {
    workdir(&open(path)?)
}

fn state_name(s: RepositoryState) -> &'static str {
    use RepositoryState::*;
    match s {
        Clean => "clean",
        Merge => "merge",
        Revert | RevertSequence => "revert",
        CherryPick | CherryPickSequence => "cherry-pick",
        Bisect => "bisect",
        Rebase | RebaseInteractive | RebaseMerge => "rebase",
        ApplyMailbox | ApplyMailboxOrRebase => "am",
    }
}

/// Repo has stopped mid-operation (after a failed merge / rebase).
fn in_progress(path: &str) -> bool {
    open(path)
        .map(|r| r.state() != RepositoryState::Clean)
        .unwrap_or(false)
}

struct Output {
    ok: bool,
    text: String,
}

fn git(dir: &Path, args: &[&str]) -> Result<Output> {
    let mut cmd = Command::new("git");
    cmd.args(args)
        .current_dir(dir)
        // Never block on a hidden prompt: no terminal credential prompt, no
        // editor, and no stdin for ssh to read a passphrase from.
        .stdin(Stdio::null())
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
    Ok(Output {
        ok: out.status.success(),
        text: text.trim().to_string(),
    })
}

fn git_ok(dir: &Path, args: &[&str]) -> Result<String> {
    let o = git(dir, args)?;
    if o.ok {
        Ok(o.text)
    } else {
        Err(o.text)
    }
}

#[cfg(test)]
mod testutil {
    use super::git_ok;
    use std::fs;
    use std::path::Path;

    /// Fresh repo on `main` with a test identity.
    pub fn repo() -> tempfile::TempDir {
        let d = tempfile::tempdir().unwrap();
        init(d.path());
        d
    }

    pub fn init(p: &Path) {
        git_ok(p, &["init", "-q", "-b", "main"]).unwrap();
        identity(p);
    }

    pub fn identity(p: &Path) {
        git_ok(p, &["config", "user.name", "Test"]).unwrap();
        git_ok(p, &["config", "user.email", "t@example.com"]).unwrap();
        git_ok(p, &["config", "commit.gpgsign", "false"]).unwrap();
    }

    pub fn s(p: &Path) -> &str {
        p.to_str().unwrap()
    }

    /// Write `file` and commit everything with `msg`.
    pub fn commit_file(p: &Path, file: &str, content: &str, msg: &str) {
        fs::write(p.join(file), content).unwrap();
        let r = super::write::commit(s(p), msg, &[]).unwrap();
        assert_eq!(r.status, super::OpStatus::Ok, "{}", r.output);
    }
}
