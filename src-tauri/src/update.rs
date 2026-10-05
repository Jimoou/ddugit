//! The app updating itself (tauri-plugin-updater). Release builds learn the
//! update manifest's address (`latest.json` in the download storage) from
//! `DDUGIT_UPDATE_URL`; builds without it (dev, local) never update. The
//! manifest is not trusted on its own: each installer is checked against the
//! public key in `tauri.conf.json`, and the signed version must match the
//! announced one (`requireSignedVersion`), so a forged manifest cannot swap in
//! an older release.

use serde::Serialize;
use tauri_plugin_updater::UpdaterExt;

const ENDPOINT: Option<&str> = option_env!("DDUGIT_UPDATE_URL");

/// A newer version than the one running.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    pub notes: Option<String>,
}

/// The manifest address a build was given: none (or empty) means never update.
fn endpoint(raw: Option<&str>) -> Result<Option<tauri::Url>, String> {
    match raw.filter(|u| !u.is_empty()) {
        None => Ok(None),
        Some(url) => url.parse().map(Some).map_err(|e| format!("{e}")),
    }
}

async fn find(app: &tauri::AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let Some(url) = endpoint(ENDPOINT)? else {
        return Ok(None);
    };
    let updater = app
        .updater_builder()
        .endpoints(vec![url])
        .and_then(|b| b.build())
        .map_err(|e| e.to_string())?;
    updater.check().await.map_err(|e| e.to_string())
}

pub async fn check(app: &tauri::AppHandle) -> Result<Option<UpdateInfo>, String> {
    Ok(find(app).await?.map(|u| UpdateInfo {
        version: u.version,
        notes: u.body,
    }))
}

/// Download, verify and install the newest version, then start it.
/// (On Windows the installer closes the app itself.)
pub async fn install(app: &tauri::AppHandle) -> Result<(), String> {
    let update = find(app).await?.ok_or("No update available")?;
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(|e| e.to_string())?;
    app.restart()
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;

    #[test]
    fn a_build_without_an_address_never_updates() {
        assert_eq!(endpoint(None), Ok(None));
        assert_eq!(endpoint(Some("")), Ok(None));
        let url = endpoint(Some("https://example.com/releases/latest.json")).unwrap();
        assert_eq!(url.unwrap().path(), "/releases/latest.json");
        assert!(endpoint(Some("not a url")).is_err());
    }

    /// Installers are only trusted when signed by the release key, for the version
    /// they claim; the platform files must not drop that.
    #[test]
    fn updates_must_be_signed_by_the_release_key() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let updater = &conf["plugins"]["updater"];
        assert_eq!(updater["requireSignedVersion"], true);
        let key = base64::engine::general_purpose::STANDARD
            .decode(updater["pubkey"].as_str().unwrap())
            .unwrap();
        let key = String::from_utf8(key).unwrap();
        assert!(key.starts_with("untrusted comment: minisign public key"), "{key}");
        for platform in [
            include_str!("../tauri.macos.conf.json"),
            include_str!("../tauri.windows.conf.json"),
        ] {
            let conf: serde_json::Value = serde_json::from_str(platform).unwrap();
            assert!(conf["plugins"]["updater"].is_null(), "{platform}");
        }
    }
}
