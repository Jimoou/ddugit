//! Git access layer.
//!
//! Reads (history, refs, status, diffs) use libgit2 for speed. Writes (commit,
//! merge, checkout, branch, fetch/pull/push) shell out to the user's `git` so
//! hooks, credentials, signing and LFS behave exactly as on the command line.

pub mod backport;
pub mod bisect;
pub mod changelog;
pub mod cleanup;
pub mod conflict;
pub mod diff;
pub mod edit;
pub mod glance;
pub mod history;
pub mod identity;
pub mod lfs;
pub mod pick;
pub mod read;
pub mod rebase;
pub mod refs;
pub mod remote;
pub mod setup;
pub mod stack;
pub mod stage;
pub mod stash;
pub mod submodule;
pub mod transfer;
pub mod undo;
pub mod watch;
pub mod worktree;
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
    /// Credentials or SSH host trust missing; the UI explains how to set them up.
    Auth,
    /// A cherry-pick / revert / rebase step stopped because the commit's change
    /// is already there: nothing conflicts, nothing to commit. Skip it.
    Empty,
    /// Refused without force: a branch with commits not merged anywhere, or a
    /// worktree with changes.
    Unmerged,
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

/// A ref, revision or name handed to git as an operand. One starting with `-`
/// would be read as an option (`--upload-pack=…`, `--output=…`), so it is refused.
pub(crate) fn operand(s: &str) -> Result<&str> {
    if s.starts_with('-') {
        Err(format!("'{s}' can't start with '-'"))
    } else {
        Ok(s)
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

/// A remote's push URL meaning "never push here" (`git remote set-url --push`).
pub(crate) const NO_PUSH: &str = "DISABLED";

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

/// The git executable writes run with; `None` means `git` on PATH. Set from
/// the settings screen, e.g. when the app's PATH lacks the user's git (macOS
/// apps launched from Finder don't see a shell's PATH).
static GIT_PATH: std::sync::RwLock<Option<String>> = std::sync::RwLock::new(None);

fn git_program() -> String {
    GIT_PATH
        .read()
        .ok()
        .and_then(|p| p.clone())
        .unwrap_or_else(|| "git".into())
}

/// `git --version` of `program` (`None`: the current one), or why it can't run.
pub fn version(program: Option<&str>) -> Result<String> {
    let program = program.map_or_else(git_program, str::to_string);
    let out = Command::new(&program)
        .arg("--version")
        .stdin(Stdio::null())
        .output()
        .map_err(|e| format!("Can't run '{program}': {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() || !text.starts_with("git version") {
        return Err(format!("'{program}' is not a git executable"));
    }
    Ok(text)
}

/// A git executable the user named: an absolute path to an existing file
/// called `git` (`git.exe` on Windows). Checked before it is ever run.
fn check_git_path(program: &str) -> Result<()> {
    let p = Path::new(program);
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let named_git = name == "git" || name.eq_ignore_ascii_case("git.exe");
    if !p.is_absolute() || !named_git || !p.is_file() {
        return Err(format!(
            "'{program}' is not a git executable (give the full path to git)"
        ));
    }
    Ok(())
}

/// Use `program` for git (blank or `None`: back to PATH). Refused, keeping
/// the current one, unless it is a full path to `git` that answers `--version` like git.
pub fn set_program(program: Option<&str>) -> Result<String> {
    let program = program.map(str::trim).filter(|p| !p.is_empty());
    if let Some(p) = program {
        check_git_path(p)?;
    }
    let v = version(Some(program.unwrap_or("git")))?;
    *GIT_PATH.write().map_err(err)? = program.map(str::to_string);
    Ok(v)
}

fn command(dir: &Path, args: &[&str]) -> Command {
    let mut cmd = Command::new(git_program());
    cmd.args(args)
        .current_dir(dir)
        // Never block on a hidden prompt: no terminal credential prompt, no
        // editor, and no stdin for ssh to read a passphrase from.
        .stdin(Stdio::null())
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_EDITOR", "true")
        .env("LC_ALL", "C");
    // Tests use local folders as remotes (submodules too), which git blocks by default.
    #[cfg(test)]
    cmd.env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "protocol.file.allow")
        .env("GIT_CONFIG_VALUE_0", "always");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

const SPAWN_ERR: &str = "Failed to run git (is it installed and on PATH?)";

fn join_output(ok: bool, stdout: &str, stderr: &str) -> Output {
    let mut text = stdout.trim_end().to_string();
    if !stderr.trim().is_empty() {
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(stderr.trim_end());
    }
    Output {
        ok,
        text: text.trim().to_string(),
    }
}

fn git(dir: &Path, args: &[&str]) -> Result<Output> {
    let out = command(dir, args)
        .output()
        .map_err(|e| format!("{SPAWN_ERR}: {e}"))?;
    Ok(join_output(
        out.status.success(),
        &String::from_utf8_lossy(&out.stdout),
        &String::from_utf8_lossy(&out.stderr),
    ))
}

/// Like `git`, but streams stderr: every `\r`/`\n`-separated segment goes to
/// `on_segment`, which returns `true` to swallow it (progress lines) instead of
/// keeping it in the output text.
fn git_streaming(dir: &Path, args: &[&str], mut on_segment: impl FnMut(&str) -> bool) -> Result<Output> {
    use std::io::Read;
    let mut child = command(dir, args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{SPAWN_ERR}: {e}"))?;
    let mut stdout = child.stdout.take().expect("piped stdout");
    // Drain stdout on its own thread so a full pipe can never deadlock git.
    let out_thread = std::thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = stdout.read_to_end(&mut buf);
        buf
    });

    let mut stderr = child.stderr.take().expect("piped stderr");
    let (mut kept, mut seg, mut chunk) = (String::new(), Vec::new(), [0u8; 4096]);
    let mut flush = |seg: &mut Vec<u8>, kept: &mut String| {
        let line = String::from_utf8_lossy(seg).into_owned();
        seg.clear();
        if !line.trim().is_empty() && !on_segment(&line) {
            kept.push_str(&line);
            kept.push('\n');
        }
    };
    loop {
        let n = stderr.read(&mut chunk).map_err(err)?;
        if n == 0 {
            break;
        }
        for &b in &chunk[..n] {
            if b == b'\r' || b == b'\n' {
                flush(&mut seg, &mut kept);
            } else {
                seg.push(b);
            }
        }
    }
    flush(&mut seg, &mut kept);

    let status = child.wait().map_err(err)?;
    let stdout = out_thread.join().unwrap_or_default();
    Ok(join_output(
        status.success(),
        &String::from_utf8_lossy(&stdout),
        &kept,
    ))
}

/// Like `git`, but feeds `input` on stdin (e.g. a patch for `git apply`).
fn git_input(dir: &Path, args: &[&str], input: &str) -> Result<Output> {
    use std::io::Write;
    let mut child = command(dir, args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{SPAWN_ERR}: {e}"))?;
    child
        .stdin
        .take()
        .expect("piped stdin")
        .write_all(input.as_bytes())
        .map_err(err)?; // stdin drops here, closing the pipe
    let out = child.wait_with_output().map_err(err)?;
    Ok(join_output(
        out.status.success(),
        &String::from_utf8_lossy(&out.stdout),
        &String::from_utf8_lossy(&out.stderr),
    ))
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
mod tests {
    use super::*;

    #[test]
    fn git_program_is_validated_before_use() {
        assert!(version(None).unwrap().starts_with("git version"));
        // Something that runs but isn't git, and something that doesn't exist.
        assert!(set_program(Some("/no/such/git")).is_err());
        assert!(version(Some(if cfg!(windows) { "where" } else { "true" })).is_err());
        // Blank means PATH again; the global never held the bad value.
        assert!(set_program(Some("  ")).unwrap().starts_with("git version"));
        assert_eq!(git_program(), "git");
        // Only a full path to a file named git is ever run.
        assert!(check_git_path("git").is_err());
        assert!(check_git_path(if cfg!(windows) {
            "C:\\Windows\\System32\\cmd.exe"
        } else {
            "/bin/sh"
        })
        .is_err());
    }

    #[test]
    fn operands_that_look_like_options_are_refused() {
        assert!(operand("--upload-pack=touch x").is_err());
        assert!(operand("-x").is_err());
        assert_eq!(operand("feature/x").unwrap(), "feature/x");
        let d = testutil::repo();
        testutil::commit_file(d.path(), "a.txt", "a", "a");
        assert!(write::checkout(testutil::s(d.path()), "--orphan=x").is_err());
        assert!(write::create_branch(testutil::s(d.path()), "-D", None, false).is_err());
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
        // Runners (e.g. Windows) may set core.autocrlf globally; tests compare exact bytes.
        git_ok(p, &["config", "core.autocrlf", "false"]).unwrap();
    }

    pub fn s(p: &Path) -> &str {
        p.to_str().unwrap()
    }

    /// Write `file` and commit everything with `msg`.
    pub fn commit_file(p: &Path, file: &str, content: &str, msg: &str) {
        fs::write(p.join(file), content).unwrap();
        let r = super::write::commit(s(p), msg, &[], false).unwrap();
        assert_eq!(r.status, super::OpStatus::Ok, "{}", r.output);
    }
}
