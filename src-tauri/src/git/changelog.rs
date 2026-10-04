//! Release notes (Pro): the commits that went into a release, for the
//! frontend to group by kind (`notes.ts`) and write as Markdown.
//!
//! Only the first-parent line is read: on a branch that takes pull requests,
//! that is one commit per pull request (a squash commit, or the merge commit
//! that names it), not every commit inside each one.

use serde::Serialize;

use super::{git, git_ok, operand, repo_dir, Result};

/// More than this many commits between two releases is cut off.
const LIMIT: usize = 2000;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NoteCommit {
    pub id: String,
    pub author: String,
    pub time: i64,
    pub summary: String,
    pub body: String,
    /// For a merge on the first-parent line: the commits it brought in (no
    /// merges among them), for when the merge itself names no pull request.
    pub inner: Vec<NoteCommit>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NoteRange {
    /// Where the notes start: the asked revision, else the latest tag before `to`; none means from the start.
    pub from: Option<String>,
    pub commits: Vec<NoteCommit>,
    /// Tags reachable from `to`, newest first (to pick another start).
    pub tags: Vec<String>,
    /// More commits than `LIMIT`; only the newest are listed.
    pub truncated: bool,
}

pub fn range(path: &str, from: Option<&str>, to: &str) -> Result<NoteRange> {
    let to = operand(to)?;
    from.map(operand).transpose()?;
    let dir = repo_dir(path)?;
    let from = match from {
        // Empty: from the very first commit.
        Some("") => None,
        Some(f) => Some(f.to_string()),
        // The latest tag before `to` (not `to` itself when it is a tag).
        None => {
            let o = git(&dir, &["describe", "--tags", "--abbrev=0", &format!("{to}^")])?;
            o.ok.then(|| o.text.trim().to_string())
        }
    };
    let span = match &from {
        Some(f) => format!("{f}..{to}"),
        None => to.to_string(),
    };
    let max = format!("--max-count={}", LIMIT + 1);
    let mut commits = log(&dir, &["--first-parent", &max, &span])?;
    let truncated = commits.len() > LIMIT;
    commits.truncate(LIMIT);
    for (c, parents) in commits.iter_mut() {
        if let [first, rest @ ..] = parents.as_slice() {
            for p in rest {
                let inner = log(&dir, &["--no-merges", &max, &format!("{first}..{p}")])?;
                c.inner.extend(inner.into_iter().map(|(c, _)| c));
            }
        }
    }
    let commits = commits.into_iter().map(|(c, _)| c).collect();
    let tags = git_ok(&dir, &["tag", "--merged", to, "--sort=-creatordate"])?
        .lines()
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(String::from)
        .collect();
    Ok(NoteRange {
        from,
        commits,
        tags,
        truncated,
    })
}

/// `git log <args>`: each commit and its parents.
fn log(dir: &std::path::Path, args: &[&str]) -> Result<Vec<(NoteCommit, Vec<String>)>> {
    let mut argv = vec!["log", "--format=%H%x1f%P%x1f%an%x1f%at%x1f%s%x1f%b%x1e"];
    argv.extend_from_slice(args);
    argv.push("--");
    Ok(git_ok(dir, &argv)?
        .split('\x1e')
        .filter_map(|rec| {
            let mut f = rec.trim_start_matches('\n').split('\x1f');
            let id = f.next().filter(|s| !s.is_empty())?.to_string();
            let parents = f.next()?.split_whitespace().map(String::from).collect();
            let c = NoteCommit {
                id,
                author: f.next()?.to_string(),
                time: f.next()?.parse().unwrap_or(0),
                summary: f.next()?.to_string(),
                body: f.next().unwrap_or("").trim().to_string(),
                inner: Vec::new(),
            };
            Some((c, parents))
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, s};
    use super::*;

    #[test]
    fn notes_start_at_the_previous_tag_and_follow_the_first_parent() {
        let d = repo();
        let p = d.path();
        commit_file(p, "a.txt", "0", "chore: start");
        git_ok(p, &["tag", "v0.1.0"]).unwrap();
        commit_file(p, "a.txt", "1", "feat(api): add search (#3)");
        // A branch merged with a merge commit: only the merge is on the first-parent line.
        git_ok(p, &["checkout", "-qb", "topic"]).unwrap();
        commit_file(p, "b.txt", "1", "wip inside the pull request");
        git_ok(p, &["checkout", "-q", "main"]).unwrap();
        git_ok(
            p,
            &[
                "merge",
                "--no-ff",
                "-q",
                "topic",
                "-m",
                "Merge pull request #4 from me/topic",
                "-m",
                "fix: handle empty input",
            ],
        )
        .unwrap();
        git_ok(p, &["tag", "v0.2.0"]).unwrap();
        commit_file(p, "a.txt", "2", "docs: after the release");

        let r = range(s(p), None, "v0.2.0").unwrap();
        assert_eq!(r.from.as_deref(), Some("v0.1.0"));
        let summaries: Vec<&str> = r.commits.iter().map(|c| c.summary.as_str()).collect();
        assert_eq!(
            summaries,
            vec![
                "Merge pull request #4 from me/topic",
                "feat(api): add search (#3)"
            ]
        );
        assert_eq!(r.commits[0].body, "fix: handle empty input");
        // What the merge brought in, for a merge that names no pull request.
        let inner: Vec<&str> = r.commits[0].inner.iter().map(|c| c.summary.as_str()).collect();
        assert_eq!(inner, vec!["wip inside the pull request"]);
        assert!(r.commits[1].inner.is_empty());
        assert_eq!(r.commits[0].author, "Test");
        assert!(r.tags.contains(&"v0.1.0".to_string()) && r.tags.contains(&"v0.2.0".to_string()));

        // No earlier tag: from the very first commit.
        assert_eq!(range(s(p), Some(""), "v0.2.0").unwrap().commits.len(), 3);
        let first = range(s(p), None, "v0.1.0").unwrap();
        assert_eq!(first.from, None);
        assert_eq!(first.commits.len(), 1);
        // An explicit start; HEAD works too.
        let all = range(s(p), Some("v0.1.0"), "HEAD").unwrap();
        assert_eq!(all.commits.len(), 3);
        assert!(range(s(p), Some("--output=x"), "HEAD").is_err());
    }
}
