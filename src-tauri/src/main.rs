#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use nimi_shell_tauri::capabilities::{runtime::RuntimeBridgeInstalledHost, session_logging};
use nimiplatform_parentos::app_storage;
use tauri::Manager;

fn setup_parentos_installed_host(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let data_root = app.path().app_data_dir()?.join("data");
    let cache_root = app.path().app_cache_dir()?;
    let temp_root = cache_root.join("tmp");
    for root in [&data_root, &cache_root, &temp_root] {
        std::fs::create_dir_all(root)?;
    }
    app_storage::install_host_app_storage_roots(
        data_root.display().to_string(),
        cache_root.display().to_string(),
        temp_root.display().to_string(),
    )
    .map_err(std::io::Error::other)?;
    app.manage(RuntimeBridgeInstalledHost::platform_default());
    Ok(())
}

fn main() {
    session_logging::set_app_session_prefix("parentos");
    session_logging::install_panic_hook();
    session_logging::log_boot_marker("parentos main() entered");

    tauri::Builder::default()
        .setup(setup_parentos_installed_host)
        .invoke_handler(nimi_shell_tauri::nimi_shell_tauri_installed_app_standard_shell_handler![])
        .run(tauri::generate_context!())
        .expect("error running parentos");
}
