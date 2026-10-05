//! Pro licenses, checked offline. A license is a text:
//!
//! `DDUGIT1.<payload>.<signature>` (both base64url): the payload is JSON
//! (who, what kind, how many seats, updates until when), the signature is
//! Ed25519 over the payload bytes. The app holds only the public key, so a
//! license checks the same with no network at all (air-gapped sites too) and
//! there is no account or login. An unlicensed copy is simply Free.
//!
//! A bought license (`personal`, plan `lifetime`) is paid once, never expires and
//! covers every update (`updatesUntil` 9999-12-31). It is signed for one device
//! (`device`, the hash from `device.rs`; up to three per license on ddugit.com) and
//! opens Pro only there. The app asks ddugit.com about it now and then
//! (`refresh_in`, the license itself is the only credential) so a device removed on
//! the website, or a refunded license, stops here too; offline it keeps working.
//! Site licenses for closed networks are pasted, bound to no device and never asked
//! about. Subscriptions (no longer sold) still verify until their expiry.

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
    /// `personal` (bought, device-bound), `commercial` (per seat, older) or `site` (a whole organisation).
    pub kind: String,
    pub seats: u32,
    /// `YYYY-MM-DD`.
    pub issued: String,
    /// Versions released up to this date (`YYYY-MM-DD`) are covered, for good; `9999-12-31` = all.
    pub updates_until: String,
    /// Subscriptions: paid through + grace (`YYYY-MM-DD`); after it the app only reminds.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires: Option<String>,
    /// `lifetime` for a bought license; `monthly` / `yearly` for an old subscription; absent for a site license.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub plan: Option<String>,
    /// The device it is signed for (`device::hash`); absent = any computer (site licenses).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
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
    /// An old subscription's expiry has passed.
    pub expired: bool,
    /// The license is signed for another computer: Pro stays closed here.
    pub other_device: bool,
}

/// What asking ddugit.com for a renewed license came to.
#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Refresh {
    /// A license with a later expiry is installed.
    Renewed,
    /// The subscription is paid and the license on this computer is already current.
    Current,
    /// The subscription has ended.
    Lapsed,
    /// The store doesn't know this license.
    Unknown,
    /// This device was removed from the license on ddugit.com; the license here is gone too.
    Removed,
    /// The license was withdrawn (refunded); the license here is gone too.
    Revoked,
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

/// Days since 1970-01-01, today in UTC.
fn today_days() -> i64 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    (secs / 86_400) as i64
}

/// Today in UTC as `YYYY-MM-DD` (civil-from-days, so no date crate is needed).
fn today() -> String {
    civil(today_days())
}

/// Days since 1970-01-01 → `YYYY-MM-DD` (Howard Hinnant's algorithm).
pub(crate) fn civil(days: i64) -> String {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

/// A license that opens Pro now: valid, for this computer, and not past a subscription's expiry.
pub fn active(status: &LicenseStatus) -> Option<&LicenseInfo> {
    status
        .license
        .as_ref()
        .filter(|_| !status.expired && !status.other_device)
}

/// Signed for a device other than this one (`here` gives this device's hash, asked only when needed).
fn elsewhere(info: &LicenseInfo, here: impl FnOnce() -> Option<String>) -> bool {
    info.device.as_ref().is_some_and(|d| here().as_ref() != Some(d))
}

fn this_device(dir: &Path) -> Option<String> {
    crate::device::id_in(dir).ok().map(|id| crate::device::hash(&id))
}

pub const OTHER_DEVICE: &str = "This license belongs to another computer.";

fn expired(info: &LicenseInfo, today: &str) -> bool {
    info.expires.as_deref().is_some_and(|e| today > e)
}

fn file(dir: &Path) -> PathBuf {
    dir.join("license.txt")
}

/// The license text kept on this computer.
pub fn text_in(dir: &Path) -> Option<String> {
    std::fs::read_to_string(file(dir))
        .ok()
        .map(|t| t.trim().to_string())
}

pub fn status_in(dir: &Path) -> LicenseStatus {
    let checkable = key().is_ok();
    let license = text_in(dir).and_then(|t| key().and_then(|k| verify_with(&t, &k)).ok());
    LicenseStatus {
        newer_than_license: license.as_ref().is_some_and(|l| newer_than(l, BUILD_DATE)),
        expired: license.as_ref().is_some_and(|l| expired(l, &today())),
        other_device: license
            .as_ref()
            .is_some_and(|l| elsewhere(l, || this_device(dir))),
        license,
        checkable,
    }
}

/// Check `text` and keep it in `dir`; nothing is written unless it is valid.
pub fn install_in(dir: &Path, text: &str) -> Result<LicenseStatus> {
    let info = verify_with(text, &key()?)?;
    if elsewhere(&info, || this_device(dir)) {
        return Err(OTHER_DEVICE.into());
    }
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    std::fs::write(file(dir), text.trim()).map_err(|e| e.to_string())?;
    Ok(status_in(dir))
}

/// Where the app asks for a renewed license. The site forwards it to the
/// license service, so this address never has to change in shipped apps.
const REFRESH_URL: &str = "https://ddugit.com/api/license/refresh";

#[derive(Deserialize)]
struct RefreshReply {
    license: Option<String>,
    status: Option<String>,
}

/// Ask ddugit.com whether this computer's license still holds: a lifetime license
/// comes back unchanged unless its device was removed or it was refunded (then it is
/// removed here too); an old subscription comes back renewed while paid. Network
/// failures are errors and change nothing.
pub fn refresh_in(dir: &Path) -> Result<Refresh> {
    let text = text_in(dir).ok_or("No license on this computer")?;
    let reply: RefreshReply = ureq::post(REFRESH_URL)
        .send_json(serde_json::json!({ "license": text }))
        .map_err(|e| format!("Couldn't reach ddugit.com: {e}"))?
        .body_mut()
        .read_json()
        .map_err(|e| e.to_string())?;
    apply_refresh(dir, &text, reply, &key()?)
}

/// Install what the service answered, if it is a valid license for the same id.
fn apply_refresh(dir: &Path, held: &str, reply: RefreshReply, key: &VerifyingKey) -> Result<Refresh> {
    match (reply.license, reply.status.as_deref()) {
        (Some(new), _) => {
            let old = verify_with(held, key)?;
            let renewed = verify_with(&new, key)?;
            if renewed.id != old.id {
                return Err("The renewed license is for another license".into());
            }
            if new.trim() == held.trim() {
                return Ok(Refresh::Current);
            }
            std::fs::write(file(dir), new.trim()).map_err(|e| e.to_string())?;
            Ok(Refresh::Renewed)
        }
        (None, Some("removed")) => drop_license(dir, Refresh::Removed),
        // A lifetime license only "expires" when it is refunded; a subscription just lapses.
        (None, Some("expired")) if verify_with(held, key)?.plan.as_deref() == Some("lifetime") => {
            drop_license(dir, Refresh::Revoked)
        }
        (None, Some("expired")) => Ok(Refresh::Lapsed),
        (None, Some("unknown")) => Ok(Refresh::Unknown),
        _ => Err("The license service gave no answer".into()),
    }
}

fn drop_license(dir: &Path, why: Refresh) -> Result<Refresh> {
    remove_in(dir).map(|_| why)
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
            expires: None,
            plan: None,
            device: None,
        }
    }

    /// What ddugit.com signs for a purchase activated on `device` (a hash).
    fn lifetime(device: &str) -> LicenseInfo {
        LicenseInfo {
            id: "lic_l".into(),
            kind: "personal".into(),
            seats: 1,
            updates_until: "9999-12-31".into(),
            plan: Some("lifetime".into()),
            device: Some(device.into()),
            ..info()
        }
    }

    fn monthly(expires: &str) -> LicenseInfo {
        LicenseInfo {
            id: "lic_m".into(),
            kind: "commercial".into(),
            seats: 1,
            updates_until: expires.into(),
            expires: Some(expires.into()),
            plan: Some("monthly".into()),
            ..info()
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
    fn dates_come_out_as_calendar_days() {
        assert_eq!(civil(0), "1970-01-01");
        assert_eq!(civil(20_730), "2026-10-04");
        assert_eq!(civil(11_016), "2000-02-29");
        assert_eq!(civil(-1), "1969-12-31");
        assert_eq!(today().len(), 10);
    }

    #[test]
    fn a_subscription_lapses_after_its_expiry_and_a_site_license_never_does() {
        assert!(!expired(&monthly("2026-11-11"), "2026-11-11"));
        assert!(expired(&monthly("2026-11-11"), "2026-11-12"));
        assert!(!expired(&info(), "2099-01-01"));
    }

    #[test]
    fn licenses_signed_before_subscriptions_still_read() {
        // The first format had no expiry or plan.
        let key = issuer();
        let old = serde_json::json!({
            "id": "lic_0", "name": "A", "email": "a@b.c", "kind": "commercial", "seats": 1,
            "issued": "2026-10-02", "updatesUntil": "2027-10-02"
        });
        let payload = serde_json::to_vec(&old).unwrap();
        let text = format!(
            "{PREFIX}{}.{}",
            B64.encode(&payload),
            B64.encode(key.sign(&payload).to_bytes())
        );
        let read = verify_with(&text, &key.verifying_key()).unwrap();
        assert_eq!((read.expires, read.plan), (None, None));
    }

    #[test]
    fn a_renewal_replaces_the_license_only_when_valid_and_the_same_one() {
        let key = issuer();
        let dir = tempfile::tempdir().unwrap();
        let held = sign(&key, &monthly("2026-11-11"));
        std::fs::write(file(dir.path()), &held).unwrap();
        let reply = |license: Option<String>, status: Option<&str>| RefreshReply {
            license,
            status: status.map(Into::into),
        };
        let vk = key.verifying_key();

        // Same text back: already current.
        assert_eq!(
            apply_refresh(dir.path(), &held, reply(Some(held.clone()), None), &vk).unwrap(),
            Refresh::Current
        );
        // Another license's renewal, or one signed by someone else: refused, file untouched.
        let other = sign(
            &key,
            &LicenseInfo {
                id: "lic_x".into(),
                ..monthly("2026-12-11")
            },
        );
        assert!(apply_refresh(dir.path(), &held, reply(Some(other), None), &vk).is_err());
        let foreign = sign(&SigningKey::from_bytes(&[9u8; 32]), &monthly("2026-12-11"));
        assert!(apply_refresh(dir.path(), &held, reply(Some(foreign), None), &vk).is_err());
        assert_eq!(std::fs::read_to_string(file(dir.path())).unwrap(), held);
        // A later expiry: installed.
        let next = sign(&key, &monthly("2026-12-11"));
        assert_eq!(
            apply_refresh(dir.path(), &held, reply(Some(next.clone()), None), &vk).unwrap(),
            Refresh::Renewed
        );
        assert_eq!(std::fs::read_to_string(file(dir.path())).unwrap(), next);
        // Lapsed or unknown: nothing changes.
        assert_eq!(
            apply_refresh(dir.path(), &next, reply(None, Some("expired")), &vk).unwrap(),
            Refresh::Lapsed
        );
        assert_eq!(
            apply_refresh(dir.path(), &next, reply(None, Some("unknown")), &vk).unwrap(),
            Refresh::Unknown
        );
        assert!(apply_refresh(dir.path(), &next, reply(None, None), &vk).is_err());
    }

    #[test]
    fn a_lifetime_license_covers_every_version_and_never_lapses() {
        let l = lifetime("h");
        assert!(!newer_than(&l, Some("2099-12-31")));
        assert!(!expired(&l, "2099-12-31"));
        // The site's payload: camelCase, no `expires`.
        let key = issuer();
        let payload = serde_json::to_vec(&serde_json::json!({
            "id": "lic_l", "name": "A", "email": "a@b.c", "kind": "personal", "seats": 1,
            "issued": "2026-10-05", "updatesUntil": "9999-12-31", "plan": "lifetime", "device": "h"
        }))
        .unwrap();
        let text = format!(
            "{PREFIX}{}.{}",
            B64.encode(&payload),
            B64.encode(key.sign(&payload).to_bytes())
        );
        let read = verify_with(&text, &key.verifying_key()).unwrap();
        assert_eq!((read.device.as_deref(), read.expires), (Some("h"), None));
    }

    #[test]
    fn a_device_bound_license_opens_pro_only_on_its_device() {
        let here = crate::device::hash("this-device");
        assert!(!elsewhere(&lifetime(&here), || Some(here.clone())));
        assert!(elsewhere(&lifetime(&here), || Some(crate::device::hash("other"))));
        assert!(elsewhere(&lifetime(&here), || None));
        // Unbound (site) licenses never ask for the device.
        assert!(!elsewhere(&info(), || panic!("not asked")));
        let status = |other_device| LicenseStatus {
            license: Some(lifetime(&here)),
            newer_than_license: false,
            checkable: true,
            expired: false,
            other_device,
        };
        assert!(active(&status(false)).is_some());
        assert!(active(&status(true)).is_none());
    }

    #[test]
    fn a_removed_or_refunded_lifetime_license_is_dropped_and_offline_keeps_it() {
        let key = issuer();
        let vk = key.verifying_key();
        let dir = tempfile::tempdir().unwrap();
        let held = sign(&key, &lifetime("h"));
        let reply = |status: &str| RefreshReply {
            license: None,
            status: Some(status.into()),
        };
        let put = || std::fs::write(file(dir.path()), &held).unwrap();

        put();
        let same = RefreshReply {
            license: Some(held.clone()),
            status: None,
        };
        assert_eq!(
            apply_refresh(dir.path(), &held, same, &vk).unwrap(),
            Refresh::Current
        );
        assert!(file(dir.path()).exists());
        assert_eq!(
            apply_refresh(dir.path(), &held, reply("removed"), &vk).unwrap(),
            Refresh::Removed
        );
        assert!(!file(dir.path()).exists());
        put();
        assert_eq!(
            apply_refresh(dir.path(), &held, reply("expired"), &vk).unwrap(),
            Refresh::Revoked
        );
        assert!(!file(dir.path()).exists());
        // An old subscription that lapsed stays (it only reminds).
        let sub = sign(&key, &monthly("2026-11-11"));
        std::fs::write(file(dir.path()), &sub).unwrap();
        assert_eq!(
            apply_refresh(dir.path(), &sub, reply("expired"), &vk).unwrap(),
            Refresh::Lapsed
        );
        assert!(file(dir.path()).exists());
    }

    #[test]
    fn the_public_key_is_32_base64url_bytes() {
        let k = B64.encode(issuer().verifying_key().to_bytes());
        assert!(parse_key(&k).is_ok());
        assert!(parse_key("short").is_err());
    }
}
