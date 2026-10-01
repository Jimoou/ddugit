//! Branch and tag management: rename / delete branches, tags, checking out remote branches.

use git2::BranchType;
use serde::Deserialize;

use super::{git, open, workdir, OpResult, OpStatus, Result};

/// One ref operation; the frontend sends `{ kind, ...fields }`.
#[derive(Debug, Deserialize, Clone, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum RefOp {
    RenameBranch {
        from: String,
        to: String,
    },
    /// Without `force`, git refuses branches that aren't merged (`Unmerged`).
    DeleteBranch {
        name: String,
        force: bool,
    },
    /// Annotated when `message` is non-empty.
    CreateTag {
        name: String,
        at: String,
        message: String,
    },
    DeleteTag {
        name: String,
    },
    /// `origin/feature` → local `feature` tracking it (or switch to it if it exists).
    CheckoutRemote {
        remote_ref: String,
    },
    /// Another repository to fetch from, e.g. the original project in a customer fork.
    AddRemote {
        name: String,
        url: String,
    },
    /// Forget a remote and its remote-tracking branches.
    RemoveRemote {
        name: String,
    },
}

pub fn apply(path: &str, op: &RefOp) -> Result<OpResult> {
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let args: Vec<String> = match op {
        RefOp::RenameBranch { from, to } => vec!["branch".into(), "-m".into(), from.clone(), to.clone()],
        RefOp::DeleteBranch { name, force } => {
            vec![
                "branch".into(),
                if *force { "-D" } else { "-d" }.into(),
                name.clone(),
            ]
        }
        RefOp::CreateTag { name, at, message } if message.trim().is_empty() => {
            vec!["tag".into(), name.clone(), at.clone()]
        }
        RefOp::CreateTag { name, at, message } => {
            vec![
                "tag".into(),
                "-a".into(),
                name.clone(),
                "-m".into(),
                message.trim().into(),
                at.clone(),
            ]
        }
        RefOp::DeleteTag { name } => vec!["tag".into(), "-d".into(), name.clone()],
        RefOp::CheckoutRemote { remote_ref } => {
            let local = remote_ref.split_once('/').map(|(_, b)| b).unwrap_or(remote_ref);
            if repo.find_branch(local, BranchType::Local).is_ok() {
                vec!["checkout".into(), local.into()]
            } else {
                vec!["checkout".into(), "--track".into(), remote_ref.clone()]
            }
        }
        RefOp::AddRemote { name, url } => {
            vec!["remote".into(), "add".into(), name.clone(), url.trim().into()]
        }
        RefOp::RemoveRemote { name } => vec!["remote".into(), "remove".into(), name.clone()],
    };
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let o = git(&dir, &argv)?;
    if !o.ok && o.text.contains("not fully merged") {
        return Ok(OpResult::with(OpStatus::Unmerged, o));
    }
    Ok(o.into())
}

#[cfg(test)]
mod tests {
    use super::super::read::{snapshot, RefKind};
    use super::super::testutil::{commit_file, identity, repo, s};
    use super::super::write::{checkout, create_branch};
    use super::super::{git_ok, OpStatus};
    use super::*;

    fn has(p: &str, kind: RefKind, name: &str) -> bool {
        snapshot(p, 10)
            .unwrap()
            .refs
            .iter()
            .any(|r| r.kind == kind && r.name == name)
    }

    #[test]
    fn rename_and_delete_branch_with_unmerged_guard() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        create_branch(p, "feat", None, true).unwrap();
        commit_file(d.path(), "f.txt", "f", "work");
        checkout(p, "main").unwrap();

        let r = apply(
            p,
            &RefOp::RenameBranch {
                from: "feat".into(),
                to: "feature/x".into(),
            },
        )
        .unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(has(p, RefKind::Local, "feature/x") && !has(p, RefKind::Local, "feat"));

        let del = |force| {
            apply(
                p,
                &RefOp::DeleteBranch {
                    name: "feature/x".into(),
                    force,
                },
            )
            .unwrap()
        };
        assert_eq!(del(false).status, OpStatus::Unmerged);
        assert!(has(p, RefKind::Local, "feature/x"));
        assert_eq!(del(true).status, OpStatus::Ok);
        assert!(!has(p, RefKind::Local, "feature/x"));
    }

    #[test]
    fn lightweight_and_annotated_tags() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        let head = snapshot(p, 1).unwrap().head.target.unwrap();
        let tag = |name: &str, message: &str| {
            apply(
                p,
                &RefOp::CreateTag {
                    name: name.into(),
                    at: head.clone(),
                    message: message.into(),
                },
            )
            .unwrap()
        };
        assert_eq!(tag("v1", "").status, OpStatus::Ok);
        assert_eq!(tag("v2", "release two").status, OpStatus::Ok);
        let out = git_ok(d.path(), &["cat-file", "-t", "v2"]).unwrap();
        assert_eq!(out, "tag"); // annotated tag object
        assert!(has(p, RefKind::Tag, "v1") && has(p, RefKind::Tag, "v2"));

        assert_eq!(
            apply(p, &RefOp::DeleteTag { name: "v1".into() }).unwrap().status,
            OpStatus::Ok
        );
        assert!(!has(p, RefKind::Tag, "v1"));
    }

    #[test]
    fn checkout_remote_creates_tracking_branch_then_reuses_it() {
        let origin = tempfile::tempdir().unwrap();
        git_ok(origin.path(), &["init", "-q", "--bare", "-b", "main"]).unwrap();
        let a = repo();
        git_ok(a.path(), &["remote", "add", "origin", s(origin.path())]).unwrap();
        commit_file(a.path(), "a.txt", "a", "base");
        create_branch(s(a.path()), "topic", None, true).unwrap();
        commit_file(a.path(), "t.txt", "t", "topic work");
        git_ok(a.path(), &["push", "-q", "origin", "main", "topic"]).unwrap();

        let b = tempfile::tempdir().unwrap();
        git_ok(b.path(), &["clone", "-q", s(origin.path()), "."]).unwrap();
        identity(b.path());
        let pb = s(b.path());
        let op = RefOp::CheckoutRemote {
            remote_ref: "origin/topic".into(),
        };
        let r = apply(pb, &op).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let h = snapshot(pb, 10).unwrap().head;
        assert_eq!(h.branch.as_deref(), Some("topic"));
        assert_eq!(h.upstream.as_deref(), Some("origin/topic"));

        checkout(pb, "main").unwrap();
        assert_eq!(apply(pb, &op).unwrap().status, OpStatus::Ok); // existing local reused
        assert_eq!(snapshot(pb, 1).unwrap().head.branch.as_deref(), Some("topic"));
    }

    #[test]
    fn ref_op_json_shape() {
        let op: RefOp = serde_json::from_str(r#"{"kind":"checkoutRemote","remoteRef":"origin/x"}"#).unwrap();
        assert_eq!(
            op,
            RefOp::CheckoutRemote {
                remote_ref: "origin/x".into()
            }
        );
        let op: RefOp = serde_json::from_str(r#"{"kind":"deleteBranch","name":"x","force":true}"#).unwrap();
        assert_eq!(
            op,
            RefOp::DeleteBranch {
                name: "x".into(),
                force: true
            }
        );
    }

    #[test]
    fn add_fetch_and_remove_a_remote() {
        let upstream = repo();
        commit_file(upstream.path(), "a.txt", "a", "upstream work");
        let d = repo();
        commit_file(d.path(), "b.txt", "b", "fork work");
        let p = s(d.path());
        let add = RefOp::AddRemote {
            name: "upstream".into(),
            url: format!(" {} ", s(upstream.path())),
        };
        assert_eq!(apply(p, &add).unwrap().status, OpStatus::Ok);
        assert_eq!(apply(p, &add).unwrap().status, OpStatus::Failed, "duplicate name");
        git_ok(d.path(), &["fetch", "--all"]).unwrap();
        assert!(has(p, RefKind::Remote, "upstream/main"));
        assert!(snapshot(p, 10)
            .unwrap()
            .remotes
            .iter()
            .any(|r| r.name == "upstream"));

        let rm = RefOp::RemoveRemote {
            name: "upstream".into(),
        };
        assert_eq!(apply(p, &rm).unwrap().status, OpStatus::Ok);
        assert!(!has(p, RefKind::Remote, "upstream/main"));
    }
}
