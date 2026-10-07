//! Opening things outside the app: a repository's folder or one of its files
//! in the file manager, its default app, a terminal or the user's editor, and
//! a file as a commit had it (a read-only copy in the app's cache).
//!
//! The webview only names a repository and a path in it: the path must stay
//! inside that work tree (no `..`, no symlink out, nothing in `.git`), the
//! default app never gets something it would run (programs, scripts, app
//! bundles), and an editor is a known one on PATH or a program the user chose
//! that nothing else could have put there (see `git::planted`), never a shell.
//! Nothing goes through a shell: every program gets its arguments as argv.

use std::ffi::OsString;
use std::path::{Component, Path, PathBuf};

use serde::Deserialize;

mod editor;
pub use editor::{editor, known as known_editor, save as save_editor};
use editor::{editor_launch, stored};

type Result<T> = std::result::Result<T, String>;

/// How to open a path.
#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum OpenHow {
    /// Show it selected in Finder / Explorer / the file manager.
    Reveal,
    /// The app the system opens it with (a folder: the file manager).
    Default,
    /// A terminal in the folder (a file: its folder).
    Terminal,
    /// The editor from the settings (kept in the config folder, see `editor::save`).
    Editor,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Os {
    Mac,
    Windows,
    Linux,
}

const OS: Os = if cfg!(target_os = "macos") {
    Os::Mac
} else if cfg!(windows) {
    Os::Windows
} else {
    Os::Linux
};

/// `file` in the work tree of the repository at `repo` (`None`: the work tree
/// itself), as the real path it names. Refused: absolute paths and `..`, a
/// path that leaves the work tree once links are followed, anything in a git
/// folder, and paths not on disk.
pub fn inside(repo: &str, file: Option<&str>) -> Result<PathBuf> {
    let (root, git_dirs) = crate::git::layout(repo)?;
    let Some(file) = file else { return Ok(root) };
    let rel = Path::new(file);
    if !rel
        .components()
        .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err(format!("'{file}' is not a path inside the repository"));
    }
    let real = root
        .join(rel)
        .canonicalize()
        .map_err(|_| format!("'{file}' is not on disk"))?;
    let in_git = |p: &Path| {
        p.strip_prefix(&root)
            .map(|r| r.components().any(|c| c.as_os_str().eq_ignore_ascii_case(".git")))
            .unwrap_or(true)
            || git_dirs.iter().any(|g| p.starts_with(g))
    };
    if !real.starts_with(&root) {
        return Err(format!("'{file}' leads outside the repository"));
    }
    if in_git(&real) {
        return Err(format!("'{file}' is in a git folder"));
    }
    Ok(real)
}

/// `\\?\C:\x` → `C:\x`: canonical paths on Windows are verbatim, which cmd.exe
/// can't start in and many editors can't open. Other paths are left as they are.
fn plain(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) if rest.as_bytes().get(1) == Some(&b':') => PathBuf::from(rest),
        _ => p,
    }
}

/// Kinds of files the system "opens" by running them, by extension.
#[rustfmt::skip]
const RUNS: &[&str] = &[
    // Windows
    "exe", "com", "bat", "cmd", "scr", "pif", "msi", "msp", "msc", "cpl", "hta", "jar", "js", "jse",
    "vbs", "vbe", "wsf", "wsh", "ps1", "psm1", "lnk", "url", "reg", "inf", "appref-ms",
    "application", "gadget", "scf", "settingcontent-ms", "library-ms", "diagcab", "jnlp", "chm",
    "xll", "wsc", "sct", "msix", "msixbundle", "appx", "appxbundle", "appinstaller", "search-ms",
    "searchconnector-ms", "xbap", "website", "ws", "psc1", "mde", "accde", "ade", "adp",
    // (disk images open as a drive whose files skip the downloaded-file warning)
    "iso", "img", "vhd", "vhdx",
    // (Python installs make its scripts run on a double click)
    "py", "pyw", "pyz", "pyc",
    // macOS
    "app", "command", "tool", "terminal", "workflow", "action", "scpt", "scptd", "applescript",
    "pkg", "mpkg", "prefpane", "webloc", "inetloc", "fileloc", "osax", "saver", "plugin", "kext",
    "mobileconfig", "service", "dmg",
    // Linux
    "desktop", "sh", "run", "appimage", "bin", "deb", "rpm", "flatpakref", "flatpak", "snap",
];

/// Would the system's default app run `real` rather than show it?
fn runs_when_opened(real: &Path) -> bool {
    let risky_ext = real
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| RUNS.iter().any(|r| r.eq_ignore_ascii_case(e)));
    risky_ext || (real.is_file() && executable(real))
}

#[cfg(unix)]
fn executable(real: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(real).is_ok_and(|m| m.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn executable(_: &Path) -> bool {
    false
}

/// Open `file` of the repository at `repo` (`None`: the repository's folder);
/// `config` is the app's config folder, where the editor is kept.
pub fn open(config: &Path, repo: &str, file: Option<&str>, how: &OpenHow) -> Result<()> {
    let real = plain(inside(repo, file)?);
    match how {
        OpenHow::Reveal => tauri_plugin_opener::reveal_item_in_dir(&real).map_err(|e| e.to_string()),
        OpenHow::Default => open_default(&real),
        OpenHow::Terminal => {
            let dir = if real.is_dir() {
                real
            } else {
                real.parent().map(Path::to_path_buf).ok_or("No folder")?
            };
            terminal(&dir)
        }
        OpenHow::Editor => spawn(&editor_launch(OS, &plain(stored(config)?), &real)),
    }
}

fn open_default(real: &Path) -> Result<()> {
    if runs_when_opened(real) {
        let name = real.file_name().unwrap_or_default().to_string_lossy();
        return Err(format!(
            "'{name}' would run as a program: open it in an editor or show it in its folder"
        ));
    }
    tauri_plugin_opener::open_path(real, None::<&str>).map_err(|e| e.to_string())
}

/// A program to start: what, with which arguments, where, and (Windows) in a console of its own.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Launch {
    pub program: OsString,
    pub args: Vec<OsString>,
    pub cwd: Option<PathBuf>,
    pub console: bool,
}

impl Launch {
    fn new(program: impl Into<OsString>, args: &[&std::ffi::OsStr]) -> Self {
        Launch {
            program: program.into(),
            args: args.iter().map(|a| a.to_os_string()).collect(),
            cwd: None,
            console: false,
        }
    }
    fn at(mut self, dir: &Path) -> Self {
        self.cwd = Some(dir.to_path_buf());
        self
    }
}

/// Start `l` and let it run on its own (the app doesn't wait for editors or terminals).
fn spawn(l: &Launch) -> Result<()> {
    // A console program keeps the console's own input: `proc::hidden` closes stdin,
    // which a Windows console shell reads as "exit" at once.
    let mut cmd = if l.console {
        std::process::Command::new(&l.program)
    } else {
        crate::proc::hidden(&l.program)
    };
    cmd.args(&l.args);
    if let Some(dir) = &l.cwd {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    if l.console {
        use std::os::windows::process::CommandExt;
        // A console of its own instead of `proc::hidden`'s none: the terminal is the point.
        const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;
        cmd.creation_flags(CREATE_NEW_CONSOLE);
    }
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Can't start {}: {e}", l.program.to_string_lossy()))?;
    // Reap it when it exits so it doesn't linger as a zombie.
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

/// Terminals tried on Linux after `$TERMINAL`, in order.
const LINUX_TERMINALS: &[&str] = &[
    "x-terminal-emulator",
    "gnome-terminal",
    "konsole",
    "xfce4-terminal",
    "kgx",
    "ptyxis",
    "tilix",
    "alacritty",
    "kitty",
    "wezterm",
    "foot",
    "xterm",
];

/// How to start a terminal in `dir` on `os`; `found` resolves a program name on PATH.
/// The folder is the terminal's working directory (or a plain argument after
/// `-a Terminal` on macOS), never part of a command line a shell reads.
pub fn terminal_launch(
    os: Os,
    dir: &Path,
    env_terminal: Option<&str>,
    found: impl Fn(&str) -> Option<PathBuf>,
) -> Option<Launch> {
    match os {
        Os::Mac => Some(Launch::new(
            "/usr/bin/open",
            &["-a".as_ref(), "Terminal".as_ref(), dir.as_os_str()],
        )),
        Os::Windows => Some(match found("wt") {
            // Windows Terminal: `-d .` is its start folder, the working directory we give it.
            Some(wt) => Launch::new(wt, &["-d".as_ref(), ".".as_ref()]).at(dir),
            None => Launch {
                console: true,
                ..Launch::new("cmd.exe", &[]).at(dir)
            },
        }),
        Os::Linux => env_terminal
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .into_iter()
            .chain(LINUX_TERMINALS.iter().copied())
            .find_map(|name| found(name).map(|p| Launch::new(p, &[]).at(dir))),
    }
}

fn terminal(dir: &Path) -> Result<()> {
    let env = std::env::var("TERMINAL").ok();
    let launch = terminal_launch(OS, dir, env.as_deref(), on_path).ok_or("No terminal app found")?;
    spawn(&launch)
}

/// Where `name` is on PATH (plus where macOS installs command-line tools, as
/// apps started from Finder get a bare PATH), with Windows' program extensions.
fn on_path(name: &str) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = std::env::var_os("PATH")
        .map(|p| std::env::split_paths(&p).collect())
        .unwrap_or_default();
    if OS == Os::Mac {
        dirs.extend(["/usr/local/bin", "/opt/homebrew/bin"].map(PathBuf::from));
    }
    let exts: &[&str] = if OS == Os::Windows {
        &[".exe", ".cmd", ".bat"]
    } else {
        &[""]
    };
    dirs.iter()
        .filter(|d| d.is_absolute())
        .flat_map(|d| exts.iter().map(move |e| d.join(format!("{name}{e}"))))
        .find_map(|p| match p.canonicalize() {
            Ok(real) if real.is_file() => Some(real),
            // Windows' app execution aliases (`wt.exe` in WindowsApps) are links nothing can resolve.
            _ if OS == Os::Windows && p.symlink_metadata().is_ok_and(|m| !m.is_dir()) => Some(p),
            _ => None,
        })
}

/// `src/app.ts` at abc1234… → `app (abc1234).ts`: the copy's name, safe on every
/// system, and never taken for the file itself.
pub fn version_name(file: &str, id: &str) -> String {
    let base = file.rsplit('/').next().unwrap_or(file);
    let clean: String = base
        .chars()
        .map(|c| {
            if "\\/:*?\"<>|".contains(c) || c.is_control() {
                '_'
            } else {
                c
            }
        })
        .collect();
    let short = &id[..id.len().min(7)];
    match clean.rfind('.').filter(|&i| i > 0) {
        Some(i) => format!("{} ({short}){}", &clean[..i], &clean[i..]),
        None => format!("{clean} ({short})"),
    }
}

/// Write `file` as commit `rev` has it into `cache` (the app's own cache
/// folder) as a read-only copy, and open that in the editor kept in `config`
/// (`in_editor`) or the default app.
pub fn open_version(
    cache: &Path,
    config: &Path,
    repo: &str,
    rev: &str,
    file: &str,
    in_editor: bool,
) -> Result<()> {
    let editor = in_editor.then(|| stored(config)).transpose()?;
    let copy = plain(write_version(cache, repo, rev, file)?);
    match editor {
        Some(e) => spawn(&editor_launch(OS, &plain(e), &copy)),
        None => open_default(&copy),
    }
}

fn write_version(cache: &Path, repo: &str, rev: &str, file: &str) -> Result<PathBuf> {
    let (id, content) = crate::git::history::blob_at(repo, rev, file)?;
    // A folder per path, so `a/x.txt` and `b/x.txt` of one commit don't replace each other.
    let path_id = git2::Oid::hash_object(git2::ObjectType::Blob, file.as_bytes())
        .map_err(|e| e.to_string())?
        .to_string();
    let dir = cache.join("versions").join(&path_id[..12]);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let copy = dir.join(version_name(file, &id));
    // A copy left from before is replaced (it is read-only, and may not be ours to follow).
    if copy.symlink_metadata().is_ok() {
        let mut perm = std::fs::symlink_metadata(&copy)
            .map_err(|e| e.to_string())?
            .permissions();
        #[allow(clippy::permissions_set_readonly_false)]
        perm.set_readonly(false);
        let _ = std::fs::set_permissions(&copy, perm);
        std::fs::remove_file(&copy).map_err(|e| e.to_string())?;
    }
    let mut f = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&copy)
        .map_err(|e| e.to_string())?;
    std::io::Write::write_all(&mut f, &content).map_err(|e| e.to_string())?;
    let mut perm = f.metadata().map_err(|e| e.to_string())?.permissions();
    perm.set_readonly(true);
    std::fs::set_permissions(&copy, perm).map_err(|e| e.to_string())?;
    Ok(copy)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testutil::{commit_file, repo, s};

    #[test]
    fn only_paths_inside_the_work_tree_are_opened() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "first");
        std::fs::create_dir(d.path().join("dir")).unwrap();
        std::fs::write(d.path().join("dir/b.txt"), "b").unwrap();
        let root = d.path().canonicalize().unwrap();
        let p = s(d.path());
        assert_eq!(inside(p, None).unwrap(), root);
        assert_eq!(inside(p, Some("a.txt")).unwrap(), root.join("a.txt"));
        assert_eq!(inside(p, Some("dir/b.txt")).unwrap(), root.join("dir/b.txt"));
        assert_eq!(inside(p, Some("./dir")).unwrap(), root.join("dir"));
        for bad in [
            "../x",
            "dir/../../x",
            "dir/..",
            ".git",
            ".git/config",
            "dir/.GIT/x",
            "missing.txt",
        ] {
            assert!(inside(p, Some(bad)).is_err(), "{bad}");
        }
        let outside = tempfile::tempdir().unwrap();
        let abs = outside.path().join("x");
        std::fs::write(&abs, "x").unwrap();
        assert!(inside(p, Some(s(&abs))).is_err());
        assert!(inside(s(outside.path()), None).is_err(), "not a repository");
    }

    #[cfg(unix)]
    #[test]
    fn links_out_of_the_work_tree_or_into_git_are_refused() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "first");
        let outside = tempfile::tempdir().unwrap();
        std::fs::write(outside.path().join("secret"), "x").unwrap();
        std::os::unix::fs::symlink(outside.path().join("secret"), d.path().join("out")).unwrap();
        std::os::unix::fs::symlink(outside.path(), d.path().join("outdir")).unwrap();
        std::os::unix::fs::symlink(d.path().join(".git/config"), d.path().join("cfg")).unwrap();
        std::os::unix::fs::symlink(d.path().join("a.txt"), d.path().join("ok")).unwrap();
        let p = s(d.path());
        assert!(inside(p, Some("out")).is_err());
        assert!(inside(p, Some("outdir/secret")).is_err());
        assert!(inside(p, Some("cfg")).is_err());
        assert!(inside(p, Some("ok")).unwrap().ends_with("a.txt"));
    }

    #[test]
    fn the_default_app_never_gets_a_program() {
        let d = tempfile::tempdir().unwrap();
        for name in [
            "setup.exe",
            "run.BAT",
            "x.command",
            "Thing.app",
            "a.desktop",
            "s.sh",
            "l.lnk",
            "help.chm",
            "disk.iso",
            "pkg.deb",
        ] {
            assert!(runs_when_opened(&d.path().join(name)), "{name}");
        }
        let doc = d.path().join("notes.md");
        std::fs::write(&doc, "x").unwrap();
        assert!(!runs_when_opened(&doc));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let script = d.path().join("build");
            std::fs::write(&script, "#!/bin/sh\n").unwrap();
            std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
            assert!(runs_when_opened(&script));
        }
    }

    #[test]
    fn terminals_start_in_the_folder_without_a_shell_line() {
        let dir = Path::new("/work/my repo;rm -rf ~");
        let none = |_: &str| None;
        let mac = terminal_launch(Os::Mac, dir, None, none).unwrap();
        assert_eq!(mac.program, "/usr/bin/open");
        assert_eq!(mac.args, ["-a", "Terminal", "/work/my repo;rm -rf ~"]);

        let wt = terminal_launch(Os::Windows, dir, None, |n| {
            (n == "wt").then(|| "C:\\wt.exe".into())
        })
        .unwrap();
        assert_eq!(
            (wt.program.to_str(), wt.args.clone()),
            (Some("C:\\wt.exe"), vec!["-d".into(), ".".into()])
        );
        assert_eq!(wt.cwd.as_deref(), Some(dir));
        let cmd = terminal_launch(Os::Windows, dir, None, none).unwrap();
        assert_eq!(cmd.program, "cmd.exe");
        assert!(cmd.args.is_empty() && cmd.console && cmd.cwd.as_deref() == Some(dir));

        let linux = |env: Option<&str>, have: &'static [&'static str]| {
            terminal_launch(Os::Linux, dir, env, |n| {
                have.contains(&n).then(|| format!("/usr/bin/{n}").into())
            })
        };
        let l = linux(None, &["konsole", "xterm"]).unwrap();
        assert_eq!(l.program, "/usr/bin/konsole");
        assert!(l.args.is_empty() && l.cwd.as_deref() == Some(dir));
        assert_eq!(
            linux(Some("kitty"), &["kitty", "xterm"]).unwrap().program,
            "/usr/bin/kitty"
        );
        assert_eq!(linux(Some("nope"), &["xterm"]).unwrap().program, "/usr/bin/xterm");
        assert_eq!(linux(None, &[]), None);
    }

    #[test]
    fn verbatim_windows_paths_are_made_plain() {
        assert_eq!(plain(r"\\?\C:\r\a.txt".into()), PathBuf::from(r"C:\r\a.txt"));
        assert_eq!(plain(r"\\?\UNC\srv\x".into()), PathBuf::from(r"\\?\UNC\srv\x"));
        assert_eq!(plain("/work/a".into()), PathBuf::from("/work/a"));
    }

    #[test]
    fn version_copies_are_named_after_the_commit() {
        assert_eq!(version_name("src/app.ts", "abc1234def"), "app (abc1234).ts");
        assert_eq!(version_name("Makefile", "abc1234def"), "Makefile (abc1234)");
        assert_eq!(version_name(".env", "abc1234def"), ".env (abc1234)");
        assert_eq!(version_name("we:ird?.txt", "abc1234"), "we_ird_ (abc1234).txt");
    }

    #[test]
    fn a_version_is_written_read_only_into_the_cache() {
        let d = repo();
        commit_file(d.path(), "a.txt", "old\n", "first");
        commit_file(d.path(), "a.txt", "new\n", "second");
        let cache = tempfile::tempdir().unwrap();
        let copy = write_version(cache.path(), s(d.path()), "HEAD~1", "a.txt").unwrap();
        assert_eq!(std::fs::read_to_string(&copy).unwrap(), "old\n");
        assert!(copy.starts_with(cache.path()));
        assert!(std::fs::metadata(&copy).unwrap().permissions().readonly());
        // Again: replaced, not refused.
        assert_eq!(
            write_version(cache.path(), s(d.path()), "HEAD~1", "a.txt").unwrap(),
            copy
        );
        assert!(write_version(cache.path(), s(d.path()), "HEAD", "missing.txt").is_err());
        // The same name in another folder gets a copy of its own.
        std::fs::create_dir(d.path().join("b")).unwrap();
        commit_file(d.path(), "b/a.txt", "other\n", "third");
        let other = write_version(cache.path(), s(d.path()), "HEAD", "b/a.txt").unwrap();
        assert_ne!(other.parent(), copy.parent());
        assert_eq!(std::fs::read_to_string(&copy).unwrap(), "old\n");
        // The working tree is untouched.
        assert_eq!(std::fs::read_to_string(d.path().join("a.txt")).unwrap(), "new\n");
    }
}
