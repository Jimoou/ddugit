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

/// Goes before a subcommand that takes file paths from the UI: they name files,
/// so `[`, `*`, `?` and `:(magic)` must not match other files (`git clean -- 'a?'`
/// would also delete `ab`). Not set globally: `lfs track` patterns are globs.
/// Only for commands that run no hooks: git exports it to them as
/// `GIT_LITERAL_PATHSPECS`, which would break a hook's own globs; those use [`literal`].
pub(crate) const LITERAL: &str = "--literal-pathspecs";

/// One UI file path as a pathspec that matches only that path (see [`LITERAL`]).
pub(crate) fn literal(path: &str) -> String {
    format!(":(literal){path}")
}

/// A remote's push URL meaning "never push here" (`git remote set-url --push`).
pub(crate) const NO_PUSH: &str = "DISABLED";

/// Whether commit `a` is `b` or one of its ancestors.
fn is_ancestor(dir: &Path, a: &str, b: &str) -> bool {
    git(dir, &["merge-base", "--is-ancestor", a, b]).is_ok_and(|o| o.ok)
}

/// The local config's keys matching `pattern` with their values, in file
/// order. Read with `-z` ("key\nvalue\0"): names in keys may hold spaces and
/// dots. Nothing set (or no answer) is empty.
fn config_entries(dir: &Path, pattern: &str) -> Vec<(String, String)> {
    let Ok(out) = git(dir, &["config", "--local", "-z", "--get-regexp", pattern]) else {
        return Vec::new();
    };
    out.text
        .split('\0')
        .filter_map(|entry| {
            let (k, v) = entry.trim_start_matches('\n').split_once('\n')?;
            Some((k.to_string(), v.to_string()))
        })
        .collect()
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
    let out = crate::proc::hidden(&program)
        .arg("--version")
        .output()
        .map_err(|e| format!("Can't run '{program}': {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !out.status.success() || !text.starts_with("git version") {
        return Err(format!("'{program}' is not a git executable"));
    }
    Ok(text)
}

/// A git executable the user named: an absolute path to an existing file
/// called `git` (`git.exe` on Windows). Checked before it is ever run. The
/// file it resolves to must not be something a clone or a download could have
/// put there: no file a repository tracks (or would add), nothing in a temp
/// folder, and (Unix) nothing other users may rewrite.
fn check_git_path(program: &str) -> Result<()> {
    let p = Path::new(program);
    let name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
    let named_git = name == "git" || name.eq_ignore_ascii_case("git.exe");
    if !p.is_absolute() || !named_git || !p.is_file() {
        return Err(format!(
            "'{program}' is not a git executable (give the full path to git)"
        ));
    }
    let real = p.canonicalize().map_err(err)?;
    if in_temp(&real) {
        return Err(format!("'{program}' is in a temporary folder"));
    }
    if in_repository(&real) {
        return Err(format!("'{program}' is inside a git repository"));
    }
    if writable_by_others(&real) {
        return Err(format!("'{program}' can be changed by other users"));
    }
    Ok(())
}

/// Under the system temp folder (or `/tmp`, `/var/tmp`).
fn in_temp(real: &Path) -> bool {
    let mut temps = vec![std::env::temp_dir()];
    if cfg!(unix) {
        temps.extend(["/tmp", "/var/tmp"].map(std::path::PathBuf::from));
    }
    temps
        .iter()
        .filter_map(|t| t.canonicalize().ok())
        .any(|t| real.starts_with(t))
}

/// In a repository's work tree and tracked there, or not ignored by it (a
/// clone's files are tracked). Ignored files are fine: Homebrew's prefix is a
/// repository that ignores its `bin/` and `Cellar/`.
fn in_repository(real: &Path) -> bool {
    let Some(parent) = real.parent() else {
        return false;
    };
    let Ok(repo) = Repository::discover(parent) else {
        return false;
    };
    let Some(rel) = repo
        .workdir()
        .and_then(|w| w.canonicalize().ok())
        .and_then(|w| real.strip_prefix(w).ok().map(Path::to_path_buf))
    else {
        // Inside `.git` or a bare repository: hooks and such, never git itself.
        return true;
    };
    let tracked = repo.index().is_ok_and(|i| i.get_path(&rel, 0).is_some());
    tracked || !repo.is_path_ignored(&rel).unwrap_or(false)
}

#[cfg(unix)]
fn writable_by_others(real: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(real).map_or(true, |m| m.permissions().mode() & 0o022 != 0)
}

#[cfg(not(unix))]
fn writable_by_others(_: &Path) -> bool {
    false
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

/// Subcommands that may reach a remote (over ssh or http).
const NETWORK: &[&str] = &[
    "fetch",
    "pull",
    "push",
    "clone",
    "ls-remote",
    "submodule",
    "lfs",
    "remote",
];

/// The git subcommand in `args` (after options like `-c key=value`).
fn subcommand<'a>(args: &[&'a str]) -> Option<&'a str> {
    let mut it = args.iter();
    while let Some(a) = it.next() {
        match *a {
            "-c" | "-C" => {
                it.next();
            }
            a if a.starts_with('-') => {}
            a => return Some(a),
        }
    }
    None
}

/// Environment and `-c` options for git that may reach a remote, so it can't
/// hang: ssh in batch mode (an unknown host key or a passphrase without an
/// agent fails at once, as `Host key verification failed` / `Permission
/// denied (publickey)`, which `remote::is_auth_failure` reports) unless the
/// user chose their own ssh command, and an HTTP transfer that stalls for a
/// minute gives up unless the user set their own limit. `env` reads the
/// process environment.
fn network_guard(
    dir: &Path,
    env: impl Fn(&str) -> Option<std::ffi::OsString>,
) -> (Vec<(&'static str, &'static str)>, Vec<&'static str>) {
    let config = Repository::discover(dir)
        .and_then(|r| r.config())
        .or_else(|_| git2::Config::open_default())
        .and_then(|mut c| c.snapshot())
        .ok();
    let set = |key: &str| config.as_ref().is_some_and(|c| c.get_entry(key).is_ok());
    let mut vars = Vec::new();
    if env("GIT_SSH_COMMAND").is_none() && env("GIT_SSH").is_none() && !set("core.sshCommand") {
        vars.push(("GIT_SSH_COMMAND", "ssh -o BatchMode=yes"));
    }
    let mut options = Vec::new();
    if !set("http.lowSpeedLimit") && !set("http.lowSpeedTime") && env("GIT_HTTP_LOW_SPEED_LIMIT").is_none() {
        options.extend(["-c", "http.lowSpeedLimit=1", "-c", "http.lowSpeedTime=60"]);
    }
    (vars, options)
}

fn command(dir: &Path, args: &[&str]) -> Command {
    let mut cmd = crate::proc::hidden(git_program());
    if subcommand(args).is_some_and(|s| NETWORK.contains(&s)) {
        let (env, config) = network_guard(dir, |k| std::env::var_os(k));
        cmd.envs(env).args(config);
    }
    cmd.args(args)
        .current_dir(dir)
        // Never block on a hidden prompt: no terminal credential prompt, no
        // askpass helper (an empty GIT_ASKPASS also hides core.askPass and
        // SSH_ASKPASS from git), no editor, and (`proc::hidden`) no stdin for
        // ssh to read a passphrase from. Credential helpers still run.
        .env("GIT_TERMINAL_PROMPT", "0")
        .env("GIT_ASKPASS", "")
        .env("GIT_EDITOR", "true")
        .env("LC_ALL", "C");
    // Tests use local folders as remotes (submodules too), which git blocks by default.
    #[cfg(test)]
    cmd.env("GIT_CONFIG_COUNT", "1")
        .env("GIT_CONFIG_KEY_0", "protocol.file.allow")
        .env("GIT_CONFIG_VALUE_0", "always");
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
fn git_input(dir: &Path, args: &[&str], input: &[u8]) -> Result<Output> {
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
        .write_all(input)
        .map_err(err)?; // stdin drops here, closing the pipe
    let out = child.wait_with_output().map_err(err)?;
    Ok(join_output(
        out.status.success(),
        &String::from_utf8_lossy(&out.stdout),
        &String::from_utf8_lossy(&out.stderr),
    ))
}

/// Lowercase hex of `bytes` (digests).
pub(crate) fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
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
        assert!(version(Some("/no/such/git"))
            .unwrap_err()
            .starts_with("Can't run"));
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
    fn remote_work_gets_no_hidden_prompts_unless_the_user_chose_ssh() {
        assert_eq!(
            subcommand(&["-c", "a=b", "--literal-pathspecs", "fetch"]),
            Some("fetch")
        );
        assert_eq!(subcommand(&["-C", "x"]), None);
        let d = testutil::repo();
        let none = |_: &str| None;
        let (vars, options) = network_guard(d.path(), none);
        assert_eq!(vars, [("GIT_SSH_COMMAND", "ssh -o BatchMode=yes")]);
        assert_eq!(
            options,
            ["-c", "http.lowSpeedLimit=1", "-c", "http.lowSpeedTime=60"]
        );
        // The user's own ssh command (config or environment) and speed limit are kept.
        let set = |_: &str| Some(std::ffi::OsString::from("x"));
        assert!(network_guard(d.path(), set).0.is_empty());
        git_ok(d.path(), &["config", "core.sshCommand", "ssh -i key"]).unwrap();
        git_ok(d.path(), &["config", "http.lowSpeedTime", "600"]).unwrap();
        assert_eq!(network_guard(d.path(), none), (vec![], vec![]));
    }

    #[test]
    fn a_fetch_over_ssh_that_would_prompt_fails_as_auth() {
        // An ssh "client" that, like ssh asking about a new host key, needs a
        // terminal; git hands it our options, so batch mode is visible here.
        let d = testutil::repo();
        let ssh = d.path().join("fake-ssh");
        std::fs::write(
            &ssh,
            "#!/bin/sh\ncase \"$*\" in *BatchMode=yes*) echo 'Host key verification failed.' >&2; exit 255;; esac\nread answer\n",
        )
        .unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&ssh, std::fs::Permissions::from_mode(0o755)).unwrap();
            git_ok(
                d.path(),
                &["remote", "add", "origin", "ssh://git@example.invalid/x.git"],
            )
            .unwrap();
            // Our GIT_SSH_COMMAND with the fake in place of `ssh` (none when the
            // environment already names an ssh command).
            let mut cmd = command(d.path(), &["fetch", "origin"]);
            let ours = cmd
                .get_envs()
                .find(|(k, _)| *k == "GIT_SSH_COMMAND")
                .and_then(|(_, v)| v.map(|v| v.to_string_lossy().into_owned()));
            if let Some(ours) = ours {
                let replaced = ours.replacen("ssh", ssh.to_str().unwrap(), 1);
                cmd.env("GIT_SSH_COMMAND", replaced);
                let out = cmd.output().unwrap();
                let text = String::from_utf8_lossy(&out.stderr);
                assert!(!out.status.success());
                assert!(remote::is_auth_failure(&text), "{text}");
            }
        }
    }

    #[test]
    fn git_programs_a_clone_could_plant_are_refused() {
        // A tracked file named `git` in a work tree (here also in a temp folder).
        let d = testutil::repo();
        let fake = d.path().join("git");
        std::fs::write(&fake, "#!/bin/sh\necho git version 9\n").unwrap();
        git_ok(d.path(), &["add", "git"]).unwrap();
        let real = fake.canonicalize().unwrap();
        assert!(in_repository(&real));
        assert!(in_temp(&real));
        assert!(check_git_path(real.to_str().unwrap()).is_err());
        // Ignored and untracked: allowed as far as the repository goes.
        let ignored = d.path().join("bin");
        std::fs::create_dir(&ignored).unwrap();
        std::fs::write(d.path().join(".gitignore"), "/bin/\n").unwrap();
        std::fs::write(ignored.join("git"), "").unwrap();
        assert!(!in_repository(&ignored.join("git").canonicalize().unwrap()));
        assert!(!in_temp(Path::new("/usr/bin/git")));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let f = ignored.join("git");
            std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o757)).unwrap();
            assert!(writable_by_others(&f));
            std::fs::set_permissions(&f, std::fs::Permissions::from_mode(0o755)).unwrap();
            assert!(!writable_by_others(&f));
        }
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
pub(crate) mod testutil {
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

    /// `git <args>` in `p` that must succeed (for tests outside `git`).
    pub fn run(p: &Path, args: &[&str]) -> String {
        git_ok(p, args).unwrap()
    }

    /// Write `file` and commit everything with `msg`.
    pub fn commit_file(p: &Path, file: &str, content: &str, msg: &str) {
        fs::write(p.join(file), content).unwrap();
        let r = super::write::commit(s(p), msg, &[], false).unwrap();
        assert_eq!(r.status, super::OpStatus::Ok, "{}", r.output);
    }
}
