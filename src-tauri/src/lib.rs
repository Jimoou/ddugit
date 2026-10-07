mod about;
mod activate;
mod device;
mod digest;
mod forge;
mod git;
mod http;
mod keychain;
mod license;
mod pro;
mod proc;
mod report;
mod ssh;
mod update;

use git::backport::{BackportItem, BackportTally};
use git::conflict::{ConflictFile, Resolution};
use git::diff::{DiffScope, FileDiff};
use git::pick::PickOp;
use git::read::RepoSnapshot;
use git::rebase::{RebaseStep, TodoItem};
use git::refs::RefOp;
use git::remote::{Progress, RemoteOp, RemoteRefOp};
use git::stash::{StashOp, StashOptions};
use git::write::{CommitOptions, MergeMode};
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
/// - `name(args) in dir -> T => body`: `dir` is the app's config folder (the license's home).
/// - `pro name(args) -> T => body`: Pro only, refused here and not just in the UI.
///   Every Pro-gated command is declared this way, so the line is auditable here.
macro_rules! command {
    (pro $name:ident($($arg:ident: $ty:ty),*) -> $ret:ty => $body:expr) => {
        command!($name($($arg: $ty),*) in dir -> $ret => {
            pro::require(&dir)?;
            $body
        });
    };
    ($name:ident($($arg:ident: $ty:ty),*) in $dir:ident -> $ret:ty => $body:expr) => {
        #[tauri::command]
        async fn $name(app: tauri::AppHandle, $($arg: $ty),*) -> Result<$ret, String> {
            let $dir = license_dir(&app)?;
            blocking(move || $name::run($dir, $($arg),*)).await
        }
        /// The command's body with the config folder passed in (tests give their own).
        mod $name {
            use super::*;
            pub(super) fn run($dir: std::path::PathBuf, $($arg: $ty),*) -> Result<$ret, String> {
                $body
            }
        }
    };
    ($name:ident($($arg:ident: $ty:ty),*) -> $ret:ty => $body:expr) => {
        #[tauri::command]
        async fn $name($($arg: $ty),*) -> Result<$ret, String> {
            blocking(move || $body).await
        }
    };
}

command!(repo_snapshot(path: String, limit: Option<usize>) -> RepoSnapshot
    => git::read::snapshot(&path, limit.unwrap_or(3000)));
command!(repo_glance(paths: Vec<String>) -> Vec<git::glance::RepoGlance> => Ok(git::glance::glance(&paths)));
command!(git_commit(path: String, message: String, paths: Vec<String>, amend: bool, staged_only: bool, options: CommitOptions) -> OpResult
=> if staged_only {
    git::write::commit_index(&path, &message, amend, options)
} else {
    git::write::commit(&path, &message, &paths, amend, options)
});
command!(commit_template(path: String) -> Option<String> => git::write::commit_template(&path));
command!(git_stage_hunks(path: String, file: String, hunks: Vec<String>, lines: Option<Vec<usize>>, unstage: bool) -> OpResult
    => git::stage::stage_hunks(&path, &file, &hunks, lines.as_deref(), unstage));
command!(git_discard_hunks(path: String, file: String, hunks: Vec<String>, lines: Option<Vec<usize>>) -> OpResult
    => git::stage::discard_hunks(&path, &file, &hunks, lines.as_deref()));
command!(git_stage_files(path: String, paths: Vec<String>, unstage: bool) -> OpResult
    => git::stage::stage_files(&path, &paths, unstage));
command!(git_ignore(path: String, patterns: Vec<String>, untrack: Vec<String>) -> OpResult
    => git::ignore::ignore(&path, &patterns, &untrack));
command!(backport_compare(path: String, source: String, target: String) -> Vec<BackportItem>
    => git::backport::compare(&path, &source, &target));
// Backport actions are Pro; comparing branches stays Free.
command!(pro backport_ignore(path: String, target: String, id: String, ignore: bool) -> ()
    => git::backport::set_ignored(&path, &target, &id, ignore));
command!(backport_summary(path: String, source: String, targets: Vec<String>) -> Vec<BackportTally>
    => git::backport::summary(&path, &source, &targets));
// Air-gapped transfer: looking at a bundle and the history are Free, writing and importing are Pro.
command!(pro transfer_export(path: String, req: git::transfer::ExportRequest) -> OpResult
    => git::transfer::export(&path, &req));
command!(pro transfer_import(path: String, file: String, name: String) -> OpResult
    => git::transfer::import(&path, &file, &name));

// Batch work across repositories (dashboard) is Pro: one repository per call.
command!(pro batch_switch(path: String, branch: String) -> git::write::SwitchResult
    => git::write::switch_or_create(&path, &branch));
// Release notes: reading the commits is plain `git log`; the screen holds the Pro line.
command!(release_range(path: String, from: Option<String>, to: String) -> git::changelog::NoteRange
    => git::changelog::range(&path, from.as_deref(), &to));
// Stacked branches: seeing them and taking a branch out are Free, building and restacking are Pro.
command!(stack_list(path: String) -> Vec<git::stack::StackBranch> => git::stack::list(&path));
command!(stack_op(path: String, op: git::stack::StackOp) in dir -> OpResult => {
    if !matches!(op, git::stack::StackOp::Remove { .. }) {
        pro::require(&dir)?;
    }
    git::stack::apply(&path, &op)
});
command!(transfer_check(path: String, file: String) -> git::transfer::BundleCheck => git::transfer::check(&path, &file));
command!(transfer_history(path: String) -> Vec<git::transfer::Sent> => git::transfer::history(&path));

command!(pro backport_apply(path: String, ids: Vec<String>, target: String) -> OpResult
    => git::backport::apply(&path, &ids, &target));
command!(pro backport_export(path: String, ids: Vec<String>, out_dir: String) -> OpResult
    => git::backport::export(&path, &ids, &out_dir));
command!(git_rebase(path: String, base: String, steps: Vec<RebaseStep>) -> OpResult
    => git::rebase::rebase(&path, &base, &steps));
command!(git_rebase_todo(path: String, base: String) -> Vec<TodoItem> => git::rebase::todo(&path, &base));
command!(set_git_path(git_path: Option<String>) -> String => git::set_program(git_path.as_deref()));
command!(git_rebase_onto(path: String, upstream: String) -> OpResult => git::rebase::onto(&path, &upstream));
command!(git_merge(path: String, source: String, target: Option<String>, mode: MergeMode, message: Option<String>)
    -> OpResult => git::write::merge(&path, &source, target.as_deref(), mode, message.as_deref()));
command!(git_abort(path: String) -> OpResult => git::write::abort(&path));
command!(git_continue(path: String) -> OpResult => git::write::continue_op(&path));
command!(git_pick(path: String, op: PickOp, id: String, target: Option<String>) -> OpResult
    => git::pick::pick(&path, op, &id, target.as_deref()));
command!(git_checkout(path: String, target: String) -> OpResult => git::write::checkout(&path, &target));
command!(git_create_branch(path: String, name: String, at: Option<String>, switch: bool) -> OpResult
    => git::write::create_branch(&path, &name, at.as_deref(), switch));
command!(git_worktree(path: String, op: git::worktree::WorktreeOp) -> OpResult
    => git::worktree::apply(&path, &op));
command!(git_submodule(path: String, op: git::submodule::SubmoduleOp) -> OpResult
    => git::submodule::apply(&path, &op));
command!(lfs_status(path: String) -> git::lfs::LfsStatus => git::lfs::status(&path));
command!(git_lfs(path: String, op: git::lfs::LfsOp) -> OpResult => git::lfs::apply(&path, &op));
command!(git_ref(path: String, op: RefOp) -> OpResult => git::refs::apply(&path, &op));
command!(git_remote(path: String, op: RemoteOp, on_progress: Channel<Progress>) -> OpResult
    => git::remote::remote(&path, op, |p| { let _ = on_progress.send(p); }));
command!(git_fetch_remote(path: String, name: String, on_progress: Channel<Progress>) -> OpResult
    => git::remote::fetch_one(&path, &name, |p| { let _ = on_progress.send(p); }));
command!(git_push_to(path: String, remote: String, branch: Option<String>, on_progress: Channel<Progress>) -> OpResult
    => git::remote::push_to(&path, &remote, branch.as_deref(), |p| { let _ = on_progress.send(p); }));
command!(git_remote_ref(path: String, remote: String, op: RemoteRefOp, on_progress: Channel<Progress>) -> OpResult
    => git::remote::remote_ref(&path, &remote, &op, |p| { let _ = on_progress.send(p); }));
command!(git_skip(path: String) -> OpResult => git::write::skip(&path));
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
/// Where the license text is kept: the app's own config folder, not the webview's storage.
fn license_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    app.path().app_config_dir().map_err(|e| e.to_string())
}

command!(license_status() in dir -> license::LicenseStatus => Ok(license::status_in(&dir)));
command!(license_install(text: String) in dir -> license::LicenseStatus => license::install_in(&dir, &text));
command!(license_remove() in dir -> license::LicenseStatus => license::remove_in(&dir));

#[tauri::command]
async fn update_check(app: tauri::AppHandle) -> Result<Option<update::UpdateInfo>, String> {
    update::check(&app).await
}

#[tauri::command]
async fn update_install(app: tauri::AppHandle) -> Result<(), String> {
    update::install(&app).await
}

// Sign in on ddugit.com in the browser and keep the license it sends back.
command!(license_activate() in dir -> license::LicenseStatus => activate::activate_in(&dir, |url| {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}));

#[tauri::command]
fn license_activate_cancel() {
    activate::cancel();
}

// Free this device's place on ddugit.com and remove the license here (even offline).
command!(license_deactivate() in dir -> activate::Deactivation => activate::deactivate_in(&dir));
command!(license_refresh() in dir -> license::Refresh => license::refresh_in(&dir));

command!(ssh_status() -> ssh::SshStatus => ssh::status());
command!(identity_read(path: Option<String>) -> git::identity::Identity => git::identity::read(path.as_deref()));
command!(git_identity(path: Option<String>, op: git::identity::IdentityOp) -> OpResult
    => git::identity::apply(path.as_deref(), &op));
command!(signing_keys() -> git::identity::SigningKeys => git::identity::signing_keys());
command!(commit_signature(path: String, id: String) -> git::identity::Signature
    => git::identity::signature(&path, &id));
command!(ssh_keygen(comment: String) -> ssh::SshKey => ssh::keygen(&comment));
command!(ssh_host_key(url: String) -> ssh::HostKey => ssh::host_key(&url));
command!(ssh_trust_host(url: String, fingerprints: Vec<String>) -> () => ssh::trust_host(&url, &fingerprints));
command!(ssh_test(url: String) -> ssh::SshTest => ssh::test(&url));
// Pull requests: Free for public repositories, Pro for private or self-hosted ones
// (decided in `forge`). Opening one follows the same line as reading them.
command!(pull_requests(path: String) in dir -> forge::PrReport => forge::report(&path, pro::status_in(&dir).pro));
command!(pr_target(path: String, remote: String) in dir -> forge::create::PrTarget
    => forge::create::target(&path, &remote, pro::status_in(&dir).pro));
command!(pr_create(path: String, remote: String, req: forge::create::NewPr) in dir -> forge::create::PrOutcome
    => forge::create::create(&path, &remote, pro::status_in(&dir).pro, &req));
command!(pro_status() in dir -> pro::ProStatus => Ok(pro::status_in(&dir)));
// Listing one's own repositories is Free whatever the host: it only saves copying a URL.
command!(forge_repos(kind: forge::ForgeKind, host: String) -> forge::repos::ForgeRepos
    => forge::repos::list(kind, &host));
command!(set_forge_token(host: String, token: Option<String>) -> () => forge::set_token(&host, token.as_deref()));
// Open a web page in the browser (https only).
command!(open_url(url: String) -> () => {
    about::openable(&url)?;
    tauri_plugin_opener::open_url(&url, None::<&str>).map_err(|e| e.to_string())
});
command!(app_info() -> about::AppInfo => Ok(about::app_info()));
command!(git_version() -> String => git::version(None));
command!(report_send(report: report::NewReport) -> String => report::send(&report));
command!(file_log(path: String, rev: String, file: String) -> Vec<git::history::FileTouch>
    => git::history::file_log(&path, &rev, &file));
command!(search_commits(path: String, query: String, kind: git::search::SearchKind, regex: bool, limit: usize)
    -> git::search::SearchResult => git::search::search(&path, &query, kind, regex, limit));
command!(git_blame(path: String, rev: String, file: String) -> git::history::Blame
    => git::history::blame(&path, &rev, &file));
command!(git_discard(path: String, paths: Vec<String>) -> OpResult => git::stash::discard(&path, &paths));
command!(git_stash_push(path: String, message: String, paths: Vec<String>, options: StashOptions) -> OpResult
    => git::stash::stash_push(&path, &message, &paths, options));
command!(git_stash_branch(path: String, id: String, name: String) -> OpResult
    => git::stash::stash_branch(&path, &id, &name));
command!(git_stash(path: String, op: StashOp, id: String) -> OpResult => git::stash::stash(&path, op, &id));
command!(conflict_file(path: String, file: String) -> ConflictFile => git::conflict::conflict_file(&path, &file));
command!(git_resolve(path: String, file: String, how: Resolution) -> OpResult
    => git::conflict::resolve(&path, &file, &how));
command!(commit_diff(path: String, id: String) -> Vec<FileDiff> => git::diff::commit_diff(&path, &id));
command!(range_diff(path: String, from: String, to: String, merge_base: bool) -> Vec<FileDiff>
    => git::diff::range_diff(&path, &from, &to, merge_base));
command!(save_file(path: String, rev: String, file: String, dest: String) -> OpResult
    => git::history::save_file(&path, &rev, &file, &dest));
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

/// Repository passed on the command line (`ddugit path/to/repo`), if any.
#[tauri::command]
fn initial_repo() -> Option<String> {
    repo_arg(std::env::args().skip(1))
}

/// The first argument that isn't an option, as an absolute path.
fn repo_arg(mut args: impl Iterator<Item = String>) -> Option<String> {
    let arg = args.find(|a| !a.starts_with('-'))?;
    // `absolute` rather than `canonicalize`: no `\\?\` verbatim prefix on Windows.
    std::path::absolute(arg)
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Watching::default())
        .invoke_handler(tauri::generate_handler![
            initial_repo,
            repo_root,
            git_clone,
            git_init,
            watch_repo,
            repo_snapshot,
            repo_glance,
            git_commit,
            git_stage_hunks,
            git_discard_hunks,
            git_stage_files,
            git_ignore,
            commit_template,
            set_git_path,
            git_version,
            app_info,
            report_send,
            git_rebase,
            git_rebase_todo,
            git_rebase_onto,
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
            git_worktree,
            git_submodule,
            lfs_status,
            git_lfs,
            git_remote,
            git_fetch_remote,
            git_push_to,
            git_remote_ref,
            git_skip,
            git_reset,
            git_reflog,
            branch_report,
            git_delete_branches,
            git_edit_commit,
            git_restore_file,
            git_bisect,
            bisect_state,
            file_log,
            search_commits,
            pull_requests,
            pr_target,
            pr_create,
            license_status,
            license_install,
            license_remove,
            license_refresh,
            license_activate,
            license_activate_cancel,
            license_deactivate,
            pro_status,
            transfer_export,
            transfer_import,
            transfer_check,
            transfer_history,
            stack_list,
            release_range,
            batch_switch,
            stack_op,
            update_check,
            update_install,
            ssh_status,
            identity_read,
            git_identity,
            signing_keys,
            commit_signature,
            ssh_keygen,
            ssh_host_key,
            ssh_trust_host,
            ssh_test,
            set_forge_token,
            forge_repos,
            open_url,
            git_blame,
            git_discard,
            git_stash_push,
            git_stash_branch,
            git_stash,
            conflict_file,
            git_resolve,
            commit_diff,
            range_diff,
            save_file,
            worktree_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use git::stack::StackOp;
    use git::testutil::{commit_file, repo, run, s};
    use git::OpStatus;
    use std::path::{Path, PathBuf};

    /// A repository on `main` with a `topic` branch one fix ahead, stacked on main and
    /// bundled in `.git/topic.bundle`, and the fix's id.
    fn fixture() -> (tempfile::TempDir, String) {
        let d = repo();
        commit_file(d.path(), "a.txt", "a", "base");
        run(d.path(), &["branch", "topic"]);
        run(d.path(), &["checkout", "-q", "topic"]);
        commit_file(d.path(), "b.txt", "b", "fix");
        let fix = run(d.path(), &["rev-parse", "HEAD"]).trim().to_string();
        run(d.path(), &["checkout", "-q", "main"]);
        run(d.path(), &["config", "branch.topic.ddugit-parent", "main"]);
        run(
            d.path(),
            &["bundle", "create", "-q", ".git/topic.bundle", "topic"],
        );
        (d, fix)
    }

    /// Everything a refused command must leave alone: refs, HEAD, local config, files.
    fn state(repo: &Path, out: &Path) -> String {
        let files: Vec<_> = std::fs::read_dir(out)
            .unwrap()
            .flatten()
            .map(|e| e.file_name())
            .collect();
        [
            run(repo, &["for-each-ref"]),
            run(repo, &["symbolic-ref", "HEAD"]),
            run(repo, &["config", "--local", "--list"]),
            run(repo, &["status", "--porcelain"]),
            format!("{files:?}"),
        ]
        .join("\n")
    }

    /// Every Pro-only command, as one call on `repo` with `cfg` as the config folder.
    type Call = fn(PathBuf, String, &str, &Path) -> Result<OpStatus, String>;

    fn pro_calls() -> Vec<(&'static str, Call)> {
        vec![
            ("backport_ignore", |cfg, p, fix, _| {
                backport_ignore::run(cfg, p, "main".into(), fix.into(), true).map(|()| OpStatus::Ok)
            }),
            ("backport_apply", |cfg, p, fix, _| {
                backport_apply::run(cfg, p, vec![fix.into()], "main".into()).map(|r| r.status)
            }),
            ("backport_export", |cfg, p, fix, out| {
                backport_export::run(cfg, p, vec![fix.into()], s(out).into()).map(|r| r.status)
            }),
            ("transfer_export", |cfg, p, _, out| {
                let req = git::transfer::ExportRequest {
                    dest: "Acme".into(),
                    branches: vec!["main".into()],
                    full: true,
                    out_dir: s(out).into(),
                };
                transfer_export::run(cfg, p, req).map(|r| r.status)
            }),
            ("transfer_import", |cfg, p, _, _| {
                let file = Path::new(&p).join(".git/topic.bundle");
                transfer_import::run(cfg, p, s(&file).into(), "acme".into()).map(|r| r.status)
            }),
            ("batch_switch", |cfg, p, _, _| {
                batch_switch::run(cfg, p, "topic".into()).map(|r| r.result.status)
            }),
            ("stack_op create", |cfg, p, _, _| {
                let op = StackOp::Create {
                    name: "next".into(),
                    parent: "main".into(),
                };
                stack_op::run(cfg, p, op).map(|r| r.status)
            }),
            ("stack_op set parent", |cfg, p, _, _| {
                let op = StackOp::SetParent {
                    branch: "topic".into(),
                    parent: "main".into(),
                };
                stack_op::run(cfg, p, op).map(|r| r.status)
            }),
            ("stack_op restack", |cfg, p, _, _| {
                let op = StackOp::Restack {
                    branch: "topic".into(),
                };
                stack_op::run(cfg, p, op).map(|r| r.status)
            }),
        ]
    }

    #[test]
    fn pro_commands_are_refused_on_free_before_touching_anything() {
        let free = tempfile::tempdir().unwrap();
        for (name, call) in pro_calls() {
            let (d, fix) = fixture();
            let out = tempfile::tempdir().unwrap();
            let before = state(d.path(), out.path());
            let r = call(free.path().into(), s(d.path()).into(), &fix, out.path());
            assert_eq!(r, Err(pro::LOCKED.to_string()), "{name}");
            assert_eq!(
                state(d.path(), out.path()),
                before,
                "{name} changed something on Free"
            );
        }
    }

    #[test]
    fn pro_commands_work_with_a_license() {
        let pro_dir = tempfile::tempdir().unwrap();
        license::tests::install_test_license(pro_dir.path());
        for (name, call) in pro_calls() {
            let (d, fix) = fixture();
            let out = tempfile::tempdir().unwrap();
            let r = call(pro_dir.path().into(), s(d.path()).into(), &fix, out.path());
            assert_eq!(r, Ok(OpStatus::Ok), "{name}");
        }
    }

    /// The release webview runs only the app's own scripts and talks only to the
    /// backend; the platform files must not loosen that.
    #[test]
    fn the_release_window_runs_only_its_own_scripts() {
        let conf: serde_json::Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let security = &conf["app"]["security"];
        assert_eq!(security["freezePrototype"], true);
        let csp = security["csp"].as_str().unwrap();
        let directive = |name: &str| {
            csp.split(';')
                .map(str::trim)
                .find_map(|d| d.strip_prefix(name)?.strip_prefix(' '))
                .unwrap_or_else(|| panic!("no {name} in {csp}"))
                .to_string()
        };
        assert_eq!(directive("default-src"), "'self'");
        assert_eq!(directive("script-src"), "'self'");
        assert_eq!(directive("connect-src"), "ipc: http://ipc.localhost");
        assert_eq!(directive("object-src"), "'none'");
        assert_eq!(directive("frame-ancestors"), "'none'");
        for platform in [
            include_str!("../tauri.macos.conf.json"),
            include_str!("../tauri.windows.conf.json"),
        ] {
            let conf: serde_json::Value = serde_json::from_str(platform).unwrap();
            assert!(conf["app"]["security"].is_null(), "{platform}");
        }
    }

    #[test]
    fn the_first_plain_argument_is_the_repository_to_open() {
        let args = |a: &[&str]| repo_arg(a.iter().map(|s| s.to_string()));
        assert_eq!(args(&[]), None);
        assert_eq!(args(&["--verbose", "-x"]), None);
        let abs = std::path::absolute("work/app").unwrap();
        let want = Some(abs.to_string_lossy().into_owned());
        assert_eq!(args(&["--flag", "work/app", "other"]), want);
        assert_eq!(args(&[&want.clone().unwrap()]), want);
    }

    #[test]
    fn taking_a_branch_out_of_its_stack_stays_free() {
        let free = tempfile::tempdir().unwrap();
        let (d, _) = fixture();
        let op = StackOp::Remove {
            branch: "topic".into(),
        };
        let r = stack_op::run(free.path().into(), s(d.path()).into(), op).unwrap();
        assert_eq!(r.status, OpStatus::Ok, "{}", r.output);
        assert!(git::stack::list(s(d.path())).unwrap().is_empty());
    }
}
