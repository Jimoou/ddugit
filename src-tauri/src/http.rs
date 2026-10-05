//! The one HTTP client: ddugit.com (activation, license refresh, reports) and
//! the forge APIs. Every call has a connect and an overall timeout, so a site
//! or captive portal that accepts the connection and stalls can't hang the
//! UI or leak a blocking thread, and every answer is size-capped.

use std::sync::OnceLock;
use std::time::Duration;

use serde_json::Value;

type Result<T> = std::result::Result<T, String>;

/// Largest answer read; a JSON API reply is far smaller.
const MAX_BODY: u64 = 8 * 1024 * 1024;

fn agent() -> &'static ureq::Agent {
    static AGENT: OnceLock<ureq::Agent> = OnceLock::new();
    AGENT.get_or_init(|| {
        ureq::Agent::config_builder()
            .timeout_connect(Some(Duration::from_secs(10)))
            .timeout_global(Some(Duration::from_secs(30)))
            // Error statuses come back with their JSON body (`{ error }`, GitHub's `message`).
            .http_status_as_error(false)
            .user_agent("ddugit")
            .build()
            .into()
    })
}

/// GET (`body` `None`) or POST `body` as JSON to `url`, with a bearer `token`
/// when given. Any status comes back with its JSON body (`Null` when it has
/// none or isn't JSON); only a failure to get an answer at all is an error.
pub fn send(url: &str, token: Option<&str>, body: Option<&Value>) -> Result<(u16, Value)> {
    let auth = token.map(|t| format!("Bearer {t}"));
    let mut resp = match body {
        Some(b) => {
            let mut req = agent().post(url).header("Accept", "application/json");
            if let Some(a) = &auth {
                req = req.header("Authorization", a);
            }
            req.send_json(b)
        }
        None => {
            let mut req = agent().get(url).header("Accept", "application/json");
            if let Some(a) = &auth {
                req = req.header("Authorization", a);
            }
            req.call()
        }
    }
    .map_err(|e| e.to_string())?;
    let status = resp.status().as_u16();
    let text = resp
        .body_mut()
        .with_config()
        .limit(MAX_BODY)
        .read_to_string()
        .map_err(|e| e.to_string())?;
    Ok((status, serde_json::from_str(&text).unwrap_or(Value::Null)))
}

/// Percent-encode a URL path segment or query value (UTF-8; unreserved characters stay).
pub fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

    /// A server that answers one request with `reply`.
    fn serve(reply: &'static str) -> String {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut buf = [0u8; 4096];
            let _ = s.read(&mut buf);
            let _ = s.write_all(reply.as_bytes());
        });
        format!("http://127.0.0.1:{port}/x")
    }

    #[test]
    fn error_statuses_come_back_with_their_body() {
        let url = serve(
            "HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: 18\r\nConnection: close\r\n\r\n{\"error\":\"nope.\"}\n",
        );
        let (status, v) = send(&url, None, Some(&serde_json::json!({}))).unwrap();
        assert_eq!((status, v["error"].as_str()), (403, Some("nope.")));
        let url = serve("HTTP/1.1 200 OK\r\nContent-Length: 4\r\nConnection: close\r\n\r\nnot!");
        assert_eq!(send(&url, Some("t"), None).unwrap(), (200, Value::Null));
    }

    #[test]
    fn encodes_query_values() {
        assert_eq!(encode("Kim's Mac 한"), "Kim%27s%20Mac%20%ED%95%9C");
        assert_eq!(encode("a-b_c.d~"), "a-b_c.d~");
    }
}
