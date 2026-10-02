//! Branch housekeeping: which local branches are merged, lost their upstream
//! (deleted on the remote, pruned by fetch) or went quiet, and deleting many
//! at once.

use git2::{BranchType, Repository};
use serde::Serialize;

use super::{err, git, open, workdir, OpResult, OpStatus, Result};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchHealth {
    pub name: String,
    pub tip: String,
    /// Commit time of the tip (seconds).
    pub time: i64,
    /// Everything on it is already in the base branch.
    pub merged: bool,
    /// It tracked a remote branch that no longer exists.
    pub gone: bool,
    pub upstream: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BranchReport {
    /// Branch "merged" is measured against: the remote's default, else main/master, else HEAD's.
    pub base: Option<String>,
    /// Every local branch except the checked-out one and the base.
    pub branches: Vec<BranchHealth>,
}

/// `origin/HEAD`'s local name, else `main` / `master`, else the current branch.
fn base_branch(repo: &Repository) -> Option<String> {
    let has = |n: &str| repo.find_branch(n, BranchType::Local).is_ok();
    if let Ok(r) = repo.find_reference("refs/remotes/origin/HEAD") {
        if let Some(t) = r.symbolic_target() {
            let name = t.trim_start_matches("refs/remotes/origin/");
            if has(name) {
                return Some(name.to_string());
            }
        }
    }
    ["main", "master"]
        .into_iter()
        .find(|n| has(n))
        .map(str::to_string)
        .or_else(|| repo.head().ok()?.shorthand().map(str::to_string))
}

pub fn report(path: &str) -> Result<BranchReport> {
    let repo = open(path)?;
    let base = base_branch(&repo);
    let base_tip = base
        .as_deref()
        .and_then(|b| repo.find_branch(b, BranchType::Local).ok())
        .and_then(|b| b.get().target());
    let current = repo.head().ok().and_then(|h| h.shorthand().map(str::to_string));
    let config = repo.config().map_err(err)?;

    let mut branches = Vec::new();
    for item in repo.branches(Some(BranchType::Local)).map_err(err)? {
        let (b, _) = item.map_err(err)?;
        let Some(name) = b.name().ok().flatten().map(str::to_string) else {
            continue;
        };
        if Some(&name) == current.as_ref() || Some(&name) == base.as_ref() {
            continue;
        }
        let Some(tip) = b.get().target() else { continue };
        let time = repo.find_commit(tip).map_err(err)?.time().seconds();
        let merged =
            base_tip.is_some_and(|bt| bt == tip || repo.graph_descendant_of(bt, tip).unwrap_or(false));
        // Configured to track something, but that remote branch is gone.
        let tracks = config.get_string(&format!("branch.{name}.merge")).is_ok();
        let upstream = b
            .upstream()
            .ok()
            .and_then(|u| u.name().ok().flatten().map(str::to_string));
        branches.push(BranchHealth {
            gone: tracks && upstream.is_none(),
            name,
            tip: tip.to_string(),
            time,
            merged,
            upstream,
        });
    }
    branches.sort_by_key(|b| b.time);
    Ok(BranchReport { base, branches })
}

/// Delete several local branches; `force` also deletes unmerged ones.
pub fn delete_branches(path: &str, names: &[String], force: bool) -> Result<OpResult> {
    for n in names {
        super::operand(n)?;
    }
    if names.is_empty() {
        return Err("No branches selected".into());
    }
    let dir = workdir(&open(path)?)?;
    let mut args = vec!["branch", if force { "-D" } else { "-d" }];
    args.extend(names.iter().map(String::as_str));
    let o = git(&dir, &args)?;
    let status = match () {
        _ if o.ok => OpStatus::Ok,
        _ if o.text.contains("not fully merged") => OpStatus::Unmerged,
        _ => OpStatus::Failed,
    };
    Ok(OpResult::with(status, o))
}

#[cfg(test)]
mod tests {
    use super::super::git_ok;
    use super::super::remote::{remote, RemoteOp};
    use super::super::testutil::{commit_file, identity, repo, s};
    use super::*;

    fn find<'a>(r: &'a BranchReport, name: &str) -> &'a BranchHealth {
        r.branches.iter().find(|b| b.name == name).unwrap()
    }

    #[test]
    fn reports_merged_unmerged_and_gone_branches() {
        let origin = tempfile::tempdir().unwrap();
        git_ok(origin.path(), &["init", "-q", "--bare", "-b", "main"]).unwrap();
        let r = repo();
        git_ok(r.path(), &["remote", "add", "origin", s(origin.path())]).unwrap();
        commit_file(r.path(), "a.txt", "a", "base");
        git_ok(r.path(), &["push", "-q", "-u", "origin", "main"]).unwrap();

        git_ok(r.path(), &["branch", "done"]).unwrap();
        git_ok(r.path(), &["switch", "-q", "-c", "wip"]).unwrap();
        commit_file(r.path(), "w.txt", "w", "wip work");
        git_ok(r.path(), &["push", "-q", "-u", "origin", "wip"]).unwrap();
        git_ok(r.path(), &["switch", "-q", "main"]).unwrap();
        // Someone deletes `wip` on the remote; fetch --prune drops origin/wip.
        let other = tempfile::tempdir().unwrap();
        git_ok(other.path(), &["clone", "-q", s(origin.path()), "."]).unwrap();
        identity(other.path());
        git_ok(other.path(), &["push", "-q", "origin", "--delete", "wip"]).unwrap();
        remote(s(r.path()), RemoteOp::Fetch, |_| {}).unwrap();

        let rep = report(s(r.path())).unwrap();
        assert_eq!(rep.base.as_deref(), Some("main"));
        assert!(rep.branches.iter().all(|b| b.name != "main"));
        let done = find(&rep, "done");
        assert!(done.merged && !done.gone);
        let wip = find(&rep, "wip");
        assert!(!wip.merged && wip.gone && wip.upstream.is_none());
    }

    #[test]
    fn deletes_many_and_refuses_unmerged_without_force() {
        let r = repo();
        commit_file(r.path(), "a.txt", "a", "base");
        git_ok(r.path(), &["branch", "a"]).unwrap();
        git_ok(r.path(), &["branch", "b"]).unwrap();
        git_ok(r.path(), &["switch", "-q", "-c", "c"]).unwrap();
        commit_file(r.path(), "c.txt", "c", "only on c");
        git_ok(r.path(), &["switch", "-q", "main"]).unwrap();

        let ok = delete_branches(s(r.path()), &["a".into(), "b".into()], false).unwrap();
        assert_eq!(ok.status, OpStatus::Ok, "{}", ok.output);
        let no = delete_branches(s(r.path()), &["c".into()], false).unwrap();
        assert_eq!(no.status, OpStatus::Unmerged);
        let forced = delete_branches(s(r.path()), &["c".into()], true).unwrap();
        assert_eq!(forced.status, OpStatus::Ok);
        assert!(report(s(r.path())).unwrap().branches.is_empty());
    }
}
