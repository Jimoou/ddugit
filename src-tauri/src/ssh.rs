//! SSH for git remotes, set up from inside the app: which keys exist, making
//! one, trusting a server's host key (checked against the fingerprints GitHub
//! and GitLab publish), and testing the connection. Uses the system's OpenSSH
//! tools; nothing here ever prompts (no stdin, `BatchMode=yes`).

use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use serde::Serialize;

pub type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SshKey {
    /// Private key file name in ~/.ssh (e.g. `id_ed25519`).
    pub name: String,
    /// The `.pub` line to paste into the forge's SSH key settings.
    pub public: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SshStatus {
    /// OpenSSH (`ssh`, `ssh-keygen`) is installed.
    pub available: bool,
    pub keys: Vec<SshKey>,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct HostKey {
    pub host: String,
    pub port: Option<u16>,
    /// Already in known_hosts.
    pub known: bool,
    /// SHA256 fingerprints the server presents now.
    pub fingerprints: Vec<String>,
    /// For hosts that publish theirs (github.com, gitlab.com): whether one matches.
    pub verified: Option<bool>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SshTest {
    pub ok: bool,
    /// The account the server greeted, when it names one.
    pub user: Option<String>,
    pub output: String,
}

/// Host key fingerprints published by the forges themselves.
const PUBLISHED: &[(&str, &str)] = &[
    // https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints
    ("github.com", "SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"),
    ("github.com", "SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM"),
    ("github.com", "SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s"),
    // https://docs.gitlab.com/ee/user/gitlab_com/#ssh-host-keys-fingerprints
    ("gitlab.com", "SHA256:eUXGGm1YGsMAS7vkcx6JOJdOGHPem5gQp4taiCfCLB8"),
    ("gitlab.com", "SHA256:HbW3g8zUjNSksFbqTiUWPWg2Bq1x8xdGUrliXFzSnUw"),
    ("gitlab.com", "SHA256:ROQFvPThGrW4RuWLoL9tq9I9zJ42fK4XywyRtbOz/EQ"),
];

/// `~/.ssh` (`%USERPROFILE%\.ssh` on Windows).
pub fn ssh_dir() -> Result<PathBuf> {
    let home =
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).ok_or("No home folder")?;
    Ok(PathBuf::from(home).join(".ssh"))
}

fn tool(name: &str) -> Command {
    let mut cmd = Command::new(name);
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd
}

/// Host (and port, if not 22) of an SSH remote: `git@host:path` or `ssh://user@host[:port]/path`.
/// `None` for anything that isn't SSH.
pub fn ssh_host(url: &str) -> Option<(String, Option<u16>)> {
    let url = url.trim();
    let (host, port) = if let Some(rest) = url
        .strip_prefix("ssh://")
        .or_else(|| url.strip_prefix("git+ssh://"))
    {
        let authority = rest.split('/').next()?;
        let hostport = authority.rsplit('@').next()?;
        match hostport.rsplit_once(':') {
            Some((h, p)) => (h, Some(p.parse::<u16>().ok()?)),
            None => (hostport, None),
        }
    } else if url.contains("://") {
        return None;
    } else {
        // scp-like: [user@]host:path (a Windows drive `C:\…` has no `@` and a one-letter host)
        let (left, _) = url.split_once(':')?;
        let host = left.rsplit('@').next()?;
        if !left.contains('@') && host.len() == 1 {
            return None;
        }
        (host, None)
    };
    let host = host
        .trim_start_matches('[')
        .trim_end_matches(']')
        .to_ascii_lowercase();
    // A host is a name, not an option or a path.
    let valid = !host.is_empty()
        && !host.starts_with('-')
        && host
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".-_:".contains(c));
    valid.then_some((host, port.filter(|p| *p != 22)))
}

/// The key files in `dir` that have a `.pub` beside them, ed25519 first.
pub fn keys_in(dir: &Path) -> Vec<SshKey> {
    let Ok(entries) = fs::read_dir(dir) else {
        return vec![];
    };
    let mut keys: Vec<SshKey> = entries
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let private = name.strip_suffix(".pub")?;
            if !dir.join(private).is_file() {
                return None;
            }
            let public = fs::read_to_string(e.path()).ok()?.trim().to_string();
            public.starts_with("ssh-").then(|| SshKey {
                name: private.to_string(),
                public,
            })
        })
        .collect();
    keys.sort_by_key(|k| (!k.public.starts_with("ssh-ed25519"), k.name.clone()));
    keys
}

pub fn status() -> Result<SshStatus> {
    let available = tool("ssh-keygen").arg("-?").output().is_ok();
    Ok(SshStatus {
        available,
        keys: keys_in(&ssh_dir()?),
    })
}

/// Make a new ed25519 key in `dir` (`id_ed25519`, or `id_ed25519_ddugit` if
/// that is taken). Without a passphrase, so git can use it without a prompt;
/// the file is readable only by the user.
pub fn keygen_in(dir: &Path, comment: &str) -> Result<SshKey> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let name = ["id_ed25519", "id_ed25519_ddugit"]
        .into_iter()
        .find(|n| !dir.join(n).exists())
        .ok_or("Keys named id_ed25519 and id_ed25519_ddugit already exist")?;
    let file = dir.join(name);
    let comment = comment.replace(['\n', '\r'], " ");
    let out = tool("ssh-keygen")
        .args(["-q", "-t", "ed25519", "-N", "", "-C", comment.trim(), "-f"])
        .arg(&file)
        .output()
        .map_err(|e| format!("Can't run ssh-keygen: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    keys_in(dir)
        .into_iter()
        .find(|k| k.name == name)
        .ok_or_else(|| "The new key was not written".into())
}

pub fn keygen(comment: &str) -> Result<SshKey> {
    keygen_in(&ssh_dir()?, comment)
}

/// `host` as known_hosts writes it: `[host]:port` for a port other than 22.
fn known_name(host: &str, port: Option<u16>) -> String {
    match port {
        Some(p) => format!("[{host}]:{p}"),
        None => host.to_string(),
    }
}

/// `ssh-keyscan` lines (`host type key`) → their SHA256 fingerprints, via `ssh-keygen -lf -`.
fn fingerprints(scan: &str) -> Result<Vec<String>> {
    let mut child = tool("ssh-keygen")
        .args(["-l", "-E", "sha256", "-f", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Can't run ssh-keygen: {e}"))?;
    child
        .stdin
        .take()
        .ok_or("no stdin")?
        .write_all(scan.as_bytes())
        .map_err(|e| e.to_string())?;
    let out = child.wait_with_output().map_err(|e| e.to_string())?;
    Ok(parse_fingerprints(&String::from_utf8_lossy(&out.stdout)))
}

/// `256 SHA256:abc… host (ED25519)` lines → `SHA256:abc…`, without duplicates.
fn parse_fingerprints(listing: &str) -> Vec<String> {
    let set: BTreeSet<String> = listing
        .lines()
        .filter_map(|l| l.split_whitespace().nth(1))
        .filter(|f| f.starts_with("SHA256:"))
        .map(str::to_string)
        .collect();
    set.into_iter().collect()
}

/// Whether one of `fps` is a fingerprint `host` publishes (`None`: it publishes none we know).
fn published_match(host: &str, fps: &[String]) -> Option<bool> {
    let theirs: Vec<&str> = PUBLISHED
        .iter()
        .filter(|(h, _)| *h == host)
        .map(|(_, f)| *f)
        .collect();
    (!theirs.is_empty()).then(|| fps.iter().any(|f| theirs.contains(&f.as_str())))
}

fn scan(host: &str, port: Option<u16>) -> Result<String> {
    let mut cmd = tool("ssh-keyscan");
    cmd.args(["-T", "8", "-t", "ed25519,ecdsa,rsa"]);
    if let Some(p) = port {
        cmd.args(["-p", &p.to_string()]);
    }
    let out = cmd
        .arg("--")
        .arg(host)
        .output()
        .map_err(|e| format!("Can't run ssh-keyscan: {e}"))?;
    let text = String::from_utf8_lossy(&out.stdout).to_string();
    if text.trim().is_empty() {
        return Err(format!("{host} did not answer on SSH"));
    }
    Ok(text)
}

/// What the server at `url` presents, and whether we already trust it.
pub fn host_key_in(dir: &Path, url: &str) -> Result<HostKey> {
    let (host, port) = ssh_host(url).ok_or("Not an SSH address")?;
    let known = tool("ssh-keygen")
        .arg("-F")
        .arg(known_name(&host, port))
        .arg("-f")
        .arg(dir.join("known_hosts"))
        .output()
        .is_ok_and(|o| o.status.success() && !o.stdout.is_empty());
    let fps = fingerprints(&scan(&host, port)?)?;
    Ok(HostKey {
        verified: published_match(&host, &fps),
        host,
        port,
        known,
        fingerprints: fps,
    })
}

pub fn host_key(url: &str) -> Result<HostKey> {
    host_key_in(&ssh_dir()?, url)
}

/// Add the server's keys to known_hosts, but only if it still presents exactly
/// the fingerprints the user was shown (and, for a forge that publishes its
/// own, only if one of them matches).
pub fn trust_host_in(dir: &Path, url: &str, shown: &[String]) -> Result<()> {
    let (host, port) = ssh_host(url).ok_or("Not an SSH address")?;
    let keys = scan(&host, port)?;
    let fps = fingerprints(&keys)?;
    let mut want = shown.to_vec();
    want.sort();
    if fps != want {
        return Err(format!("{host} now presents a different key; check it again"));
    }
    if published_match(&host, &fps) == Some(false) {
        return Err(format!("{host}'s key doesn't match the one it publishes"));
    }
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("known_hosts"))
        .map_err(|e| e.to_string())?;
    let lines: String = keys
        .lines()
        .filter(|l| !l.starts_with('#') && !l.trim().is_empty())
        .map(|l| format!("{l}\n"))
        .collect();
    file.write_all(lines.as_bytes()).map_err(|e| e.to_string())
}

pub fn trust_host(url: &str, shown: &[String]) -> Result<()> {
    trust_host_in(&ssh_dir()?, url, shown)
}

/// The greeting's user name: GitHub "Hi NAME! You've successfully
/// authenticated", GitLab "Welcome to GitLab, @NAME!".
fn greeted(output: &str) -> Option<String> {
    if let Some(rest) = output.split("Hi ").nth(1) {
        if output.contains("successfully authenticated") {
            return rest.split('!').next().map(str::to_string);
        }
    }
    let rest = output.split("Welcome to GitLab, @").nth(1)?;
    rest.split('!').next().map(str::to_string)
}

/// `ssh -T git@host`: does the server let us in with the keys we have?
pub fn test(url: &str) -> Result<SshTest> {
    let (host, port) = ssh_host(url).ok_or("Not an SSH address")?;
    let mut cmd = tool("ssh");
    cmd.args([
        "-T",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=8",
        "-o",
        "StrictHostKeyChecking=yes",
    ]);
    if let Some(p) = port {
        cmd.args(["-p", &p.to_string()]);
    }
    let out = cmd
        .arg(format!("git@{host}"))
        .output()
        .map_err(|e| format!("Can't run ssh: {e}"))?;
    let output = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    )
    .trim()
    .to_string();
    let user = greeted(&output);
    // GitHub answers the greeting with exit status 1, so the greeting is what counts.
    let ok = user.is_some() || out.status.success();
    Ok(SshTest { ok, user, output })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_ssh_host_of_a_remote() {
        assert_eq!(
            ssh_host("git@github.com:o/r.git"),
            Some(("github.com".into(), None))
        );
        assert_eq!(
            ssh_host("ssh://git@GitLab.example.com:2222/g/p.git"),
            Some(("gitlab.example.com".into(), Some(2222)))
        );
        assert_eq!(ssh_host("ssh://git@host:22/x"), Some(("host".into(), None)));
        assert_eq!(ssh_host("https://github.com/o/r.git"), None);
        assert_eq!(ssh_host("C:\\work\\repo"), None);
        assert_eq!(ssh_host("git@-oProxyCommand=x:o/r"), None);
    }

    #[test]
    fn reads_fingerprints_and_checks_the_published_ones() {
        let listing = "256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)\n\
                       256 SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU github.com (ED25519)\n\
                       3072 SHA256:uNiVztksCsDhcc0u9e8BujQXVUpKZIDTMczCvj3tD2s github.com (RSA)\n";
        let fps = parse_fingerprints(listing);
        assert_eq!(fps.len(), 2);
        assert_eq!(published_match("github.com", &fps), Some(true));
        assert_eq!(
            published_match("github.com", &["SHA256:nope".into()]),
            Some(false)
        );
        assert_eq!(published_match("git.example.com", &fps), None);
    }

    #[test]
    fn reads_who_the_server_greeted() {
        assert_eq!(
            greeted(
                "Hi octocat! You've successfully authenticated, but GitHub does not provide shell access."
            )
            .as_deref(),
            Some("octocat")
        );
        assert_eq!(greeted("Welcome to GitLab, @kim!").as_deref(), Some("kim"));
        assert_eq!(greeted("git@github.com: Permission denied (publickey)."), None);
    }

    #[test]
    fn makes_a_key_and_lists_it_with_its_public_half() {
        if tool("ssh-keygen").arg("-?").output().is_err() {
            return; // OpenSSH isn't installed here
        }
        let dir = tempfile::tempdir().unwrap();
        let key = keygen_in(dir.path(), "me@example.com\nexec").unwrap();
        assert_eq!(key.name, "id_ed25519");
        assert!(key.public.starts_with("ssh-ed25519 ") && key.public.ends_with("me@example.com exec"));
        // The usual name is taken: the next one goes beside it.
        assert_eq!(keygen_in(dir.path(), "x").unwrap().name, "id_ed25519_ddugit");
        assert_eq!(keys_in(dir.path()).len(), 2);
        assert!(keygen_in(dir.path(), "x").is_err());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(dir.path().join("id_ed25519"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o077, 0, "private key must not be readable by others");
        }
    }

    #[test]
    fn fingerprints_a_scanned_key() {
        if tool("ssh-keygen").arg("-?").output().is_err() {
            return;
        }
        // A key line as ssh-keyscan prints it (github.com's published ed25519 key).
        let line =
            "github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl\n";
        assert_eq!(
            fingerprints(line).unwrap(),
            ["SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"]
        );
    }
}
