mod git;

use git::{OpResult, RepoSnapshot};

/// Run blocking git work off the main thread so the window never stalls.
async fn blocking<T, F>(f: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn repo_snapshot(path: String, limit: Option<usize>) -> Result<RepoSnapshot, String> {
    blocking(move || git::snapshot(&path, limit.unwrap_or(3000))).await
}

#[tauri::command]
async fn git_commit(path: String, message: String, paths: Vec<String>) -> Result<OpResult, String> {
    blocking(move || git::commit(&path, &message, &paths)).await
}

#[tauri::command]
async fn git_merge(path: String, source: String, target: Option<String>) -> Result<OpResult, String> {
    blocking(move || git::merge(&path, &source, target.as_deref())).await
}

#[tauri::command]
async fn git_merge_abort(path: String) -> Result<OpResult, String> {
    blocking(move || git::merge_abort(&path)).await
}

#[tauri::command]
async fn git_checkout(path: String, target: String) -> Result<OpResult, String> {
    blocking(move || git::checkout(&path, &target)).await
}

#[tauri::command]
async fn git_create_branch(
    path: String,
    name: String,
    at: Option<String>,
    switch: bool,
) -> Result<OpResult, String> {
    blocking(move || git::create_branch(&path, &name, at.as_deref(), switch)).await
}

/// Repository passed on the command line (`otgit path/to/repo`), if any.
#[tauri::command]
fn initial_repo() -> Option<String> {
    let arg = std::env::args().skip(1).find(|a| !a.starts_with('-'))?;
    // `absolute` rather than `canonicalize`: no `\\?\` verbatim prefix on Windows.
    std::path::absolute(arg)
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            initial_repo,
            repo_snapshot,
            git_commit,
            git_merge,
            git_merge_abort,
            git_checkout,
            git_create_branch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
