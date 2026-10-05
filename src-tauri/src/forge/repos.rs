//! The signed-in user's repositories on a forge (GitHub, GitLab; public or
//! self-hosted), to clone one or add it as a remote without copying its URL.
//! The token stays here: only names and URLs go to the webview.

use serde::{Deserialize, Serialize};

use super::{
    graphql, graphql_url, is_public_forge, token_for, FetchError, ForgeKind, Login, Nodes, TokenSource,
};

pub type Result<T> = std::result::Result<T, String>;

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ForgeRepo {
    /// `owner/repo` on GitHub; the full (possibly nested) project path on GitLab.
    pub full_name: String,
    pub description: Option<String>,
    /// Anything but public (GitLab's `internal` included).
    pub private: bool,
    pub https_url: String,
    pub ssh_url: String,
    /// Last update (GitHub) or activity (GitLab), RFC 3339.
    pub updated: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ForgeRepos {
    pub kind: ForgeKind,
    /// The host as asked, normalized (`https://GitHub.com/` → `github.com`).
    pub host: String,
    pub token: TokenSource,
    /// github.com / gitlab.com themselves.
    pub public: bool,
    /// No token, or the token was refused (`unauthorized`): the UI asks for one.
    pub needs_token: bool,
    pub unauthorized: bool,
    /// The signed-in login.
    pub user: Option<String>,
    /// Most recently updated first.
    pub repos: Vec<ForgeRepo>,
}

/// A host as people type it: maybe with a scheme, a user, a path or a trailing slash.
pub fn normalize_host(input: &str) -> Result<String> {
    let s = input.trim();
    let s = s.split_once("://").map_or(s, |(_, rest)| rest);
    let s = s.split('/').next().unwrap_or("");
    let s = s.rsplit('@').next().unwrap_or("").to_ascii_lowercase();
    let ok = !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | ':'))
        && !s.starts_with(['.', '-', ':']);
    if ok {
        Ok(s)
    } else {
        Err(format!("Not a host name: {}", input.trim()))
    }
}

const GITHUB_QUERY: &str = "query { viewer { login repositories(first: 100, \
    affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], \
    ownerAffiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], \
    orderBy: {field: UPDATED_AT, direction: DESC}) { \
    nodes { nameWithOwner description isPrivate url sshUrl updatedAt } } } }";

const GITLAB_QUERY: &str = "query { currentUser { username } \
    projects(membership: true, first: 100, sort: \"latest_activity_desc\") { \
    nodes { fullPath description visibility httpUrlToRepo sshUrlToRepo lastActivityAt } } }";

#[derive(Deserialize)]
struct GhData {
    viewer: GhViewer,
}
#[derive(Deserialize)]
struct GhViewer {
    login: String,
    repositories: Nodes<GhRepo>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GhRepo {
    name_with_owner: String,
    description: Option<String>,
    #[serde(default)]
    is_private: bool,
    url: String,
    ssh_url: String,
    updated_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlData {
    current_user: Option<Login>,
    projects: Nodes<GlProject>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct GlProject {
    full_path: String,
    description: Option<String>,
    visibility: Option<String>,
    http_url_to_repo: String,
    ssh_url_to_repo: String,
    last_activity_at: Option<String>,
}

/// Blank descriptions are no description.
fn text(s: Option<String>) -> Option<String> {
    s.map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// GitHub's `url` is the web page; `.git` makes it the clone address.
fn clone_url(web: &str) -> String {
    let web = web.trim_end_matches('/');
    if web.ends_with(".git") {
        web.to_string()
    } else {
        format!("{web}.git")
    }
}

fn from_github(d: GhData) -> (Option<String>, Vec<ForgeRepo>) {
    let repos = d
        .viewer
        .repositories
        .nodes
        .into_iter()
        .map(|r| ForgeRepo {
            full_name: r.name_with_owner,
            description: text(r.description),
            private: r.is_private,
            https_url: clone_url(&r.url),
            ssh_url: r.ssh_url,
            updated: r.updated_at.unwrap_or_default(),
        })
        .collect();
    (Some(d.viewer.login), repos)
}

fn from_gitlab(d: GlData) -> (Option<String>, Vec<ForgeRepo>) {
    let repos = d
        .projects
        .nodes
        .into_iter()
        .map(|p| ForgeRepo {
            full_name: p.full_path,
            description: text(p.description),
            private: p.visibility.as_deref() != Some("public"),
            https_url: p.http_url_to_repo,
            ssh_url: p.ssh_url_to_repo,
            updated: p.last_activity_at.unwrap_or_default(),
        })
        .collect();
    (d.current_user.map(|u| u.login), repos)
}

/// One query: the user's login and their repositories.
pub(super) fn fetch(
    endpoint: &str,
    kind: ForgeKind,
    token: &str,
) -> std::result::Result<(Option<String>, Vec<ForgeRepo>), FetchError> {
    let none = serde_json::json!({});
    Ok(match kind {
        ForgeKind::Github => from_github(graphql(endpoint, token, GITHUB_QUERY, none)?),
        ForgeKind::Gitlab => from_gitlab(graphql(endpoint, token, GITLAB_QUERY, none)?),
    })
}

/// The repositories the signed-in user owns, collaborates on or reaches through
/// an organization / group on `host`. Without a token (or with a refused one)
/// the list is empty and `needs_token` says to ask for one.
pub fn list(kind: ForgeKind, host: &str) -> Result<ForgeRepos> {
    let host = normalize_host(host)?;
    let (token, source) = token_for(kind, &host);
    let mut out = ForgeRepos {
        kind,
        public: is_public_forge(&host),
        token: source,
        needs_token: token.is_none(),
        unauthorized: false,
        user: None,
        repos: Vec::new(),
        host,
    };
    if let Some(token) = token {
        match fetch(&graphql_url(kind, &out.host), kind, &token) {
            Ok((user, repos)) => (out.user, out.repos) = (user, repos),
            Err(FetchError::Unauthorized) => (out.needs_token, out.unauthorized) = (true, true),
            Err(FetchError::Other(e)) => return Err(e),
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_hosts_as_typed() {
        for h in [
            "github.com",
            " GitHub.com ",
            "https://github.com/",
            "https://github.com/jimoou/ddugit",
            "git@github.com",
        ] {
            assert_eq!(normalize_host(h).unwrap(), "github.com", "{h}");
        }
        assert_eq!(
            normalize_host("gitlab.corp.io:8443").unwrap(),
            "gitlab.corp.io:8443"
        );
        for bad in ["", "   ", "https://", "git hub.com", "-x.com", "a?b"] {
            assert!(normalize_host(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn reads_github_repositories() {
        let body = r#"{"viewer":{"login":"jimin","repositories":{"nodes":[
            {"nameWithOwner":"jimin/rocket","description":"  ","isPrivate":true,
             "url":"https://github.com/jimin/rocket","sshUrl":"git@github.com:jimin/rocket.git",
             "updatedAt":"2026-10-01T09:00:00Z"},
            {"nameWithOwner":"acme/site","description":"Landing page","isPrivate":false,
             "url":"https://github.com/acme/site","sshUrl":"git@github.com:acme/site.git","updatedAt":null}]}}}"#;
        let (user, repos) = from_github(serde_json::from_str(body).unwrap());
        assert_eq!(user.as_deref(), Some("jimin"));
        assert_eq!(
            repos[0],
            ForgeRepo {
                full_name: "jimin/rocket".into(),
                description: None,
                private: true,
                https_url: "https://github.com/jimin/rocket.git".into(),
                ssh_url: "git@github.com:jimin/rocket.git".into(),
                updated: "2026-10-01T09:00:00Z".into(),
            }
        );
        assert_eq!(
            (
                repos[1].description.as_deref(),
                repos[1].private,
                repos[1].updated.as_str()
            ),
            (Some("Landing page"), false, "")
        );
    }

    #[test]
    fn reads_gitlab_projects_and_counts_internal_as_private() {
        let body = r#"{"currentUser":{"username":"minji"},"projects":{"nodes":[
            {"fullPath":"group/sub/app","description":null,"visibility":"internal",
             "httpUrlToRepo":"https://gitlab.corp.io/group/sub/app.git",
             "sshUrlToRepo":"git@gitlab.corp.io:group/sub/app.git","lastActivityAt":"2026-09-30T12:00:00Z"},
            {"fullPath":"minji/notes","description":"Notes","visibility":"public",
             "httpUrlToRepo":"https://gitlab.corp.io/minji/notes.git",
             "sshUrlToRepo":"git@gitlab.corp.io:minji/notes.git","lastActivityAt":"2026-09-01T12:00:00Z"}]}}"#;
        let (user, repos) = from_gitlab(serde_json::from_str(body).unwrap());
        assert_eq!(user.as_deref(), Some("minji"));
        assert_eq!(
            (
                repos[0].full_name.as_str(),
                repos[0].private,
                repos[0].description.clone()
            ),
            ("group/sub/app", true, None)
        );
        assert_eq!(repos[0].https_url, "https://gitlab.corp.io/group/sub/app.git");
        assert!(!repos[1].private);
    }

    #[test]
    fn an_untrusted_host_without_a_saved_token_asks_for_one() {
        // Never reaches `gh` (not signed in there), nothing in the keychain here: no network either.
        let r = list(ForgeKind::Github, "https://GitHub.attacker.example/").unwrap();
        assert_eq!(r.host, "github.attacker.example");
        assert!(r.needs_token && !r.unauthorized && !r.public && r.repos.is_empty());
        assert!(list(ForgeKind::Gitlab, "not a host").is_err());
    }
}
