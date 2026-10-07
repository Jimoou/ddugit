//! External diff and merge tools: `git difftool` / `git mergetool` with the
//! tool the user set up in git (`diff.tool`, `merge.tool`, their `guitool`s)
//! or one picked in the app's settings. Both run until the tool's window
//! closes, so the UI calls them off the main thread and doesn't queue other
//! git work behind them.

use std::path::Path;

use serde::{Deserialize, Serialize};

use super::{err, git, literal, open, operand, repo_dir, OpResult, OpStatus, Result};

/// git's own graphical tools (`git difftool --tool-help`). Terminal ones
/// (vimdiff, nvimdiff, emerge) are left out: there is no terminal to run them in.
pub const KNOWN: &[&str] = &[
    "araxis",
    "bc",
    "codecompare",
    "deltawalker",
    "diffmerge",
    "diffuse",
    "ecmerge",
    "examdiff",
    "guiffy",
    "gvimdiff",
    "kdiff3",
    "kompare",
    "meld",
    "opendiff",
    "p4merge",
    "smerge",
    "tkdiff",
    "tortoisemerge",
    "winmerge",
    "xxdiff",
];

/// What git is set up with, for the settings screen.
#[derive(Debug, Serialize, Clone, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ToolSetup {
    /// The tool `git difftool` uses with nothing picked in the app.
    pub diff: Option<String>,
    pub merge: Option<String>,
    /// Tools defined in git config (`difftool.<name>.cmd`, `mergetool.<name>.cmd`).
    pub custom_diff: Vec<String>,
    pub custom_merge: Vec<String>,
    pub known: Vec<String>,
}

/// What to compare in the diff tool.
#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DiffTarget {
    /// The working tree against the index (`staged`: the index against HEAD).
    Worktree { staged: bool, file: Option<String> },
    /// A commit against its first parent (an empty tree for the first commit).
    Commit { id: String, file: Option<String> },
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Diff,
    Merge,
}

impl Kind {
    fn section(self) -> &'static str {
        match self {
            Kind::Diff => "difftool",
            Kind::Merge => "mergetool",
        }
    }
}

fn config(path: Option<&str>) -> Option<git2::Config> {
    let cfg = match path {
        Some(p) => open(p).ok()?.config().ok()?,
        None => git2::Config::open_default().ok()?,
    };
    let mut cfg = cfg;
    cfg.snapshot().ok()
}

/// Tool names with a `<section>.<name>.cmd` in `cfg`.
fn custom(cfg: &git2::Config, kind: Kind) -> Vec<String> {
    let pattern = format!(r"^{}\..+\.cmd$", kind.section());
    let mut names: Vec<String> = cfg
        .entries(Some(&pattern))
        .map(|entries| {
            let mut v = Vec::new();
            let _ = entries.for_each(|e| {
                if let Some(name) = e.name() {
                    let inner = &name[kind.section().len() + 1..name.len() - ".cmd".len()];
                    v.push(inner.to_string());
                }
            });
            v
        })
        .unwrap_or_default();
    names.sort();
    names.dedup();
    names
}

/// The tool git would pick, and whether it is a `guitool` (run with `--gui`).
fn configured(cfg: &git2::Config, kind: Kind) -> Option<(String, bool)> {
    let get = |k: &str| cfg.get_string(k).ok().filter(|v| !v.trim().is_empty());
    let keys: &[(&str, bool)] = match kind {
        Kind::Diff => &[
            ("diff.guitool", true),
            ("diff.tool", false),
            ("merge.tool", false),
        ],
        Kind::Merge => &[("merge.guitool", true), ("merge.tool", false)],
    };
    keys.iter().find_map(|(k, gui)| get(k).map(|v| (v, *gui)))
}

/// What git is set up with (`path`: a repository, whose config counts too).
pub fn setup(path: Option<&str>) -> ToolSetup {
    let known = KNOWN.iter().map(|s| s.to_string()).collect();
    let Some(cfg) = config(path) else {
        return ToolSetup {
            known,
            ..Default::default()
        };
    };
    ToolSetup {
        diff: configured(&cfg, Kind::Diff).map(|t| t.0),
        merge: configured(&cfg, Kind::Merge).map(|t| t.0),
        custom_diff: custom(&cfg, Kind::Diff),
        custom_merge: custom(&cfg, Kind::Merge),
        known,
    }
}

/// The tool option for git: the one picked in the app (a known tool or one
/// defined in git config, nothing else), else git's own choice.
fn tool_arg(cfg: Option<&git2::Config>, kind: Kind, picked: Option<&str>) -> Result<Option<String>> {
    match picked.map(str::trim).filter(|t| !t.is_empty()) {
        Some(name) => {
            let defined = cfg.is_some_and(|c| custom(c, kind).iter().any(|n| n == name));
            if !KNOWN.contains(&name) && !defined {
                return Err(format!("'{name}' is not a {} git knows", kind.section()));
            }
            Ok(Some(format!("--tool={}", operand(name)?)))
        }
        None => Ok(cfg
            .and_then(|c| configured(c, kind))
            .and_then(|(_, gui)| gui.then(|| "--gui".to_string()))),
    }
}

/// `git difftool` arguments: one file, or every file at once (`--dir-diff`).
fn difftool_args(revs: &[String], tool: Option<String>, file: Option<&str>) -> Vec<String> {
    let mut args = vec!["difftool".to_string(), "--no-prompt".to_string()];
    args.extend(tool);
    if file.is_none() {
        args.push("--dir-diff".into());
    }
    args.extend(revs.iter().cloned());
    if let Some(f) = file {
        args.push("--".into());
        args.push(literal(f));
    }
    args
}

/// Open `target` in the diff tool and wait until it closes.
pub fn difftool(path: &str, target: &DiffTarget, tool: Option<&str>) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    let cfg = config(Some(path));
    let tool = tool_arg(cfg.as_ref(), Kind::Diff, tool)?;
    let (revs, file) = match target {
        DiffTarget::Worktree { staged, file } => {
            (if *staged { vec!["--cached".into()] } else { vec![] }, file)
        }
        DiffTarget::Commit { id, file } => (commit_revs(path, &dir, id)?, file),
    };
    let args = difftool_args(&revs, tool, file.as_deref());
    run(&dir, &args)
}

/// The commit and what it is compared with: its first parent, else the empty tree.
fn commit_revs(path: &str, dir: &Path, id: &str) -> Result<Vec<String>> {
    let repo = open(path)?;
    let commit = repo
        .revparse_single(operand(id)?)
        .and_then(|o| o.peel_to_commit())
        .map_err(err)?;
    let parent = match commit.parent_id(0) {
        Ok(p) => p.to_string(),
        // The empty tree's id, without writing it (stdin is empty).
        Err(_) => {
            let out = git(dir, &["hash-object", "-t", "tree", "--stdin"])?;
            if !out.ok {
                return Err(out.text);
            }
            out.text
        }
    };
    Ok(vec![parent, commit.id().to_string()])
}

/// Resolve `file`'s conflict in the merge tool; done when git staged the result.
pub fn mergetool(path: &str, file: &str, tool: Option<&str>) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    let cfg = config(Some(path));
    let mut args = vec!["mergetool".to_string(), "--no-prompt".to_string()];
    args.extend(tool_arg(cfg.as_ref(), Kind::Merge, tool)?);
    args.extend(["--".to_string(), literal(file)]);
    let r = run(&dir, &args)?;
    let index = open(path)?.index().map_err(err)?;
    let left = index.conflicts().map_err(err)?.flatten().any(|c| {
        [c.our, c.their, c.ancestor]
            .iter()
            .flatten()
            .any(|e| e.path == file.as_bytes())
    });
    Ok(if left && r.status == OpStatus::Ok {
        OpResult {
            status: OpStatus::Failed,
            output: format!("'{file}' is still in conflict"),
        }
    } else {
        r
    })
}

fn run(dir: &Path, args: &[String]) -> Result<OpResult> {
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = git(dir, &args)?;
    Ok(OpResult {
        status: if out.ok { OpStatus::Ok } else { OpStatus::Failed },
        output: out.text,
    })
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, run as git_run, s};
    use super::super::write::{checkout, create_branch, merge, MergeMode};
    use super::*;

    #[test]
    fn difftool_arguments_compare_one_file_or_all() {
        let revs = vec!["a".to_string(), "b".to_string()];
        assert_eq!(
            difftool_args(&revs, Some("--tool=meld".into()), Some("x y.txt")),
            [
                "difftool",
                "--no-prompt",
                "--tool=meld",
                "a",
                "b",
                "--",
                ":(literal)x y.txt"
            ]
        );
        assert_eq!(
            difftool_args(&["--cached".into()], None, None),
            ["difftool", "--no-prompt", "--dir-diff", "--cached"]
        );
    }

    #[test]
    fn only_known_or_configured_tools_are_passed_to_git() {
        let d = repo();
        git_run(d.path(), &["config", "difftool.mine.cmd", "true"]);
        let cfg = config(Some(s(d.path())));
        let cfg = cfg.as_ref();
        assert_eq!(
            tool_arg(cfg, Kind::Diff, Some("meld")).unwrap().unwrap(),
            "--tool=meld"
        );
        assert_eq!(
            tool_arg(cfg, Kind::Diff, Some("mine")).unwrap().unwrap(),
            "--tool=mine"
        );
        assert!(tool_arg(cfg, Kind::Merge, Some("mine")).is_err());
        assert!(tool_arg(cfg, Kind::Diff, Some("vimdiff")).is_err());
        assert!(tool_arg(cfg, Kind::Diff, Some("--extcmd=sh")).is_err());
        assert_eq!(tool_arg(cfg, Kind::Diff, Some(" ")).unwrap(), None);
        git_run(d.path(), &["config", "diff.guitool", "meld"]);
        let cfg = config(Some(s(d.path())));
        assert_eq!(
            tool_arg(cfg.as_ref(), Kind::Diff, None).unwrap().unwrap(),
            "--gui"
        );
        let found = setup(Some(s(d.path())));
        assert_eq!(found.diff.as_deref(), Some("meld"));
        assert_eq!(found.custom_diff, ["mine"]);
        assert!(found.known.iter().any(|k| k == "kdiff3"));
    }

    /// A tool that writes what it was given next to the repository.
    fn logging_tool(d: &Path) -> std::path::PathBuf {
        let log = d.join(".git").join("tool.log");
        let cmd = format!(
            "echo \"$(basename \"$LOCAL\") $(cat \"$REMOTE\")\" >> '{}'",
            log.display()
        );
        git_run(d, &["config", "difftool.log.cmd", &cmd]);
        log
    }

    #[test]
    fn difftool_runs_the_tool_on_a_commit_or_the_working_tree() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "one", "first");
        commit_file(d.path(), "a.txt", "two", "second");
        std::fs::write(d.path().join("a.txt"), "three").unwrap();
        let log = logging_tool(d.path());
        let first = git_run(d.path(), &["rev-parse", "HEAD~1"]).trim().to_string();
        let file = Some("a.txt".to_string());
        let commit = DiffTarget::Commit {
            id: "HEAD".into(),
            file: file.clone(),
        };
        assert_eq!(difftool(p, &commit, Some("log")).unwrap().status, OpStatus::Ok);
        let root = DiffTarget::Commit {
            id: first,
            file: file.clone(),
        };
        assert_eq!(difftool(p, &root, Some("log")).unwrap().status, OpStatus::Ok);
        let work = DiffTarget::Worktree { staged: false, file };
        assert_eq!(difftool(p, &work, Some("log")).unwrap().status, OpStatus::Ok);
        let seen = std::fs::read_to_string(&log).unwrap();
        let remotes: Vec<_> = seen.lines().map(|l| l.rsplit(' ').next().unwrap()).collect();
        assert_eq!(remotes, ["two", "one", "three"], "{seen}");
        assert!(difftool(
            p,
            &DiffTarget::Commit {
                id: "-x".into(),
                file: None
            },
            Some("log")
        )
        .is_err());
    }

    #[test]
    fn mergetool_resolves_the_file_with_the_tool() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "base\n", "base");
        commit_file(d.path(), "b.txt", "base\n", "base b");
        create_branch(p, "feature", None, true).unwrap();
        std::fs::write(d.path().join("b.txt"), "feature\n").unwrap();
        commit_file(d.path(), "a.txt", "feature\n", "feature edit");
        checkout(p, "main").unwrap();
        std::fs::write(d.path().join("b.txt"), "main\n").unwrap();
        commit_file(d.path(), "a.txt", "main\n", "main edit");
        let r = merge(p, "feature", None, MergeMode::Commit, None).unwrap();
        assert_eq!(r.status, OpStatus::Conflict);
        git_run(
            d.path(),
            &["config", "mergetool.theirs.cmd", "cat \"$REMOTE\" > \"$MERGED\""],
        );
        git_run(d.path(), &["config", "mergetool.theirs.trustExitCode", "true"]);
        git_run(d.path(), &["config", "mergetool.keepBackup", "false"]);
        let r = mergetool(p, "a.txt", Some("theirs")).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert_eq!(
            std::fs::read_to_string(d.path().join("a.txt")).unwrap(),
            "feature\n"
        );
        // Only the file asked for: the other one stays in conflict.
        let left = git_run(d.path(), &["diff", "--name-only", "--diff-filter=U"]);
        assert_eq!(left.trim(), "b.txt");

        // A tool that gives up leaves the conflict, and says so.
        git_run(d.path(), &["config", "mergetool.fail.cmd", "false"]);
        git_run(d.path(), &["config", "mergetool.fail.trustExitCode", "true"]);
        assert_eq!(
            mergetool(p, "b.txt", Some("fail")).unwrap().status,
            OpStatus::Failed
        );
        assert!(mergetool(p, "b.txt", Some("nonesuch")).is_err());
    }
}
