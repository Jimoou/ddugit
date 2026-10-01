//! Finding the commit that broke something with `git bisect`, driven by
//! clicks: mark one bad and one good commit, then answer good / bad / skip
//! for each commit git checks out until one is left.

use serde::{Deserialize, Serialize};

use super::{err, git, git_ok, open, workdir, OpResult, OpStatus, Result};

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum BisectOp {
    Start {
        bad: String,
        good: String,
    },
    /// Judge the commit checked out now.
    Good,
    Bad,
    Skip,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BisectState {
    pub bad: Option<String>,
    pub good: Vec<String>,
    pub skipped: Vec<String>,
    /// The commit to test now (HEAD), unless the culprit is found.
    pub current: Option<String>,
    /// The first bad commit, once only one candidate is left.
    pub culprit: Option<String>,
    /// Commits that may still be the first bad one (bad included), newest first.
    pub candidates: Vec<String>,
}

pub fn bisect(path: &str, op: &BisectOp) -> Result<OpResult> {
    let dir = workdir(&open(path)?)?;
    let o = match op {
        BisectOp::Start { bad, good } => git(&dir, &["bisect", "start", bad, good, "--"])?,
        BisectOp::Good => git(&dir, &["bisect", "good"])?,
        BisectOp::Bad => git(&dir, &["bisect", "bad"])?,
        BisectOp::Skip => git(&dir, &["bisect", "skip"])?,
    };
    let status = if o.ok { OpStatus::Ok } else { OpStatus::Failed };
    Ok(OpResult::with(status, o))
}

/// The bisect in progress, if any.
pub fn state(path: &str) -> Result<Option<BisectState>> {
    let repo = open(path)?;
    if !repo.path().join("BISECT_START").exists() {
        return Ok(None);
    }
    let mut bad = None;
    let (mut good, mut skipped) = (Vec::new(), Vec::new());
    for r in repo.references_glob("refs/bisect/*").map_err(err)? {
        let r = r.map_err(err)?;
        let (Some(name), Some(id)) = (r.name(), r.target()) else {
            continue;
        };
        let id = id.to_string();
        match name.trim_start_matches("refs/bisect/") {
            "bad" => bad = Some(id),
            n if n.starts_with("good") => good.push(id),
            n if n.starts_with("skip") => skipped.push(id),
            _ => {}
        }
    }
    let mut candidates = Vec::new();
    if let Some(b) = &bad {
        let dir = workdir(&repo)?;
        let mut args = vec!["rev-list", "--max-count=5000", b.as_str(), "--not"];
        args.extend(good.iter().map(String::as_str));
        candidates = git_ok(&dir, &args)?
            .lines()
            .filter(|c| !skipped.iter().any(|s| s == c))
            .map(str::to_string)
            .collect();
    }
    let culprit = (candidates.len() == 1).then(|| candidates[0].clone());
    let current = if culprit.is_some() {
        None
    } else {
        repo.head().ok().and_then(|h| h.target()).map(|o| o.to_string())
    };
    Ok(Some(BisectState {
        bad,
        good,
        skipped,
        current,
        culprit,
        candidates,
    }))
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::super::write::abort;
    use super::*;

    #[test]
    fn finds_the_commit_that_broke_it() {
        let d = repo();
        let mut ids = Vec::new();
        for i in 0..9 {
            // Commit 5 introduces the bug, and it stays broken after.
            let content = if i >= 5 { "broken" } else { "fine" };
            commit_file(d.path(), "app.txt", &format!("{content} {i}"), &format!("c{i}"));
            ids.push(
                git_ok(d.path(), &["rev-parse", "HEAD"])
                    .unwrap()
                    .trim()
                    .to_string(),
            );
        }
        assert_eq!(state(s(d.path())).unwrap(), None);
        let start = BisectOp::Start {
            bad: ids[8].clone(),
            good: ids[0].clone(),
        };
        assert_eq!(bisect(s(d.path()), &start).unwrap().status, OpStatus::Ok);

        let mut rounds = 0;
        let culprit = loop {
            let st = state(s(d.path())).unwrap().unwrap();
            if let Some(c) = st.culprit {
                break c;
            }
            assert!(st.candidates.contains(&ids[5]));
            let here = std::fs::read_to_string(d.path().join("app.txt")).unwrap();
            let op = if here.starts_with("broken") {
                BisectOp::Bad
            } else {
                BisectOp::Good
            };
            assert_eq!(bisect(s(d.path()), &op).unwrap().status, OpStatus::Ok);
            rounds += 1;
            assert!(rounds < 6, "bisect should converge in ~log2(8) steps");
        };
        assert_eq!(culprit, ids[5]);

        // Finishing returns to the branch.
        abort(s(d.path())).unwrap();
        assert_eq!(state(s(d.path())).unwrap(), None);
        assert_eq!(
            git_ok(d.path(), &["rev-parse", "--abbrev-ref", "HEAD"])
                .unwrap()
                .trim(),
            "main"
        );
    }

    #[test]
    fn skipping_leaves_the_commit_out_of_the_candidates() {
        let d = repo();
        for i in 0..5 {
            commit_file(d.path(), "f.txt", &i.to_string(), &format!("c{i}"));
        }
        bisect(
            s(d.path()),
            &BisectOp::Start {
                bad: "HEAD".into(),
                good: "HEAD~4".into(),
            },
        )
        .unwrap();
        let before = state(s(d.path())).unwrap().unwrap();
        let probe = before.current.clone().unwrap();
        bisect(s(d.path()), &BisectOp::Skip).unwrap();
        let after = state(s(d.path())).unwrap().unwrap();
        assert!(after.skipped.contains(&probe));
        assert!(!after.candidates.contains(&probe));
    }
}
