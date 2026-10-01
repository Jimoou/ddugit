//! Watch a repository for changes that should refresh the UI: working-tree
//! edits (minus ignored paths) and ref / index / in-progress-operation changes
//! inside `.git` (e.g. a commit or fetch done from a terminal).

use std::path::{Path, PathBuf};
use std::time::Duration;

use git2::Repository;
use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{new_debouncer, DebounceEventResult, Debouncer};

use super::{err, open, workdir, Result};

pub type RepoWatcher = Debouncer<RecommendedWatcher>;

/// `.git` entries whose change means history, refs, the index or the
/// operation state changed. Objects, logs and lock files are noise.
const GIT_SIGNALS: &[&str] = &[
    "HEAD",
    "index",
    "refs",
    "packed-refs",
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
    "logs/refs/stash",
];

/// Whether a change at `path` (absolute) should refresh the UI. `roots` are the
/// workdir as opened and canonicalized: macOS reports `/private/var/...` for a
/// repo opened as `/var/...`.
fn relevant(repo: Option<&Repository>, roots: &[PathBuf], path: &Path) -> bool {
    let Some(rel) = roots.iter().find_map(|r| path.strip_prefix(r).ok()) else {
        return false;
    };
    let mut parts = rel.components();
    if parts.next().is_some_and(|c| c.as_os_str() == ".git") {
        let inner = parts.as_path();
        if inner.extension().is_some_and(|e| e == "lock") {
            return false;
        }
        return GIT_SIGNALS.iter().any(|s| inner.starts_with(s));
    }
    // Build output and other ignored files must not trigger refresh storms.
    !repo.is_some_and(|r| r.is_path_ignored(rel).unwrap_or(false))
}

/// Start watching; `on_change` runs (debounced) on a background thread.
/// Dropping the returned watcher stops it.
pub fn watch(path: &str, on_change: impl Fn() + Send + 'static) -> Result<RepoWatcher> {
    let root: PathBuf = workdir(&open(path)?)?;
    let roots: Vec<PathBuf> = [Some(root.clone()), std::fs::canonicalize(&root).ok()]
        .into_iter()
        .flatten()
        .collect();
    let cb_root = root.clone();
    let mut debouncer = new_debouncer(Duration::from_millis(300), move |res: DebounceEventResult| {
        let Ok(events) = res else { return };
        let repo = Repository::open(&cb_root).ok();
        if events.iter().any(|e| relevant(repo.as_ref(), &roots, &e.path)) {
            on_change();
        }
    })
    .map_err(err)?;
    debouncer
        .watcher()
        .watch(&root, RecursiveMode::Recursive)
        .map_err(err)?;
    Ok(debouncer)
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;
    use std::fs;
    use std::sync::mpsc;

    #[test]
    fn relevance_rules() {
        let d = repo();
        fs::write(d.path().join(".gitignore"), "target/\n").unwrap();
        let r = Repository::open(d.path()).unwrap();
        let root = d.path();
        let roots = [root.to_path_buf()];
        let yes = |p: &str| relevant(Some(&r), &roots, &root.join(p));
        assert!(yes("src/main.rs"));
        assert!(yes(".git/HEAD"));
        assert!(yes(".git/refs/heads/main"));
        assert!(yes(".git/index"));
        assert!(yes(".git/MERGE_HEAD"));
        assert!(!yes(".git/objects/ab/cdef"));
        assert!(!yes(".git/index.lock"));
        assert!(!yes(".git/logs/HEAD"));
        assert!(!yes("target/debug/app"));
        assert!(!relevant(Some(&r), &roots, Path::new("/elsewhere/file")));
    }

    #[test]
    fn editing_a_file_triggers_the_callback() {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "base");
        let (tx, rx) = mpsc::channel();
        let _w = watch(s(d.path()), move || {
            let _ = tx.send(());
        })
        .unwrap();
        // Give the OS watcher a moment to arm before writing.
        std::thread::sleep(Duration::from_millis(300));
        fs::write(d.path().join("a.txt"), "changed").unwrap();
        assert!(
            rx.recv_timeout(Duration::from_secs(10)).is_ok(),
            "no change event within 10s"
        );
    }
}
