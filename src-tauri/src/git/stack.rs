//! Stacked branches (Pro): small branches built one on top of another, e.g.
//! `main ← api ← ui ← docs`, each reviewed as its own pull request.
//!
//! Each stacked branch remembers, in the repository's local config, its parent
//! branch and the parent's tip it was last built on (`base`). When the parent
//! moves (new commits, an amend, a squash merge), restacking replays just the
//! branch's own commits (`base..branch`) onto the parent's new tip, bottom up
//! through the whole stack: `git rebase --onto <parent> <base> <branch>`.
//! Keeping `base` instead of using the merge base is what keeps an amended or
//! squash-merged parent's old commits from being replayed again.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::{git, git_ok, in_progress, operand, repo_dir, OpResult, OpStatus, Result};

/// `branch.<name>.ddugit-parent`: git moves and removes `branch.<name>.*` with the branch.
const PARENT: &str = "ddugit-parent";
/// `branch.<name>.ddugit-base`: the parent's tip the branch was last built on.
const BASE: &str = "ddugit-base";

/// One stacked branch, as the sidebar shows it.
#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct StackBranch {
    pub name: String,
    pub parent: String,
    /// The parent branch no longer exists (merged and deleted, renamed elsewhere).
    pub parent_missing: bool,
    /// The parent has moved on: its tip isn't in this branch's history.
    pub behind: bool,
    /// Commits of its own, on top of the parent.
    pub own: usize,
}

/// One stack operation; the frontend sends `{ kind, ...fields }`.
#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum StackOp {
    /// A new branch at `parent`'s tip, stacked on it, checked out.
    Create { name: String, parent: String },
    /// Stack an existing branch on `parent` (or move it to another parent).
    SetParent { branch: String, parent: String },
    /// Take a branch out of its stack; its commits stay.
    Remove { branch: String },
    /// Rebuild the whole stack `branch` belongs to, bottom up.
    Restack { branch: String },
}

fn key(branch: &str, what: &str) -> String {
    format!("branch.{branch}.{what}")
}

fn tip(dir: &Path, rev: &str) -> Option<String> {
    git(
        dir,
        &["rev-parse", "--verify", "--quiet", &format!("{rev}^{{commit}}")],
    )
    .ok()
    .filter(|o| o.ok)
    .map(|o| o.text.trim().to_string())
}

fn local(dir: &Path, branch: &str) -> Option<String> {
    tip(dir, &format!("refs/heads/{branch}"))
}

fn is_ancestor(dir: &Path, a: &str, b: &str) -> bool {
    git(dir, &["merge-base", "--is-ancestor", a, b]).is_ok_and(|o| o.ok)
}

/// Every `branch.<name>.<what>` in the local config, by branch.
fn config_values(dir: &Path, what: &str) -> BTreeMap<String, String> {
    let pattern = format!(r"^branch\..*\.{what}$");
    // `-z`: "key\nvalue\0"; branch names may hold dots, so the key is cut at both ends.
    let Ok(out) = git(dir, &["config", "--local", "-z", "--get-regexp", &pattern]) else {
        return BTreeMap::new();
    };
    out.text
        .split('\0')
        .filter_map(|entry| {
            let (k, v) = entry.trim_start_matches('\n').split_once('\n')?;
            let name = k.strip_prefix("branch.")?.strip_suffix(&format!(".{what}"))?;
            Some((name.to_string(), v.to_string()))
        })
        .collect()
}

/// Stacked branch → parent, for branches that still exist.
fn parents(dir: &Path) -> BTreeMap<String, String> {
    config_values(dir, PARENT)
        .into_iter()
        .filter(|(b, _)| local(dir, b).is_some())
        .collect()
}

pub fn list(path: &str) -> Result<Vec<StackBranch>> {
    let dir = repo_dir(path)?;
    Ok(parents(&dir)
        .into_iter()
        .map(|(name, parent)| {
            let parent_tip = local(&dir, &parent);
            let behind = parent_tip
                .as_deref()
                .is_some_and(|p| !is_ancestor(&dir, p, &format!("refs/heads/{name}")));
            let from = parent_tip.or_else(|| git_ok(&dir, &["config", &key(&name, BASE)]).ok());
            let own = from
                .and_then(|f| {
                    git_ok(
                        &dir,
                        &["rev-list", "--count", &format!("{}..refs/heads/{name}", f.trim())],
                    )
                    .ok()
                })
                .and_then(|n| n.trim().parse().ok())
                .unwrap_or(0);
            StackBranch {
                parent_missing: local(&dir, &parent).is_none(),
                name,
                parent,
                behind,
                own,
            }
        })
        .collect())
}

fn set(dir: &Path, branch: &str, what: &str, value: &str) -> Result<()> {
    git_ok(dir, &["config", "--local", &key(branch, what), value]).map(|_| ())
}

/// Bottom-up order of the stack `branch` is in: its root (the lowest stacked
/// branch, whose parent isn't stacked) first, then each branch after its parent.
fn stack_of(all: &BTreeMap<String, String>, branch: &str) -> Vec<String> {
    let mut root = branch.to_string();
    let mut seen = vec![root.clone()];
    while let Some(p) = all
        .get(&root)
        .filter(|p| all.contains_key(*p) && !seen.contains(p))
    {
        root = p.clone();
        seen.push(root.clone());
    }
    let mut order = vec![root];
    let mut i = 0;
    while i < order.len() {
        let kids: Vec<String> = all
            .iter()
            .filter(|(b, p)| **p == order[i] && !order.contains(b))
            .map(|(b, _)| b.clone())
            .collect();
        order.extend(kids);
        i += 1;
    }
    order
}

pub fn apply(path: &str, op: &StackOp) -> Result<OpResult> {
    let dir = repo_dir(path)?;
    let ok = |text: String| OpResult {
        status: OpStatus::Ok,
        output: text,
    };
    match op {
        StackOp::Create { name, parent } => {
            let (name, parent) = (operand(name.trim())?, operand(parent.trim())?);
            let at = local(&dir, parent).ok_or_else(|| format!("No local branch '{parent}'"))?;
            if local(&dir, name).is_some() {
                return Err(format!("Branch '{name}' already exists"));
            }
            let o = git(&dir, &["checkout", "-b", name, parent])?;
            if !o.ok {
                return Ok(o.into());
            }
            set(&dir, name, PARENT, parent)?;
            set(&dir, name, BASE, &at)?;
            Ok(ok(o.text))
        }
        StackOp::SetParent { branch, parent } => {
            let (branch, parent) = (operand(branch.trim())?, operand(parent.trim())?);
            let head = local(&dir, branch).ok_or_else(|| format!("No local branch '{branch}'"))?;
            let parent_tip = local(&dir, parent).ok_or_else(|| format!("No local branch '{parent}'"))?;
            // Refuse a loop: the new parent sitting on top of this branch.
            let mut all = parents(&dir);
            all.insert(branch.to_string(), parent.to_string());
            let mut at = parent.to_string();
            for _ in 0..all.len() {
                if at == branch {
                    return Err(format!("'{parent}' is stacked on '{branch}'"));
                }
                match all.get(&at) {
                    Some(p) => at = p.clone(),
                    None => break,
                }
            }
            // Moving off a vanished (say, squash-merged) parent keeps the old base, so
            // only the branch's own commits are replayed; otherwise start from the fork point.
            let kept = git_ok(&dir, &["config", &key(branch, BASE)])
                .ok()
                .map(|b| b.trim().to_string())
                .filter(|b| is_ancestor(&dir, b, &head));
            let base = match kept {
                Some(b) => b,
                None => git_ok(&dir, &["merge-base", &parent_tip, &head])?
                    .trim()
                    .to_string(),
            };
            set(&dir, branch, PARENT, parent)?;
            set(&dir, branch, BASE, &base)?;
            Ok(ok(String::new()))
        }
        StackOp::Remove { branch } => {
            let branch = operand(branch.trim())?;
            for what in [PARENT, BASE] {
                // Exit 5: the key wasn't set, which is fine.
                git(&dir, &["config", "--local", "--unset-all", &key(branch, what)])?;
            }
            Ok(ok(String::new()))
        }
        StackOp::Restack { branch } => restack(path, &dir, operand(branch.trim())?),
    }
}

fn restack(path: &str, dir: &Path, branch: &str) -> Result<OpResult> {
    if in_progress(path) {
        return Err("Finish or abort the operation in progress first".into());
    }
    let dirty = git_ok(dir, &["status", "--porcelain", "--untracked-files=no"])?;
    if !dirty.trim().is_empty() {
        return Err("Commit or stash your changes before restacking".into());
    }
    let all = parents(dir);
    if !all.contains_key(branch) {
        return Err(format!("'{branch}' isn't stacked"));
    }
    let back = git_ok(dir, &["symbolic-ref", "--quiet", "--short", "HEAD"]).ok();
    let mut log = String::new();
    let mut moved = 0;
    for b in stack_of(&all, branch) {
        let parent = &all[&b];
        let Some(parent_tip) = local(dir, parent) else {
            return Err(format!(
                "'{b}' sits on '{parent}', which no longer exists: pick a new parent"
            ));
        };
        let head = format!("refs/heads/{b}");
        if !is_ancestor(dir, &parent_tip, &head) {
            let base = git_ok(dir, &["config", &key(&b, BASE)])
                .ok()
                .map(|s| s.trim().to_string())
                .filter(|s| is_ancestor(dir, s, &head));
            let base = match base {
                Some(s) => s,
                None => git_ok(dir, &["merge-base", &parent_tip, &head])?
                    .trim()
                    .to_string(),
            };
            let o = git(dir, &["rebase", "--onto", &parent_tip, &base, &b])?;
            log.push_str(&o.text);
            if !o.ok {
                // Stopped on conflicts: once resolved, restacking again goes on from here
                // (this branch then already sits on its parent).
                return Ok(super::write::conflict_aware(path, o));
            }
            moved += 1;
        }
        set(dir, &b, BASE, &parent_tip)?;
    }
    if let Some(back) = back {
        git_ok(dir, &["checkout", "--quiet", back.trim()])?;
    }
    Ok(OpResult {
        status: OpStatus::Ok,
        output: if moved == 0 {
            "Already up to date".into()
        } else {
            log
        },
    })
}

/// After `git branch -m from to`: branches stacked on `from` now sit on `to`.
pub(super) fn renamed(dir: &Path, from: &str, to: &str) {
    for (b, p) in config_values(dir, PARENT) {
        if p == from {
            let _ = set(dir, &b, PARENT, to);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;

    fn run(p: &Path, op: StackOp) -> OpResult {
        let r = apply(s(p), &op).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        r
    }

    fn log(p: &Path, range: &str) -> Vec<String> {
        git_ok(p, &["log", "--format=%s", range])
            .unwrap()
            .lines()
            .map(String::from)
            .collect()
    }

    fn create(p: &Path, name: &str, parent: &str) {
        run(
            p,
            StackOp::Create {
                name: name.into(),
                parent: parent.into(),
            },
        );
    }

    #[test]
    fn restacking_replays_only_each_branchs_own_commits_after_an_amend() {
        let d = repo();
        let p = d.path();
        commit_file(p, "base.txt", "0", "base");
        create(p, "api", "main");
        commit_file(p, "api.txt", "1", "api");
        create(p, "ui", "api");
        commit_file(p, "ui.txt", "1", "ui");
        create(p, "docs", "ui");
        commit_file(p, "docs.txt", "1", "docs");

        let listed = list(s(p)).unwrap();
        assert_eq!(listed.len(), 3);
        assert!(listed
            .iter()
            .all(|b| !b.behind && b.own == 1 && !b.parent_missing));

        // Rewrite the bottom of the stack: everything above it falls behind.
        git_ok(p, &["checkout", "-q", "api"]).unwrap();
        std::fs::write(p.join("api.txt"), "2").unwrap();
        git_ok(p, &["commit", "-qam", "api, amended", "--amend"]).unwrap();
        git_ok(p, &["checkout", "-q", "docs"]).unwrap();
        let behind: Vec<String> = list(s(p))
            .unwrap()
            .into_iter()
            .filter(|b| b.behind)
            .map(|b| b.name)
            .collect();
        assert_eq!(behind, vec!["ui".to_string()]);

        // Restacking from anywhere in the stack rebuilds all of it, and comes back.
        run(p, StackOp::Restack { branch: "ui".into() });
        assert_eq!(log(p, "main..docs"), vec!["docs", "ui", "api, amended"]);
        assert_eq!(
            git_ok(p, &["symbolic-ref", "--short", "HEAD"]).unwrap().trim(),
            "docs"
        );
        assert!(list(s(p)).unwrap().iter().all(|b| !b.behind));
        assert_eq!(
            run(
                p,
                StackOp::Restack {
                    branch: "docs".into()
                }
            )
            .output,
            "Already up to date"
        );
    }

    #[test]
    fn a_squash_merged_parent_hands_its_children_to_main() {
        let d = repo();
        let p = d.path();
        commit_file(p, "base.txt", "0", "base");
        create(p, "api", "main");
        commit_file(p, "api.txt", "1", "api 1");
        commit_file(p, "api.txt", "2", "api 2");
        create(p, "ui", "api");
        commit_file(p, "ui.txt", "1", "ui");

        // api lands on main as one squashed commit and is deleted.
        git_ok(p, &["checkout", "-q", "main"]).unwrap();
        git_ok(p, &["merge", "-q", "--squash", "api"]).unwrap();
        git_ok(p, &["commit", "-qm", "api (squashed)"]).unwrap();
        git_ok(p, &["branch", "-qD", "api"]).unwrap();
        assert!(list(s(p)).unwrap()[0].parent_missing);
        assert!(apply(s(p), &StackOp::Restack { branch: "ui".into() }).is_err());

        run(
            p,
            StackOp::SetParent {
                branch: "ui".into(),
                parent: "main".into(),
            },
        );
        run(p, StackOp::Restack { branch: "ui".into() });
        // Only ui's own commit is replayed: api's old commits don't come back.
        assert_eq!(log(p, "main..ui"), vec!["ui"]);
    }

    #[test]
    fn loops_are_refused_and_renames_follow() {
        let d = repo();
        let p = d.path();
        commit_file(p, "base.txt", "0", "base");
        create(p, "api", "main");
        create(p, "ui", "api");
        let looped = apply(
            s(p),
            &StackOp::SetParent {
                branch: "api".into(),
                parent: "ui".into(),
            },
        );
        assert!(looped.is_err());

        super::super::refs::apply(
            s(p),
            &super::super::refs::RefOp::RenameBranch {
                from: "api".into(),
                to: "server".into(),
            },
        )
        .unwrap();
        let ui = list(s(p)).unwrap().into_iter().find(|b| b.name == "ui").unwrap();
        assert_eq!(ui.parent, "server");

        run(p, StackOp::Remove { branch: "ui".into() });
        assert!(list(s(p)).unwrap().iter().all(|b| b.name != "ui"));
    }
}
