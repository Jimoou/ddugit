//! Tangled pulls and pushes, and what the app does with each. In every one, no local
//! commit may be lost: it ends up on the branch, or the operation stops and says why.

use super::super::read::read_head;
use super::super::testutil::{commit_file, s};
use super::super::{git_ok, open, write, OpStatus};
use super::tests::setup;
use super::{remote, RemoteOp};
use std::path::Path;

/// Commit subjects on HEAD, newest first.
fn subjects(p: &Path) -> Vec<String> {
    git_ok(p, &["log", "--format=%s"])
        .unwrap()
        .lines()
        .map(str::to_string)
        .collect()
}

fn has(p: &Path, subject: &str) -> bool {
    subjects(p).iter().any(|x| x == subject)
}

fn ahead_behind(p: &Path) -> (usize, usize) {
    let h = read_head(&open(s(p)).unwrap());
    (h.ahead, h.behind)
}

fn run(p: &Path, op: RemoteOp) -> super::OpResult {
    remote(s(p), op, |_| {}).unwrap()
}

/// B pushes `subject` on top of the remote.
fn theirs(b: &Path, file: &str, subject: &str) {
    git_ok(b, &["pull", "-q", "--ff-only"]).unwrap();
    commit_file(b, file, subject, subject);
    git_ok(b, &["push", "-q"]).unwrap();
}

#[test]
fn diverged_pull_stops_then_merge_or_rebase_keeps_both_sides() {
    for op in [RemoteOp::PullMerge, RemoteOp::PullRebase] {
        let (_o, a, b) = setup();
        theirs(b.path(), "b.txt", "from b");
        commit_file(a.path(), "a.txt", "a", "from a");
        let before = git_ok(a.path(), &["rev-parse", "HEAD"]).unwrap();

        // Fast-forward only: says diverged and leaves the branch where it was.
        assert_eq!(run(a.path(), RemoteOp::Pull).status, OpStatus::Diverged);
        assert_eq!(git_ok(a.path(), &["rev-parse", "HEAD"]).unwrap(), before);

        let r = run(a.path(), op);
        assert_eq!(r.status, OpStatus::Ok, "{op:?}: {}", r.output);
        assert!(has(a.path(), "from a") && has(a.path(), "from b"), "{op:?}");
        assert_eq!(ahead_behind(a.path()).1, 0, "{op:?}");
        assert_eq!(run(a.path(), RemoteOp::Push).status, OpStatus::Ok, "{op:?}");
    }
}

#[test]
fn rebase_pull_keeps_a_commit_the_remote_dropped() {
    let (_o, a, b) = setup();
    // A pushes a commit, then B rewrites the remote without it.
    commit_file(a.path(), "a1.txt", "a1", "pushed, then overwritten");
    assert_eq!(run(a.path(), RemoteOp::Push).status, OpStatus::Ok);
    git_ok(b.path(), &["pull", "-q"]).unwrap();
    git_ok(b.path(), &["reset", "-q", "--hard", "HEAD~1"]).unwrap();
    commit_file(b.path(), "b.txt", "b", "from b");
    git_ok(b.path(), &["push", "-q", "--force"]).unwrap();
    commit_file(a.path(), "a2.txt", "a2", "never pushed");
    assert_eq!(run(a.path(), RemoteOp::Fetch).status, OpStatus::Ok);

    // `git pull --rebase` drops the first one: it is in origin/main's reflog (`--fork-point`).
    let r = run(a.path(), RemoteOp::PullRebase);
    assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
    assert!(has(a.path(), "pushed, then overwritten") && has(a.path(), "never pushed"));
    assert_eq!(ahead_behind(a.path()), (2, 0));
}

#[test]
fn rebase_pull_skips_only_a_change_the_remote_already_has() {
    let (_o, a, b) = setup();
    git_ok(b.path(), &["pull", "-q"]).unwrap();
    commit_file(b.path(), "same.txt", "same", "same change, upstream");
    git_ok(b.path(), &["push", "-q"]).unwrap();
    commit_file(a.path(), "same.txt", "same", "same change, local");
    commit_file(a.path(), "mine.txt", "mine", "only local");

    let r = run(a.path(), RemoteOp::PullRebase);
    assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
    // The duplicate is left out (the UI says so), the change itself is there, the rest stays.
    assert!(
        r.output.contains("skipped previously applied commit"),
        "{}",
        r.output
    );
    assert!(!has(a.path(), "same change, local") && has(a.path(), "only local"));
    assert_eq!(
        std::fs::read_to_string(a.path().join("same.txt")).unwrap(),
        "same"
    );
}

#[test]
fn a_branch_without_upstream_follows_the_remote_branch_of_its_name() {
    let (_o, a, b) = setup();
    git_ok(b.path(), &["switch", "-q", "-c", "topic"]).unwrap();
    commit_file(b.path(), "t.txt", "t", "topic on the remote");
    git_ok(b.path(), &["push", "-q", "-u", "origin", "topic"]).unwrap();
    // A makes its own `topic` without tracking anything, and commits on it.
    git_ok(a.path(), &["switch", "-q", "-c", "topic"]).unwrap();
    commit_file(a.path(), "mine.txt", "m", "topic here");

    // Before: pull said "push first", and push was refused with "pull first".
    let r = run(a.path(), RemoteOp::Pull);
    assert_eq!(r.status, OpStatus::Diverged, "{}", r.output);
    let h = read_head(&open(s(a.path())).unwrap());
    assert_eq!(h.upstream.as_deref(), Some("origin/topic"));

    let r = run(a.path(), RemoteOp::PullRebase);
    assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
    assert!(has(a.path(), "topic here") && has(a.path(), "topic on the remote"));
    assert_eq!(run(a.path(), RemoteOp::Push).status, OpStatus::Ok);
}

#[test]
fn a_refused_first_push_leaves_the_branch_following_the_remote_one() {
    let (_o, a, b) = setup();
    git_ok(b.path(), &["switch", "-q", "-c", "topic"]).unwrap();
    commit_file(b.path(), "t.txt", "t", "topic on the remote");
    git_ok(b.path(), &["push", "-q", "-u", "origin", "topic"]).unwrap();
    git_ok(a.path(), &["switch", "-q", "-c", "topic"]).unwrap();
    commit_file(a.path(), "mine.txt", "m", "topic here");

    // A hasn't fetched, so it doesn't know `origin/topic`: the push is refused.
    let r = run(a.path(), RemoteOp::Push);
    assert_eq!(r.status, OpStatus::Rejected, "{}", r.output);
    let h = read_head(&open(s(a.path())).unwrap());
    // Now it follows origin/topic, so the merge/rebase dialog can offer a way out.
    assert_eq!(h.upstream.as_deref(), Some("origin/topic"));
    assert_eq!((h.ahead, h.behind), (1, 1));
    assert!(has(a.path(), "topic here"));
}

#[test]
fn a_new_branch_is_still_pushed_and_starts_following() {
    let (_o, a, _b) = setup();
    git_ok(a.path(), &["switch", "-q", "-c", "fresh"]).unwrap();
    commit_file(a.path(), "f.txt", "f", "fresh work");
    // Nothing of that name on the remote: pull has nothing to follow, push creates it.
    assert!(remote(s(a.path()), RemoteOp::Pull, |_| {}).is_err());
    assert_eq!(run(a.path(), RemoteOp::Push).status, OpStatus::Ok);
    let h = read_head(&open(s(a.path())).unwrap());
    assert_eq!(h.upstream.as_deref(), Some("origin/fresh"));
}

#[test]
fn an_upstream_deleted_on_the_remote_is_not_pulled_and_is_pushed_again() {
    let (origin, a, _b) = setup();
    git_ok(a.path(), &["switch", "-q", "-c", "gone"]).unwrap();
    commit_file(a.path(), "g.txt", "g", "on gone");
    assert_eq!(run(a.path(), RemoteOp::Push).status, OpStatus::Ok);
    git_ok(origin.path(), &["branch", "-q", "-D", "gone"]).unwrap();
    git_ok(a.path(), &["fetch", "-q", "--prune"]).unwrap();
    commit_file(a.path(), "g2.txt", "g2", "after it was deleted");

    assert!(remote(s(a.path()), RemoteOp::Pull, |_| {}).is_err());
    assert!(has(a.path(), "on gone") && has(a.path(), "after it was deleted"));
    assert_eq!(run(a.path(), RemoteOp::Push).status, OpStatus::Ok);
    assert_eq!(
        git_ok(origin.path(), &["log", "-1", "--format=%s", "gone"])
            .unwrap()
            .trim(),
        "after it was deleted"
    );
}

#[test]
fn a_pull_never_touches_uncommitted_work() {
    for op in [RemoteOp::PullMerge, RemoteOp::PullRebase] {
        let (_o, a, b) = setup();
        theirs(b.path(), "base.txt", "theirs");
        commit_file(a.path(), "a.txt", "a", "from a");
        // Uncommitted edit to the file the remote changed.
        std::fs::write(a.path().join("base.txt"), "my edit").unwrap();
        let before = git_ok(a.path(), &["rev-parse", "HEAD"]).unwrap();

        let r = run(a.path(), op);
        assert_eq!(r.status, OpStatus::Failed, "{op:?}: {}", r.output);
        assert_eq!(
            git_ok(a.path(), &["rev-parse", "HEAD"]).unwrap(),
            before,
            "{op:?}"
        );
        let edit = std::fs::read_to_string(a.path().join("base.txt")).unwrap();
        assert_eq!(edit, "my edit", "{op:?}");
    }
}

#[test]
fn the_behind_count_waits_for_a_fetch() {
    let (_o, a, b) = setup();
    theirs(b.path(), "b.txt", "from b");
    // What the pull question counted before it fetched first: nothing to pull.
    assert_eq!(ahead_behind(a.path()), (0, 0));
    assert_eq!(run(a.path(), RemoteOp::Fetch).status, OpStatus::Ok);
    assert_eq!(ahead_behind(a.path()), (0, 1));
    assert_eq!(run(a.path(), RemoteOp::Pull).status, OpStatus::Ok);
    assert!(has(a.path(), "from b"));
}

#[test]
fn a_refused_push_then_rebase_pull_then_push_goes_through() {
    let (_o, a, b) = setup();
    theirs(b.path(), "b.txt", "from b");
    commit_file(a.path(), "a.txt", "a", "from a");

    assert_eq!(run(a.path(), RemoteOp::Push).status, OpStatus::Rejected);
    assert_eq!(run(a.path(), RemoteOp::PullRebase).status, OpStatus::Ok);
    assert_eq!(run(a.path(), RemoteOp::Push).status, OpStatus::Ok);
    assert_eq!(ahead_behind(a.path()), (0, 0));
    assert_eq!(
        subjects(a.path())[..2],
        ["from a".to_string(), "from b".to_string()]
    );
}

#[test]
fn an_aborted_conflicting_rebase_pull_puts_everything_back() {
    let (_o, a, b) = setup();
    theirs(b.path(), "base.txt", "theirs");
    commit_file(a.path(), "base.txt", "ours", "edit a");
    let before = git_ok(a.path(), &["rev-parse", "HEAD"]).unwrap();

    assert_eq!(run(a.path(), RemoteOp::PullRebase).status, OpStatus::Conflict);
    assert_eq!(write::abort(s(a.path())).unwrap().status, OpStatus::Ok);
    assert_eq!(git_ok(a.path(), &["rev-parse", "HEAD"]).unwrap(), before);
    assert_eq!(
        std::fs::read_to_string(a.path().join("base.txt")).unwrap(),
        "ours"
    );
}
