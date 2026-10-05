//! OS keychain entries (macOS Keychain, Windows Credential Manager). Forge
//! tokens and the device id live under separate services: both used to share
//! `ddugit`, where saving a forge token for a "host" named `device-id` replaced
//! the device id.

/// Forge tokens, one account per host.
pub const FORGE: &str = "ddugit-forge";
/// The device id (`device.rs`).
pub const DEVICE: &str = "ddugit-device";
/// The device id's account name, in either service.
pub const DEVICE_ACCOUNT: &str = "device-id";
/// The service both used before they were split.
const LEGACY: &str = "ddugit";

/// Entry `account` of `service`. A value still saved under the old shared
/// service is moved over first, so tokens and the device id survive the split.
pub fn entry(service: &str, account: &str) -> Option<keyring::Entry> {
    let e = keyring::Entry::new(service, account).ok()?;
    // The legacy `device-id` account belongs to the device id, never to a forge "host".
    let ours = (service == DEVICE) == (account == DEVICE_ACCOUNT);
    if ours && matches!(e.get_password(), Err(keyring::Error::NoEntry)) {
        if let Ok(old) = keyring::Entry::new(LEGACY, account) {
            if let Ok(v) = old.get_password() {
                if e.set_password(&v).is_ok() {
                    let _ = old.delete_credential();
                }
            }
        }
    }
    Some(e)
}
