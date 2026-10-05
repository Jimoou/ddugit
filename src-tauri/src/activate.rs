//! Pro activation by signing in on ddugit.com instead of pasting a license.
//!
//! The native-app sign-in pattern (RFC 8252, a loopback redirect): listen on a
//! random port of 127.0.0.1, open `ddugit.com/activate?port=…&state=…&device=…&name=…`
//! in the browser, and wait. The site registers this device on the license (up to
//! three; when full it lets the user remove one first). After signing in, the site sends the browser back to
//! `http://127.0.0.1:<port>/callback?code=…&state=…` with a one-time code; the
//! app trades the code and its device id for the license signed for this device
//! (`/api/license/activate`), keeps it like a pasted one, and sends the browser on to a "done" page. The license itself never
//! travels in a URL. Pasting a license stays for air-gapped sites.
//!
//! `deactivate_in` is the way back: it frees this device's place on ddugit.com and
//! removes the license here, even when the site can't be reached.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::device;
use crate::license::{self, LicenseStatus};

type Result<T> = std::result::Result<T, String>;

const SITE: &str = "https://ddugit.com";
/// How long the browser has to come back.
const WAIT: Duration = Duration::from_secs(300);

/// The activation that may still finish; starting another or cancelling bumps it.
static CURRENT: AtomicU64 = AtomicU64::new(0);

/// Stop waiting for the browser (the activation in progress returns "Cancelled").
pub fn cancel() {
    CURRENT.fetch_add(1, Ordering::SeqCst);
}

/// Sign in on ddugit.com in the browser (`open` opens a URL) and keep the license it hands back.
pub fn activate_in(dir: &Path, open: impl FnOnce(&str) -> Result<()>) -> Result<LicenseStatus> {
    let me = CURRENT.fetch_add(1, Ordering::SeqCst) + 1;
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| e.to_string())?;
    listener.set_nonblocking(true).map_err(|e| e.to_string())?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();
    let state = token()?;
    let device = device::id_in(dir)?;
    let name = encode(&device::name());
    open(&format!(
        "{SITE}/activate?port={port}&state={state}&device={device}&name={name}"
    ))?;

    let live = || CURRENT.load(Ordering::SeqCst) == me;
    let (stream, code) = wait_for_code(&listener, &state, Instant::now() + WAIT, live)?;
    let done = exchange(&code, &device).and_then(|text| license::install_in(dir, &text));
    let page = if done.is_ok() { "ok" } else { "failed" };
    redirect(stream, &format!("{SITE}/activate/done?result={page}"));
    done
}

/// Percent-encode a query value (UTF-8; unreserved characters stay).
fn encode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// 32 random bytes, base64url: the `state` that ties the browser's answer to this request.
fn token() -> Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    use base64::Engine;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes))
}

/// Accept connections until one brings `/callback` with our `state`; other paths
/// (a favicon) get a 404. Returns the connection to answer once the code is traded.
fn wait_for_code(
    listener: &TcpListener,
    state: &str,
    deadline: Instant,
    live: impl Fn() -> bool,
) -> Result<(TcpStream, String)> {
    loop {
        if !live() {
            return Err("Cancelled".into());
        }
        if Instant::now() > deadline {
            return Err("Timed out waiting for the browser".into());
        }
        let mut stream = match listener.accept() {
            Ok((s, _)) => s,
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                std::thread::sleep(Duration::from_millis(150));
                continue;
            }
            Err(e) => return Err(e.to_string()),
        };
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
        let Some(target) = request_target(&mut stream) else {
            continue;
        };
        let Some(query) = target.strip_prefix("/callback?") else {
            let _ =
                stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            continue;
        };
        let param = |name: &str| {
            query
                .split('&')
                .find_map(|kv| kv.strip_prefix(name)?.strip_prefix('='))
                .filter(|v| {
                    !v.is_empty()
                        && v.chars()
                            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
                })
        };
        match (param("code"), param("state")) {
            (Some(code), Some(s)) if s == state => return Ok((stream, code.to_string())),
            _ => {
                redirect(stream, &format!("{SITE}/activate/done?result=failed"));
                return Err("The browser came back with an answer for another request".into());
            }
        }
    }
}

/// The path and query of an HTTP GET, from its first line.
fn request_target(stream: &mut TcpStream) -> Option<String> {
    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    while !buf.windows(4).any(|w| w == b"\r\n\r\n") && buf.len() < 8192 {
        let n = stream.read(&mut chunk).ok()?;
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
    }
    let head = String::from_utf8_lossy(&buf);
    let mut first = head.lines().next()?.split(' ');
    (first.next()? == "GET").then(|| first.next().map(String::from))?
}

fn redirect(mut stream: TcpStream, to: &str) {
    let _ = write!(
        stream,
        "HTTP/1.1 302 Found\r\nLocation: {to}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
    );
}

#[derive(Deserialize)]
struct Reply {
    license: Option<String>,
    #[serde(default)]
    ok: bool,
    error: Option<String>,
}

/// POST `body` to the site; an error status still brings `{ error }` (a short English sentence).
fn post(path: &str, body: serde_json::Value) -> Result<Reply> {
    ureq::post(&format!("{SITE}{path}"))
        .config()
        .http_status_as_error(false)
        .build()
        .send_json(body)
        .map_err(|e| format!("Couldn't reach ddugit.com: {e}"))?
        .body_mut()
        .read_json()
        .map_err(|_| "ddugit.com gave an unexpected answer. Try again later.".into())
}

/// Trade the one-time code (and this device's id) for the license text.
fn exchange(code: &str, device: &str) -> Result<String> {
    let reply = post(
        "/api/license/activate",
        serde_json::json!({ "code": code, "device": device }),
    )?;
    match (reply.license, reply.error) {
        (Some(text), _) => Ok(text),
        (None, Some(e)) => Err(e),
        (None, None) => Err("The license service gave no answer".into()),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Deactivation {
    pub status: LicenseStatus,
    /// ddugit.com freed this device's place; if not (offline), the user removes it on the website.
    pub confirmed: bool,
}

/// Free this device's place on the license at ddugit.com, then remove the license here
/// whatever the site said.
pub fn deactivate_in(dir: &Path) -> Result<Deactivation> {
    let device = device::id_in(dir)?;
    let held = license::status_in(dir).license.and_then(|l| l.device);
    deactivate_with(dir, held.as_deref(), &device, |text| {
        let reply = post(
            "/api/license/deactivate",
            serde_json::json!({ "license": text, "device": device }),
        )?;
        match reply.error {
            Some(e) if !reply.ok => Err(e),
            _ => Ok(reply.ok),
        }
    })
}

/// `bound`: the device the license here is signed for; `tell` asks the site to free it.
fn deactivate_with(
    dir: &Path,
    bound: Option<&str>,
    device: &str,
    tell: impl FnOnce(&str) -> Result<bool>,
) -> Result<Deactivation> {
    let confirmed = match (bound, license::text_in(dir)) {
        // Signed for this device: the site frees its place.
        (Some(hash), Some(text)) if hash == device::hash(device) => tell(&text).unwrap_or(false),
        // Not bound, or bound elsewhere: there is no place of ours to free.
        (None, _) => true,
        _ => false,
    };
    Ok(Deactivation {
        status: license::remove_in(dir)?,
        confirmed,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A browser coming back: a favicon request first, then `path`. Returns the redirect it got.
    fn browser(port: u16, path: &'static str) -> std::thread::JoinHandle<String> {
        std::thread::spawn(move || {
            let mut favicon = TcpStream::connect(("127.0.0.1", port)).unwrap();
            favicon
                .write_all(b"GET /favicon.ico HTTP/1.1\r\nHost: x\r\n\r\n")
                .unwrap();
            let mut s = TcpStream::connect(("127.0.0.1", port)).unwrap();
            write!(s, "GET {path} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n").unwrap();
            let mut out = String::new();
            let _ = s.read_to_string(&mut out);
            out
        })
    }

    fn listen() -> (TcpListener, u16) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        l.set_nonblocking(true).unwrap();
        let port = l.local_addr().unwrap().port();
        (l, port)
    }

    #[test]
    fn the_callback_with_our_state_gives_the_code() {
        let (l, port) = listen();
        let b = browser(port, "/callback?code=abc_DEF-123&state=S1");
        let (stream, code) =
            wait_for_code(&l, "S1", Instant::now() + Duration::from_secs(10), || true).unwrap();
        assert_eq!(code, "abc_DEF-123");
        redirect(stream, "https://ddugit.com/activate/done?result=ok");
        let reply = b.join().unwrap();
        assert!(reply.starts_with("HTTP/1.1 302"));
        assert!(reply.contains("Location: https://ddugit.com/activate/done?result=ok"));
    }

    #[test]
    fn another_state_is_refused_and_waiting_ends() {
        let (l, port) = listen();
        let b = browser(port, "/callback?code=abc&state=OTHER");
        let r = wait_for_code(&l, "S1", Instant::now() + Duration::from_secs(10), || true);
        assert!(r.is_err());
        assert!(b.join().unwrap().contains("result=failed"));

        // Cancelled: the wait ends right away.
        let (l, _) = listen();
        let r = wait_for_code(&l, "S1", Instant::now() + Duration::from_secs(10), || false);
        assert_eq!(r.err().as_deref(), Some("Cancelled"));

        // Nobody comes back: the wait ends at the deadline.
        let (l, _) = listen();
        let r = wait_for_code(&l, "S1", Instant::now() + Duration::from_millis(300), || true);
        assert_eq!(r.err().as_deref(), Some("Timed out waiting for the browser"));
    }

    #[test]
    fn device_names_are_percent_encoded() {
        assert_eq!(encode("Kim's Mac 맥"), "Kim%27s%20Mac%20%EB%A7%A5");
        assert_eq!(encode("a-b_c.d~"), "a-b_c.d~");
    }

    #[test]
    fn deactivating_removes_the_license_here_whatever_the_site_says() {
        let dir = tempfile::tempdir().unwrap();
        let lic = dir.path().join("license.txt");
        let here = device::hash("dev");
        let put = || std::fs::write(&lic, "DDUGIT1.x.y").unwrap();

        // Offline (or refused): removed here anyway, not confirmed.
        put();
        let out = deactivate_with(dir.path(), Some(&here), "dev", |text| {
            assert_eq!(text, "DDUGIT1.x.y");
            Err("Couldn't reach ddugit.com".into())
        })
        .unwrap();
        assert!(!out.confirmed && out.status.license.is_none() && !lic.exists());
        // The site freed the place.
        put();
        let out = deactivate_with(dir.path(), Some(&here), "dev", |_| Ok(true)).unwrap();
        assert!(out.confirmed && !lic.exists());
        // Signed for another computer: the site isn't asked.
        put();
        let other = device::hash("other");
        let out = deactivate_with(dir.path(), Some(&other), "dev", |_| panic!("not asked")).unwrap();
        assert!(!out.confirmed && !lic.exists());
        // Not bound to a device: nothing to free.
        put();
        assert!(
            deactivate_with(dir.path(), None, "dev", |_| panic!())
                .unwrap()
                .confirmed
        );
    }

    #[test]
    fn a_state_token_is_long_and_url_safe() {
        let (a, b) = (token().unwrap(), token().unwrap());
        assert_eq!(a.len(), 43);
        assert_ne!(a, b);
        assert!(a
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }
}
