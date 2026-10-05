//! This computer's identity for device-bound licenses (up to three devices per license).
//!
//! The device id is 32 random bytes, base64url (43 characters), made once and kept
//! in the config folder (`device-id`) and in the OS keychain, which survives a
//! reinstall: when both hold one and they differ, the keychain wins. It only ever
//! goes to ddugit.com when activating or removing this device; a license carries
//! its SHA-256 (`device_hash`), never the id itself.

use std::path::Path;
use std::sync::OnceLock;

use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use base64::Engine;
type Result<T> = std::result::Result<T, String>;

const FILE: &str = crate::keychain::DEVICE_ACCOUNT;

/// Read once per run: the keychain is asked at most once.
static ID: OnceLock<String> = OnceLock::new();

/// This computer's device id, made on first use.
pub fn id_in(dir: &Path) -> Result<String> {
    if let Some(id) = ID.get() {
        return Ok(id.clone());
    }
    let entry = crate::keychain::entry(crate::keychain::DEVICE, FILE);
    let held = entry.as_ref().and_then(|e| e.get_password().ok());
    let id = settle(dir, held, |id| {
        if let Some(e) = &entry {
            let _ = e.set_password(id);
        }
    })?;
    Ok(ID.get_or_init(|| id).clone())
}

/// The id from the keychain (`held`) or the file, else a new one; whichever copy
/// is missing or different is rewritten (`mirror` writes the keychain).
fn settle(dir: &Path, held: Option<String>, mirror: impl FnOnce(&str)) -> Result<String> {
    let file = dir.join(FILE);
    let from_file = std::fs::read_to_string(&file)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| valid(s));
    let held = held.map(|s| s.trim().to_string()).filter(|s| valid(s));
    let id = match held.clone().or_else(|| from_file.clone()) {
        Some(id) => id,
        None => new_id()?,
    };
    if from_file.as_ref() != Some(&id) {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
        std::fs::write(&file, &id).map_err(|e| e.to_string())?;
    }
    if held.as_ref() != Some(&id) {
        mirror(&id);
    }
    Ok(id)
}

fn new_id() -> Result<String> {
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(B64.encode(bytes))
}

/// What the site accepts: exactly 43 base64url characters.
fn valid(id: &str) -> bool {
    id.len() == 43
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Lowercase SHA-256 hex of the id's text: the `device` a license is bound to.
pub fn hash(id: &str) -> String {
    crate::digest::sha256_hex(id.as_bytes()).expect("reading bytes in memory can't fail")
}

/// How the website lists this computer: its name, without control characters, at most 64 characters.
pub fn name() -> String {
    clean(&raw_name().unwrap_or_default())
}

fn clean(raw: &str) -> String {
    let name: String = raw.chars().filter(|c| !c.is_control()).take(64).collect();
    match name.trim() {
        "" => "This computer".into(),
        n => n.into(),
    }
}

fn raw_name() -> Option<String> {
    if cfg!(windows) {
        return std::env::var("COMPUTERNAME").ok();
    }
    let run = |cmd: &str, args: &[&str]| crate::proc::stdout_of(crate::proc::hidden(cmd).args(args));
    // macOS: the name people gave the Mac ("Kim's MacBook Pro"), not the network host name.
    let friendly = if cfg!(target_os = "macos") {
        run("scutil", &["--get", "ComputerName"])
    } else {
        std::fs::read_to_string("/proc/sys/kernel/hostname").ok()
    };
    friendly.or_else(|| run("hostname", &[]))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn a_new_id_is_made_once_and_kept_in_both_places() {
        let dir = tempfile::tempdir().unwrap();
        let mirrored = RefCell::new(None);
        let id = settle(dir.path(), None, |s| *mirrored.borrow_mut() = Some(s.to_string())).unwrap();
        assert!(valid(&id));
        assert_eq!(mirrored.borrow().as_deref(), Some(id.as_str()));
        assert_eq!(std::fs::read_to_string(dir.path().join(FILE)).unwrap(), id);
        // Next run: the file and the keychain agree, nothing is rewritten.
        let again = settle(dir.path(), Some(id.clone()), |_| panic!("no rewrite")).unwrap();
        assert_eq!(again, id);
    }

    #[test]
    fn the_keychain_wins_and_fills_a_missing_copy() {
        let dir = tempfile::tempdir().unwrap();
        let (a, b) = (new_id().unwrap(), new_id().unwrap());
        std::fs::write(dir.path().join(FILE), &a).unwrap();
        // Reinstalled: the keychain still has the earlier id.
        assert_eq!(settle(dir.path(), Some(b.clone()), |_| panic!()).unwrap(), b);
        assert_eq!(std::fs::read_to_string(dir.path().join(FILE)).unwrap(), b);
        // The keychain lost it: the file's id goes back into the keychain.
        let mirrored = RefCell::new(None);
        let id = settle(dir.path(), None, |s| *mirrored.borrow_mut() = Some(s.to_string())).unwrap();
        assert_eq!(
            (id.as_str(), mirrored.borrow().as_deref()),
            (b.as_str(), Some(b.as_str()))
        );
        // Junk in either place is ignored.
        std::fs::write(dir.path().join(FILE), "junk").unwrap();
        assert_eq!(settle(dir.path(), Some(b.clone()), |_| panic!()).unwrap(), b);
    }

    #[test]
    fn the_hash_is_sha256_hex_of_the_id_text() {
        // `printf %s abc | sha256sum`
        assert_eq!(
            hash("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn device_names_are_cleaned_and_short() {
        assert_eq!(clean("  "), "This computer");
        assert_eq!(clean("Kim's\nMac"), "Kim'sMac");
        assert_eq!(clean(&"가".repeat(80)).chars().count(), 64);
        assert!(!name().is_empty());
    }
}
