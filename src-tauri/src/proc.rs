//! Child processes the app starts (git, ssh tools, `gh` / `glab`, OS queries):
//! no stdin to wait on, and on Windows no console window flashing up.

use std::ffi::OsStr;
use std::process::{Command, Stdio};

/// `program`, ready for arguments: stdin closed, no console window.
pub fn hidden(program: impl AsRef<OsStr>) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// The trimmed stdout of `cmd` when it ran, succeeded and printed something.
pub fn stdout_of(cmd: &mut Command) -> Option<String> {
    let out = cmd.output().ok()?;
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (out.status.success() && !text.is_empty()).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_what_a_program_prints() {
        assert!(stdout_of(hidden("git").arg("--version"))
            .unwrap()
            .starts_with("git version"));
        assert_eq!(stdout_of(&mut hidden("no-such-program-ddugit")), None);
    }
}
