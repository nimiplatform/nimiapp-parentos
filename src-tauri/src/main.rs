#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use nimi_shell_tauri::capabilities::{runtime::RuntimeBridgeLocalAppHost, session_logging};
use nimiplatform_parentos::{
    app_storage, attachment_store, child_avatar, dropped_file, journal_audio, journal_photo,
    orthodontic_photos, report_export, sqlite,
};
use tauri::Manager;

fn setup_parentos_app_host(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
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
    app.manage(RuntimeBridgeLocalAppHost::platform_default());
    Ok(())
}

fn main() {
    session_logging::set_app_session_prefix("parentos");
    session_logging::install_panic_hook();
    session_logging::log_boot_marker("parentos main() entered");

    tauri::Builder::default()
        .setup(setup_parentos_app_host)
        .invoke_handler(nimi_shell_tauri::nimi_shell_tauri_local_app_standard_shell_handler![
            journal_audio::save_journal_voice_audio,
            journal_audio::delete_journal_voice_audio,
            journal_photo::save_journal_photo,
            child_avatar::save_child_avatar,
            journal_photo::delete_journal_photo,
            dropped_file::pick_image_files_as_base64,
            report_export::report_export_create_save_target,
            report_export::report_export_write_save_target,
            sqlite::queries::create_family,
            sqlite::queries::get_family,
            sqlite::queries::get_child,
            sqlite::queries::create_child,
            sqlite::queries::get_children,
            sqlite::queries::update_child,
            sqlite::queries::delete_child,
            sqlite::queries::insert_measurement,
            sqlite::queries::get_measurements,
            sqlite::queries::update_measurement,
            sqlite::queries::delete_measurement,
            sqlite::queries::upsert_milestone_record,
            sqlite::queries::get_milestone_records,
            sqlite::queries::delete_milestone_record,
            sqlite::queries::upsert_reminder_state,
            sqlite::queries::get_reminder_states,
            sqlite::queries::get_active_reminders,
            sqlite::queries::upsert_reminder_consultation,
            sqlite::queries::clear_reminder_consultation,
            sqlite::queries::insert_custom_todo,
            sqlite::queries::update_custom_todo,
            sqlite::queries::complete_custom_todo,
            sqlite::queries::advance_custom_todo_due_date,
            sqlite::queries::uncomplete_custom_todo,
            sqlite::queries::delete_custom_todo,
            sqlite::queries::get_custom_todos,
            sqlite::queries::insert_vaccine_record,
            sqlite::queries::get_vaccine_records,
            sqlite::queries::insert_journal_entry,
            sqlite::queries::insert_journal_entry_with_tags,
            sqlite::queries::update_journal_entry_with_tags,
            sqlite::queries::update_journal_keepsake,
            sqlite::queries::delete_journal_entry,
            sqlite::queries::get_journal_entries,
            sqlite::queries::insert_journal_tag,
            sqlite::queries::get_journal_tags,
            sqlite::queries::create_conversation,
            sqlite::queries::get_conversations,
            sqlite::queries::insert_ai_message,
            sqlite::queries::insert_consultation_ai_message,
            sqlite::queries::get_ai_messages,
            sqlite::queries::insert_growth_report,
            sqlite::queries::get_growth_reports,
            sqlite::queries::update_growth_report_content,
            sqlite::queries::set_app_setting,
            sqlite::queries::get_app_setting,
            sqlite::queries::insert_dental_record,
            sqlite::queries::update_dental_record,
            sqlite::queries::delete_dental_record,
            sqlite::queries::get_dental_records,
            sqlite::queries::insert_ortho_clinical_dental_record,
            attachment_store::save_attachment,
            attachment_store::get_attachments,
            attachment_store::get_attachments_by_owner,
            attachment_store::delete_attachment,
            sqlite::queries::insert_allergy_record,
            sqlite::queries::update_allergy_record,
            sqlite::queries::get_allergy_records,
            sqlite::queries::upsert_sleep_record,
            sqlite::queries::delete_sleep_record,
            sqlite::queries::get_sleep_records,
            sqlite::queries::insert_medical_event,
            sqlite::queries::update_medical_event,
            sqlite::queries::get_medical_events,
            sqlite::queries::insert_tanner_assessment,
            sqlite::queries::get_tanner_assessments,
            sqlite::queries::delete_tanner_assessment,
            sqlite::queries::insert_fitness_assessment,
            sqlite::queries::get_fitness_assessments,
            sqlite::queries::delete_fitness_assessment,
            sqlite::queries::delete_fitness_event,
            sqlite::queries::insert_outdoor_record,
            sqlite::queries::update_outdoor_record,
            sqlite::queries::delete_outdoor_record,
            sqlite::queries::get_outdoor_records,
            sqlite::queries::get_outdoor_goal,
            sqlite::queries::set_outdoor_goal,
            sqlite::queries::insert_posture_assessment,
            sqlite::queries::get_posture_assessments,
            sqlite::queries::save_health_record_capture,
            sqlite::queries::replace_health_record_capture,
            sqlite::queries::get_health_record_events,
            sqlite::queries::get_health_record_values,
            sqlite::queries::get_profile_section_summaries,
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
            sqlite::queries::get_vision_followup_settings,
            sqlite::queries::set_vision_followup_settings,
            sqlite::queries::clear_vision_followup_settings,
            sqlite::db_init,
        ])
        .run(tauri::generate_context!())
        .expect("error running parentos");
}
