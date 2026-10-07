//! Ignoring files: patterns appended to the `.gitignore` at the top of the working
//! tree, and tracked files taken out of the index (`git rm --cached`) so they can be.

use super::{git_ok, open, workdir, OpResult, OpStatus, Result, LITERAL};

/// Add `patterns` to the top-level `.gitignore` (made when missing; ones already
/// there are skipped), then stop tracking `untrack` while leaving the files on disk.
pub fn ignore(path: &str, patterns: &[String], untrack: &[String]) -> Result<OpResult> {
    let dir = workdir(&open(path)?)?;
    let mut out = Vec::new();
    if !patterns.is_empty() {
        let file = dir.join(".gitignore");
        // A repository can check out `.gitignore` as a link to any file: never write through one.
        if file.symlink_metadata().is_ok_and(|m| !m.file_type().is_file()) {
            return Err(".gitignore is not a plain file (a link?): edit it by hand".into());
        }
        let mut now = match std::fs::read(&file) {
            Ok(bytes) => bytes,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(e) => return Err(format!("Can't read .gitignore: {e}")),
        };
        // Only appended to: the file's own bytes (any encoding) stay as they are.
        match appended(&String::from_utf8_lossy(&now), patterns)? {
            Some(more) => {
                now.extend_from_slice(more.as_bytes());
                std::fs::write(&file, now).map_err(|e| format!("Can't write .gitignore: {e}"))?;
                out.push(format!("Added to .gitignore: {}", patterns.join(", ")));
            }
            None => out.push("Already in .gitignore".to_string()),
        }
    }
    if !untrack.is_empty() {
        let mut args = vec![LITERAL, "rm", "--cached", "-r", "-q", "--"];
        args.extend(untrack.iter().map(String::as_str));
        out.push(git_ok(&dir, &args)?);
    }
    Ok(OpResult {
        status: OpStatus::Ok,
        output: out.join("\n").trim().to_string(),
    })
}

/// What to add to the end of `.gitignore` text `now` for the `patterns` it lacks, each on
/// its own line (`None` when every one is already there). A pattern must be one line.
fn appended(now: &str, patterns: &[String]) -> Result<Option<String>> {
    // Unescaped trailing spaces mean nothing to git; an escaped one (`\ `) is part of the pattern.
    let there = |p: &str| now.lines().any(|l| l == p || l.trim_end() == p);
    let mut add: Vec<&str> = Vec::new();
    for p in patterns {
        if p.trim().is_empty() || p.contains(['\n', '\r']) {
            return Err(format!("Not an ignore pattern: {p:?}"));
        }
        if !there(p) && !add.contains(&p.as_str()) {
            add.push(p);
        }
    }
    if add.is_empty() {
        return Ok(None);
    }
    // Keep the file's line endings when it uses CRLF.
    let eol = if now.contains("\r\n") { "\r\n" } else { "\n" };
    let mut next = String::new();
    if !now.is_empty() && !now.ends_with('\n') {
        next.push_str(eol);
    }
    for p in add {
        next.push_str(p);
        next.push_str(eol);
    }
    Ok(Some(next))
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::*;
    use std::fs;

    #[test]
    fn appends_only_missing_patterns() {
        let pats = |v: &[&str]| v.iter().map(|p| p.to_string()).collect::<Vec<_>>();
        assert_eq!(
            appended("", &pats(&["*.log"])).unwrap().as_deref(),
            Some("*.log\n")
        );
        assert_eq!(
            appended("/target\n*.log", &pats(&["*.log", "/dist/", "/dist/"]))
                .unwrap()
                .as_deref(),
            Some("\n/dist/\n")
        );
        assert_eq!(
            appended("a\r\n", &pats(&["b"])).unwrap().as_deref(),
            Some("b\r\n")
        );
        // Trailing spaces in the file don't make a second copy.
        assert_eq!(appended("*.log  \n", &pats(&["*.log"])).unwrap(), None);
        // An escaped trailing space is part of the pattern.
        assert_eq!(appended("/name\\ \n", &pats(&["/name\\ "])).unwrap(), None);
        assert!(appended("", &pats(&["a\nb"])).is_err());
        assert!(appended("", &pats(&[" "])).is_err());
    }

    #[test]
    fn ignore_hides_untracked_files_and_skips_duplicates() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        fs::create_dir(d.path().join("build")).unwrap();
        fs::write(d.path().join("build/out.bin"), "x").unwrap();
        fs::write(d.path().join("debug.log"), "x").unwrap();

        let r = ignore(p, &["*.log".into(), "/build/".into()], &[]).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let changes: Vec<String> = snapshot(p, 5)
            .unwrap()
            .changes
            .into_iter()
            .map(|c| c.path)
            .collect();
        assert_eq!(changes, vec![".gitignore"]);
        ignore(p, &["*.log".into()], &[]).unwrap();
        assert_eq!(
            fs::read_to_string(d.path().join(".gitignore")).unwrap(),
            "*.log\n/build/\n"
        );
    }

    #[test]
    fn a_gitignore_that_is_a_link_or_not_utf8_is_never_rewritten() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "a.txt", "a", "base");
        // Latin-1 comment: kept byte for byte.
        fs::write(d.path().join(".gitignore"), b"# caf\xe9\n/x\n").unwrap();
        ignore(p, &["*.log".into()], &[]).unwrap();
        assert_eq!(
            fs::read(d.path().join(".gitignore")).unwrap(),
            b"# caf\xe9\n/x\n*.log\n"
        );
        #[cfg(unix)]
        {
            let outside = tempfile::tempdir().unwrap();
            let victim = outside.path().join("victim");
            fs::write(&victim, "keep\n").unwrap();
            fs::remove_file(d.path().join(".gitignore")).unwrap();
            std::os::unix::fs::symlink(&victim, d.path().join(".gitignore")).unwrap();
            assert!(ignore(p, &["/evil".into()], &[]).is_err());
            assert_eq!(fs::read_to_string(&victim).unwrap(), "keep\n");
        }
    }

    #[test]
    fn stop_tracking_keeps_the_file() {
        let d = repo();
        let p = s(d.path());
        commit_file(d.path(), "secret.env", "KEY=1", "oops");
        let r = ignore(p, &["/secret.env".into()], &["secret.env".into()]).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(d.path().join("secret.env").exists());
        let snap = snapshot(p, 5).unwrap();
        let gone = snap.changes.iter().find(|c| c.path == "secret.env").unwrap();
        assert_eq!(gone.staged.as_deref(), Some("deleted"));
        assert!(gone.unstaged.is_none(), "ignored now, so not untracked");
        // Without a pattern the file shows up as untracked.
        commit_file(d.path(), "keep.txt", "k", "more");
        ignore(p, &[], &["keep.txt".into()]).unwrap();
        let snap = snapshot(p, 5).unwrap();
        let kept = snap.changes.iter().find(|c| c.path == "keep.txt").unwrap();
        assert_eq!(kept.unstaged.as_deref(), Some("untracked"));
    }
}
