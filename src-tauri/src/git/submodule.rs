//! Submodules: other repositories pinned at a commit inside this one. Their
//! state is read with libgit2; bringing them in line goes through git.

use git2::{Repository, SubmoduleIgnore, SubmoduleStatus};
use serde::{Deserialize, Serialize};

use super::remote::is_auth_failure;
use super::{git, open, operand, workdir, OpResult, OpStatus, Result};

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SubmoduleState {
    /// Not checked out yet (fresh clone without `--recursive`).
    Uninitialized,
    /// At the commit this repository records.
    Clean,
    /// Checked out at another commit than the recorded one.
    Moved,
    /// Has changes of its own (edited or untracked files inside).
    Dirty,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubmoduleInfo {
    pub name: String,
    /// Relative to the working tree root.
    pub path: String,
    pub url: Option<String>,
    /// The commit this repository pins it at.
    pub recorded: Option<String>,
    /// The commit checked out in its folder.
    pub checked_out: Option<String>,
    pub state: SubmoduleState,
}

#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum SubmoduleOp {
    /// Check out the recorded commits (initializing first, nested ones too);
    /// one submodule when `path` is given, all otherwise.
    Update { path: Option<String> },
    /// Copy the URLs from `.gitmodules` into the config (after a URL changed upstream).
    Sync,
}

fn state(s: SubmoduleStatus) -> SubmoduleState {
    if s.contains(SubmoduleStatus::WD_UNINITIALIZED) || !s.contains(SubmoduleStatus::IN_WD) {
        SubmoduleState::Uninitialized
    } else if s.contains(SubmoduleStatus::WD_MODIFIED) {
        SubmoduleState::Moved
    } else if s.intersects(
        SubmoduleStatus::WD_INDEX_MODIFIED | SubmoduleStatus::WD_WD_MODIFIED | SubmoduleStatus::WD_UNTRACKED,
    ) {
        SubmoduleState::Dirty
    } else {
        SubmoduleState::Clean
    }
}

pub(super) fn list(repo: &Repository) -> Vec<SubmoduleInfo> {
    let Ok(subs) = repo.submodules() else {
        return Vec::new();
    };
    let mut out: Vec<SubmoduleInfo> = subs
        .iter()
        .filter_map(|sm| {
            let name = sm.name()?.to_string();
            let status = repo.submodule_status(&name, SubmoduleIgnore::None).ok()?;
            Some(SubmoduleInfo {
                path: sm.path().to_string_lossy().replace('\\', "/"),
                url: sm.url().map(str::to_string),
                recorded: sm.index_id().or(sm.head_id()).map(|o| o.to_string()),
                checked_out: sm.workdir_id().map(|o| o.to_string()),
                state: state(status),
                name,
            })
        })
        .collect();
    out.sort_by(|a, b| a.path.cmp(&b.path));
    out
}

pub fn apply(path: &str, op: &SubmoduleOp) -> Result<OpResult> {
    let dir = workdir(&open(path)?)?;
    // Checkouts in submodules run their hooks, so the path is spelled literal (see `LITERAL`).
    let spec = match op {
        SubmoduleOp::Update { path: Some(p) } => Some(super::literal(operand(p)?)),
        _ => None,
    };
    let mut args = vec!["submodule"];
    match op {
        SubmoduleOp::Update { .. } => {
            args.extend(["update", "--init", "--recursive"]);
            if let Some(p) = &spec {
                args.extend(["--", p.as_str()]);
            }
        }
        SubmoduleOp::Sync => args.extend(["sync", "--recursive"]),
    }
    let o = git(&dir, &args)?;
    if !o.ok && is_auth_failure(&o.text) {
        return Ok(OpResult::with(OpStatus::Auth, o));
    }
    Ok(o.into())
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, identity, repo, s};
    use super::super::{git_ok, read::snapshot};
    use super::*;
    use std::path::Path;

    fn subs(p: &Path) -> Vec<SubmoduleInfo> {
        snapshot(s(p), 10).unwrap().submodules
    }

    #[test]
    fn reads_and_updates_submodules() {
        let lib = repo();
        commit_file(lib.path(), "lib.txt", "1", "lib one");
        let app = repo();
        commit_file(app.path(), "app.txt", "a", "app");
        git_ok(app.path(), &["submodule", "add", "-q", s(lib.path()), "libs/lib"]).unwrap();
        git_ok(app.path(), &["commit", "-qm", "add lib"]).unwrap();
        assert_eq!(subs(app.path())[0].state, SubmoduleState::Clean);

        // A clone without --recursive: there, but not checked out.
        let parent = tempfile::tempdir().unwrap();
        let clone = parent.path().join("app");
        git_ok(parent.path(), &["clone", "-q", s(app.path()), s(&clone)]).unwrap();
        identity(&clone);
        let [sm] = <[SubmoduleInfo; 1]>::try_from(subs(&clone)).unwrap();
        assert_eq!(sm.path, "libs/lib");
        assert_eq!(sm.state, SubmoduleState::Uninitialized);
        assert!(sm.recorded.is_some() && sm.checked_out.is_none());

        let up = |p: Option<&str>| {
            apply(
                s(&clone),
                &SubmoduleOp::Update {
                    path: p.map(String::from),
                },
            )
            .unwrap()
        };
        assert_eq!(up(Some("libs/lib")).status, OpStatus::Ok, "{}", up(None).output);
        let sm = &subs(&clone)[0];
        assert_eq!(sm.state, SubmoduleState::Clean);
        assert_eq!(sm.checked_out, sm.recorded);

        // Moved to another commit inside, then edited.
        commit_file(lib.path(), "lib.txt", "2", "lib two");
        let inner = clone.join("libs/lib");
        git_ok(&inner, &["pull", "-q", "origin", "main"]).unwrap();
        assert_eq!(subs(&clone)[0].state, SubmoduleState::Moved);
        // Back to the recorded commit, then a local edit.
        assert_eq!(up(None).status, OpStatus::Ok);
        std::fs::write(inner.join("lib.txt"), "edited").unwrap();
        assert_eq!(subs(&clone)[0].state, SubmoduleState::Dirty);

        assert_eq!(apply(s(&clone), &SubmoduleOp::Sync).unwrap().status, OpStatus::Ok);
        assert!(apply(
            s(&clone),
            &SubmoduleOp::Update {
                path: Some("--force".into())
            }
        )
        .is_err());
    }
}
