//! Commercial licenses, checked offline. ddugit is free for personal and
//! open-source use; a company buys a license and gets a license text:
//!
//! `DDUGIT1.<payload>.<signature>` (both base64url): the payload is JSON
//! (who, what kind, how many seats, updates until when), the signature is
//! Ed25519 over the payload bytes. The app holds only the public key, so a
//! license checks the same with no network at all (air-gapped sites too) and
//! there is no account or login. Nothing is ever locked: an unlicensed copy
//! simply says so in settings.

use std::path::{Path, PathBuf};

use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

pub type Result<T> = std::result::Result<T, String>;

const PREFIX: &str = "DDUGIT1.";

/// The issuer's public key (base64url, 32 bytes), baked in at build time from
/// `DDUGIT_LICENSE_PUBKEY`. A build without it can't check licenses.
const PUBLIC_KEY: Option<&str> = option_env!("DDUGIT_LICENSE_PUBKEY");
/// This build's date (`YYYY-MM-DD`), set by the release workflow; compared with
/// "updates until" so a license covers the versions released while it was current.
const BUILD_DATE: Option<&str> = option_env!("DDUGIT_BUILD_DATE");

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicenseInfo {
    pub id: String,
    /// Licensee: a person or a company.
    pub name: String,
    pub email: String,
    /// `commercial` (per seat) or `site` (a whole organisation, e.g. an air-gapped site).
    pub kind: String,
    pub seats: u32,
    /// `YYYY-MM-DD`.
    pub issued: String,
    /// Versions released up to this date (`YYYY-MM-DD`) are covered, for good.
    pub updates_until: String,
}

#[derive(Debug, Serialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LicenseStatus {
    /// The license on this computer, if a valid one is installed.
    pub license: Option<LicenseInfo>,
    /// This version was released after the license's update period.
    pub newer_than_license: bool,
    /// This build can check licenses (it carries the public key).
    pub checkable: bool,
}

fn parse_key(b64: &str) -> Result<VerifyingKey> {
    let bytes: [u8; 32] = B64
        .decode(b64.trim())
        .map_err(|_| "bad public key".to_string())?
        .try_into()
        .map_err(|_| "bad public key".to_string())?;
    VerifyingKey::from_bytes(&bytes).map_err(|e| e.to_string())
}

/// Check a license text against `key` and read what it grants.
pub fn verify_with(text: &str, key: &VerifyingKey) -> Result<LicenseInfo> {
    let text: String = text.split_whitespace().collect(); // pasted from mail: line breaks and spaces
    let body = text.strip_prefix(PREFIX).ok_or("This is not a ddugit license")?;
    let (payload, sig) = body.split_once('.').ok_or("The license is incomplete")?;
    let payload = B64.decode(payload).map_err(|_| "The license is damaged")?;
    let sig: [u8; 64] = B64
        .decode(sig)
        .map_err(|_| "The license is damaged")?
        .try_into()
        .map_err(|_| "The license is damaged")?;
    key.verify(&payload, &Signature::from_bytes(&sig))
        .map_err(|_| "The license signature doesn't check out".to_string())?;
    serde_json::from_slice(&payload).map_err(|_| "The license is damaged".into())
}

fn key() -> Result<VerifyingKey> {
    parse_key(PUBLIC_KEY.ok_or("This build can't check licenses")?)
}

/// `updates_until` is earlier than the build date (both `YYYY-MM-DD`, so text order is date order).
fn newer_than(info: &LicenseInfo, build: Option<&str>) -> bool {
    build.is_some_and(|b| b > info.updates_until.as_str())
}

fn file(dir: &Path) -> PathBuf {
    dir.join("license.txt")
}

pub fn status_in(dir: &Path) -> LicenseStatus {
    let checkable = key().is_ok();
    let license = std::fs::read_to_string(file(dir))
        .ok()
        .and_then(|t| key().and_then(|k| verify_with(&t, &k)).ok());
    LicenseStatus {
        newer_than_license: license.as_ref().is_some_and(|l| newer_than(l, BUILD_DATE)),
        license,
        checkable,
    }
}

/// Check `text` and keep it in `dir`; nothing is written unless it is valid.
pub fn install_in(dir: &Path, text: &str) -> Result<LicenseStatus> {
    verify_with(text, &key()?)?;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(file(dir), text.trim()).map_err(|e| e.to_string())?;
    Ok(status_in(dir))
}

pub fn remove_in(dir: &Path) -> Result<LicenseStatus> {
    match std::fs::remove_file(file(dir)) {
        Ok(()) => Ok(status_in(dir)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(status_in(dir)),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn issuer() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn info() -> LicenseInfo {
        LicenseInfo {
            id: "lic_1".into(),
            name: "Acme Corp".into(),
            email: "it@acme.example".into(),
            kind: "site".into(),
            seats: 50,
            issued: "2026-10-02".into(),
            updates_until: "2027-10-02".into(),
        }
    }

    /// What the issuing side (scripts/license.mjs, the web hook) produces.
    fn sign(key: &SigningKey, info: &LicenseInfo) -> String {
        let payload = serde_json::to_vec(info).unwrap();
        let sig = key.sign(&payload);
        format!("{PREFIX}{}.{}", B64.encode(&payload), B64.encode(sig.to_bytes()))
    }

    #[test]
    fn a_signed_license_checks_offline_and_reads_back() {
        let key = issuer();
        let text = sign(&key, &info());
        assert_eq!(verify_with(&text, &key.verifying_key()).unwrap(), info());
        // Pasted from an email, wrapped and indented.
        let wrapped = format!("  {}\n {}  ", &text[..40], &text[40..]);
        assert_eq!(verify_with(&wrapped, &key.verifying_key()).unwrap(), info());
    }

    #[test]
    fn a_tampered_or_foreign_license_is_refused() {
        let key = issuer();
        let text = sign(&key, &info());
        // More seats, same signature.
        let mut more = info();
        more.seats = 5000;
        let forged = format!(
            "{PREFIX}{}.{}",
            B64.encode(serde_json::to_vec(&more).unwrap()),
            text.rsplit('.').next().unwrap()
        );
        assert!(verify_with(&forged, &key.verifying_key()).is_err());
        // Signed by someone else.
        let other = SigningKey::from_bytes(&[9u8; 32]);
        assert!(verify_with(&sign(&other, &info()), &key.verifying_key()).is_err());
        assert!(verify_with("hello", &key.verifying_key()).is_err());
        assert!(verify_with("DDUGIT1.abc", &key.verifying_key()).is_err());
    }

    #[test]
    fn a_license_covers_versions_released_during_its_update_period() {
        assert!(!newer_than(&info(), Some("2027-10-02")));
        assert!(newer_than(&info(), Some("2027-10-03")));
        assert!(!newer_than(&info(), None));
    }

    /// Interop with the issuing side: build with `DDUGIT_LICENSE_PUBKEY` and run with
    /// `DDUGIT_TEST_LICENSE` set to a license from `scripts/license.mjs sign`.
    #[test]
    fn installs_a_license_issued_by_the_script() {
        let (Some(_), Ok(text)) = (PUBLIC_KEY, std::env::var("DDUGIT_TEST_LICENSE")) else {
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        assert!(install_in(dir.path(), "DDUGIT1.nope.nope").is_err());
        assert!(status_in(dir.path()).license.is_none());
        let status = install_in(dir.path(), &text).unwrap();
        assert_eq!(status.license.unwrap().name, "Acme Corp");
        assert!(remove_in(dir.path()).unwrap().license.is_none());
    }

    #[test]
    fn the_public_key_is_32_base64url_bytes() {
        let k = B64.encode(issuer().verifying_key().to_bytes());
        assert!(parse_key(&k).is_ok());
        assert!(parse_key("short").is_err());
    }
}
