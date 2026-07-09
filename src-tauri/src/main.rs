#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Shared standard shell capabilities from kit/shell/tauri crate.
use nimi_shell_tauri::capabilities::{
    ai_config, data, runtime, session_logging, shell_ui, storage,
};
use nimi_shell_tauri::installed_app_launch::{
    build_installed_nimi_app_launch_binding_script,
    resolve_installed_nimi_app_launch_binding_from_env, InstalledNimiAppLaunchBindingEnvConfig,
};

const PARENTOS_APP_ID: &str = "nimi.parentos";
const PARENTOS_RUNTIME_APP_INSTANCE_ID: &str = "nimi.parentos.desktop-installed";
const PARENTOS_RUNTIME_DEVICE_ID: &str = "desktop-installed-app";
const PARENTOS_RELEASE_DESCRIPTOR_REF: &str = "nimi.parentos.bundled-with-nimi";
const DESKTOP_INSTALLED_APP_LAUNCH_HOST_ID: &str = "desktop-electron-installed-app-host";

// App-local modules
mod app_storage;
mod attachment_store;
mod child_avatar;
mod dropped_file;
mod journal_audio;
mod journal_photo;
mod orthodontic_photos;
mod photos;
mod report_export;
mod sqlite;
#[cfg(test)]
mod test_support;

fn load_dotenv_files() {
    let root_env_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../.env");
    if root_env_path.exists() {
        match dotenvy::from_path_iter(&root_env_path) {
            Ok(iter) => {
                for item in iter.flatten() {
                    let (key, value) = item;
                    // NIMI_* vars always override; others only set if missing
                    let should_override = key.starts_with("NIMI_") || key.starts_with("VITE_NIMI_");
                    if should_override || std::env::var_os(&key).is_none() {
                        std::env::set_var(&key, &value);
                    }
                }
                eprintln!("[parentos] dotenv loaded path={}", root_env_path.display());
            }
            Err(error) => {
                eprintln!(
                    "[parentos] dotenv load failed path={} error={error}",
                    root_env_path.display()
                );
            }
        }
    }
}

fn configure_runtime_bridge_env() {
    if cfg!(debug_assertions) && std::env::var_os("NIMI_RUNTIME_BRIDGE_MODE").is_none() {
        std::env::set_var("NIMI_RUNTIME_BRIDGE_MODE", "RUNTIME");
    }
}

fn optional_env_path(keys: &[&str]) -> Option<std::path::PathBuf> {
    keys.iter()
        .find_map(|key| {
            std::env::var(key)
                .ok()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .map(std::path::PathBuf::from)
}

fn parentos_standard_app_storage_binding() -> Result<data::StandardDataRootBinding, String> {
    match optional_env_path(&[
        "NIMI_APP_DURABLE_DATA_ROOT",
        "NIMI_PARENTOS_TAURI_DURABLE_DATA_ROOT",
        "NIMI_PARENTOS_TAURI_STANDARD_DATA_ROOT",
    ]) {
        Some(durable_data_root) => Ok(data::StandardDataRootBinding::RuntimeLaunchProjection {
            cache_root: optional_env_path(&[
                "NIMI_APP_CACHE_ROOT",
                "NIMI_PARENTOS_TAURI_CACHE_ROOT",
            ])
            .or_else(|| Some(durable_data_root.clone())),
            temp_root: optional_env_path(&["NIMI_APP_TEMP_ROOT", "NIMI_PARENTOS_TAURI_TEMP_ROOT"])
                .or_else(|| Some(durable_data_root.clone())),
            durable_data_root,
            projection_ref: "parentos-tauri-runtime-launch-projection".to_string(),
        }),
        None => Err("ParentOS Tauri requires host-bound standard app storage roots".to_string()),
    }
}

fn resolve_parentos_standard_storage() -> Result<
    (
        data::StandardAppStorageRootSlot,
        app_storage::ParentOSAppStorageRoots,
    ),
    String,
> {
    let standard_roots = tauri::async_runtime::block_on(data::resolve_standard_app_storage_roots(
        parentos_standard_app_storage_binding()?,
    ))?;
    let durable_data_root = standard_roots.data_root().display().to_string();
    let cache_root = standard_roots
        .cache_root()
        .unwrap_or_else(|| standard_roots.data_root())
        .display()
        .to_string();
    let temp_root = standard_roots
        .temp_root()
        .unwrap_or_else(|| standard_roots.data_root())
        .display()
        .to_string();
    let parentos_roots =
        app_storage::install_host_app_storage_roots(durable_data_root, cache_root, temp_root)?;
    Ok((
        data::StandardAppStorageRootSlot::from_roots(standard_roots),
        parentos_roots,
    ))
}

fn resolve_parentos_installed_launch_binding_script() -> Result<String, String> {
    let binding = resolve_installed_nimi_app_launch_binding_from_env(
        InstalledNimiAppLaunchBindingEnvConfig {
            app_id: PARENTOS_APP_ID,
            default_app_instance_id: PARENTOS_RUNTIME_APP_INSTANCE_ID,
            default_device_id: PARENTOS_RUNTIME_DEVICE_ID,
            default_release_descriptor_ref: PARENTOS_RELEASE_DESCRIPTOR_REF,
            launch_host_id: DESKTOP_INSTALLED_APP_LAUNCH_HOST_ID,
            launch_nonce_env_keys: &["NIMI_APP_LAUNCH_NONCE", "NIMI_PARENTOS_TAURI_LAUNCH_NONCE"],
            realm_base_url_env_keys: &[
                "NIMI_REALM_BASE_URL",
                "NIMI_REALM_URL",
                "NIMI_PARENTOS_TAURI_REALM_BASE_URL",
            ],
            app_instance_id_env_keys: &[
                "NIMI_APP_INSTANCE_ID",
                "NIMI_PARENTOS_TAURI_APP_INSTANCE_ID",
            ],
            device_id_env_keys: &["NIMI_APP_DEVICE_ID", "NIMI_PARENTOS_TAURI_DEVICE_ID"],
            release_descriptor_ref_env_keys: &[
                "NIMI_APP_RELEASE_DESCRIPTOR_REF",
                "NIMI_PARENTOS_TAURI_RELEASE_DESCRIPTOR_REF",
            ],
        },
    )?;
    build_installed_nimi_app_launch_binding_script(&binding)
        .map_err(|error| format!("serialize ParentOS installed app launch binding: {error}"))
}

fn setup_parentos_app_storage_scope(
    app: &mut tauri::App,
    roots: &app_storage::ParentOSAppStorageRoots,
) -> Result<(), Box<dyn std::error::Error>> {
    app_storage::allow_data_root_in_asset_scope(&app.handle(), roots).map_err(|error| {
        Box::new(std::io::Error::new(std::io::ErrorKind::Other, error))
            as Box<dyn std::error::Error>
    })
}

fn main() {
    load_dotenv_files();
    configure_runtime_bridge_env();
    session_logging::set_app_session_prefix("parentos");
    session_logging::install_panic_hook();
    session_logging::log_boot_marker("parentos main() entered");
    let (standard_storage_slot, parentos_roots) = resolve_parentos_standard_storage()
        .expect("bind ParentOS standard Runtime app storage roots");
    let parentos_roots_for_setup = parentos_roots.clone();
    let launch_binding_script = resolve_parentos_installed_launch_binding_script()
        .expect("bind ParentOS installed app launch binding");

    tauri::Builder::default()
        .append_invoke_initialization_script(launch_binding_script)
        .manage(standard_storage_slot)
        .setup(move |app| setup_parentos_app_storage_scope(app, &parentos_roots_for_setup))
        .invoke_handler(tauri::generate_handler![
            shell_ui::confirm_dialog,
            shell_ui::start_window_drag,
            shell_ui::focus_main_window,
            data::data_path_resolve,
            storage::storage_read_json,
            storage::storage_write_json,
            storage::storage_remove_json,
            ai_config::ai_config_get,
            ai_config::ai_config_set,
            runtime::runtime_bridge_unary,
            runtime::runtime_bridge_stream_open,
            runtime::runtime_bridge_stream_close,
            journal_audio::save_journal_voice_audio,
            journal_audio::delete_journal_voice_audio,
            journal_photo::save_journal_photo,
            child_avatar::save_child_avatar,
            journal_photo::delete_journal_photo,
            dropped_file::pick_image_files_as_base64,
            report_export::report_export_create_save_grant,
            report_export::report_export_write_grant,
            // Family & Children
            sqlite::queries::create_family,
            sqlite::queries::get_family,
            sqlite::queries::get_child,
            sqlite::queries::create_child,
            sqlite::queries::get_children,
            sqlite::queries::update_child,
            sqlite::queries::delete_child,
            // Growth Measurements
            sqlite::queries::insert_measurement,
            sqlite::queries::get_measurements,
            sqlite::queries::update_measurement,
            sqlite::queries::delete_measurement,
            // Milestone Records
            sqlite::queries::upsert_milestone_record,
            sqlite::queries::get_milestone_records,
            sqlite::queries::delete_milestone_record,
            // Reminder States
            sqlite::queries::upsert_reminder_state,
            sqlite::queries::get_reminder_states,
            sqlite::queries::get_active_reminders,
            sqlite::queries::upsert_reminder_consultation,
            sqlite::queries::clear_reminder_consultation,
            // Custom Todos
            sqlite::queries::insert_custom_todo,
            sqlite::queries::update_custom_todo,
            sqlite::queries::complete_custom_todo,
            sqlite::queries::advance_custom_todo_due_date,
            sqlite::queries::uncomplete_custom_todo,
            sqlite::queries::delete_custom_todo,
            sqlite::queries::get_custom_todos,
            // Vaccine Records
            sqlite::queries::insert_vaccine_record,
            sqlite::queries::get_vaccine_records,
            // Journal Entries
            sqlite::queries::insert_journal_entry,
            sqlite::queries::insert_journal_entry_with_tags,
            sqlite::queries::update_journal_entry_with_tags,
            sqlite::queries::update_journal_keepsake,
            sqlite::queries::delete_journal_entry,
            sqlite::queries::get_journal_entries,
            sqlite::queries::insert_journal_tag,
            sqlite::queries::get_journal_tags,
            // AI Conversations
            sqlite::queries::create_conversation,
            sqlite::queries::get_conversations,
            sqlite::queries::insert_ai_message,
            sqlite::queries::insert_consultation_ai_message,
            sqlite::queries::get_ai_messages,
            // Growth Reports
            sqlite::queries::insert_growth_report,
            sqlite::queries::get_growth_reports,
            sqlite::queries::update_growth_report_content,
            // App Settings
            sqlite::queries::set_app_setting,
            sqlite::queries::get_app_setting,
            // Dental Records
            sqlite::queries::insert_dental_record,
            sqlite::queries::update_dental_record,
            sqlite::queries::delete_dental_record,
            sqlite::queries::get_dental_records,
            sqlite::queries::insert_ortho_clinical_dental_record,
            // Attachments
            attachment_store::save_attachment,
            attachment_store::get_attachments,
            attachment_store::get_attachments_by_owner,
            attachment_store::delete_attachment,
            // Allergy Records
            sqlite::queries::insert_allergy_record,
            sqlite::queries::update_allergy_record,
            sqlite::queries::get_allergy_records,
            // Sleep Records
            sqlite::queries::upsert_sleep_record,
            sqlite::queries::delete_sleep_record,
            sqlite::queries::get_sleep_records,
            // Medical Events
            sqlite::queries::insert_medical_event,
            sqlite::queries::update_medical_event,
            sqlite::queries::get_medical_events,
            // Tanner Assessments
            sqlite::queries::insert_tanner_assessment,
            sqlite::queries::get_tanner_assessments,
            sqlite::queries::delete_tanner_assessment,
            // Fitness Assessments
            sqlite::queries::insert_fitness_assessment,
            sqlite::queries::get_fitness_assessments,
            sqlite::queries::delete_fitness_assessment,
            sqlite::queries::delete_fitness_event,
            // Outdoor Records
            sqlite::queries::insert_outdoor_record,
            sqlite::queries::update_outdoor_record,
            sqlite::queries::delete_outdoor_record,
            sqlite::queries::get_outdoor_records,
            sqlite::queries::get_outdoor_goal,
            sqlite::queries::set_outdoor_goal,
            // Posture Assessments (PO-PROF-019)
            sqlite::queries::insert_posture_assessment,
            sqlite::queries::get_posture_assessments,
            // Health Record Capture
            sqlite::queries::save_health_record_capture,
            sqlite::queries::replace_health_record_capture,
            sqlite::queries::get_health_record_events,
            sqlite::queries::get_health_record_values,
            // Profile Section Summaries
            sqlite::queries::get_profile_section_summaries,
            // Orthodontic (PO-ORTHO-*)
            sqlite::queries::insert_orthodontic_case,
            sqlite::queries::update_orthodontic_case,
            sqlite::queries::delete_orthodontic_case,
            sqlite::queries::get_orthodontic_cases,
            sqlite::queries::insert_orthodontic_appliance,
            sqlite::queries::update_orthodontic_appliance_status,
            sqlite::queries::update_orthodontic_appliance_review,
            sqlite::queries::update_orthodontic_appliance_plan,
            sqlite::queries::advance_orthodontic_appliance_phase,
            sqlite::queries::delete_orthodontic_appliance,
            sqlite::queries::get_orthodontic_appliances,
            sqlite::queries::insert_orthodontic_checkin,
            sqlite::queries::delete_orthodontic_checkin,
            sqlite::queries::get_orthodontic_checkins,
            sqlite::queries::get_orthodontic_dashboard,
            sqlite::queries::insert_unwear_interval,
            sqlite::queries::close_unwear_interval,
            sqlite::queries::update_unwear_interval,
            sqlite::queries::delete_unwear_interval,
            sqlite::queries::get_unwear_intervals,
            sqlite::queries::get_orthodontic_journey,
            // Orthodontic Photo Sessions (PO-ORTHO-012)
            sqlite::queries::insert_orthodontic_photo_session,
            sqlite::queries::update_orthodontic_photo_session,
            sqlite::queries::get_orthodontic_photo_session,
            sqlite::queries::list_orthodontic_photo_sessions_for_case,
            sqlite::queries::list_photo_attachments_for_session,
            orthodontic_photos::attach_orthodontic_photo,
            orthodontic_photos::list_orthodontic_photo_session_bundles,
            orthodontic_photos::read_orthodontic_photo_blob,
            orthodontic_photos::delete_orthodontic_photo_session,
            orthodontic_photos::delete_orthodontic_photo_attachment,
            // Vision follow-up settings
            sqlite::queries::get_vision_followup_settings,
            sqlite::queries::set_vision_followup_settings,
            sqlite::queries::clear_vision_followup_settings,
            // DB init
            sqlite::db_init,
        ])
        .run(tauri::generate_context!())
        .expect("error running parentos");
}
