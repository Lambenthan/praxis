// AI4S Workbench — Tauri 2 entry. Hosts the React frontend and supervises the
// bundled OpenCode sidecar (isolated config/data + dedicated port; killed on exit).
mod artifact_file;
mod debug_log;
mod examples;
mod hpc;
mod jupyter;
mod kernel;
mod large_file;
mod modal;
mod opencode_config;
mod preview_server;
mod provenance;
mod runtime;
mod science_mcp;
mod tools;

use jupyter::JupyterState;
use kernel::KernelState;
use preview_server::PreviewState;
use provenance::ProvenanceState;
use runtime::RuntimeState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Single instance MUST be the first plugin. A second launch (or a reinstall
        // while the app is still running) focuses the existing window instead of
        // starting a second OpenCode on the same data dir (which deadlocks the DB).
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        // Self-update: the frontend checks on launch and drives the download +
        // install through this plugin; `process` provides the relaunch after.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(RuntimeState::default())
        .manage(KernelState::default())
        .manage(JupyterState::default())
        .manage(PreviewState::default())
        .manage(ProvenanceState::default())
        .invoke_handler(tauri::generate_handler![
            runtime::start_runtime,
            runtime::runtime_password,
            runtime::stop_runtime,
            runtime::workspace_path,
            runtime::workspace_base,
            runtime::set_workspace_base,
            runtime::open_workspace_base,
            runtime::set_workspace,
            runtime::new_dated_workspace,
            runtime::pick_folder,
            runtime::import_opencode_login,
            runtime::remove_config_entry,
            jupyter::jupyter_status,
            jupyter::setup_jupyter,
            jupyter::start_jupyter,
            runtime::configure_opencode,
            runtime::get_approval_mode,
            runtime::set_approval_mode,
            kernel::kernel_execute,
            kernel::kernel_reset,
            artifact_file::read_artifact,
            artifact_file::open_path,
            artifact_file::resolve_artifact,
            artifact_file::save_text_file,
            artifact_file::save_binary_file,
            artifact_file::open_url,
            artifact_file::add_files_to_workspace,
            artifact_file::add_text_to_workspace,
            artifact_file::list_notebooks,
            artifact_file::list_dir,
            artifact_file::write_workspace_file,
            provenance::record_provenance,
            provenance::list_provenance,
            provenance::read_env_lockfile,
            science_mcp::science_mcp_python,
            science_mcp::setup_science_mcp,
            examples::install_example,
            hpc::list_ssh_hosts,
            hpc::hpc_config,
            hpc::set_hpc_config,
            hpc::hpc_check,
            hpc::hpc_jobs,
            hpc::hpc_cancel,
            modal::modal_status,
            preview_server::preview_url,
            large_file::probe_large_file,
            tools::detect_tools,
            debug_log::log_debug
        ])
        .build(tauri::generate_context!())
        .expect("error while building AI4S Workbench")
        .run(|app, event| {
            // Clean up on exit. macOS Cmd+Q / Quit terminates via RunEvent::Exit
            // (ExitRequested is not always delivered), so handle BOTH — otherwise
            // the OpenCode sidecar / kernel / Jupyter orphan on every quit. The
            // cleanup is idempotent, so running on both is safe.
            if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
                runtime::kill_child(&app.state::<RuntimeState>());
                kernel::kill_kernel(&app.state::<KernelState>());
                jupyter::kill_jupyter(&app.state::<JupyterState>());
            }
        });
}
