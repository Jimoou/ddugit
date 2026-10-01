mod git;

use git::backport::{BackportItem, BackportTally};
use git::conflict::{ConflictFile, Resolution};
use git::diff::{DiffScope, FileDiff};
use git::pick::PickOp;
use git::read::RepoSnapshot;
use git::rebase::RebaseStep;
use git::refs::RefOp;
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
command!(git_commit(path: String, message: String, paths: Vec<String>, amend: bool, staged_only: bool) -> OpResult
=> if staged_only {
    git::write::commit_index(&path, &message, amend)
} else {
    git::write::commit(&path, &message, &paths, amend)
});
command!(git_stage_hunks(path: String, file: String, hunks: Vec<usize>, lines: Option<Vec<usize>>, unstage: bool) -> OpResult
    => git::stage::stage_hunks(&path, &file, &hunks, lines.as_deref(), unstage));
command!(backport_compare(path: String, source: String, target: String) -> Vec<BackportItem>
    => git::backport::compare(&path, &source, &target));
command!(backport_ignore(path: String, target: String, id: String, ignore: bool) -> ()
    => git::backport::set_ignored(&path, &target, &id, ignore));
command!(backport_summary(path: String, source: String, targets: Vec<String>) -> Vec<BackportTally>
    => git::backport::summary(&path, &source, &targets));
command!(backport_apply(path: String, ids: Vec<String>, target: String) -> OpResult
    => git::backport::apply(&path, &ids, &target));
command!(backport_export(path: String, ids: Vec<String>, out_dir: String) -> OpResult
    => git::backport::export(&path, &ids, &out_dir));
command!(git_rebase(path: String, base: String, steps: Vec<RebaseStep>) -> OpResult
    => git::rebase::rebase(&path, &base, &steps));
command!(set_git_path(git_path: Option<String>) -> String => git::set_program(git_path.as_deref()));
command!(git_merge(path: String, source: String, target: Option<String>) -> OpResult
    => git::write::merge(&path, &source, target.as_deref()));
command!(git_abort(path: String) -> OpResult => git::write::abort(&path));
command!(git_continue(path: String) -> OpResult => git::write::continue_op(&path));
command!(git_pick(path: String, op: PickOp, id: String, target: Option<String>) -> OpResult
    => git::pick::pick(&path, op, &id, target.as_deref()));
command!(git_checkout(path: String, target: String) -> OpResult => git::write::checkout(&path, &target));
command!(git_create_branch(path: String, name: String, at: Option<String>, switch: bool) -> OpResult
    => git::write::create_branch(&path, &name, at.as_deref(), switch));
command!(git_ref(path: String, op: RefOp) -> OpResult => git::refs::apply(&path, &op));
command!(git_remote(path: String, op: RemoteOp, on_progress: Channel<Progress>) -> OpResult
    => git::remote::remote(&path, op, |p| { let _ = on_progress.send(p); }));
command!(git_clone(url: String, dest: String, on_progress: Channel<Progress>) -> OpResult
    => git::setup::clone(&url, &dest, |p| { let _ = on_progress.send(p); }));
command!(git_init(dir: String) -> OpResult => git::setup::init(&dir));
command!(git_reset(path: String, target: String, mode: git::undo::ResetMode) -> OpResult
    => git::undo::reset(&path, &target, mode));
command!(git_reflog(path: String, limit: Option<usize>) -> Vec<git::undo::ReflogEntry>
    => git::undo::reflog(&path, limit.unwrap_or(100)));
command!(branch_report(path: String) -> git::cleanup::BranchReport => git::cleanup::report(&path));
command!(git_delete_branches(path: String, names: Vec<String>, force: bool) -> OpResult
    => git::cleanup::delete_branches(&path, &names, force));
command!(git_edit_commit(path: String, id: String, edit: git::edit::CommitEdit) -> OpResult
    => git::edit::edit_commit(&path, &id, &edit));
command!(git_restore_file(path: String, source: String, file: String) -> OpResult
    => git::edit::restore_file(&path, &source, &file));
command!(git_bisect(path: String, op: git::bisect::BisectOp) -> OpResult => git::bisect::bisect(&path, &op));
command!(bisect_state(path: String) -> Option<git::bisect::BisectState> => git::bisect::state(&path));
command!(file_log(path: String, rev: String, file: String) -> Vec<git::history::FileTouch>
    => git::history::file_log(&path, &rev, &file));
command!(git_blame(path: String, rev: String, file: String) -> git::history::Blame
    => git::history::blame(&path, &rev, &file));
command!(git_discard(path: String, paths: Vec<String>) -> OpResult => git::stash::discard(&path, &paths));
command!(git_stash_push(path: String, message: String, paths: Vec<String>) -> OpResult
    => git::stash::stash_push(&path, &message, &paths));
command!(git_stash(path: String, op: StashOp, index: usize) -> OpResult => git::stash::stash(&path, op, index));
command!(conflict_file(path: String, file: String) -> ConflictFile => git::conflict::conflict_file(&path, &file));
command!(git_resolve(path: String, file: String, how: Resolution) -> OpResult
    => git::conflict::resolve(&path, &file, &how));
command!(commit_diff(path: String, id: String) -> Vec<FileDiff> => git::diff::commit_diff(&path, &id));
command!(worktree_diff(path: String, file: Option<String>, scope: DiffScope) -> Vec<FileDiff>
    => git::diff::worktree_diff(&path, file.as_deref(), scope));

/// The one repository being watched; replacing it drops (stops) the previous watcher.
#[derive(Default)]
struct Watching(std::sync::Mutex<Option<git::watch::RepoWatcher>>);

/// Watch `path` and emit `repo-changed` to the window on relevant changes.
#[tauri::command]
fn watch_repo(app: tauri::AppHandle, state: tauri::State<Watching>, path: String) -> Result<(), String> {
    use tauri::Emitter;
    let watcher = git::watch::watch(&path, move || {
        let _ = app.emit("repo-changed", ());
    })?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(watcher);
    Ok(())
}

/// Working tree root of the repository `dir` is in (for dropped files and folders).
#[tauri::command]
fn repo_root(dir: String) -> Option<String> {
    git::setup::repo_root(&dir)
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
        .manage(Watching::default())
        .invoke_handler(tauri::generate_handler![
            initial_repo,
            repo_root,
            git_clone,
            git_init,
            watch_repo,
            repo_snapshot,
            git_commit,
            git_stage_hunks,
            set_git_path,
            git_rebase,
            backport_compare,
            backport_ignore,
            backport_summary,
            backport_apply,
            backport_export,
            git_merge,
            git_abort,
            git_continue,
            git_pick,
            git_checkout,
            git_create_branch,
            git_ref,
            git_remote,
            git_reset,
            git_reflog,
            branch_report,
            git_delete_branches,
            git_edit_commit,
            git_restore_file,
            git_bisect,
            bisect_state,
            file_log,
            git_blame,
            git_discard,
            git_stash_push,
            git_stash,
            conflict_file,
            git_resolve,
            commit_diff,
            worktree_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
