//! The user's editor: a known one found on PATH, or a program they chose that
//! isn't a shell or interpreter and that nothing else could have put there.

use std::path::{Path, PathBuf};

use super::{on_path, Launch, Os, Result, OS};

/// Editors the settings offer by name (found on PATH).
#[rustfmt::skip]
pub const EDITORS: &[&str] = &[
    "code", "code-insiders", "cursor", "windsurf", "zed", "subl", "idea", "webstorm", "pycharm",
    "goland", "clion", "rider", "phpstorm", "rubymine", "studio", "fleet", "nova", "mate", "bbedit",
    "gedit", "gnome-text-editor", "kate", "kwrite", "mousepad", "xed", "geany", "gvim", "emacs",
    "notepad++", "notepad",
];

/// Programs that run the file they're given (or anything else) instead of showing it.
#[rustfmt::skip]
const NOT_EDITORS: &[&str] = &[
    "sh", "bash", "zsh", "fish", "dash", "ksh", "csh", "tcsh", "nu", "pwsh", "powershell", "cmd",
    "python", "python2", "python3", "py", "pythonw", "node", "nodejs", "deno", "bun", "perl",
    "ruby", "php", "lua", "tclsh", "wish", "java", "javaw", "osascript", "open", "xdg-open", "gio",
    "env", "xargs", "sudo", "doas", "su", "nohup", "exec", "start", "explorer", "rundll32",
    "regsvr32", "mshta", "wscript", "cscript", "msiexec", "git", "ssh", "curl", "wget", "rm", "mv",
    "cp", "dd", "chmod", "chown", "awk", "sed", "make", "busybox", "toybox",
];

/// `python3.12.exe` → `python`: the name without extension, version or case.
fn bare_name(path: &Path) -> String {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let name = name
        .strip_suffix(".exe")
        .or_else(|| name.strip_suffix(".cmd"))
        .or_else(|| name.strip_suffix(".bat"))
        .unwrap_or(&name);
    name.trim_end_matches(|c: char| c.is_ascii_digit() || c == '.' || c == '-')
        .to_string()
}

/// The editor `program` names, as a real path: one of `EDITORS` on PATH, or
/// an absolute path to a program (a `.app` on macOS) that isn't a shell or
/// interpreter and that a clone or download couldn't have put there.
pub fn editor(program: &str) -> Result<PathBuf> {
    let program = program.trim();
    let p = Path::new(program);
    let real = if p.is_absolute() {
        p.canonicalize()
            .map_err(|_| format!("'{program}' doesn't exist"))?
    } else if EDITORS.contains(&program) {
        on_path(program).ok_or_else(|| format!("'{program}' isn't on PATH (give its full path)"))?
    } else {
        return Err(format!(
            "'{program}' is not an editor ddugit knows (give its full path)"
        ));
    };
    let bundle = OS == Os::Mac && real.is_dir() && real.extension().is_some_and(|e| e == "app");
    if !(real.is_file() || bundle) {
        return Err(format!("'{program}' is not a program"));
    }
    if NOT_EDITORS.contains(&bare_name(&real).as_str()) {
        return Err(format!("'{program}' runs files instead of editing them"));
    }
    if let Some(why) = crate::git::planted(&real) {
        return Err(format!("'{program}' {why}"));
    }
    Ok(real)
}

/// The settings' editor, kept in the app's config folder rather than the
/// webview's storage: the webview says "the editor", never which program.
const STORED: &str = "editor";

/// Is `program` one the settings offer by name (no confirmation needed)?
pub fn known(program: &str) -> bool {
    EDITORS.contains(&program.trim())
}

/// The editor `save` kept in `dir`, checked again (it may have moved or been replaced).
pub fn stored(dir: &Path) -> Result<PathBuf> {
    let program = std::fs::read_to_string(dir.join(STORED))
        .map_err(|_| "No editor is set: choose one in Settings".to_string())?;
    editor(program.trim())
}

/// Keep `program` as the editor ("" forgets it); answers the path it runs ("" when forgotten).
/// A program that isn't a known name must have been confirmed by the user first (`lib.rs`).
pub fn save(dir: &Path, program: &str) -> Result<String> {
    let program = program.trim();
    let file = dir.join(STORED);
    if program.is_empty() {
        return match std::fs::remove_file(&file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(String::new()),
        };
    }
    let real = editor(program)?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(&file, program).map_err(|e| e.to_string())?;
    Ok(real.to_string_lossy().into_owned())
}

/// How to open `target` in `editor` (checked by [`editor`]): a macOS app
/// bundle through `open -a`, any other program with the path as its argument.
/// `target` is absolute, so it can't pass for an option.
pub fn editor_launch(os: Os, editor: &Path, target: &Path) -> Launch {
    let bundle = os == Os::Mac && editor.extension().is_some_and(|e| e == "app");
    if bundle {
        Launch::new(
            "/usr/bin/open",
            &["-a".as_ref(), editor.as_os_str(), target.as_os_str()],
        )
    } else {
        Launch::new(editor, &[target.as_os_str()])
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::git::testutil::{repo, s};
    use std::ffi::OsString;

    #[test]
    fn editors_get_the_path_as_one_argument() {
        let target = Path::new("/work/a b.txt");
        let l = editor_launch(Os::Linux, Path::new("/usr/bin/code"), target);
        assert_eq!(
            (l.program.to_str(), l.args.clone()),
            (Some("/usr/bin/code"), vec![target.into()])
        );
        let app = Path::new("/Applications/Visual Studio Code.app");
        let l = editor_launch(Os::Mac, app, target);
        assert_eq!(l.program, "/usr/bin/open");
        assert_eq!(l.args, [OsString::from("-a"), app.into(), target.into()]);
        let w = editor_launch(
            Os::Windows,
            Path::new("C:\\Code\\bin\\code.cmd"),
            Path::new("C:\\r\\a.txt"),
        );
        assert_eq!(w.args, [OsString::from("C:\\r\\a.txt")]);
    }

    #[test]
    fn editors_are_known_names_or_programs_nothing_could_plant() {
        assert!(editor("vim-but-not-known").is_err());
        assert!(editor("sh").is_err());
        assert!(editor("relative/code").is_err());
        assert!(editor("/no/such/editor").is_err());
        #[cfg(unix)]
        {
            assert!(editor("/bin/sh").unwrap_err().contains("runs files"));
            // A program in a repository (here also in a temp folder) is refused.
            let d = repo();
            let fake = d.path().join("myedit");
            std::fs::write(&fake, "#!/bin/sh\n").unwrap();
            assert!(editor(s(&fake)).is_err());
        }
        assert_eq!(bare_name(Path::new("/py/Python3.12.EXE")), "python");
        assert_eq!(bare_name(Path::new("/usr/bin/node-18")), "node");
        assert_eq!(bare_name(Path::new("/usr/bin/code")), "code");
    }

    #[test]
    fn the_editor_is_kept_in_the_config_folder() {
        let dir = tempfile::tempdir().unwrap();
        let cfg = dir.path().join("cfg");
        assert!(stored(&cfg).unwrap_err().contains("No editor"));
        assert!(save(&cfg, "sh").is_err());
        assert!(!cfg.join(STORED).exists(), "a refused program isn't kept");
        assert_eq!(save(&cfg, "").unwrap(), "");
        assert!(known("code") && !known("/usr/bin/code") && !known("sh"));
    }
}
