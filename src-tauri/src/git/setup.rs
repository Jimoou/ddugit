//! Getting a repository to open: clone a URL, create a new one, or find the
//! repository a dropped file or folder belongs to.

use std::path::Path;

use super::remote::{remote_status, stream_remote, Progress};
use super::{git, OpResult, Result};

/// `git clone <url> <dest>`; `dest` must not exist yet or be an empty folder.
/// Progress streams like fetch; missing credentials come back as `Auth`.
pub fn clone(url: &str, dest: &str, on_progress: impl FnMut(Progress)) -> Result<OpResult> {
    let url = url.trim();
    if url.is_empty() {
        return Err("Enter a repository URL".into());
    }
    let dest = Path::new(dest);
    let parent = dest.parent().filter(|p| p.is_dir()).ok_or_else(|| {
        format!(
            "Folder does not exist: {}",
            dest.parent().unwrap_or(dest).display()
        )
    })?;
    let target = dest.to_string_lossy();
    let o = stream_remote(parent, &["clone", "--progress", "--", url, &target], on_progress)?;
    Ok(OpResult::with(remote_status(&o, false), o))
}

/// `git init` with `main` as the first branch, in an existing folder.
pub fn init(dir: &str) -> Result<OpResult> {
    let dir = Path::new(dir);
    if !dir.is_dir() {
        return Err(format!("Folder does not exist: {}", dir.display()));
    }
    Ok(git(dir, &["init", "-b", "main"])?.into())
}

/// Working tree root of the repository `path` (a file or folder) is in, if any.
pub fn repo_root(path: &str) -> Option<String> {
    let repo = git2::Repository::discover(path).ok()?;
    // `absolute` keeps Windows paths free of the `\\?\` verbatim prefix.
    let dir = std::path::absolute(repo.workdir()?).ok()?;
    let s = dir.to_string_lossy();
    Some(s.trim_end_matches(['/', '\\']).to_string())
}

#[cfg(test)]
mod tests {
    use super::super::read::snapshot;
    use super::super::testutil::{commit_file, repo, s};
    use super::super::{git_ok, OpStatus};
    use super::*;

    #[test]
    fn clones_a_local_repository_into_a_new_folder() {
        let src = repo();
        commit_file(src.path(), "a.txt", "a", "first");
        let parent = tempfile::tempdir().unwrap();
        let dest = parent.path().join("copy");
        let r = clone(s(src.path()), s(&dest), |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(s(&dest), 10).unwrap();
        assert_eq!(snap.commits[0].summary, "first");
        assert_eq!(snap.head.upstream.as_deref(), Some("origin/main"));
    }

    #[test]
    fn clone_fails_cleanly_into_a_non_empty_folder_or_missing_parent() {
        let src = repo();
        commit_file(src.path(), "a.txt", "a", "first");
        let parent = tempfile::tempdir().unwrap();
        std::fs::write(parent.path().join("x"), "taken").unwrap();
        let r = clone(s(src.path()), s(parent.path()), |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Failed);
        assert!(clone(s(src.path()), s(&parent.path().join("no/such/dir")), |_| {}).is_err());
        assert!(clone(" ", s(&parent.path().join("y")), |_| {}).is_err());
    }

    /// An HTTP server on 127.0.0.1 that answers every request with `status` and
    /// no body, and the URL of a repository on it.
    fn http_answering(status: &'static str) -> String {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/team/app.git", listener.local_addr().unwrap());
        std::thread::spawn(move || {
            for mut sock in listener.incoming().flatten() {
                let mut got = Vec::new();
                let mut buf = [0u8; 1024];
                while !got.windows(4).any(|w| w == b"\r\n\r\n") {
                    match sock.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => got.extend_from_slice(&buf[..n]),
                    }
                }
                let reply = format!(
                    "HTTP/1.1 {status}\r\nWWW-Authenticate: Basic realm=\"git\"\r\n\
                     Content-Length: 0\r\nConnection: close\r\n\r\n"
                );
                let _ = sock.write_all(reply.as_bytes());
            }
        });
        url
    }

    #[test]
    fn clone_refused_by_the_server_is_classified_as_auth() {
        for (status, want) in [
            ("401 Unauthorized", OpStatus::Auth),
            ("403 Forbidden", OpStatus::Auth),
            ("404 Not Found", OpStatus::Failed),
        ] {
            let url = http_answering(status);
            let parent = tempfile::tempdir().unwrap();
            let dest = parent.path().join("app");
            let r = clone(&url, s(&dest), |_| {}).unwrap();
            assert_eq!(r.status, want, "{status}: {}", r.output);
            assert!(!dest.join(".git").exists(), "{status} left a repository behind");
        }
    }

    #[test]
    fn init_makes_an_empty_repository_on_main() {
        let d = tempfile::tempdir().unwrap();
        assert_eq!(init(s(d.path())).unwrap().status, OpStatus::Ok);
        let branch = git_ok(d.path(), &["symbolic-ref", "--short", "HEAD"]).unwrap();
        assert_eq!(branch.trim(), "main");
        assert!(init(s(&d.path().join("missing"))).is_err());
    }

    #[test]
    fn finds_the_repository_of_a_nested_path() {
        let r = repo();
        std::fs::create_dir_all(r.path().join("src/deep")).unwrap();
        let root = repo_root(s(&r.path().join("src/deep"))).unwrap();
        let want = std::path::absolute(r.path()).unwrap();
        assert_eq!(
            std::fs::canonicalize(&root).unwrap(),
            std::fs::canonicalize(want).unwrap()
        );
        let plain = tempfile::tempdir().unwrap();
        assert_eq!(repo_root(s(plain.path())), None);
    }
}
