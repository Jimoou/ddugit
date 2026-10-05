//! What a problem report says about this computer: the app's version, the OS
//! and its version, the CPU architecture. Nothing about the user or their work.

use serde::Serialize;
use std::process::{Command, Stdio};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    /// `macos`, `windows`, `linux`.
    pub os: String,
    /// Empty when it can't be read.
    pub os_version: String,
    pub arch: String,
}

pub fn app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").into(),
        os: std::env::consts::OS.into(),
        os_version: os_version(),
        arch: std::env::consts::ARCH.into(),
    }
}

/// Links the app hands to the OS: web pages only.
pub fn openable(url: &str) -> Result<(), String> {
    if url.starts_with("https://") {
        Ok(())
    } else {
        Err("Only https links can be opened".into())
    }
}

fn run(program: &str, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    let out = cmd.output().ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

#[cfg(target_os = "macos")]
fn os_version() -> String {
    run("sw_vers", &["-productVersion"]).unwrap_or_default()
}

#[cfg(windows)]
fn os_version() -> String {
    // "Microsoft Windows [Version 10.0.22631.4317]" → "10.0.22631.4317"
    run("cmd", &["/C", "ver"])
        .and_then(|v| {
            v.rsplit_once(' ')
                .map(|(_, n)| n.trim_end_matches(']').to_string())
        })
        .unwrap_or_default()
}

#[cfg(not(any(target_os = "macos", windows)))]
fn os_version() -> String {
    run("uname", &["-r"]).unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_info_names_this_build() {
        let info = app_info();
        assert_eq!(info.version, env!("CARGO_PKG_VERSION"));
        assert_eq!(info.os, std::env::consts::OS);
        assert!(!info.arch.is_empty());
        assert!(!info.os_version.contains('\n'));
    }

    #[test]
    fn only_web_links_open() {
        assert!(openable("https://ddugit.com").is_ok());
        for bad in [
            "mailto:someone@example.com",
            "http://x",
            "file:///etc/passwd",
            "javascript:alert(1)",
            "/Applications/Calculator.app",
        ] {
            assert!(openable(bad).is_err(), "{bad}");
        }
    }
}
