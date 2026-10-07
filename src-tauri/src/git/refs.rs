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
    /// With `name`, a new local branch of that name instead (when `feature` is
    /// already taken by another line of work, e.g. `upstream/main` next to `main`).
    CheckoutRemote {
        remote_ref: String,
        #[serde(default)]
        name: Option<String>,
    },
    /// Another repository to fetch from, e.g. the original project in a customer fork.
    /// `fetch_only`: never push there (its push URL is disabled).
    AddRemote {
        name: String,
        url: String,
        #[serde(default)]
        fetch_only: bool,
    },
    /// Allow or stop pushing to a remote (fetching is unaffected).
    SetPushable {
        name: String,
        pushable: bool,
    },
    /// Forget a remote and its remote-tracking branches.
    RemoveRemote {
        name: String,
    },
    /// Rename a remote; git moves its remote-tracking branches and the branches following them.
    RenameRemote {
        from: String,
        to: String,
    },
    /// Fetch from another URL. A fetch-only remote stays fetch-only (its push URL is separate).
    SetRemoteUrl {
        name: String,
        url: String,
    },
    /// Make `branch` follow remote branch `upstream` (`origin/main`), or nothing (`None`).
    SetUpstream {
        branch: String,
        #[serde(default)]
        upstream: Option<String>,
    },
    /// Move a branch that isn't checked out up to its upstream, only as a fast-forward
    /// (`Diverged` when both have their own commits).
    FastForward {
        branch: String,
    },
}

pub fn apply(path: &str, op: &RefOp) -> Result<OpResult> {
    let names: Vec<&String> = match op {
        RefOp::RenameBranch { from, to } => vec![from, to],
        RefOp::DeleteBranch { name, .. } | RefOp::DeleteTag { name } | RefOp::RemoveRemote { name } => {
            vec![name]
        }
        RefOp::CreateTag { name, at, .. } => vec![name, at],
        RefOp::CheckoutRemote { remote_ref, name } => {
            [Some(remote_ref), name.as_ref()].into_iter().flatten().collect()
        }
        RefOp::AddRemote { name, url, .. } | RefOp::SetRemoteUrl { name, url } => vec![name, url],
        RefOp::SetPushable { name, .. } | RefOp::FastForward { branch: name } => vec![name],
        RefOp::RenameRemote { from, to } => vec![from, to],
        RefOp::SetUpstream { branch, upstream } => {
            [Some(branch), upstream.as_ref()].into_iter().flatten().collect()
        }
    };
    for n in names {
        super::operand(n.trim())?;
    }
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
        RefOp::CheckoutRemote {
            remote_ref,
            name: Some(name),
        } => {
            if repo.find_branch(name.trim(), BranchType::Local).is_ok() {
                return Err(format!("Branch '{}' already exists", name.trim()));
            }
            vec![
                "checkout".into(),
                "-b".into(),
                name.trim().into(),
                "--track".into(),
                remote_ref.clone(),
                "--".into(),
            ]
        }
        RefOp::CheckoutRemote {
            remote_ref,
            name: None,
        } => {
            let local = remote_ref.split_once('/').map(|(_, b)| b).unwrap_or(remote_ref);
            if repo.find_branch(local, BranchType::Local).is_ok() {
                vec!["checkout".into(), local.into(), "--".into()]
            } else {
                vec![
                    "checkout".into(),
                    "--track".into(),
                    remote_ref.clone(),
                    "--".into(),
                ]
            }
        }
        RefOp::AddRemote { name, url, .. } => {
            vec!["remote".into(), "add".into(), name.clone(), url.trim().into()]
        }
        RefOp::SetPushable {
            name,
            pushable: false,
        } => vec![
            "remote".into(),
            "set-url".into(),
            "--push".into(),
            name.clone(),
            super::NO_PUSH.into(),
        ],
        RefOp::SetPushable { name, pushable: true } => {
            vec![
                "config".into(),
                "--unset-all".into(),
                format!("remote.{name}.pushurl"),
            ]
        }
        RefOp::RemoveRemote { name } => vec!["remote".into(), "remove".into(), name.clone()],
        RefOp::RenameRemote { from, to } => {
            vec!["remote".into(), "rename".into(), from.clone(), to.trim().into()]
        }
        RefOp::SetRemoteUrl { name, url } => {
            if url.trim().is_empty() {
                return Err("Enter the remote's URL".into());
            }
            vec!["remote".into(), "set-url".into(), name.clone(), url.trim().into()]
        }
        // A full ref name: `origin/x` could also be read as a local branch of that name.
        RefOp::SetUpstream {
            branch,
            upstream: Some(up),
        } => vec![
            "branch".into(),
            format!("--set-upstream-to=refs/remotes/{}", up.trim()),
            branch.clone(),
        ],
        RefOp::SetUpstream {
            branch,
            upstream: None,
        } => {
            vec!["branch".into(), "--unset-upstream".into(), branch.clone()]
        }
        RefOp::FastForward { branch } => match fast_forward_args(&repo, branch)? {
            Ok(args) => args,
            Err(done) => return Ok(done),
        },
    };
    // A remote with a push URL of its own would go on pushing to the old place: move it too
    // (a fetch-only remote's placeholder stays).
    let own_push = match op {
        RefOp::SetRemoteUrl { name, .. } => repo
            .find_remote(name)
            .ok()
            .and_then(|r| r.pushurl().map(String::from))
            .filter(|p| p != super::NO_PUSH),
        _ => None,
    };
    let argv: Vec<&str> = args.iter().map(String::as_str).collect();
    let o = git(&dir, &argv)?;
    if let (RefOp::SetRemoteUrl { name, url }, Some(_), true) = (op, &own_push, o.ok) {
        return Ok(git(&dir, &["remote", "set-url", "--push", name, url.trim()])?.into());
    }
    if let (RefOp::RenameBranch { from, to }, true) = (op, o.ok) {
        super::stack::renamed(&dir, from, to);
    }
    if let RefOp::AddRemote {
        name,
        fetch_only: true,
        ..
    } = op
    {
        if o.ok {
            return apply(
                path,
                &RefOp::SetPushable {
                    name: name.clone(),
                    pushable: false,
                },
            );
        }
    }
    if !o.ok && o.text.contains("not fully merged") {
        return Ok(OpResult::with(OpStatus::Unmerged, o));
    }
    // Moved on the upstream between the check and the fetch: still not a fast-forward.
    if !o.ok && matches!(op, RefOp::FastForward { .. }) && o.text.contains("[rejected]") {
        return Ok(OpResult::with(OpStatus::Diverged, o));
    }
    Ok(o.into())
}

/// `git fetch . <upstream>:refs/heads/<branch>`: a local fetch that refuses anything but a
/// fast-forward, and refuses a branch checked out here or in another worktree. Answers
/// right away (`Err`) when there's nothing to do or the two have gone apart.
fn fast_forward_args(
    repo: &git2::Repository,
    branch: &str,
) -> Result<std::result::Result<Vec<String>, OpResult>> {
    let full = format!("refs/heads/{branch}");
    let tip = repo
        .refname_to_id(&full)
        .map_err(|_| format!("Branch '{branch}' not found"))?;
    if repo
        .head()
        .ok()
        .and_then(|h| h.name().map(str::to_string))
        .as_deref()
        == Some(full.as_str())
    {
        return Err(format!("'{branch}' is checked out; pull it instead"));
    }
    let up = repo
        .branch_upstream_name(&full)
        .ok()
        .and_then(|b| b.as_str().map(str::to_string))
        .ok_or_else(|| format!("'{branch}' follows no upstream branch"))?;
    let there = repo
        .refname_to_id(&up)
        .map_err(|_| format!("{up} is gone; fetch first"))?;
    let say = |status, output: &str| {
        Err(OpResult {
            status,
            output: output.into(),
        })
    };
    if there == tip || repo.graph_descendant_of(tip, there).unwrap_or(false) {
        return Ok(say(OpStatus::Ok, "Already up to date."));
    }
    if !repo.graph_descendant_of(there, tip).unwrap_or(false) {
        return Ok(say(
            OpStatus::Diverged,
            &format!("'{branch}' and {up} each have their own commits: not a fast-forward"),
        ));
    }
    Ok(Ok(vec!["fetch".into(), ".".into(), format!("{up}:{full}")]))
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
            name: None,
        };
        let r = apply(pb, &op).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let h = snapshot(pb, 10).unwrap().head;
        assert_eq!(h.branch.as_deref(), Some("topic"));
        assert_eq!(h.upstream.as_deref(), Some("origin/topic"));

        checkout(pb, "main").unwrap();
        assert_eq!(apply(pb, &op).unwrap().status, OpStatus::Ok); // existing local reused
        assert_eq!(snapshot(pb, 1).unwrap().head.branch.as_deref(), Some("topic"));

        // `main` is taken: the remote's main as a branch of another name, tracking it.
        let named = |name: &str| RefOp::CheckoutRemote {
            remote_ref: "origin/main".into(),
            name: Some(name.into()),
        };
        let r = apply(pb, &named("origin-main")).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let h = snapshot(pb, 1).unwrap().head;
        assert_eq!(h.branch.as_deref(), Some("origin-main"));
        assert_eq!(h.upstream.as_deref(), Some("origin/main"));
        assert!(apply(pb, &named("main")).is_err(), "an existing name is refused");
        assert!(apply(pb, &named("-f")).is_err());
    }

    #[test]
    fn ref_op_json_shape() {
        let op: RefOp = serde_json::from_str(r#"{"kind":"checkoutRemote","remoteRef":"origin/x"}"#).unwrap();
        assert_eq!(
            op,
            RefOp::CheckoutRemote {
                remote_ref: "origin/x".into(),
                name: None
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
            fetch_only: false,
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

    fn tracking_of(p: &str, branch: &str) -> Option<super::super::read::Tracking> {
        let refs = snapshot(p, 10).unwrap().refs;
        refs.into_iter()
            .find(|r| r.kind == RefKind::Local && r.name == branch)
            .unwrap()
            .upstream
    }

    #[test]
    fn tracks_untracks_and_fast_forwards_a_branch_not_checked_out() {
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
        git_ok(b.path(), &["branch", "-q", "--no-track", "topic", "origin/topic"]).unwrap();
        assert_eq!(tracking_of(pb, "topic"), None);
        let track = |branch: &str, up: Option<&str>| {
            apply(
                pb,
                &RefOp::SetUpstream {
                    branch: branch.into(),
                    upstream: up.map(str::to_string),
                },
            )
        };
        let r = track("topic", Some("origin/topic")).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let t = tracking_of(pb, "topic").unwrap();
        assert_eq!(
            (t.name.as_str(), t.ahead, t.behind, t.gone),
            ("origin/topic", 0, 0, false)
        );

        // A pushes more to topic; B, on main, brings its topic up without checking it out.
        commit_file(a.path(), "t2.txt", "t2", "more topic work");
        git_ok(a.path(), &["push", "-q", "origin", "topic"]).unwrap();
        git_ok(b.path(), &["fetch", "-q"]).unwrap();
        assert_eq!(tracking_of(pb, "topic").unwrap().behind, 1);
        let ff = |branch: &str| {
            apply(
                pb,
                &RefOp::FastForward {
                    branch: branch.into(),
                },
            )
        };
        let r = ff("topic").unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let rev = |r: &str| git_ok(b.path(), &["rev-parse", r]).unwrap();
        assert_eq!(rev("topic"), rev("origin/topic"));
        assert_eq!(ff("topic").unwrap().status, OpStatus::Ok, "already there");
        assert_eq!(snapshot(pb, 1).unwrap().head.branch.as_deref(), Some("main"));

        // Both sides move on: no fast-forward, and topic stays where it was.
        git_ok(b.path(), &["checkout", "-q", "topic"]).unwrap();
        commit_file(b.path(), "b.txt", "b", "b's own");
        checkout(pb, "main").unwrap();
        commit_file(a.path(), "t3.txt", "t3", "a's own");
        git_ok(a.path(), &["push", "-q", "origin", "topic"]).unwrap();
        git_ok(b.path(), &["fetch", "-q"]).unwrap();
        let before = rev("topic");
        let t = tracking_of(pb, "topic").unwrap();
        assert_eq!((t.ahead, t.behind), (1, 1));
        assert_eq!(ff("topic").unwrap().status, OpStatus::Diverged);
        assert_eq!(rev("topic"), before);
        assert!(ff("main").is_err(), "the checked-out branch is pulled instead");
        assert!(ff("nope").is_err());

        // Stop tracking; then nothing to fast-forward to. Odd names are refused.
        assert_eq!(track("topic", None).unwrap().status, OpStatus::Ok);
        assert_eq!(tracking_of(pb, "topic"), None);
        assert!(ff("topic").is_err());
        assert!(track("-x", Some("origin/topic")).is_err());
        assert!(track("topic", Some("--all")).is_err());
        assert_eq!(
            track("topic", Some("origin/nope")).unwrap().status,
            OpStatus::Failed
        );

        // A followed branch deleted on the remote shows as gone.
        track("topic", Some("origin/topic")).unwrap();
        git_ok(b.path(), &["update-ref", "-d", "refs/remotes/origin/topic"]).unwrap();
        assert!(tracking_of(pb, "topic").unwrap().gone);
    }

    #[test]
    fn renames_a_remote_and_changes_its_url_keeping_it_fetch_only() {
        let upstream = repo();
        commit_file(upstream.path(), "a.txt", "a", "upstream work");
        let moved = repo();
        commit_file(moved.path(), "m.txt", "m", "moved work");
        let d = repo();
        commit_file(d.path(), "b.txt", "b", "fork work");
        let p = s(d.path());
        let add = RefOp::AddRemote {
            name: "upstream".into(),
            url: s(upstream.path()).into(),
            fetch_only: true,
        };
        assert_eq!(apply(p, &add).unwrap().status, OpStatus::Ok);
        git_ok(d.path(), &["fetch", "-q", "upstream"]).unwrap();
        git_ok(d.path(), &["branch", "-q", "--track", "up-main", "upstream/main"]).unwrap();

        let rename = RefOp::RenameRemote {
            from: "upstream".into(),
            to: "theirs".into(),
        };
        let r = apply(p, &rename).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(p, 10).unwrap();
        assert_eq!(
            snap.remotes.iter().map(|r| r.name.as_str()).collect::<Vec<_>>(),
            ["theirs"]
        );
        assert!(has(p, RefKind::Remote, "theirs/main") && !has(p, RefKind::Remote, "upstream/main"));
        assert_eq!(tracking_of(p, "up-main").unwrap().name, "theirs/main");
        assert_eq!(
            apply(p, &rename).unwrap().status,
            OpStatus::Failed,
            "no upstream any more"
        );

        let set_url = |url: &str| {
            apply(
                p,
                &RefOp::SetRemoteUrl {
                    name: "theirs".into(),
                    url: url.into(),
                },
            )
        };
        let r = set_url(&format!(" {} ", s(moved.path()))).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let remotes = snapshot(p, 1).unwrap().remotes;
        assert_eq!(remotes[0].url, s(moved.path()));
        assert!(!remotes[0].push, "still fetch-only");
        assert!(set_url("  ").is_err());
        assert!(set_url("--upload-pack=x").is_err());
        // A push URL of its own moves with it.
        git_ok(d.path(), &["remote", "set-url", "--push", "theirs", "/old/push"]).unwrap();
        set_url("/new/place").unwrap();
        let push = git_ok(d.path(), &["remote", "get-url", "--push", "theirs"]).unwrap();
        assert_eq!(push, "/new/place");
    }
}
