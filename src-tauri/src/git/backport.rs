//! Backport tracking between two lines of history, e.g. the original project's
//! `upstream/main` and a customer fork's `main` (the fork adds the original as a
//! remote). Lists the commits of `source` the `target` does not have yet,
//! recognising earlier ports by patch id (`--cherry-mark`) and by the
//! `(cherry picked from commit …)` trailer `-x` leaves, so a port that needed
//! conflict fixes still counts. Commits that do not apply to the fork can be
//! ignored; the choice lives in the repository's local config.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::Serialize;

use super::write::{conflict_aware, prepare_on};
use super::{git, git_ok, repo_dir, OpResult, Result};

/// Commits listed at most; older ones need a narrower `source`.
const MAX_ITEMS: usize = 1000;
const IGNORE_KEY: &str = "otgit.backportIgnored";
const TRAILER: &str = "(cherry picked from commit ";

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum BackportState {
    /// Not in the target yet.
    Missing,
    /// The target has a commit with the same patch.
    Applied,
    /// The target has a commit carrying this one's `-x` trailer (patch may differ).
    Picked { by: String },
    /// Marked as not needed in the target.
    Ignored,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BackportItem {
    pub id: String,
    pub summary: String,
    pub author: String,
    pub time: i64,
    pub state: BackportState,
}

/// Commits of `source` not reachable from `target`, newest first, each with its
/// backport state. Merge commits are left out: their changes arrive with their
/// parents.
pub fn compare(path: &str, source: &str, target: &str) -> Result<Vec<BackportItem>> {
    let dir = repo_dir(path)?;
    for r in [source, target] {
        git_ok(
            &dir,
            &["rev-parse", "--verify", "--quiet", &format!("{r}^{{commit}}")],
        )
        .map_err(|_| format!("Unknown branch or commit '{r}'"))?;
    }
    let max = format!("--max-count={MAX_ITEMS}");
    let range = format!("{target}...{source}");
    let log = git_ok(
        &dir,
        &[
            "log",
            "--cherry-mark",
            "--right-only",
            "--no-merges",
            &max,
            "--format=%m%x1f%H%x1f%an%x1f%at%x1f%s",
            &range,
        ],
    )?;
    let picked = picked_in(&dir, &format!("{source}..{target}"))?;
    let ignored = ignored(&dir)?;

    Ok(log
        .lines()
        .filter_map(|line| {
            let f: Vec<&str> = line.split('\x1f').collect();
            let [mark, id, author, time, summary] = f[..] else {
                return None;
            };
            let state = if mark == "=" {
                BackportState::Applied
            } else if let Some(by) = picked.get(id) {
                BackportState::Picked { by: by.clone() }
            } else if ignored.contains(id) {
                BackportState::Ignored
            } else {
                BackportState::Missing
            };
            Some(BackportItem {
                id: id.to_string(),
                summary: summary.to_string(),
                author: author.to_string(),
                time: time.parse().unwrap_or(0),
                state,
            })
        })
        .collect())
}

/// Original commit id → the commit in `range` whose message says it was picked from it.
fn picked_in(dir: &Path, range: &str) -> Result<HashMap<String, String>> {
    let log = git_ok(dir, &["log", "--no-merges", "--format=%H%x1f%B%x1e", range])?;
    let mut out = HashMap::new();
    for entry in log.split('\x1e') {
        let Some((by, body)) = entry.trim().split_once('\x1f') else {
            continue;
        };
        for line in body.lines() {
            if let Some(rest) = line.trim().strip_prefix(TRAILER) {
                let original = rest.trim_end_matches(')').trim();
                out.insert(original.to_string(), by.to_string());
            }
        }
    }
    Ok(out)
}

fn ignored(dir: &Path) -> Result<HashSet<String>> {
    // Exit code 1 just means the key is not set.
    let o = git(dir, &["config", "--local", "--get-all", IGNORE_KEY])?;
    Ok(if o.ok {
        o.text.lines().map(|l| l.trim().to_string()).collect()
    } else {
        HashSet::new()
    })
}

/// Mark (or unmark) `id` as not needed in the target.
pub fn set_ignored(path: &str, id: &str, ignore: bool) -> Result<()> {
    let dir = repo_dir(path)?;
    let has = ignored(&dir)?.contains(id);
    if ignore && !has {
        git_ok(&dir, &["config", "--local", "--add", IGNORE_KEY, id])?;
    } else if !ignore && has {
        git_ok(
            &dir,
            &["config", "--local", "--unset", IGNORE_KEY, &format!("^{id}$")],
        )?;
    }
    Ok(())
}

/// Cherry-pick `ids` (oldest first) onto `target` with `-x`, so later
/// comparisons recognise them even when conflicts changed the patch.
pub fn apply(path: &str, ids: &[String], target: &str) -> Result<OpResult> {
    if ids.is_empty() {
        return Err("No commits selected".into());
    }
    let dir = prepare_on(path, Some(target))?;
    let mut args = vec!["cherry-pick", "-x"];
    args.extend(ids.iter().map(String::as_str));
    Ok(conflict_aware(path, git(&dir, &args)?))
}

/// Write `ids` (oldest first) as numbered `.patch` files into `out_dir`, for a
/// fork that can't fetch from the original (e.g. a customer's closed network).
pub fn export(path: &str, ids: &[String], out_dir: &str) -> Result<OpResult> {
    if ids.is_empty() {
        return Err("No commits selected".into());
    }
    let dir = repo_dir(path)?;
    let mut files = Vec::new();
    for (i, id) in ids.iter().enumerate() {
        let n = (i + 1).to_string();
        let o = git(
            &dir,
            &["format-patch", "-1", "--start-number", &n, "-o", out_dir, id],
        )?;
        if !o.ok {
            return Ok(o.into());
        }
        files.push(o.text);
    }
    Ok(OpResult {
        status: super::OpStatus::Ok,
        output: files.join("\n"),
    })
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::super::write::{checkout, create_branch};
    use super::super::OpStatus;
    use super::*;

    fn head(d: &Path) -> String {
        git_ok(d, &["rev-parse", "HEAD"]).unwrap()
    }

    /// main: base → fix1 → fix2 → fix3. fork (from base): own work, fix2 picked
    /// cleanly, and a reworked port of fix1 that kept the `-x` trailer.
    fn forked() -> (tempfile::TempDir, [String; 3]) {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a\n", "base");
        create_branch(p, "fork", None, false).unwrap();
        let mut fixes = Vec::new();
        for i in 1..=3 {
            commit_file(
                d.path(),
                &format!("fix{i}.txt"),
                "upstream\n",
                &format!("fix {i}"),
            );
            fixes.push(head(d.path()));
        }
        checkout(p, "fork").unwrap();
        commit_file(d.path(), "custom.txt", "customer\n", "customer tweak");
        git_ok(d.path(), &["cherry-pick", &fixes[1]]).unwrap();
        let msg = format!("fix 1 for the fork\n\n{TRAILER}{})", fixes[0]);
        commit_file(d.path(), "fix1.txt", "adapted\n", &msg);
        (d, fixes.try_into().unwrap())
    }

    fn states(p: &str) -> Vec<(String, BackportState)> {
        compare(p, "main", "fork")
            .unwrap()
            .into_iter()
            .map(|i| (i.summary, i.state))
            .collect()
    }

    #[test]
    fn classifies_missing_applied_and_picked() {
        let (d, _) = forked();
        let p = s(d.path());
        let st = states(p);
        assert_eq!(st.len(), 3, "{st:?}");
        assert_eq!(st[0], ("fix 3".into(), BackportState::Missing));
        assert_eq!(st[1], ("fix 2".into(), BackportState::Applied));
        assert!(matches!(&st[2], (s, BackportState::Picked { .. }) if s == "fix 1"));
        assert!(compare(p, "nope", "fork").is_err());
    }

    #[test]
    fn ignore_then_apply_the_rest() {
        let (d, [_, _, fix3]) = forked();
        let p = s(d.path());
        set_ignored(p, &fix3, true).unwrap();
        set_ignored(p, &fix3, true).unwrap(); // idempotent
        assert_eq!(states(p)[0].1, BackportState::Ignored);
        set_ignored(p, &fix3, false).unwrap();
        assert_eq!(states(p)[0].1, BackportState::Missing);

        checkout(p, "main").unwrap();
        let r = apply(p, std::slice::from_ref(&fix3), "fork").unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        // Now on fork, and fix 3 counts as applied (same patch).
        assert_eq!(git_ok(d.path(), &["branch", "--show-current"]).unwrap(), "fork");
        assert!(states(p).iter().all(|(_, s)| *s != BackportState::Missing));
    }

    #[test]
    fn exports_numbered_patches() {
        let (d, [fix1, _, fix3]) = forked();
        let out = tempfile::tempdir().unwrap();
        let r = export(s(d.path()), &[fix1, fix3], s(out.path())).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let mut names: Vec<_> = std::fs::read_dir(out.path())
            .unwrap()
            .map(|e| e.unwrap().file_name().into_string().unwrap())
            .collect();
        names.sort();
        assert_eq!(names, ["0001-fix-1.patch", "0002-fix-3.patch"]);
    }
}
