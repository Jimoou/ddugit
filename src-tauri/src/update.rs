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

async fn find(app: &tauri::AppHandle) -> Result<Option<tauri_plugin_updater::Update>, String> {
    let Some(url) = ENDPOINT.filter(|u| !u.is_empty()) else {
        return Ok(None);
    };
    let url = url.parse().map_err(|e| format!("{e}"))?;
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
