//! Problem reports and questions, sent to ddugit.com over HTTPS (the site keeps
//! them for its admin page). The text was shown to the user, and redacted, before
//! it gets here; this only checks the limits the site sets and posts it.

use serde::{Deserialize, Serialize};

use crate::activate::{post, Reply};

type Result<T> = std::result::Result<T, String>;

const MESSAGE_MAX: usize = 5000;
const EMAIL_MAX: usize = 254;
const DIAGNOSTICS_MAX: usize = 20_000;

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ReportKind {
    Bug,
    Question,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewReport {
    pub kind: ReportKind,
    pub message: String,
    pub email: Option<String>,
    pub diagnostics: Option<String>,
}

/// The JSON body the site takes (`/api/report`), after the same checks it makes.
fn body(r: &NewReport, app_version: &str, os: &str) -> Result<serde_json::Value> {
    let message = r.message.trim();
    if message.is_empty() {
        return Err("Write what happened first".into());
    }
    if message.chars().count() > MESSAGE_MAX {
        return Err(format!("The message is longer than {MESSAGE_MAX} characters"));
    }
    let email = r.email.as_deref().map(str::trim).filter(|e| !e.is_empty());
    if let Some(e) = email {
        let looks_ok = e.len() <= EMAIL_MAX
            && e.split_once('@').is_some_and(|(user, host)| {
                !user.is_empty() && host.contains('.') && !e.contains(char::is_whitespace)
            });
        if !looks_ok {
            return Err("The reply email doesn't look like an email address".into());
        }
    }
    let diagnostics = r.diagnostics.as_deref().map(str::trim).filter(|d| !d.is_empty());
    // Diagnostics are a courtesy: cut rather than refuse (the log is at the end, oldest first).
    let diagnostics = diagnostics.map(|d| d.chars().take(DIAGNOSTICS_MAX).collect::<String>());
    Ok(serde_json::json!({
        "kind": r.kind,
        "message": message,
        "email": email,
        "diagnostics": diagnostics,
        "source": "app",
        "appVersion": app_version,
        "os": os,
    }))
}

/// What the site's answer means: the stored report's id, or its reason (a short English sentence).
fn outcome(reply: Reply) -> Result<String> {
    match (reply.ok, reply.id, reply.error) {
        (true, id, _) => Ok(id.unwrap_or_default()),
        (false, _, Some(e)) => Err(e),
        (false, _, None) => Err("ddugit.com didn't take the report. Try again later.".into()),
    }
}

/// Send `report`; resolves with the id the site gave it.
pub fn send(report: &NewReport) -> Result<String> {
    let os = format!("{} {}", std::env::consts::OS, std::env::consts::ARCH);
    let body = body(report, env!("CARGO_PKG_VERSION"), &os)?;
    outcome(post("/api/report", body)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn report(message: &str, email: Option<&str>, diagnostics: Option<&str>) -> NewReport {
        NewReport {
            kind: ReportKind::Bug,
            message: message.into(),
            email: email.map(Into::into),
            diagnostics: diagnostics.map(Into::into),
        }
    }

    #[test]
    fn body_matches_the_site_contract() {
        let b = body(
            &report("  It froze.  ", Some(" me@example.com "), Some("ddugit 1.0.0")),
            "1.0.0",
            "macos aarch64",
        )
        .unwrap();
        assert_eq!(
            b,
            serde_json::json!({
                "kind": "bug",
                "message": "It froze.",
                "email": "me@example.com",
                "diagnostics": "ddugit 1.0.0",
                "source": "app",
                "appVersion": "1.0.0",
                "os": "macos aarch64",
            })
        );
        let q = NewReport {
            kind: ReportKind::Question,
            ..report("How?", Some(""), None)
        };
        let b = body(&q, "1.0.0", "windows x86_64").unwrap();
        assert_eq!(b["kind"], "question");
        assert!(b["email"].is_null() && b["diagnostics"].is_null());
    }

    #[test]
    fn body_checks_what_the_site_would_refuse() {
        assert!(body(&report("  ", None, None), "1", "x").is_err());
        assert!(body(&report(&"a".repeat(MESSAGE_MAX + 1), None, None), "1", "x").is_err());
        for bad in ["me", "me@host", "@x.com", "me @x.com"] {
            assert!(body(&report("hi", Some(bad), None), "1", "x").is_err(), "{bad}");
        }
        let long = "가".repeat(DIAGNOSTICS_MAX + 10);
        let b = body(&report("hi", None, Some(&long)), "1", "x").unwrap();
        assert_eq!(
            b["diagnostics"].as_str().unwrap().chars().count(),
            DIAGNOSTICS_MAX
        );
    }

    #[test]
    fn outcome_reads_the_sites_answer() {
        let ok = Reply {
            ok: true,
            id: Some("abc".into()),
            ..Default::default()
        };
        assert_eq!(outcome(ok), Ok("abc".into()));
        let limited = Reply {
            error: Some("Too many reports. Try again later.".into()),
            ..Default::default()
        };
        assert_eq!(outcome(limited), Err("Too many reports. Try again later.".into()));
        assert!(outcome(Reply::default()).is_err());
    }
}
