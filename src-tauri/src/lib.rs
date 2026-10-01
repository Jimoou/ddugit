mod git;

use git::diff::FileDiff;
use git::pick::PickOp;
use git::read::RepoSnapshot;
use git::remote::{Progress, RemoteOp};
use git::stash::StashOp;
use git::OpResult;
use tauri::ipc::Channel;

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

/// Declares an async Tauri command whose body runs on the blocking pool.
/// Commands only unpack arguments; logic lives in `git::*`.
macro_rules! command {
    ($name:ident($($arg:ident: $ty:ty),*) -> $ret:ty => $body:expr) => {
        #[tauri::command]
        async fn $name($($arg: $ty),*) -> Result<$ret, String> {
            blocking(move || $body).await
        }
    };
}

command!(repo_snapshot(path: String, limit: Option<usize>) -> RepoSnapshot
    => git::read::snapshot(&path, limit.unwrap_or(3000)));
command!(git_commit(path: String, message: String, paths: Vec<String>, amend: bool) -> OpResult
    => git::write::commit(&path, &message, &paths, amend));
command!(git_merge(path: String, source: String, target: Option<String>) -> OpResult
    => git::write::merge(&path, &source, target.as_deref()));
command!(git_abort(path: String) -> OpResult => git::write::abort(&path));
command!(git_continue(path: String) -> OpResult => git::write::continue_op(&path));
command!(git_pick(path: String, op: PickOp, id: String, target: Option<String>) -> OpResult
    => git::pick::pick(&path, op, &id, target.as_deref()));
command!(git_checkout(path: String, target: String) -> OpResult => git::write::checkout(&path, &target));
command!(git_create_branch(path: String, name: String, at: Option<String>, switch: bool) -> OpResult
    => git::write::create_branch(&path, &name, at.as_deref(), switch));
command!(git_remote(path: String, op: RemoteOp, on_progress: Channel<Progress>) -> OpResult
    => git::remote::remote(&path, op, |p| { let _ = on_progress.send(p); }));
command!(git_discard(path: String, paths: Vec<String>) -> OpResult => git::stash::discard(&path, &paths));
command!(git_stash_push(path: String, message: String, paths: Vec<String>) -> OpResult
    => git::stash::stash_push(&path, &message, &paths));
command!(git_stash(path: String, op: StashOp, index: usize) -> OpResult => git::stash::stash(&path, op, index));
command!(commit_diff(path: String, id: String) -> Vec<FileDiff> => git::diff::commit_diff(&path, &id));
command!(worktree_diff(path: String, file: Option<String>) -> Vec<FileDiff>
    => git::diff::worktree_diff(&path, file.as_deref()));

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
            git_abort,
            git_continue,
            git_pick,
            git_checkout,
            git_create_branch,
            git_remote,
            git_discard,
            git_stash_push,
            git_stash,
            commit_diff,
            worktree_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
