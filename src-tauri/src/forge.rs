//! Open pull requests (GitHub) / merge requests (GitLab) for the repository's
//! remotes, so the graph can mark the commits they point at.
//!
//! Token lookup, in order: the forge's own CLI (`gh auth token`, `glab config
//! get token`), then a token the user typed in, kept in the OS keychain.

use std::path::Path;
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ForgeKind {
    Github,
    Gitlab,
}

/// A remote that lives on a forge we can ask about pull requests.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Forge {
    pub kind: ForgeKind,
    pub host: String,
    /// `owner/repo` on GitHub; the full (possibly nested) project path on GitLab.
    pub slug: String,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TokenSource {
    /// `gh` / `glab` is logged in.
    Cli,
    Keychain,
    None,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PullRequest {
    pub remote: String,
    pub number: u64,
    pub title: String,
    pub url: String,
    pub draft: bool,
    /// Source branch name on the forge.
    pub branch: String,
    /// Head commit of the pull request.
    pub sha: String,
    pub author: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForgeStatus {
    pub remote: String,
    pub kind: ForgeKind,
    pub host: String,
    pub slug: String,
    pub token: TokenSource,
    /// The token was refused: ask the user for a new one.
    pub unauthorized: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PrReport {
    pub forges: Vec<ForgeStatus>,
    pub prs: Vec<PullRequest>,
}

/// `https://host/owner/repo(.git)`, `git@host:owner/repo(.git)` or
/// `ssh://git@host[:port]/owner/repo(.git)` → the forge it lives on, if known.
pub fn parse_remote(url: &str) -> Option<Forge> {
    let url = url.trim();
    let (host, path) = if let Some(rest) = url.split_once("://").map(|(_, r)| r) {
        let (authority, path) = rest.split_once('/')?;
        let host = authority.rsplit('@').next()?;
        (host.split(':').next()?, path)
    } else {
        // scp-like: [user@]host:path
        let (left, path) = url.split_once(':')?;
        (left.rsplit('@').next()?, path)
    };
    let host = host.to_ascii_lowercase();
    let path = path.trim_matches('/');
    let path = path.strip_suffix(".git").unwrap_or(path);
    let kind = if host.contains("github") {
        ForgeKind::Github
    } else if host.contains("gitlab") {
        ForgeKind::Gitlab
    } else {
        return None;
    };
    let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
    let slug = match kind {
        ForgeKind::Github if parts.len() >= 2 => format!("{}/{}", parts[0], parts[1]),
        ForgeKind::Gitlab if parts.len() >= 2 => parts.join("/"),
        _ => return None,
    };
    Some(Forge { kind, host, slug })
}

/// REST API root for a forge host (GitHub Enterprise and self-hosted GitLab included).
pub fn api_base(kind: ForgeKind, host: &str) -> String {
    match kind {
        ForgeKind::Github if host == "github.com" => "https://api.github.com".into(),
        ForgeKind::Github => format!("https://{host}/api/v3"),
        ForgeKind::Gitlab => format!("https://{host}/api/v4"),
    }
}

const KEYCHAIN_SERVICE: &str = "ddugit";

fn keychain(host: &str) -> Option<keyring::Entry> {
    keyring::Entry::new(KEYCHAIN_SERVICE, host).ok()
}

/// Remember (or with `None`, forget) the token for a forge host.
pub fn set_token(host: &str, token: Option<&str>) -> Result<()> {
    let entry = keychain(host).ok_or("The keychain is not available")?;
    match token.map(str::trim).filter(|t| !t.is_empty()) {
        Some(t) => entry.set_password(t).map_err(|e| e.to_string()),
        None => match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        },
    }
}

/// Apps started from Finder don't see a shell's PATH, so also try the usual install spots.
fn cli_candidates(name: &str) -> Vec<String> {
    let mut v = vec![name.to_string()];
    if cfg!(target_os = "macos") {
        v.push(format!("/opt/homebrew/bin/{name}"));
        v.push(format!("/usr/local/bin/{name}"));
    }
    v
}

fn cli_token(kind: ForgeKind, host: &str) -> Option<String> {
    let (bin, args): (&str, Vec<&str>) = match kind {
        ForgeKind::Github => ("gh", vec!["auth", "token", "--hostname", host]),
        ForgeKind::Gitlab => ("glab", vec!["config", "get", "token", "--host", host]),
    };
    for program in cli_candidates(bin) {
        let mut cmd = Command::new(&program);
        cmd.args(&args)
            .stdin(Stdio::null())
            .env("GH_PROMPT_DISABLED", "1")
            .env("NO_COLOR", "1");
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        if let Ok(out) = cmd.output() {
            let token = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if out.status.success() && !token.is_empty() && !token.contains(char::is_whitespace) {
                return Some(token);
            }
        }
    }
    None
}

/// The forge CLI's token first, then the keychain.
fn token_for(kind: ForgeKind, host: &str) -> (Option<String>, TokenSource) {
    if let Some(t) = cli_token(kind, host) {
        return (Some(t), TokenSource::Cli);
    }
    match keychain(host).and_then(|e| e.get_password().ok()) {
        Some(t) => (Some(t), TokenSource::Keychain),
        None => (None, TokenSource::None),
    }
}

#[derive(Deserialize)]
struct GhPull {
    number: u64,
    title: String,
    html_url: String,
    #[serde(default)]
    draft: bool,
    head: GhHead,
    user: Option<GhUser>,
}
#[derive(Deserialize)]
struct GhHead {
    #[serde(rename = "ref")]
    branch: String,
    sha: String,
}
#[derive(Deserialize)]
struct GhUser {
    login: String,
}

#[derive(Deserialize)]
struct GlMerge {
    iid: u64,
    title: String,
    web_url: String,
    #[serde(default)]
    draft: bool,
    source_branch: String,
    sha: String,
    author: Option<GlUser>,
}
#[derive(Deserialize)]
struct GlUser {
    username: String,
}

enum FetchError {
    Unauthorized,
    Other(String),
}

fn get_json<T: serde::de::DeserializeOwned>(
    url: &str,
    auth: (&str, String),
) -> std::result::Result<T, FetchError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(15)))
        .http_status_as_error(false)
        .build()
        .into();
    let mut resp = agent
        .get(url)
        .header(auth.0, &auth.1)
        .header("User-Agent", "ddugit")
        .header("Accept", "application/json")
        .call()
        .map_err(|e| FetchError::Other(e.to_string()))?;
    match resp.status().as_u16() {
        200..=299 => resp
            .body_mut()
            .read_json::<T>()
            .map_err(|e| FetchError::Other(e.to_string())),
        401 | 403 => Err(FetchError::Unauthorized),
        s => Err(FetchError::Other(format!("HTTP {s} from {url}"))),
    }
}

fn open_pulls(
    base: &str,
    forge: &Forge,
    remote: &str,
    token: &str,
) -> std::result::Result<Vec<PullRequest>, FetchError> {
    Ok(match forge.kind {
        ForgeKind::Github => {
            let url = format!("{base}/repos/{}/pulls?state=open&per_page=100", forge.slug);
            get_json::<Vec<GhPull>>(&url, ("Authorization", format!("Bearer {token}")))?
                .into_iter()
                .map(|p| PullRequest {
                    remote: remote.to_string(),
                    number: p.number,
                    title: p.title,
                    url: p.html_url,
                    draft: p.draft,
                    branch: p.head.branch,
                    sha: p.head.sha,
                    author: p.user.map(|u| u.login).unwrap_or_default(),
                })
                .collect()
        }
        ForgeKind::Gitlab => {
            let project = forge.slug.replace('/', "%2F");
            let url = format!("{base}/projects/{project}/merge_requests?state=opened&per_page=100");
            get_json::<Vec<GlMerge>>(&url, ("PRIVATE-TOKEN", token.to_string()))?
                .into_iter()
                .map(|m| PullRequest {
                    remote: remote.to_string(),
                    number: m.iid,
                    title: m.title,
                    url: m.web_url,
                    draft: m.draft,
                    branch: m.source_branch,
                    sha: m.sha,
                    author: m.author.map(|u| u.username).unwrap_or_default(),
                })
                .collect()
        }
    })
}

/// Ask each forge remote (origin first, each project once) for its open pull requests.
pub fn report(path: &str) -> Result<PrReport> {
    let repo = git2::Repository::discover(Path::new(path)).map_err(|e| e.message().to_string())?;
    let mut names: Vec<String> = repo
        .remotes()
        .map_err(|e| e.message().to_string())?
        .iter()
        .flatten()
        .map(str::to_string)
        .collect();
    names.sort_by_key(|n| n != "origin");
    let mut report = PrReport::default();
    let mut seen: Vec<Forge> = Vec::new();
    for name in names {
        let Some(forge) = repo
            .find_remote(&name)
            .ok()
            .and_then(|r| r.url().and_then(parse_remote))
        else {
            continue;
        };
        if seen.contains(&forge) {
            continue;
        }
        seen.push(forge.clone());
        let (token, source) = token_for(forge.kind, &forge.host);
        let mut status = ForgeStatus {
            remote: name.clone(),
            kind: forge.kind,
            host: forge.host.clone(),
            slug: forge.slug.clone(),
            token: source,
            unauthorized: false,
            error: None,
        };
        if let Some(token) = token {
            match open_pulls(&api_base(forge.kind, &forge.host), &forge, &name, &token) {
                Ok(prs) => report.prs.extend(prs),
                Err(FetchError::Unauthorized) => status.unauthorized = true,
                Err(FetchError::Other(e)) => status.error = Some(e),
            }
        }
        report.forges.push(status);
    }
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;

    fn gh(slug: &str) -> Option<Forge> {
        Some(Forge {
            kind: ForgeKind::Github,
            host: "github.com".into(),
            slug: slug.into(),
        })
    }

    #[test]
    fn parses_remote_urls_of_every_shape() {
        for url in [
            "https://github.com/jimoou/ddugit.git",
            "https://github.com/jimoou/ddugit",
            "https://someone@github.com/jimoou/ddugit/",
            "git@github.com:jimoou/ddugit.git",
            "ssh://git@github.com:22/jimoou/ddugit.git",
            "  git@GitHub.com:jimoou/ddugit  ",
        ] {
            assert_eq!(parse_remote(url), gh("jimoou/ddugit"), "{url}");
        }
        assert_eq!(
            parse_remote("git@gitlab.example.com:group/sub/project.git"),
            Some(Forge {
                kind: ForgeKind::Gitlab,
                host: "gitlab.example.com".into(),
                slug: "group/sub/project".into(),
            })
        );
        assert_eq!(parse_remote("https://example.com/a/b.git"), None);
        assert_eq!(parse_remote("/srv/git/project.git"), None);
        assert_eq!(parse_remote("https://github.com/only-owner"), None);
    }

    #[test]
    fn api_roots_cover_enterprise_and_self_hosted() {
        assert_eq!(
            api_base(ForgeKind::Github, "github.com"),
            "https://api.github.com"
        );
        assert_eq!(
            api_base(ForgeKind::Github, "github.corp.io"),
            "https://github.corp.io/api/v3"
        );
        assert_eq!(
            api_base(ForgeKind::Gitlab, "gitlab.com"),
            "https://gitlab.com/api/v4"
        );
    }

    /// Serve one canned HTTP response and hand back the request it got.
    fn serve_once(status: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let reply = format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let handle = std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut buf = [0u8; 4096];
            let n = sock.read(&mut buf).unwrap();
            sock.write_all(reply.as_bytes()).unwrap();
            String::from_utf8_lossy(&buf[..n]).to_string()
        });
        (base, handle)
    }

    #[test]
    fn reads_github_pulls_with_the_token() {
        let body = r#"[{"number":7,"title":"Graph zoom","html_url":"https://github.com/o/r/pull/7","draft":true,
            "head":{"ref":"feature/zoom","sha":"abc123"},"user":{"login":"jimin"},"extra":1}]"#;
        let (base, server) = serve_once("200 OK", body);
        let prs = match open_pulls(&base, &gh("o/r").unwrap(), "origin", "t0ken") {
            Ok(p) => p,
            Err(_) => panic!("fetch failed"),
        };
        let request = server.join().unwrap();
        assert!(
            request.starts_with("GET /repos/o/r/pulls?state=open&per_page=100 "),
            "{request}"
        );
        assert!(
            request
                .to_ascii_lowercase()
                .contains("authorization: bearer t0ken"),
            "{request}"
        );
        assert_eq!(
            prs,
            [PullRequest {
                remote: "origin".into(),
                number: 7,
                title: "Graph zoom".into(),
                url: "https://github.com/o/r/pull/7".into(),
                draft: true,
                branch: "feature/zoom".into(),
                sha: "abc123".into(),
                author: "jimin".into(),
            }]
        );
    }

    #[test]
    fn reads_gitlab_merge_requests_and_flags_a_refused_token() {
        let forge = Forge {
            kind: ForgeKind::Gitlab,
            host: "gitlab.com".into(),
            slug: "group/sub/project".into(),
        };
        let body = r#"[{"iid":3,"title":"Fix","web_url":"https://gitlab.com/x/-/merge_requests/3",
            "source_branch":"fix/x","sha":"def456","author":{"username":"minji"}}]"#;
        let (base, server) = serve_once("200 OK", body);
        let prs = open_pulls(&base, &forge, "origin", "glpat").ok().unwrap();
        let request = server.join().unwrap();
        assert!(request.starts_with("GET /projects/group%2Fsub%2Fproject/merge_requests?state=opened"));
        assert!(request.to_ascii_lowercase().contains("private-token: glpat"));
        assert_eq!(
            (prs[0].number, prs[0].draft, prs[0].sha.as_str()),
            (3, false, "def456")
        );

        let (base, server) = serve_once("401 Unauthorized", r#"{"message":"Bad credentials"}"#);
        assert!(matches!(
            open_pulls(&base, &forge, "origin", "old"),
            Err(FetchError::Unauthorized)
        ));
        server.join().unwrap();
    }
}
