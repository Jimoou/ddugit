//! Getting a repository to open: clone a URL, create a new one, or find the
//! repository a dropped file or folder belongs to.

use std::path::Path;

use super::remote::{remote_status, stream_remote, Progress};
use serde::Deserialize;

use super::{git, operand, OpResult, Result};

/// How much of the repository a clone brings (the dialog's "Advanced" part).
#[derive(Debug, Deserialize, Default, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct CloneOptions {
    /// Check out this branch (or tag) instead of the remote's default (`--branch`).
    pub branch: Option<String>,
    /// Only the last `depth` commits (`--depth`); 0 or unset is all of history.
    pub depth: Option<u32>,
    /// Only the one branch's history (`--single-branch`). A shallow clone of every
    /// branch says `--no-single-branch`, since `--depth` alone means one branch.
    pub single_branch: bool,
    /// Also clone and check out the submodules (`--recurse-submodules`).
    pub submodules: bool,
}

impl CloneOptions {
    /// The options as `git clone` arguments; a branch that looks like an option is refused.
    fn args(&self) -> Result<Vec<String>> {
        let mut args = Vec::new();
        if let Some(b) = self.branch.as_deref().map(str::trim).filter(|b| !b.is_empty()) {
            args.extend(["--branch".into(), operand(b)?.to_string()]);
        }
        let depth = self.depth.filter(|&d| d > 0);
        if let Some(d) = depth {
            args.push(format!("--depth={d}"));
        }
        if self.single_branch {
            args.push("--single-branch".into());
        } else if depth.is_some() {
            args.push("--no-single-branch".into());
        }
        if self.submodules {
            args.push("--recurse-submodules".into());
        }
        Ok(args)
    }
}

/// `git clone <url> <dest>`; `dest` must not exist yet or be an empty folder.
/// Progress streams like fetch; missing credentials come back as `Auth`.
pub fn clone(
    url: &str,
    dest: &str,
    options: &CloneOptions,
    on_progress: impl FnMut(Progress),
) -> Result<OpResult> {
    let url = url.trim();
    if url.is_empty() {
        return Err("Enter a repository URL".into());
    }
    let extra = options.args()?;
    let dest = Path::new(dest);
    let parent = dest.parent().filter(|p| p.is_dir()).ok_or_else(|| {
        format!(
            "Folder does not exist: {}",
            dest.parent().unwrap_or(dest).display()
        )
    })?;
    let target = dest.to_string_lossy();
    let mut args = vec!["clone", "--progress"];
    args.extend(extra.iter().map(String::as_str));
    args.extend(["--", url, &target]);
    let o = stream_remote(parent, &args, on_progress)?;
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
        let r = clone(s(src.path()), s(&dest), &CloneOptions::default(), |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(s(&dest), 10).unwrap();
        assert_eq!(snap.commits[0].summary, "first");
        assert_eq!(snap.head.upstream.as_deref(), Some("origin/main"));
    }

    /// A bare repository (as `file://` URL, so `--depth` applies) with three commits on
    /// `main`, a `dev` branch one ahead, and a submodule. Keep the folders while cloning.
    fn bare_with_branch_and_submodule() -> ([tempfile::TempDir; 2], String) {
        let lib = repo();
        commit_file(lib.path(), "lib.txt", "lib", "lib");
        let src = repo();
        commit_file(src.path(), "a.txt", "1", "one");
        commit_file(src.path(), "a.txt", "2", "two");
        git_ok(src.path(), &["submodule", "add", "-q", s(lib.path()), "libs/lib"]).unwrap();
        git_ok(src.path(), &["commit", "-qm", "three"]).unwrap();
        git_ok(src.path(), &["checkout", "-qb", "dev"]).unwrap();
        commit_file(src.path(), "dev.txt", "d", "dev work");
        git_ok(src.path(), &["checkout", "-q", "main"]).unwrap();
        let root = tempfile::tempdir().unwrap();
        let bare = root.path().join("app.git");
        git_ok(root.path(), &["clone", "-q", "--bare", s(src.path()), s(&bare)]).unwrap();
        let url = format!("file://{}", bare.display());
        // `.gitmodules` names `lib`'s folder: it has to stay.
        ([root, lib], url)
    }

    #[test]
    fn clone_options_pick_a_branch_depth_and_submodules() {
        let (_keep, url) = bare_with_branch_and_submodule();
        let parent = tempfile::tempdir().unwrap();

        // A branch, shallow, one branch only, with submodules.
        let dest = parent.path().join("dev");
        let opts = CloneOptions {
            branch: Some("dev".into()),
            depth: Some(1),
            single_branch: true,
            submodules: true,
        };
        let r = clone(&url, s(&dest), &opts, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(s(&dest), 10).unwrap();
        assert_eq!(snap.head.branch.as_deref(), Some("dev"));
        assert_eq!(snap.commits.len(), 1, "shallow: one commit");
        let remote: Vec<_> = snap
            .refs
            .iter()
            .filter(|r| r.kind == super::super::read::RefKind::Remote)
            .map(|r| r.name.clone())
            .collect();
        assert_eq!(remote, ["origin/dev"]);
        assert!(dest.join("libs/lib/lib.txt").exists(), "submodule checked out");

        // Shallow but every branch; no submodules.
        let dest = parent.path().join("all");
        let opts = CloneOptions {
            depth: Some(2),
            ..Default::default()
        };
        let r = clone(&url, s(&dest), &opts, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        let snap = snapshot(s(&dest), 10).unwrap();
        assert_eq!(snap.head.branch.as_deref(), Some("main"));
        assert_eq!(snap.commits.len(), 3, "two on main, dev's own one");
        assert!(snap.refs.iter().any(|r| r.name == "origin/dev"));
        assert!(!dest.join("libs/lib/lib.txt").exists());

        // A branch that looks like an option, and one that isn't there.
        let bad = CloneOptions {
            branch: Some("--upload-pack=touch x".into()),
            ..Default::default()
        };
        assert!(clone(&url, s(&parent.path().join("bad")), &bad, |_| {}).is_err());
        let missing = CloneOptions {
            branch: Some("nope".into()),
            ..Default::default()
        };
        let r = clone(&url, s(&parent.path().join("nope")), &missing, |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Failed);
    }

    #[test]
    fn clone_options_become_arguments() {
        let args = |o: CloneOptions| o.args().unwrap();
        assert!(args(CloneOptions::default()).is_empty());
        let o = CloneOptions {
            branch: Some(" v1.0 ".into()),
            depth: Some(0),
            ..Default::default()
        };
        assert_eq!(args(o), ["--branch", "v1.0"]);
        let o = CloneOptions {
            depth: Some(5),
            submodules: true,
            ..Default::default()
        };
        assert_eq!(
            args(o),
            ["--depth=5", "--no-single-branch", "--recurse-submodules"]
        );
    }

    #[test]
    fn clone_fails_cleanly_into_a_non_empty_folder_or_missing_parent() {
        let src = repo();
        commit_file(src.path(), "a.txt", "a", "first");
        let parent = tempfile::tempdir().unwrap();
        std::fs::write(parent.path().join("x"), "taken").unwrap();
        let r = clone(s(src.path()), s(parent.path()), &CloneOptions::default(), |_| {}).unwrap();
        assert_eq!(r.status, OpStatus::Failed);
        assert!(clone(
            s(src.path()),
            s(&parent.path().join("no/such/dir")),
            &CloneOptions::default(),
            |_| {}
        )
        .is_err());
        assert!(clone(" ", s(&parent.path().join("y")), &CloneOptions::default(), |_| {}).is_err());
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
            let r = clone(&url, s(&dest), &CloneOptions::default(), |_| {}).unwrap();
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
