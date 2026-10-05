//! Opening a pull request (GitHub, GitHub Enterprise) or merge request (GitLab,
//! self-hosted included) from a local branch, over the forges' REST APIs.
//! The token stays here: only the new request's number and link go back.

use std::path::Path;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{is_public_forge, parse_remote, token_for, FetchError, Forge, ForgeKind, TokenSource};

pub type Result<T> = std::result::Result<T, String>;

/// Where a pull request would go, and whether it can go there now.
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PrTarget {
    pub remote: String,
    pub kind: ForgeKind,
    pub host: String,
    pub slug: String,
    pub token: TokenSource,
    pub public: bool,
    /// No token, or the token was refused: the UI asks for one.
    pub needs_token: bool,
    pub unauthorized: bool,
    /// A private or self-hosted repository without Pro (as in the pull request list).
    pub locked: bool,
    /// The project's default branch, the usual base.
    pub default_branch: Option<String>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewPr {
    /// Branch to merge into, as named on the forge.
    pub base: String,
    /// Branch with the changes; already pushed to the same project.
    pub head: String,
    pub title: String,
    pub body: String,
    pub draft: bool,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum PrOutcome {
    Created {
        number: u64,
        url: String,
    },
    /// One is already open for this branch.
    Exists {
        number: u64,
        url: String,
    },
    /// The token was refused or may not write (e.g. GitLab's `read_api`): ask for another.
    Refused {
        message: String,
    },
}

/// Base of the REST API on a forge host.
pub fn api_base(kind: ForgeKind, host: &str) -> String {
    match kind {
        ForgeKind::Github if host == "github.com" => "https://api.github.com".into(),
        ForgeKind::Github => format!("https://{host}/api/v3"),
        ForgeKind::Gitlab => format!("https://{host}/api/v4"),
    }
}

/// Percent-encode everything but RFC 3986's unreserved characters
/// (GitLab project paths as ids, branch names in queries).
fn enc(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The project's REST resource: `/repos/owner/repo` or `/projects/group%2Fproject`.
pub fn project_url(base: &str, forge: &Forge) -> String {
    match forge.kind {
        ForgeKind::Github => format!("{base}/repos/{}", forge.slug),
        ForgeKind::Gitlab => format!("{base}/projects/{}", enc(&forge.slug)),
    }
}

/// Where to POST a new pull / merge request.
fn create_url(base: &str, forge: &Forge) -> String {
    let project = project_url(base, forge);
    match forge.kind {
        ForgeKind::Github => format!("{project}/pulls"),
        ForgeKind::Gitlab => format!("{project}/merge_requests"),
    }
}

/// The open pull / merge request from `head`, to find the one that already exists.
fn existing_url(base: &str, forge: &Forge, head: &str) -> String {
    let project = project_url(base, forge);
    match forge.kind {
        ForgeKind::Github => {
            let owner = forge.slug.split('/').next().unwrap_or("");
            format!(
                "{project}/pulls?state=open&head={}",
                enc(&format!("{owner}:{head}"))
            )
        }
        ForgeKind::Gitlab => format!(
            "{project}/merge_requests?state=opened&source_branch={}",
            enc(head)
        ),
    }
}

const DRAFT: &str = "Draft: ";

/// GitHub takes `draft`; GitLab marks a draft by its title.
pub fn request_body(kind: ForgeKind, req: &NewPr) -> Value {
    let title = req.title.trim();
    match kind {
        ForgeKind::Github => json!({
            "title": title, "head": req.head, "base": req.base, "body": req.body, "draft": req.draft,
        }),
        ForgeKind::Gitlab => {
            let marked = title.to_ascii_lowercase().starts_with("draft:");
            let title = if req.draft && !marked {
                format!("{DRAFT}{title}")
            } else {
                title.to_string()
            };
            json!({
                "title": title, "source_branch": req.head, "target_branch": req.base, "description": req.body,
            })
        }
    }
}

/// Number and web link of a pull / merge request in a reply.
fn number_and_url(kind: ForgeKind, v: &Value) -> Option<(u64, String)> {
    let (n, url) = match kind {
        ForgeKind::Github => (&v["number"], &v["html_url"]),
        ForgeKind::Gitlab => (&v["iid"], &v["web_url"]),
    };
    Some((n.as_u64()?, url.as_str()?.to_string()))
}

/// A forge's error reply as one readable line. GitHub: `message` plus
/// `errors[].message` (or `field` + `code`); GitLab: `message` as a string,
/// a list or a `{field: [problems]}` map, or `error`.
pub fn error_text(v: &Value) -> String {
    let strings = |v: &Value| -> Vec<String> {
        match v {
            Value::String(s) => vec![s.clone()],
            Value::Array(a) => a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect(),
            Value::Object(m) => m
                .iter()
                .flat_map(|(field, problems)| match problems {
                    Value::Array(a) => a
                        .iter()
                        .filter_map(|x| x.as_str().map(|p| format!("{field} {p}")))
                        .collect(),
                    Value::String(p) => vec![format!("{field} {p}")],
                    _ => vec![],
                })
                .collect(),
            _ => vec![],
        }
    };
    let details: Vec<String> = v["errors"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|e| match (&e["message"], &e["field"], &e["code"]) {
            (Value::String(m), _, _) => Some(m.clone()),
            (_, Value::String(f), Value::String(c)) => Some(format!("{f} {c}")),
            _ => e.as_str().map(str::to_string),
        })
        .collect();
    let mut parts = if details.is_empty() {
        strings(&v["message"])
    } else {
        details
    };
    if parts.is_empty() {
        parts = strings(&v["error"]);
    }
    parts.join("; ")
}

/// GitHub answers 422 ("A pull request already exists for o:b."), GitLab 409
/// ("Another open merge request already exists for this source branch: !12").
pub fn already_exists(status: u16, text: &str) -> bool {
    matches!(status, 409 | 422) && text.to_ascii_lowercase().contains("already exists")
}

/// One REST call; any status comes back with its JSON body (`Null` when it has none).
fn rest(method: &str, url: &str, token: &str, body: Option<&Value>) -> Result<(u16, Value)> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(20)))
        .http_status_as_error(false)
        .build()
        .into();
    let auth = format!("Bearer {token}");
    let mut resp = match body {
        Some(b) => agent
            .post(url)
            .header("Authorization", &auth)
            .header("User-Agent", "ddugit")
            .header("Accept", "application/json")
            .send_json(b),
        None => agent
            .get(url)
            .header("Authorization", &auth)
            .header("User-Agent", "ddugit")
            .header("Accept", "application/json")
            .call(),
    }
    .map_err(|e| format!("{method} {url}: {e}"))?;
    let status = resp.status().as_u16();
    let text = resp.body_mut().read_to_string().unwrap_or_default();
    Ok((status, serde_json::from_str(&text).unwrap_or(Value::Null)))
}

/// The project's default branch and whether it is private (GitLab's `internal` too).
fn project_at(
    base: &str,
    forge: &Forge,
    token: &str,
) -> std::result::Result<(Option<String>, bool), FetchError> {
    let (status, v) = rest("GET", &project_url(base, forge), token, None).map_err(FetchError::Other)?;
    match status {
        200..=299 => {}
        401 | 403 => return Err(FetchError::Unauthorized),
        404 => {
            return Err(FetchError::Other(format!(
                "{} not found on {}",
                forge.slug, forge.host
            )))
        }
        s => return Err(FetchError::Other(format!("HTTP {s}: {}", error_text(&v)))),
    }
    let default = v["default_branch"].as_str().map(str::to_string);
    let private = match forge.kind {
        ForgeKind::Github => v["private"].as_bool().unwrap_or(false),
        ForgeKind::Gitlab => v["visibility"].as_str() != Some("public"),
    };
    Ok((default, private))
}

/// POST the request; on "already exists", look up the open one for its link.
fn open_at(base: &str, forge: &Forge, token: &str, req: &NewPr) -> Result<PrOutcome> {
    let (status, v) = rest(
        "POST",
        &create_url(base, forge),
        token,
        Some(&request_body(forge.kind, req)),
    )?;
    let text = error_text(&v);
    match status {
        200..=299 => {
            let (number, url) = number_and_url(forge.kind, &v).ok_or("The forge's reply has no link")?;
            Ok(PrOutcome::Created { number, url })
        }
        401 | 403 => Ok(PrOutcome::Refused {
            message: if text.is_empty() {
                format!("HTTP {status}")
            } else {
                text
            },
        }),
        s if already_exists(s, &text) => {
            let (_, list) = rest("GET", &existing_url(base, forge, &req.head), token, None)?;
            match list.get(0).and_then(|first| number_and_url(forge.kind, first)) {
                Some((number, url)) => Ok(PrOutcome::Exists { number, url }),
                None => Err(text),
            }
        }
        s => Err(if text.is_empty() {
            format!("HTTP {s}")
        } else {
            text
        }),
    }
}

/// The forge a remote of the repository at `path` lives on.
fn forge_of(path: &str, remote: &str) -> Result<Forge> {
    let repo = git2::Repository::discover(Path::new(path)).map_err(|e| e.message().to_string())?;
    let r = repo.find_remote(remote).map_err(|e| e.message().to_string())?;
    r.url()
        .and_then(parse_remote)
        .ok_or_else(|| format!("{remote} is not a GitHub or GitLab remote"))
}

/// Free covers public repositories on github.com / gitlab.com, like the pull request list.
fn locked(pro: bool, forge: &Forge, private: bool) -> bool {
    !pro && (private || !is_public_forge(&forge.host))
}

const LOCKED: &str = "Pull requests on private or company-server repositories need ddugit Pro";

/// Where a pull request from `remote` would go: its project, token state, and default branch.
pub fn target(path: &str, remote: &str, trusted: &[String], pro: bool) -> Result<PrTarget> {
    let forge = forge_of(path, remote)?;
    let (token, source) = token_for(forge.kind, &forge.host, trusted);
    let mut out = PrTarget {
        remote: remote.to_string(),
        kind: forge.kind,
        host: forge.host.clone(),
        slug: forge.slug.clone(),
        token: source,
        public: is_public_forge(&forge.host),
        needs_token: token.is_none(),
        unauthorized: false,
        locked: false,
        default_branch: None,
    };
    if let Some(token) = token {
        match project_at(&api_base(forge.kind, &forge.host), &forge, &token) {
            Ok((default, private)) => {
                out.locked = locked(pro, &forge, private);
                out.default_branch = default;
            }
            Err(FetchError::Unauthorized) => (out.needs_token, out.unauthorized) = (true, true),
            Err(FetchError::Other(e)) => return Err(e),
        }
    }
    Ok(out)
}

/// Open a pull / merge request on `remote`'s project. The Pro line is checked
/// here too (the project is read first), not only in the UI.
pub fn create(path: &str, remote: &str, trusted: &[String], pro: bool, req: &NewPr) -> Result<PrOutcome> {
    if req.title.trim().is_empty() {
        return Err("A title is required".into());
    }
    let forge = forge_of(path, remote)?;
    let Some(token) = token_for(forge.kind, &forge.host, trusted).0 else {
        return Ok(PrOutcome::Refused {
            message: format!("No token for {}", forge.host),
        });
    };
    let base = api_base(forge.kind, &forge.host);
    match project_at(&base, &forge, &token) {
        Ok((_, private)) if locked(pro, &forge, private) => Err(LOCKED.into()),
        Ok(_) => open_at(&base, &forge, &token, req),
        Err(FetchError::Unauthorized) => Ok(PrOutcome::Refused {
            message: format!("{} refused the token", forge.host),
        }),
        Err(FetchError::Other(e)) => Err(e),
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::serve;
    use super::*;

    fn forge(kind: ForgeKind, host: &str, slug: &str) -> Forge {
        Forge {
            kind,
            host: host.into(),
            slug: slug.into(),
        }
    }

    fn req(draft: bool) -> NewPr {
        NewPr {
            base: "main".into(),
            head: "feature/zoom".into(),
            title: " Graph zoom ".into(),
            body: "- Zoom levels".into(),
            draft,
        }
    }

    #[test]
    fn builds_rest_urls_for_every_host() {
        assert_eq!(
            api_base(ForgeKind::Github, "github.com"),
            "https://api.github.com"
        );
        assert_eq!(
            api_base(ForgeKind::Github, "github.corp.io"),
            "https://github.corp.io/api/v3"
        );
        assert_eq!(
            api_base(ForgeKind::Gitlab, "gitlab.corp.io:8443"),
            "https://gitlab.corp.io:8443/api/v4"
        );
        let gh = forge(ForgeKind::Github, "github.com", "o/r");
        let gl = forge(ForgeKind::Gitlab, "gitlab.com", "group/sub/my.app");
        assert_eq!(create_url("B", &gh), "B/repos/o/r/pulls");
        assert_eq!(
            create_url("B", &gl),
            "B/projects/group%2Fsub%2Fmy.app/merge_requests"
        );
        assert_eq!(
            existing_url("B", &gh, "feature/zoom"),
            "B/repos/o/r/pulls?state=open&head=o%3Afeature%2Fzoom"
        );
        assert_eq!(
            existing_url("B", &gl, "fix/a b"),
            "B/projects/group%2Fsub%2Fmy.app/merge_requests?state=opened&source_branch=fix%2Fa%20b"
        );
    }

    #[test]
    fn request_bodies_mark_drafts_each_forges_way() {
        let gh = request_body(ForgeKind::Github, &req(true));
        assert_eq!(
            gh,
            json!({"title": "Graph zoom", "head": "feature/zoom", "base": "main", "body": "- Zoom levels", "draft": true})
        );
        let gl = request_body(ForgeKind::Gitlab, &req(true));
        assert_eq!(
            gl,
            json!({"title": "Draft: Graph zoom", "source_branch": "feature/zoom", "target_branch": "main",
                   "description": "- Zoom levels"})
        );
        assert_eq!(
            request_body(ForgeKind::Gitlab, &req(false))["title"],
            "Graph zoom"
        );
        let mut marked = req(true);
        marked.title = "draft: Already".into();
        assert_eq!(
            request_body(ForgeKind::Gitlab, &marked)["title"],
            "draft: Already"
        );
    }

    #[test]
    fn reads_forge_errors_as_one_line() {
        let gh = json!({"message": "Validation Failed", "errors": [
            {"resource": "PullRequest", "code": "custom", "message": "A pull request already exists for o:x."}]});
        assert_eq!(error_text(&gh), "A pull request already exists for o:x.");
        let field = json!({"message": "Validation Failed", "errors": [{"field": "head", "code": "invalid"}]});
        assert_eq!(error_text(&field), "head invalid");
        assert_eq!(error_text(&json!({"message": "Not Found"})), "Not Found");
        let gl =
            json!({"message": ["Another open merge request already exists for this source branch: !12"]});
        assert!(already_exists(409, &error_text(&gl)));
        assert!(!already_exists(400, &error_text(&gl)));
        assert_eq!(
            error_text(&json!({"message": {"target_branch": ["is invalid"]}})),
            "target_branch is invalid"
        );
        assert_eq!(
            error_text(&json!({"error": "insufficient_scope"})),
            "insufficient_scope"
        );
        assert_eq!(error_text(&Value::Null), "");
    }

    #[test]
    fn free_covers_only_public_repositories_on_the_public_forges() {
        let gh = forge(ForgeKind::Github, "github.com", "o/r");
        let corp = forge(ForgeKind::Gitlab, "gitlab.corp.io", "a/b");
        assert!(!locked(false, &gh, false));
        assert!(locked(false, &gh, true));
        assert!(locked(false, &corp, false));
        assert!(!locked(true, &corp, true));
    }

    #[test]
    fn opens_a_github_pull_request_and_reads_the_project() {
        let gh = forge(ForgeKind::Github, "github.com", "o/r");
        let (base, server) = serve(vec![("200 OK", r#"{"default_branch":"develop","private":true}"#)]);
        let Ok((default, private)) = project_at(&base, &gh, "t0ken") else {
            panic!("read failed")
        };
        assert_eq!((default.as_deref(), private), (Some("develop"), true));
        assert!(server.join().unwrap()[0].starts_with("GET /repos/o/r "));

        let (base, server) = serve(vec![(
            "201 Created",
            r#"{"number":42,"html_url":"https://github.com/o/r/pull/42"}"#,
        )]);
        let out = open_at(&base, &gh, "t0ken", &req(true)).unwrap();
        assert_eq!(
            out,
            PrOutcome::Created {
                number: 42,
                url: "https://github.com/o/r/pull/42".into()
            }
        );
        let request = &server.join().unwrap()[0];
        assert!(request.starts_with("POST /repos/o/r/pulls "), "{request}");
        assert!(request
            .to_ascii_lowercase()
            .contains("authorization: bearer t0ken"));
        assert!(request.replace(' ', "").contains(r#""draft":true"#), "{request}");
    }

    #[test]
    fn an_existing_request_comes_back_with_its_link_and_refusals_ask_for_a_token() {
        let gl = forge(ForgeKind::Gitlab, "gitlab.com", "group/app");
        let (base, server) = serve(vec![
            (
                "409 Conflict",
                r#"{"message":["Another open merge request already exists for this source branch: !7"]}"#,
            ),
            (
                "200 OK",
                r#"[{"iid":7,"web_url":"https://gitlab.com/group/app/-/merge_requests/7"}]"#,
            ),
        ]);
        let out = open_at(&base, &gl, "glpat", &req(false)).unwrap();
        assert_eq!(
            out,
            PrOutcome::Exists {
                number: 7,
                url: "https://gitlab.com/group/app/-/merge_requests/7".into()
            }
        );
        let requests = server.join().unwrap();
        assert!(requests[0].starts_with("POST /projects/group%2Fapp/merge_requests "));
        assert!(requests[1].starts_with(
            "GET /projects/group%2Fapp/merge_requests?state=opened&source_branch=feature%2Fzoom "
        ));

        let (base, server) = serve(vec![("403 Forbidden", r#"{"error":"insufficient_scope"}"#)]);
        assert_eq!(
            open_at(&base, &gl, "read-only", &req(false)).unwrap(),
            PrOutcome::Refused {
                message: "insufficient_scope".into()
            }
        );
        server.join().unwrap();

        let (base, server) = serve(vec![(
            "422 Unprocessable Entity",
            r#"{"message":"Validation Failed","errors":[{"resource":"PullRequest","code":"custom","message":"No commits between main and feature/zoom"}]}"#,
        )]);
        let gh = forge(ForgeKind::Github, "github.com", "o/r");
        assert_eq!(
            open_at(&base, &gh, "t", &req(false)),
            Err("No commits between main and feature/zoom".into())
        );
        server.join().unwrap();
    }

    #[test]
    fn a_remote_off_the_forges_has_no_target() {
        let d = tempfile::tempdir().unwrap();
        let repo = git2::Repository::init(d.path()).unwrap();
        repo.remote("origin", "https://example.com/a/b.git").unwrap();
        let p = d.path().to_str().unwrap();
        assert!(target(p, "origin", &[], true).is_err());
        assert!(target(p, "nope", &[], true).is_err());
        assert!(create(
            p,
            "origin",
            &[],
            true,
            &NewPr {
                title: " ".into(),
                ..req(false)
            }
        )
        .is_err());
    }
}
