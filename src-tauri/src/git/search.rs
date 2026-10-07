//! Searching the whole history, not just the commits the graph has loaded:
//! by message, author, the paths a commit touched, or the text it added or
//! removed (pickaxe). Uses `git log`, which already knows all four.

use std::io::Read;
use std::path::Path;
use std::process::Stdio;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use super::{command, err, literal, open, workdir, Result, SPAWN_ERR};

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SearchKind {
    /// The commit message (`--grep`).
    Message,
    /// The author's name or email (`--author`).
    Author,
    /// Commits that changed a path, a folder or a glob (one existing file is followed across renames).
    Path,
    /// Commits that added or removed the text (`-S`), or changed a line matching the regex (`-G`).
    Content,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub id: String,
    pub summary: String,
    pub author: String,
    /// Commit time, seconds since the epoch.
    pub time: i64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    /// Newest first.
    pub hits: Vec<SearchHit>,
    /// More commits match than `hits` holds (the limit, or the time limit, cut the search).
    pub more: bool,
    /// The search ran out of time; `hits` is what it found until then.
    pub timed_out: bool,
}

/// A pickaxe over a big history can take minutes; what it found by then is shown instead.
const TIME_LIMIT: Duration = Duration::from_secs(20);
/// Field separator in each output line (a summary can hold anything but a line break).
const SEP: char = '\u{1f}';

/// Up to `limit` commits matching `query`, newest first, from every branch,
/// remote branch and tag (what the graph draws). Plain text by default;
/// `regex` takes the query as an extended regex (`-G` for content).
pub fn search(path: &str, query: &str, kind: SearchKind, regex: bool, limit: usize) -> Result<SearchResult> {
    let empty = SearchResult {
        hits: Vec::new(),
        more: false,
        timed_out: false,
    };
    if query.trim().is_empty() || limit == 0 {
        return Ok(empty);
    }
    let repo = open(path)?;
    let dir = workdir(&repo)?;
    let head = repo.head().ok().and_then(|h| h.peel_to_commit().ok());
    let Some(head) = head.or_else(|| any_commit(&repo)) else {
        return Ok(empty); // no commits yet
    };
    let follow = kind == SearchKind::Path && is_file_in(&head, query);
    let args = log_args(query, kind, regex, follow, repo.head().is_ok(), limit);
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let (out, timed_out) = run_within(&dir, &args, TIME_LIMIT)?;
    let mut hits: Vec<SearchHit> = out.lines().filter_map(parse_hit).collect();
    let more = timed_out || hits.len() > limit;
    hits.truncate(limit);
    Ok(SearchResult {
        hits,
        more,
        timed_out,
    })
}

/// A commit on any ref, when HEAD's branch has no commits yet.
fn any_commit(repo: &git2::Repository) -> Option<git2::Commit<'_>> {
    repo.references()
        .ok()?
        .flatten()
        .find_map(|r| r.peel_to_commit().ok())
}

/// `query` names one file (no glob) in `commit`'s tree: then git can follow it across renames.
fn is_file_in(commit: &git2::Commit, query: &str) -> bool {
    if query.starts_with(':') || query.contains(['*', '?', '[']) {
        return false;
    }
    commit
        .tree()
        .and_then(|t| t.get_path(Path::new(query)))
        .is_ok_and(|e| e.kind() == Some(git2::ObjectType::Blob))
}

/// `git log` arguments for a search. The query always rides inside its option
/// (`--grep=…`, `-S…`) or after `--`, so it is never read as an option itself.
fn log_args(
    query: &str,
    kind: SearchKind,
    regex: bool,
    follow: bool,
    head: bool,
    limit: usize,
) -> Vec<String> {
    let mut a: Vec<String> = [
        "-c",
        "log.showSignature=false",
        "log",
        "--no-color",
        "--format=%H%x1f%an%x1f%ct%x1f%s",
    ]
    .map(String::from)
    .into();
    a.push(format!("--max-count={}", limit + 1));
    let pattern = if regex {
        "--extended-regexp"
    } else {
        "--fixed-strings"
    };
    match kind {
        SearchKind::Message => a.extend([
            format!("--grep={query}"),
            "--regexp-ignore-case".into(),
            pattern.into(),
        ]),
        SearchKind::Author => a.extend([
            format!("--author={query}"),
            "--regexp-ignore-case".into(),
            pattern.into(),
        ]),
        SearchKind::Content if regex => a.push(format!("-G{query}")),
        SearchKind::Content => a.push(format!("-S{query}")),
        SearchKind::Path if follow => a.push("--follow".into()),
        SearchKind::Path => {}
    }
    a.extend(["--branches", "--remotes", "--tags"].map(String::from));
    if head {
        a.push("HEAD".into()); // a detached HEAD's commits are drawn too
    }
    a.push("--".into());
    if kind == SearchKind::Path {
        // A followed file is matched exactly; otherwise git's own pathspec (folder prefix, globs).
        a.push(if follow { literal(query) } else { query.to_string() });
    }
    a
}

fn parse_hit(line: &str) -> Option<SearchHit> {
    let mut f = line.splitn(4, SEP);
    let id = f.next()?;
    let author = f.next()?;
    let time = f.next()?.parse().ok()?;
    let summary = f.next()?;
    (id.len() >= 40).then(|| SearchHit {
        id: id.to_string(),
        summary: summary.to_string(),
        author: author.to_string(),
        time,
    })
}

/// Run git, stopping it after `limit`: its standard output so far (complete
/// lines only) and whether it was stopped. A failure (a bad regex) is the error.
fn run_within(dir: &Path, args: &[&str], limit: Duration) -> Result<(String, bool)> {
    let mut child = command(dir, args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("{SPAWN_ERR}: {e}"))?;
    let drain = |mut r: Box<dyn Read + Send>| {
        std::thread::spawn(move || {
            let mut buf = Vec::new();
            let _ = r.read_to_end(&mut buf);
            buf
        })
    };
    let out = drain(Box::new(child.stdout.take().expect("piped stdout")));
    let errs = drain(Box::new(child.stderr.take().expect("piped stderr")));
    let deadline = Instant::now() + limit;
    let (status, timed_out) = loop {
        if let Some(s) = child.try_wait().map_err(err)? {
            break (Some(s), false);
        }
        if Instant::now() >= deadline {
            let _ = child.kill();
            let _ = child.wait();
            break (None, true);
        }
        std::thread::sleep(Duration::from_millis(20));
    };
    let out = String::from_utf8_lossy(&out.join().unwrap_or_default()).into_owned();
    if status.is_some_and(|s| !s.success()) {
        let errs = errs.join().unwrap_or_default();
        return Err(String::from_utf8_lossy(&errs).trim().to_string());
    }
    // A stopped git may have cut its last line short.
    let whole = match out.rfind('\n') {
        Some(end) if timed_out => out[..=end].to_string(),
        None if timed_out => String::new(),
        _ => out,
    };
    Ok((whole, timed_out))
}

#[cfg(test)]
mod tests {
    use super::super::testutil::{commit_file, repo, run, s};
    use super::*;

    fn head(p: &Path) -> String {
        run(p, &["rev-parse", "HEAD"]).trim().to_string()
    }

    fn ids(path: &Path, query: &str, kind: SearchKind, regex: bool) -> Vec<String> {
        let r = search(s(path), query, kind, regex, 200).unwrap();
        r.hits.into_iter().map(|h| h.id).collect()
    }

    #[test]
    fn finds_messages_on_every_branch_as_plain_text() {
        let d = repo();
        commit_file(d.path(), "a.txt", "1\n", "Fix the crash (again)");
        let fix = head(d.path());
        run(d.path(), &["switch", "-qc", "side"]);
        commit_file(d.path(), "b.txt", "1\n", "fix another CRASH");
        let side = head(d.path());
        run(d.path(), &["switch", "-q", "main"]);
        commit_file(d.path(), "c.txt", "1\n", "unrelated");

        // Case-insensitive, newest first, the branch not checked out included.
        assert_eq!(
            ids(d.path(), "crash", SearchKind::Message, false),
            [side.clone(), fix.clone()]
        );
        // Parentheses are text unless asked for a regex.
        assert_eq!(ids(d.path(), "(again)", SearchKind::Message, false), [fix]);
        assert_eq!(ids(d.path(), "^fix another", SearchKind::Message, true), [side]);
        // A query that looks like an option is still just text.
        assert!(ids(d.path(), "--all", SearchKind::Message, false).is_empty());
        // A bad regex says why.
        assert!(search(s(d.path()), "(", SearchKind::Message, true, 200).is_err());
    }

    #[test]
    fn finds_authors_by_name_or_email() {
        let d = repo();
        commit_file(d.path(), "a.txt", "1\n", "by test");
        let mine = head(d.path());
        std::fs::write(d.path().join("b.txt"), "1\n").unwrap();
        run(d.path(), &["add", "b.txt"]);
        run(
            d.path(),
            &[
                "commit",
                "-qm",
                "by her",
                "--author",
                "Kim Minji <minji@example.org>",
            ],
        );
        let hers = head(d.path());

        assert_eq!(
            ids(d.path(), "minji", SearchKind::Author, false),
            std::slice::from_ref(&hers)
        );
        assert_eq!(ids(d.path(), "example.org", SearchKind::Author, false), [hers]);
        assert_eq!(ids(d.path(), "t@example.com", SearchKind::Author, false), [mine]);
    }

    #[test]
    fn a_file_is_followed_across_its_rename_and_folders_match_by_prefix() {
        let d = repo();
        std::fs::create_dir(d.path().join("src")).unwrap();
        commit_file(d.path(), "src/old.rs", "fn a() {}\n", "add old");
        let added = head(d.path());
        commit_file(d.path(), "other.txt", "x\n", "unrelated");
        run(d.path(), &["mv", "src/old.rs", "src/new.rs"]);
        run(d.path(), &["commit", "-qm", "rename"]);
        let renamed = head(d.path());
        commit_file(d.path(), "src/new.rs", "fn a() {}\nfn b() {}\n", "grow");
        let grown = head(d.path());

        assert_eq!(
            ids(d.path(), "src/new.rs", SearchKind::Path, false),
            [grown.clone(), renamed.clone(), added.clone()]
        );
        // A folder or a glob is a pathspec: no following, every file under it.
        assert_eq!(
            ids(d.path(), "src", SearchKind::Path, false),
            [grown.clone(), renamed.clone(), added.clone()]
        );
        assert_eq!(ids(d.path(), "*.txt", SearchKind::Path, false).len(), 1);
        // A file gone from HEAD is still found where it was.
        assert_eq!(
            ids(d.path(), "src/old.rs", SearchKind::Path, false),
            [renamed, added]
        );
    }

    #[test]
    fn content_finds_where_text_came_and_went() {
        let d = repo();
        commit_file(d.path(), "f.rs", "let speed = 1;\n", "add speed");
        let added = head(d.path());
        commit_file(
            d.path(),
            "f.rs",
            "let speed = 1;\nlet other = 2;\n",
            "unrelated line",
        );
        commit_file(d.path(), "f.rs", "let other = 2;\n", "drop speed");
        let dropped = head(d.path());
        commit_file(d.path(), "g.rs", "let speedy = 3;\n", "speedy");
        let speedy = head(d.path());

        // -S: commits that changed how many times the text appears.
        assert_eq!(
            ids(d.path(), "speed =", SearchKind::Content, false),
            [dropped.clone(), added.clone()]
        );
        // -G: commits whose changed lines match the regex.
        assert_eq!(
            ids(d.path(), "speed(y)? =", SearchKind::Content, true),
            [speedy, dropped, added]
        );
    }

    #[test]
    fn caps_at_the_limit_and_says_there_is_more() {
        let d = repo();
        for i in 0..5 {
            commit_file(d.path(), "f.txt", &format!("{i}\n"), &format!("step {i}"));
        }
        let r = search(s(d.path()), "step", SearchKind::Message, false, 3).unwrap();
        assert_eq!(r.hits.len(), 3);
        assert!(r.more && !r.timed_out);
        assert_eq!(r.hits[0].summary, "step 4");
        assert_eq!(r.hits[0].author, "Test");
        let r = search(s(d.path()), "step", SearchKind::Message, false, 5).unwrap();
        assert!(!r.more);
        // Nothing to search in an empty repository, or for nothing.
        assert!(search(s(repo().path()), "x", SearchKind::Message, false, 5)
            .unwrap()
            .hits
            .is_empty());
        assert!(search(s(d.path()), " ", SearchKind::Message, false, 5)
            .unwrap()
            .hits
            .is_empty());
    }

    #[test]
    fn a_search_out_of_time_keeps_what_it_found() {
        let d = repo();
        // A shell alias stands in for a slow git: one line out, half of another, then a wait.
        let (out, stopped) = run_within(
            d.path(),
            &["-c", "alias.slow=!printf 'a\\nb'; sleep 2", "slow"],
            Duration::from_millis(500),
        )
        .unwrap();
        assert!(stopped);
        assert_eq!(out, "a\n");
    }
}
