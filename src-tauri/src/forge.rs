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
    pub state: PrState,
    /// CI on the head commit, if any runs.
    pub checks: Option<Checks>,
    pub review: Option<Review>,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum PrState {
    Open,
    Merged,
    Closed,
}

impl PrState {
    /// GitHub `OPEN` / `MERGED` / `CLOSED`, GitLab `opened` / `merged` / `closed` / `locked`.
    fn parse(s: &str) -> Self {
        match s.to_ascii_lowercase().as_str() {
            "merged" => PrState::Merged,
            "closed" | "locked" => PrState::Closed,
            _ => PrState::Open,
        }
    }
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Checks {
    Success,
    Failure,
    Pending,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Review {
    Approved,
    /// Changes requested.
    Changes,
    /// Waiting for a required review.
    Required,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForgeStatus {
    pub remote: String,
    pub kind: ForgeKind,
    pub host: String,
    pub slug: String,
    pub token: TokenSource,
    /// Not github.com / gitlab.com: the UI says so before any token goes there.
    pub public: bool,
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

/// GraphQL endpoint for a forge host (GitHub Enterprise and self-hosted GitLab included).
/// One query per project brings every open pull request with its CI and review state.
pub fn graphql_url(kind: ForgeKind, host: &str) -> String {
    match kind {
        ForgeKind::Github if host == "github.com" => "https://api.github.com/graphql".into(),
        ForgeKind::Github | ForgeKind::Gitlab => format!("https://{host}/api/graphql"),
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

/// github.com and gitlab.com themselves; any other host is only "a GitHub" or
/// "a GitLab" because its name says so, which a repository's remote URL controls.
pub fn is_public_forge(host: &str) -> bool {
    host == "github.com" || host == "gitlab.com"
}

/// The forge CLI's token first, then the keychain. A CLI login is used for a
/// host other than github.com / gitlab.com only once the user trusted that host:
/// `gh` hands out its enterprise token for any host, so a repository whose
/// remote names `github.attacker.example` would otherwise receive it. A token
/// in the keychain was saved by the user for exactly that host.
fn token_for(kind: ForgeKind, host: &str, trusted: &[String]) -> (Option<String>, TokenSource) {
    let cli_ok = is_public_forge(host) || trusted.iter().any(|t| t == host);
    if let Some(t) = cli_ok.then(|| cli_token(kind, host)).flatten() {
        return (Some(t), TokenSource::Cli);
    }
    match keychain(host).and_then(|e| e.get_password().ok()) {
        Some(t) => (Some(t), TokenSource::Keychain),
        None => (None, TokenSource::None),
    }
}

/// Every open pull request, and the 30 most recently merged or closed ones.
const GITHUB_QUERY: &str =
    "query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { \
    open: pullRequests(states: OPEN, first: 100, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ...pr } } \
    done: pullRequests(states: [MERGED, CLOSED], first: 30, orderBy: {field: UPDATED_AT, direction: DESC}) { nodes { ...pr } } } } \
    fragment pr on PullRequest { number title url isDraft state headRefName headRefOid author { login } reviewDecision \
    commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }";

/// GitLab takes one state per connection: open, then the latest merged (20) and closed (10).
const GITLAB_QUERY: &str = "query($path: ID!) { project(fullPath: $path) { \
    open: mergeRequests(state: opened, first: 100) { nodes { ...mr } } \
    merged: mergeRequests(state: merged, first: 20, sort: UPDATED_DESC) { nodes { ...mr } } \
    closed: mergeRequests(state: closed, first: 10, sort: UPDATED_DESC) { nodes { ...mr } } } } \
    fragment mr on MergeRequest { iid title webUrl draft state sourceBranch diffHeadSha author { username } \
    headPipeline { status } approved }";

#[derive(Deserialize)]
struct Gql<T> {
    data: Option<T>,
    #[serde(default)]
    errors: Vec<GqlError>,
}
#[derive(Deserialize)]
struct GqlError {
    message: String,
}
#[derive(Deserialize)]
struct Nodes<T> {
    nodes: Vec<T>,
}
impl<T> Default for Nodes<T> {
    fn default() -> Self {
        Nodes { nodes: Vec::new() }
    }
}
#[derive(Deserialize)]
struct Login {
    #[serde(alias = "username")]
    login: String,
}

#[derive(Deserialize)]
struct GhData {
    repository: Option<GhRepo>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhRepo {
    open: Nodes<GhPull>,
    #[serde(default)]
    done: Nodes<GhPull>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhPull {
    number: u64,
    title: String,
    url: String,
    is_draft: bool,
    #[serde(default)]
    state: String,
    head_ref_name: String,
    head_ref_oid: String,
    author: Option<Login>,
    review_decision: Option<String>,
    commits: Nodes<GhCommitNode>,
}
#[derive(Deserialize)]
struct GhCommitNode {
    commit: GhCommit,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhCommit {
    status_check_rollup: Option<State>,
}
#[derive(Deserialize)]
struct State {
    #[serde(alias = "status")]
    state: String,
}

#[derive(Deserialize)]
struct GlData {
    project: Option<GlProject>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlProject {
    open: Nodes<GlMerge>,
    #[serde(default)]
    merged: Nodes<GlMerge>,
    #[serde(default)]
    closed: Nodes<GlMerge>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlMerge {
    iid: String,
    title: String,
    web_url: String,
    draft: bool,
    #[serde(default)]
    state: String,
    source_branch: String,
    diff_head_sha: Option<String>,
    author: Option<Login>,
    head_pipeline: Option<State>,
    #[serde(default)]
    approved: bool,
}

/// GitHub's rollup state or a GitLab pipeline status, as one of three outcomes.
fn checks_of(state: &str) -> Option<Checks> {
    match state.to_ascii_uppercase().as_str() {
        "SUCCESS" => Some(Checks::Success),
        "FAILURE" | "FAILED" | "ERROR" | "CANCELED" => Some(Checks::Failure),
        "PENDING"
        | "EXPECTED"
        | "RUNNING"
        | "CREATED"
        | "PREPARING"
        | "WAITING_FOR_RESOURCE"
        | "SCHEDULED" => Some(Checks::Pending),
        _ => None, // skipped, manual: nothing to report
    }
}

fn review_of(decision: &str) -> Option<Review> {
    match decision {
        "APPROVED" => Some(Review::Approved),
        "CHANGES_REQUESTED" => Some(Review::Changes),
        "REVIEW_REQUIRED" => Some(Review::Required),
        _ => None,
    }
}

enum FetchError {
    Unauthorized,
    Other(String),
}

/// POST a GraphQL query; GraphQL errors (HTTP 200) count as failures too.
fn graphql<T: serde::de::DeserializeOwned>(
    url: &str,
    token: &str,
    query: &str,
    variables: serde_json::Value,
) -> std::result::Result<T, FetchError> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(15)))
        .http_status_as_error(false)
        .build()
        .into();
    let mut resp = agent
        .post(url)
        .header("Authorization", &format!("Bearer {token}"))
        .header("User-Agent", "ddugit")
        .header("Accept", "application/json")
        .send_json(serde_json::json!({ "query": query, "variables": variables }))
        .map_err(|e| FetchError::Other(e.to_string()))?;
    let reply: Gql<T> = match resp.status().as_u16() {
        200..=299 => resp
            .body_mut()
            .read_json()
            .map_err(|e| FetchError::Other(e.to_string()))?,
        401 | 403 => return Err(FetchError::Unauthorized),
        s => return Err(FetchError::Other(format!("HTTP {s} from {url}"))),
    };
    match (reply.data, reply.errors.first()) {
        (_, Some(e)) => Err(FetchError::Other(e.message.clone())),
        (Some(d), None) => Ok(d),
        (None, None) => Err(FetchError::Other(format!("Empty reply from {url}"))),
    }
}

fn pulls(
    endpoint: &str,
    forge: &Forge,
    remote: &str,
    token: &str,
) -> std::result::Result<Vec<PullRequest>, FetchError> {
    let not_found = || FetchError::Other(format!("{} not found on {}", forge.slug, forge.host));
    Ok(match forge.kind {
        ForgeKind::Github => {
            let (owner, name) = forge.slug.split_once('/').unwrap_or((&forge.slug, ""));
            let vars = serde_json::json!({ "owner": owner, "name": name });
            let data: GhData = graphql(endpoint, token, GITHUB_QUERY, vars)?;
            let repo = data.repository.ok_or_else(not_found)?;
            repo.open
                .nodes
                .into_iter()
                .chain(repo.done.nodes)
                .map(|p| PullRequest {
                    remote: remote.to_string(),
                    number: p.number,
                    title: p.title,
                    url: p.url,
                    draft: p.is_draft,
                    branch: p.head_ref_name,
                    sha: p.head_ref_oid,
                    author: p.author.map(|a| a.login).unwrap_or_default(),
                    state: PrState::parse(&p.state),
                    checks: p
                        .commits
                        .nodes
                        .first()
                        .and_then(|n| n.commit.status_check_rollup.as_ref())
                        .and_then(|r| checks_of(&r.state)),
                    review: p.review_decision.as_deref().and_then(review_of),
                })
                .collect()
        }
        ForgeKind::Gitlab => {
            let vars = serde_json::json!({ "path": forge.slug });
            let data: GlData = graphql(endpoint, token, GITLAB_QUERY, vars)?;
            let project = data.project.ok_or_else(not_found)?;
            project
                .open
                .nodes
                .into_iter()
                .chain(project.merged.nodes)
                .chain(project.closed.nodes)
                .map(|m| PullRequest {
                    remote: remote.to_string(),
                    number: m.iid.parse().unwrap_or(0),
                    title: m.title,
                    url: m.web_url,
                    draft: m.draft,
                    branch: m.source_branch,
                    sha: m.diff_head_sha.unwrap_or_default(),
                    author: m.author.map(|a| a.login).unwrap_or_default(),
                    state: PrState::parse(&m.state),
                    checks: m.head_pipeline.and_then(|p| checks_of(&p.state)),
                    review: m.approved.then_some(Review::Approved),
                })
                .collect()
        }
    })
}

/// Ask each forge remote (origin first, each project once) for its open pull requests
/// and the recently merged or closed ones.
/// `trusted` are hosts (besides github.com / gitlab.com) whose `gh` / `glab`
/// login the user agreed to use.
pub fn report(path: &str, trusted: &[String]) -> Result<PrReport> {
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
        let (token, source) = token_for(forge.kind, &forge.host, trusted);
        let mut status = ForgeStatus {
            remote: name.clone(),
            kind: forge.kind,
            host: forge.host.clone(),
            slug: forge.slug.clone(),
            token: source,
            public: is_public_forge(&forge.host),
            unauthorized: false,
            error: None,
        };
        if let Some(token) = token {
            match pulls(&graphql_url(forge.kind, &forge.host), &forge, &name, &token) {
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
    fn only_the_public_forges_get_a_cli_token_unasked() {
        assert!(is_public_forge("github.com") && is_public_forge("gitlab.com"));
        assert!(!is_public_forge("github.attacker.example"));
        assert!(!is_public_forge("gitlab.example.com"));
        // An untrusted host never reaches `gh` / `glab`, and has no keychain entry here.
        let (token, source) = token_for(ForgeKind::Github, "github.attacker.example", &[]);
        assert!(token.is_none() && source != TokenSource::Cli);
    }

    #[test]
    fn graphql_endpoints_cover_enterprise_and_self_hosted() {
        assert_eq!(
            graphql_url(ForgeKind::Github, "github.com"),
            "https://api.github.com/graphql"
        );
        assert_eq!(
            graphql_url(ForgeKind::Github, "github.corp.io"),
            "https://github.corp.io/api/graphql"
        );
        assert_eq!(
            graphql_url(ForgeKind::Gitlab, "gitlab.com"),
            "https://gitlab.com/api/graphql"
        );
    }

    #[test]
    fn maps_ci_and_review_states() {
        assert_eq!(checks_of("SUCCESS"), Some(Checks::Success));
        assert_eq!(checks_of("failed"), Some(Checks::Failure));
        assert_eq!(checks_of("RUNNING"), Some(Checks::Pending));
        assert_eq!(checks_of("SKIPPED"), None);
        assert_eq!(review_of("CHANGES_REQUESTED"), Some(Review::Changes));
        assert_eq!(review_of(""), None);
    }

    /// Serve one canned HTTP response and hand back the request (headers and body) it got.
    fn serve_once(status: &str, body: &str) -> (String, std::thread::JoinHandle<String>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/graphql", listener.local_addr().unwrap());
        let reply = format!(
            "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
            body.len()
        );
        let handle = std::thread::spawn(move || {
            let (mut sock, _) = listener.accept().unwrap();
            let mut got = Vec::new();
            let mut buf = [0u8; 4096];
            // Read the headers, then as much body as they announce.
            loop {
                let n = sock.read(&mut buf).unwrap();
                got.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&got).to_string();
                if let Some(end) = text.find("\r\n\r\n") {
                    let len = text
                        .lines()
                        .find_map(|l| {
                            l.to_ascii_lowercase()
                                .strip_prefix("content-length:")
                                .map(|v| v.trim().parse::<usize>().unwrap_or(0))
                        })
                        .unwrap_or(0);
                    if got.len() >= end + 4 + len || n == 0 {
                        break;
                    }
                } else if n == 0 {
                    break;
                }
            }
            sock.write_all(reply.as_bytes()).unwrap();
            String::from_utf8_lossy(&got).to_string()
        });
        (url, handle)
    }

    #[test]
    fn reads_github_pulls_with_their_checks_and_review() {
        let body = r#"{"data":{"repository":{"open":{"nodes":[
            {"number":7,"title":"Graph zoom","url":"https://github.com/o/r/pull/7","isDraft":true,"state":"OPEN",
             "headRefName":"feature/zoom","headRefOid":"abc123","author":{"login":"jimin"},
             "reviewDecision":"APPROVED","commits":{"nodes":[{"commit":{"statusCheckRollup":{"state":"FAILURE"}}}]}},
            {"number":8,"title":"Docs","url":"https://github.com/o/r/pull/8","isDraft":false,
             "headRefName":"docs","headRefOid":"def","author":null,"reviewDecision":null,
             "commits":{"nodes":[{"commit":{"statusCheckRollup":null}}]}}]},
            "done":{"nodes":[{"number":5,"title":"Old","url":"https://github.com/o/r/pull/5","isDraft":false,
             "state":"MERGED","headRefName":"old","headRefOid":"0ld","author":null,"reviewDecision":null,
             "commits":{"nodes":[]}}]}}}}"#;
        let (url, server) = serve_once("200 OK", body);
        let prs = match pulls(&url, &gh("o/r").unwrap(), "origin", "t0ken") {
            Ok(p) => p,
            Err(_) => panic!("fetch failed"),
        };
        let request = server.join().unwrap();
        assert!(request.starts_with("POST /graphql "), "{request}");
        assert!(
            request
                .to_ascii_lowercase()
                .contains("authorization: bearer t0ken"),
            "{request}"
        );
        let compact = request.replace([' ', '\n'], "");
        assert!(
            compact.contains(r#""owner":"o""#) && compact.contains(r#""name":"r""#),
            "{request}"
        );
        assert_eq!(
            prs[0],
            PullRequest {
                remote: "origin".into(),
                number: 7,
                title: "Graph zoom".into(),
                url: "https://github.com/o/r/pull/7".into(),
                draft: true,
                branch: "feature/zoom".into(),
                sha: "abc123".into(),
                author: "jimin".into(),
                state: PrState::Open,
                checks: Some(Checks::Failure),
                review: Some(Review::Approved),
            }
        );
        assert_eq!(
            (prs[1].checks, prs[1].review, prs[1].author.as_str()),
            (None, None, "")
        );
        assert_eq!(
            (prs.len(), prs[2].number, prs[2].state, prs[2].checks),
            (3, 5, PrState::Merged, None)
        );
    }

    #[test]
    fn reads_gitlab_merge_requests_and_flags_refused_tokens_and_errors() {
        let forge = Forge {
            kind: ForgeKind::Gitlab,
            host: "gitlab.com".into(),
            slug: "group/sub/project".into(),
        };
        let body = r#"{"data":{"project":{"open":{"nodes":[{"iid":"3","title":"Fix",
            "webUrl":"https://gitlab.com/x/-/merge_requests/3","draft":false,"state":"opened","sourceBranch":"fix/x",
            "diffHeadSha":"def456","author":{"username":"minji"},"headPipeline":{"status":"RUNNING"},"approved":true}]},
            "merged":{"nodes":[]},
            "closed":{"nodes":[{"iid":"2","title":"Nope","webUrl":"u","draft":false,"state":"closed",
            "sourceBranch":"nope","diffHeadSha":null,"author":null,"headPipeline":null}]}}}}"#;
        let (url, server) = serve_once("200 OK", body);
        let prs = pulls(&url, &forge, "origin", "glpat").ok().unwrap();
        let request = server.join().unwrap();
        assert!(
            request
                .replace([' ', '\n'], "")
                .contains(r#""path":"group/sub/project""#),
            "{request}"
        );
        assert_eq!(
            (
                prs[0].number,
                prs[0].sha.as_str(),
                prs[0].author.as_str(),
                prs[0].checks,
                prs[0].review
            ),
            (
                3,
                "def456",
                "minji",
                Some(Checks::Pending),
                Some(Review::Approved)
            )
        );
        assert_eq!(
            (prs.len(), prs[0].state, prs[1].number, prs[1].state),
            (2, PrState::Open, 2, PrState::Closed)
        );

        let (url, server) = serve_once("401 Unauthorized", r#"{"message":"Bad credentials"}"#);
        assert!(matches!(
            pulls(&url, &forge, "origin", "old"),
            Err(FetchError::Unauthorized)
        ));
        server.join().unwrap();

        let (url, server) = serve_once("200 OK", r#"{"data":null,"errors":[{"message":"no access"}]}"#);
        assert!(matches!(pulls(&url, &forge, "origin", "t"), Err(FetchError::Other(m)) if m == "no access"));
        server.join().unwrap();
    }
}
