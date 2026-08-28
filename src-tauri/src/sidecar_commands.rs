use serde::de::DeserializeOwned;
use serde::Deserialize;
use serde_json::Value;
use std::path::PathBuf;

use crate::sqlite::queries;
use crate::{
    app_storage, attachment_store, child_avatar, dropped_file, journal_audio, journal_photo,
    orthodontic_photos, report_export, sqlite,
};

pub const PARENTOS_DIRECT_SIDECAR_COMMANDS: &[&str] = &[
    "save_journal_voice_audio",
    "delete_journal_voice_audio",
    "save_journal_photo",
    "save_child_avatar",
    "delete_journal_photo",
    "report_export_write_save_target",
    "create_family",
    "get_family",
    "get_child",
    "create_child",
    "get_children",
    "update_child",
    "delete_child",
    "insert_measurement",
    "get_measurements",
    "update_measurement",
    "delete_measurement",
    "upsert_milestone_record",
    "get_milestone_records",
    "delete_milestone_record",
    "upsert_reminder_state",
    "get_reminder_states",
    "get_active_reminders",
    "upsert_reminder_consultation",
    "clear_reminder_consultation",
    "insert_custom_todo",
    "update_custom_todo",
    "complete_custom_todo",
    "advance_custom_todo_due_date",
    "uncomplete_custom_todo",
    "delete_custom_todo",
    "get_custom_todos",
    "insert_vaccine_record",
    "update_vaccine_record",
    "delete_vaccine_record",
    "get_vaccine_records",
    "insert_journal_entry",
    "insert_journal_entry_with_tags",
    "update_journal_entry_with_tags",
    "update_journal_keepsake",
    "delete_journal_entry",
    "get_journal_entries",
    "insert_journal_tag",
    "get_journal_tags",
    "create_conversation",
    "get_conversations",
    "insert_ai_message",
    "insert_consultation_ai_message",
    "get_ai_messages",
    "insert_growth_report",
    "get_growth_reports",
    "update_growth_report_content",
    "set_app_setting",
    "get_app_setting",
    "insert_dental_record",
    "update_dental_record",
    "delete_dental_record",
    "get_dental_records",
    "insert_ortho_clinical_dental_record",
    "save_attachment",
    "get_attachments",
    "get_attachments_by_owner",
    "delete_attachment",
    "insert_allergy_record",
    "update_allergy_record",
    "get_allergy_records",
    "upsert_sleep_record",
    "delete_sleep_record",
    "get_sleep_records",
    "insert_medical_event",
    "update_medical_event",
    "get_medical_events",
    "insert_tanner_assessment",
    "get_tanner_assessments",
    "delete_tanner_assessment",
    "insert_fitness_assessment",
    "get_fitness_assessments",
    "delete_fitness_assessment",
    "delete_fitness_event",
    "insert_outdoor_record",
    "update_outdoor_record",
    "delete_outdoor_record",
    "get_outdoor_records",
    "get_outdoor_goal",
    "set_outdoor_goal",
    "insert_posture_assessment",
    "get_posture_assessments",
    "save_health_record_capture",
    "replace_health_record_capture",
    "get_health_record_events",
    "get_health_record_values",
    "get_profile_section_summaries",
    "insert_orthodontic_case",
    "update_orthodontic_case",
    "delete_orthodontic_case",
    "get_orthodontic_cases",
    "insert_orthodontic_appliance",
    "update_orthodontic_appliance_status",
    "update_orthodontic_appliance_review",
    "update_orthodontic_appliance_plan",
    "advance_orthodontic_appliance_phase",
    "delete_orthodontic_appliance",
    "get_orthodontic_appliances",
    "insert_orthodontic_checkin",
    "delete_orthodontic_checkin",
    "get_orthodontic_checkins",
    "get_orthodontic_dashboard",
    "insert_unwear_interval",
    "close_unwear_interval",
    "update_unwear_interval",
    "delete_unwear_interval",
    "get_unwear_intervals",
    "get_orthodontic_journey",
    "insert_orthodontic_photo_session",
    "update_orthodontic_photo_session",
    "get_orthodontic_photo_session",
    "list_orthodontic_photo_sessions_for_case",
    "list_photo_attachments_for_session",
    "attach_orthodontic_photo",
    "list_orthodontic_photo_session_bundles",
    "read_orthodontic_photo_blob",
    "delete_orthodontic_photo_session",
    "delete_orthodontic_photo_attachment",
    "get_vision_followup_settings",
    "set_vision_followup_settings",
    "clear_vision_followup_settings",
    "export_structured_backup",
    "import_structured_backup",
    "db_init",
];

#[derive(Debug)]
pub struct ParentOSSidecarInitInput {
    pub projection_ref: String,
    pub durable_data_root: String,
    pub cache_root: String,
    pub temp_root: String,
}

#[derive(Debug, Clone)]
pub struct ParentOSSidecarError {
    pub code: &'static str,
    pub reason_code: &'static str,
    pub action_hint: &'static str,
    pub source: &'static str,
    pub details: Value,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct NoArgs {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReportExportRegisterSaveTargetArgs {
    save_target_id: String,
    path: String,
    kind: String,
    display_path: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DroppedFileReadImageFilesAsBase64Args {
    paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveJournalVoiceAudioArgs {
    child_id: String,
    entry_id: String,
    mime_type: String,
    audio_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteJournalVoiceAudioArgs {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveJournalPhotoArgs {
    child_id: String,
    entry_id: String,
    index: u32,
    mime_type: String,
    image_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveChildAvatarArgs {
    child_id: String,
    mime_type: String,
    image_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteJournalPhotoArgs {
    path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReportExportWriteSaveTargetArgs {
    save_target_id: String,
    base64_data: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateFamilyArgs {
    family_id: String,
    display_name: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetChildArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateChildArgs {
    child_id: String,
    family_id: String,
    display_name: String,
    gender: String,
    birth_date: String,
    birth_weight_kg: Option<f64>,
    birth_height_cm: Option<f64>,
    birth_head_circ_cm: Option<f64>,
    avatar_path: Option<String>,
    nurture_mode: String,
    nurture_mode_overrides: Option<String>,
    allergies: Option<String>,
    medical_notes: Option<String>,
    recorder_profiles: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetChildrenArgs {
    family_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateChildArgs {
    child_id: String,
    display_name: String,
    gender: String,
    birth_date: String,
    birth_weight_kg: Option<f64>,
    birth_height_cm: Option<f64>,
    birth_head_circ_cm: Option<f64>,
    avatar_path: Option<String>,
    nurture_mode: String,
    nurture_mode_overrides: Option<String>,
    allergies: Option<String>,
    medical_notes: Option<String>,
    recorder_profiles: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteChildArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertMeasurementArgs {
    measurement_id: String,
    child_id: String,
    type_id: String,
    value: f64,
    measured_at: String,
    age_months: i32,
    percentile: Option<f64>,
    source: Option<String>,
    notes: Option<String>,
    now: String,
    linked_reminder_state_id: Option<String>,
    linked_reminder_rule_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetMeasurementsArgs {
    child_id: String,
    type_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateMeasurementArgs {
    measurement_id: String,
    value: f64,
    measured_at: String,
    age_months: i32,
    percentile: Option<f64>,
    source: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteMeasurementArgs {
    measurement_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpsertMilestoneRecordArgs {
    record_id: String,
    child_id: String,
    milestone_id: String,
    achieved_at: Option<String>,
    age_months_when_achieved: Option<i32>,
    notes: Option<String>,
    photo_path: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetMilestoneRecordsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteMilestoneRecordArgs {
    record_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpsertReminderStateArgs {
    state_id: String,
    child_id: String,
    rule_id: String,
    status: String,
    activated_at: Option<String>,
    completed_at: Option<String>,
    dismissed_at: Option<String>,
    dismiss_reason: Option<String>,
    repeat_index: i32,
    next_trigger_at: Option<String>,
    snoozed_until: Option<String>,
    scheduled_date: Option<String>,
    not_applicable: i32,
    planned_for_date: Option<String>,
    surface_rank: Option<i32>,
    last_surfaced_at: Option<String>,
    surface_count: i32,
    notes: Option<String>,
    acknowledged_at: Option<String>,
    reflected_at: Option<String>,
    practice_started_at: Option<String>,
    practice_last_at: Option<String>,
    practice_count: i32,
    practice_habituated_at: Option<String>,
    consulted_at: Option<String>,
    consultation_conversation_id: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetReminderStatesArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetActiveRemindersArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpsertReminderConsultationArgs {
    child_id: String,
    rule_id: String,
    repeat_index: i32,
    conversation_id: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClearReminderConsultationArgs {
    child_id: String,
    conversation_id: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertCustomTodoArgs {
    todo_id: String,
    child_id: String,
    title: String,
    due_date: Option<String>,
    recurrence_rule: Option<String>,
    reminder_offset_minutes: Option<i64>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateCustomTodoArgs {
    todo_id: String,
    title: String,
    due_date: Option<String>,
    recurrence_rule: Option<String>,
    reminder_offset_minutes: Option<i64>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CompleteCustomTodoArgs {
    todo_id: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AdvanceCustomTodoDueDateArgs {
    todo_id: String,
    next_due_date: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UncompleteCustomTodoArgs {
    todo_id: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteCustomTodoArgs {
    todo_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetCustomTodosArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertVaccineRecordArgs {
    record_id: String,
    reminder_state_id: String,
    child_id: String,
    rule_id: String,
    vaccine_name: String,
    vaccinated_at: String,
    age_months: i32,
    batch_number: Option<String>,
    hospital: Option<String>,
    adverse_reaction: Option<String>,
    photo_path: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateVaccineRecordArgs {
    record_id: String,
    vaccinated_at: String,
    age_months: i32,
    batch_number: Option<String>,
    hospital: Option<String>,
    adverse_reaction: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteVaccineRecordArgs {
    record_id: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetVaccineRecordsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertJournalEntryArgs {
    entry_id: String,
    child_id: String,
    content_type: String,
    text_content: Option<String>,
    voice_path: Option<String>,
    photo_paths: Option<String>,
    recorded_at: String,
    age_months: i32,
    observation_mode: Option<String>,
    dimension_id: Option<String>,
    selected_tags: Option<String>,
    guided_answers: Option<String>,
    observation_duration: Option<i32>,
    keepsake: i32,
    keepsake_title: Option<String>,
    keepsake_reason: Option<String>,
    #[serde(rename = "moodTag")]
    mood_tag: Option<String>,
    recorder_id: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertJournalEntryWithTagsArgs {
    entry_id: String,
    child_id: String,
    content_type: String,
    text_content: Option<String>,
    voice_path: Option<String>,
    photo_paths: Option<String>,
    recorded_at: String,
    age_months: i32,
    observation_mode: Option<String>,
    dimension_id: Option<String>,
    selected_tags: Option<String>,
    guided_answers: Option<String>,
    observation_duration: Option<i32>,
    keepsake: i32,
    keepsake_title: Option<String>,
    keepsake_reason: Option<String>,
    #[serde(rename = "moodTag")]
    mood_tag: Option<String>,
    recorder_id: Option<String>,
    ai_tags: Vec<queries::JournalTagInput>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateJournalEntryWithTagsArgs {
    entry_id: String,
    child_id: String,
    content_type: String,
    text_content: Option<String>,
    voice_path: Option<String>,
    photo_paths: Option<String>,
    recorded_at: String,
    age_months: i32,
    observation_mode: Option<String>,
    dimension_id: Option<String>,
    selected_tags: Option<String>,
    guided_answers: Option<String>,
    observation_duration: Option<i32>,
    keepsake: i32,
    keepsake_title: Option<String>,
    keepsake_reason: Option<String>,
    #[serde(rename = "moodTag")]
    mood_tag: Option<String>,
    recorder_id: Option<String>,
    ai_tags: Vec<queries::JournalTagInput>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateJournalKeepsakeArgs {
    entry_id: String,
    keepsake: i32,
    keepsake_title: Option<String>,
    keepsake_reason: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteJournalEntryArgs {
    entry_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetJournalEntriesArgs {
    child_id: String,
    limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertJournalTagArgs {
    tag_id: String,
    entry_id: String,
    domain: String,
    tag: String,
    source: String,
    confidence: Option<f64>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetJournalTagsArgs {
    entry_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CreateConversationArgs {
    conversation_id: String,
    child_id: String,
    title: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetConversationsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertAiMessageArgs {
    message_id: String,
    conversation_id: String,
    role: String,
    content: String,
    context_snapshot: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertConsultationAiMessageArgs {
    message_id: String,
    conversation_id: String,
    child_id: String,
    rule_id: String,
    repeat_index: i32,
    content: String,
    context_snapshot: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetAiMessagesArgs {
    conversation_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertGrowthReportArgs {
    report_id: String,
    child_id: String,
    report_type: String,
    period_start: String,
    period_end: String,
    age_months_start: i32,
    age_months_end: i32,
    content: String,
    generated_at: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetGrowthReportsArgs {
    child_id: String,
    report_type: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateGrowthReportContentArgs {
    report_id: String,
    content: String,
    #[serde(rename = "now")]
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SetAppSettingArgs {
    key: String,
    value: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetAppSettingArgs {
    key: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertDentalRecordArgs {
    record_id: String,
    child_id: String,
    event_type: String,
    tooth_id: Option<String>,
    tooth_set: Option<String>,
    event_date: String,
    age_months: i32,
    severity: Option<String>,
    hospital: Option<String>,
    notes: Option<String>,
    photo_path: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateDentalRecordArgs {
    record_id: String,
    event_type: String,
    tooth_id: Option<String>,
    tooth_set: Option<String>,
    event_date: String,
    age_months: i32,
    severity: Option<String>,
    hospital: Option<String>,
    notes: Option<String>,
    photo_path: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteDentalRecordArgs {
    record_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetDentalRecordsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertOrthoClinicalDentalRecordArgs {
    record_id: String,
    child_id: String,
    event_type: String,
    event_date: String,
    age_months: i32,
    hospital: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveAttachmentArgs {
    attachment_id: String,
    child_id: String,
    owner_table: String,
    owner_id: String,
    file_name: String,
    mime_type: String,
    image_base64: String,
    caption: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetAttachmentsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetAttachmentsByOwnerArgs {
    child_id: String,
    owner_table: String,
    owner_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteAttachmentArgs {
    attachment_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertAllergyRecordArgs {
    record_id: String,
    child_id: String,
    allergen: String,
    category: String,
    reaction_type: Option<String>,
    severity: String,
    diagnosed_at: Option<String>,
    age_months_at_diagnosis: Option<i32>,
    status: String,
    status_changed_at: Option<String>,
    confirmed_by: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateAllergyRecordArgs {
    record_id: String,
    allergen: String,
    category: String,
    reaction_type: Option<String>,
    severity: String,
    status: String,
    status_changed_at: Option<String>,
    confirmed_by: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetAllergyRecordsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpsertSleepRecordArgs {
    record_id: String,
    child_id: String,
    sleep_date: String,
    bedtime: Option<String>,
    wake_time: Option<String>,
    duration_minutes: Option<i32>,
    nap_count: Option<i32>,
    nap_minutes: Option<i32>,
    quality: Option<String>,
    age_months: i32,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteSleepRecordArgs {
    record_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetSleepRecordsArgs {
    child_id: String,
    limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertMedicalEventArgs {
    event_id: String,
    child_id: String,
    event_type: String,
    title: String,
    event_date: String,
    end_date: Option<String>,
    age_months: i32,
    severity: Option<String>,
    result: Option<String>,
    hospital: Option<String>,
    medication: Option<String>,
    dosage: Option<String>,
    notes: Option<String>,
    photo_path: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateMedicalEventArgs {
    event_id: String,
    title: String,
    event_date: String,
    end_date: Option<String>,
    severity: Option<String>,
    result: Option<String>,
    hospital: Option<String>,
    medication: Option<String>,
    dosage: Option<String>,
    notes: Option<String>,
    photo_path: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetMedicalEventsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertTannerAssessmentArgs {
    assessment_id: String,
    child_id: String,
    assessed_at: String,
    age_months: i32,
    breast_or_genital_stage: Option<i32>,
    pubic_hair_stage: Option<i32>,
    assessed_by: Option<String>,
    notes: Option<String>,
    now: String,
    linked_reminder_state_id: Option<String>,
    linked_reminder_rule_id: Option<String>,
    menarche_status: Option<String>,
    menarche_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetTannerAssessmentsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteTannerAssessmentArgs {
    assessment_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertFitnessAssessmentArgs {
    assessment_id: String,
    child_id: String,
    assessed_at: String,
    age_months: i32,
    assessment_source: Option<String>,
    run_50m: Option<f64>,
    run_800m: Option<f64>,
    run_1000m: Option<f64>,
    run_50x8: Option<f64>,
    sit_and_reach: Option<f64>,
    standing_long_jump: Option<f64>,
    sit_ups: Option<i32>,
    pull_ups: Option<i32>,
    rope_skipping: Option<i32>,
    vital_capacity: Option<i32>,
    run_10m_shuttle: Option<f64>,
    tennis_ball_throw: Option<f64>,
    double_foot_jump: Option<f64>,
    balance_beam: Option<f64>,
    foot_arch_status: Option<String>,
    notes: Option<String>,
    now: String,
    linked_reminder_state_id: Option<String>,
    linked_reminder_rule_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetFitnessAssessmentsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteFitnessAssessmentArgs {
    assessment_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteFitnessEventArgs {
    event_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertOutdoorRecordArgs {
    record_id: String,
    child_id: String,
    activity_date: String,
    duration_minutes: i32,
    note: Option<String>,
    now: String,
    linked_reminder_state_id: Option<String>,
    linked_reminder_rule_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateOutdoorRecordArgs {
    record_id: String,
    activity_date: Option<String>,
    duration_minutes: Option<i32>,
    note: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteOutdoorRecordArgs {
    record_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetOutdoorRecordsArgs {
    child_id: String,
    start_date: Option<String>,
    end_date: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetOutdoorGoalArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SetOutdoorGoalArgs {
    child_id: String,
    goal_minutes: i32,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertPostureAssessmentArgs {
    assessment_id: String,
    child_id: String,
    assessed_at: String,
    age_months: i32,
    source: Option<String>,
    shoulder: Option<String>,
    scapula: Option<String>,
    hip: Option<String>,
    leg: Option<String>,
    heel: Option<String>,
    neck: Option<String>,
    pelvis: Option<String>,
    knee: Option<String>,
    adam: Option<String>,
    cobb_angle: Option<f64>,
    notes: Option<String>,
    photo_paths: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetPostureAssessmentsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SaveHealthRecordCaptureArgs {
    input: queries::SaveHealthRecordCaptureInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReplaceHealthRecordCaptureArgs {
    replace_event_id: String,
    input: queries::SaveHealthRecordCaptureInput,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetHealthRecordEventsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetHealthRecordValuesArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetProfileSectionSummariesArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertOrthodonticCaseArgs {
    case_id: String,
    child_id: String,
    case_type: String,
    stage: String,
    started_at: String,
    planned_end_at: Option<String>,
    primary_issues: Option<String>,
    provider_name: Option<String>,
    provider_institution: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateOrthodonticCaseArgs {
    case_id: String,
    case_type: String,
    stage: String,
    started_at: String,
    planned_end_at: Option<String>,
    actual_end_at: Option<String>,
    primary_issues: Option<String>,
    provider_name: Option<String>,
    provider_institution: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteOrthodonticCaseArgs {
    case_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetOrthodonticCasesArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertOrthodonticApplianceArgs {
    appliance_id: String,
    case_id: String,
    child_id: String,
    child_birth_date: String,
    appliance_type: String,
    status: String,
    started_at: String,
    prescribed_hours_per_day: Option<i32>,
    prescribed_activations: Option<i32>,
    activation_interval_days: Option<i32>,
    total_aligners: Option<i32>,
    days_per_aligner: Option<i32>,
    current_phase: Option<String>,
    phase_started_at: Option<String>,
    review_interval_days: Option<i32>,
    next_review_agenda: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateOrthodonticApplianceStatusArgs {
    appliance_id: String,
    status: String,
    pause_reason: Option<String>,
    ended_at: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateOrthodonticApplianceReviewArgs {
    appliance_id: String,
    last_review_at: Option<String>,
    next_review_date: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateOrthodonticAppliancePlanArgs {
    appliance_id: String,
    prescribed_hours_per_day: Option<i32>,
    total_aligners: Option<i32>,
    days_per_aligner: Option<i32>,
    activation_interval_days: Option<i32>,
    next_review_agenda: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AdvanceOrthodonticAppliancePhaseArgs {
    appliance_id: String,
    next_phase: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteOrthodonticApplianceArgs {
    appliance_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetOrthodonticAppliancesArgs {
    case_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertOrthodonticCheckinArgs {
    checkin_id: String,
    child_id: String,
    case_id: String,
    appliance_id: String,
    checkin_type: String,
    checkin_date: String,
    checkin_at: Option<String>,
    activation_index: Option<i32>,
    aligner_index: Option<i32>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteOrthodonticCheckinArgs {
    checkin_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetOrthodonticCheckinsArgs {
    appliance_id: String,
    limit_days: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetOrthodonticDashboardArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertUnwearIntervalArgs {
    interval_id: String,
    child_id: String,
    case_id: String,
    appliance_id: String,
    start_at: String,
    end_at: Option<String>,
    reason: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct CloseUnwearIntervalArgs {
    interval_id: String,
    end_at: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateUnwearIntervalArgs {
    interval_id: String,
    start_at: String,
    end_at: Option<String>,
    reason: Option<String>,
    notes: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteUnwearIntervalArgs {
    interval_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetUnwearIntervalsArgs {
    appliance_id: String,
    limit: Option<i32>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetOrthodonticJourneyArgs {
    child_id: String,
    case_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct InsertOrthodonticPhotoSessionArgs {
    session_id: String,
    child_id: String,
    case_id: String,
    appliance_id: Option<String>,
    tray_index: Option<i64>,
    session_date: String,
    note: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct UpdateOrthodonticPhotoSessionArgs {
    session_id: String,
    tray_index: Option<i64>,
    session_date: String,
    note: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetOrthodonticPhotoSessionArgs {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListOrthodonticPhotoSessionsForCaseArgs {
    case_id: String,
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListPhotoAttachmentsForSessionArgs {
    session_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct AttachOrthodonticPhotoArgs {
    attachment_id: String,
    child_id: String,
    session_id: String,
    file_name: String,
    mime_type: String,
    angle: String,
    image_base64: String,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListOrthodonticPhotoSessionBundlesArgs {
    case_id: String,
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ReadOrthodonticPhotoBlobArgs {
    attachment_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteOrthodonticPhotoSessionArgs {
    session_id: String,
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DeleteOrthodonticPhotoAttachmentArgs {
    attachment_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct GetVisionFollowupSettingsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SetVisionFollowupSettingsArgs {
    child_id: String,
    cadence_months: i32,
    custom_next_date: Option<String>,
    now: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ClearVisionFollowupSettingsArgs {
    child_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ExportStructuredBackupArgs {
    exported_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ImportStructuredBackupArgs {
    envelope: queries::StructuredBackupEnvelope,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct DbInitArgs {
    app_account_id: Option<String>,
    admitted_reminder_rule_ids: Vec<String>,
}

pub fn initialize_parentos_sidecar(
    input: ParentOSSidecarInitInput,
) -> Result<Value, ParentOSSidecarError> {
    let roots = app_storage::install_host_app_storage_roots(
        input.durable_data_root,
        input.cache_root,
        input.temp_root,
    )
    .map_err(|error| host_error("parentos-sidecar-storage-init-failed", error))?;
    Ok(serde_json::json!({
        "ready": true,
        "projectionRef": input.projection_ref,
        "durableDataRoot": roots.data_root.display().to_string(),
        "cacheRoot": roots.cache_root.display().to_string(),
        "tempRoot": roots.temp_root.display().to_string(),
    }))
}

pub fn dispatch_parentos_sidecar_command(
    command: &str,
    payload: Value,
) -> Result<Value, ParentOSSidecarError> {
    match command {
        "save_journal_voice_audio" => {
            let args: SaveJournalVoiceAudioArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                journal_audio::save_journal_voice_audio(
                    args.child_id,
                    args.entry_id,
                    args.mime_type,
                    args.audio_base64,
                ),
            )
        }
        "delete_journal_voice_audio" => {
            let args: DeleteJournalVoiceAudioArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                journal_audio::delete_journal_voice_audio(args.path),
            )
        }
        "save_journal_photo" => {
            let args: SaveJournalPhotoArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                journal_photo::save_journal_photo(
                    args.child_id,
                    args.entry_id,
                    args.index,
                    args.mime_type,
                    args.image_base64,
                ),
            )
        }
        "save_child_avatar" => {
            let args: SaveChildAvatarArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                child_avatar::save_child_avatar(args.child_id, args.mime_type, args.image_base64),
            )
        }
        "delete_journal_photo" => {
            let args: DeleteJournalPhotoArgs = parse_args(command, payload)?;
            serialize_result(command, journal_photo::delete_journal_photo(args.path))
        }
        "report_export_write_save_target" => {
            let args: ReportExportWriteSaveTargetArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                report_export::report_export_write_save_target(
                    args.save_target_id,
                    args.base64_data,
                ),
            )
        }
        "create_family" => {
            let args: CreateFamilyArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::create_family(args.family_id, args.display_name, args.now),
            )
        }
        "get_family" => {
            let _: NoArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_family())
        }
        "get_child" => {
            let args: GetChildArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_child(args.child_id))
        }
        "create_child" => {
            let args: CreateChildArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::create_child(
                    args.child_id,
                    args.family_id,
                    args.display_name,
                    args.gender,
                    args.birth_date,
                    args.birth_weight_kg,
                    args.birth_height_cm,
                    args.birth_head_circ_cm,
                    args.avatar_path,
                    args.nurture_mode,
                    args.nurture_mode_overrides,
                    args.allergies,
                    args.medical_notes,
                    args.recorder_profiles,
                    args.now,
                ),
            )
        }
        "get_children" => {
            let args: GetChildrenArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_children(args.family_id))
        }
        "update_child" => {
            let args: UpdateChildArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_child(
                    args.child_id,
                    args.display_name,
                    args.gender,
                    args.birth_date,
                    args.birth_weight_kg,
                    args.birth_height_cm,
                    args.birth_head_circ_cm,
                    args.avatar_path,
                    args.nurture_mode,
                    args.nurture_mode_overrides,
                    args.allergies,
                    args.medical_notes,
                    args.recorder_profiles,
                    args.now,
                ),
            )
        }
        "delete_child" => {
            let args: DeleteChildArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_child(args.child_id))
        }
        "insert_measurement" => {
            let args: InsertMeasurementArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_measurement(
                    args.measurement_id,
                    args.child_id,
                    args.type_id,
                    args.value,
                    args.measured_at,
                    args.age_months,
                    args.percentile,
                    args.source,
                    args.notes,
                    args.now,
                    args.linked_reminder_state_id,
                    args.linked_reminder_rule_id,
                ),
            )
        }
        "get_measurements" => {
            let args: GetMeasurementsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_measurements(args.child_id, args.type_id),
            )
        }
        "update_measurement" => {
            let args: UpdateMeasurementArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_measurement(
                    args.measurement_id,
                    args.value,
                    args.measured_at,
                    args.age_months,
                    args.percentile,
                    args.source,
                    args.notes,
                    args.now,
                ),
            )
        }
        "delete_measurement" => {
            let args: DeleteMeasurementArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_measurement(args.measurement_id))
        }
        "upsert_milestone_record" => {
            let args: UpsertMilestoneRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::upsert_milestone_record(
                    args.record_id,
                    args.child_id,
                    args.milestone_id,
                    args.achieved_at,
                    args.age_months_when_achieved,
                    args.notes,
                    args.photo_path,
                    args.now,
                ),
            )
        }
        "get_milestone_records" => {
            let args: GetMilestoneRecordsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_milestone_records(args.child_id))
        }
        "delete_milestone_record" => {
            let args: DeleteMilestoneRecordArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_milestone_record(args.record_id))
        }
        "upsert_reminder_state" => {
            let args: UpsertReminderStateArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::upsert_reminder_state(
                    args.state_id,
                    args.child_id,
                    args.rule_id,
                    args.status,
                    args.activated_at,
                    args.completed_at,
                    args.dismissed_at,
                    args.dismiss_reason,
                    args.repeat_index,
                    args.next_trigger_at,
                    args.snoozed_until,
                    args.scheduled_date,
                    args.not_applicable,
                    args.planned_for_date,
                    args.surface_rank,
                    args.last_surfaced_at,
                    args.surface_count,
                    args.notes,
                    args.acknowledged_at,
                    args.reflected_at,
                    args.practice_started_at,
                    args.practice_last_at,
                    args.practice_count,
                    args.practice_habituated_at,
                    args.consulted_at,
                    args.consultation_conversation_id,
                    args.now,
                ),
            )
        }
        "get_reminder_states" => {
            let args: GetReminderStatesArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_reminder_states(args.child_id))
        }
        "get_active_reminders" => {
            let args: GetActiveRemindersArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_active_reminders(args.child_id))
        }
        "upsert_reminder_consultation" => {
            let args: UpsertReminderConsultationArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::upsert_reminder_consultation(
                    args.child_id,
                    args.rule_id,
                    args.repeat_index,
                    args.conversation_id,
                    args.now,
                ),
            )
        }
        "clear_reminder_consultation" => {
            let args: ClearReminderConsultationArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::clear_reminder_consultation(args.child_id, args.conversation_id, args.now),
            )
        }
        "insert_custom_todo" => {
            let args: InsertCustomTodoArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_custom_todo(
                    args.todo_id,
                    args.child_id,
                    args.title,
                    args.due_date,
                    args.recurrence_rule,
                    args.reminder_offset_minutes,
                    args.now,
                ),
            )
        }
        "update_custom_todo" => {
            let args: UpdateCustomTodoArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_custom_todo(
                    args.todo_id,
                    args.title,
                    args.due_date,
                    args.recurrence_rule,
                    args.reminder_offset_minutes,
                    args.now,
                ),
            )
        }
        "complete_custom_todo" => {
            let args: CompleteCustomTodoArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::complete_custom_todo(args.todo_id, args.now),
            )
        }
        "advance_custom_todo_due_date" => {
            let args: AdvanceCustomTodoDueDateArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::advance_custom_todo_due_date(args.todo_id, args.next_due_date, args.now),
            )
        }
        "uncomplete_custom_todo" => {
            let args: UncompleteCustomTodoArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::uncomplete_custom_todo(args.todo_id, args.now),
            )
        }
        "delete_custom_todo" => {
            let args: DeleteCustomTodoArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_custom_todo(args.todo_id))
        }
        "get_custom_todos" => {
            let args: GetCustomTodosArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_custom_todos(args.child_id))
        }
        "insert_vaccine_record" => {
            let args: InsertVaccineRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_vaccine_record(
                    args.record_id,
                    args.reminder_state_id,
                    args.child_id,
                    args.rule_id,
                    args.vaccine_name,
                    args.vaccinated_at,
                    args.age_months,
                    args.batch_number,
                    args.hospital,
                    args.adverse_reaction,
                    args.photo_path,
                    args.now,
                ),
            )
        }
        "update_vaccine_record" => {
            let args: UpdateVaccineRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_vaccine_record(
                    args.record_id,
                    args.vaccinated_at,
                    args.age_months,
                    args.batch_number,
                    args.hospital,
                    args.adverse_reaction,
                ),
            )
        }
        "delete_vaccine_record" => {
            let args: DeleteVaccineRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::delete_vaccine_record(args.record_id, args.now),
            )
        }
        "get_vaccine_records" => {
            let args: GetVaccineRecordsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_vaccine_records(args.child_id))
        }
        "insert_journal_entry" => {
            let args: InsertJournalEntryArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_journal_entry(
                    args.entry_id,
                    args.child_id,
                    args.content_type,
                    args.text_content,
                    args.voice_path,
                    args.photo_paths,
                    args.recorded_at,
                    args.age_months,
                    args.observation_mode,
                    args.dimension_id,
                    args.selected_tags,
                    args.guided_answers,
                    args.observation_duration,
                    args.keepsake,
                    args.keepsake_title,
                    args.keepsake_reason,
                    args.mood_tag,
                    args.recorder_id,
                    args.now,
                ),
            )
        }
        "insert_journal_entry_with_tags" => {
            let args: InsertJournalEntryWithTagsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_journal_entry_with_tags(
                    args.entry_id,
                    args.child_id,
                    args.content_type,
                    args.text_content,
                    args.voice_path,
                    args.photo_paths,
                    args.recorded_at,
                    args.age_months,
                    args.observation_mode,
                    args.dimension_id,
                    args.selected_tags,
                    args.guided_answers,
                    args.observation_duration,
                    args.keepsake,
                    args.keepsake_title,
                    args.keepsake_reason,
                    args.mood_tag,
                    args.recorder_id,
                    args.ai_tags,
                    args.now,
                ),
            )
        }
        "update_journal_entry_with_tags" => {
            let args: UpdateJournalEntryWithTagsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_journal_entry_with_tags(
                    args.entry_id,
                    args.child_id,
                    args.content_type,
                    args.text_content,
                    args.voice_path,
                    args.photo_paths,
                    args.recorded_at,
                    args.age_months,
                    args.observation_mode,
                    args.dimension_id,
                    args.selected_tags,
                    args.guided_answers,
                    args.observation_duration,
                    args.keepsake,
                    args.keepsake_title,
                    args.keepsake_reason,
                    args.mood_tag,
                    args.recorder_id,
                    args.ai_tags,
                    args.now,
                ),
            )
        }
        "update_journal_keepsake" => {
            let args: UpdateJournalKeepsakeArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_journal_keepsake(
                    args.entry_id,
                    args.keepsake,
                    args.keepsake_title,
                    args.keepsake_reason,
                    args.now,
                ),
            )
        }
        "delete_journal_entry" => {
            let args: DeleteJournalEntryArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_journal_entry(args.entry_id))
        }
        "get_journal_entries" => {
            let args: GetJournalEntriesArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_journal_entries(args.child_id, args.limit),
            )
        }
        "insert_journal_tag" => {
            let args: InsertJournalTagArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_journal_tag(
                    args.tag_id,
                    args.entry_id,
                    args.domain,
                    args.tag,
                    args.source,
                    args.confidence,
                    args.now,
                ),
            )
        }
        "get_journal_tags" => {
            let args: GetJournalTagsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_journal_tags(args.entry_id))
        }
        "create_conversation" => {
            let args: CreateConversationArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::create_conversation(
                    args.conversation_id,
                    args.child_id,
                    args.title,
                    args.now,
                ),
            )
        }
        "get_conversations" => {
            let args: GetConversationsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_conversations(args.child_id))
        }
        "insert_ai_message" => {
            let args: InsertAiMessageArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_ai_message(
                    args.message_id,
                    args.conversation_id,
                    args.role,
                    args.content,
                    args.context_snapshot,
                    args.now,
                ),
            )
        }
        "insert_consultation_ai_message" => {
            let args: InsertConsultationAiMessageArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_consultation_ai_message(
                    args.message_id,
                    args.conversation_id,
                    args.child_id,
                    args.rule_id,
                    args.repeat_index,
                    args.content,
                    args.context_snapshot,
                    args.now,
                ),
            )
        }
        "get_ai_messages" => {
            let args: GetAiMessagesArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_ai_messages(args.conversation_id))
        }
        "insert_growth_report" => {
            let args: InsertGrowthReportArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_growth_report(
                    args.report_id,
                    args.child_id,
                    args.report_type,
                    args.period_start,
                    args.period_end,
                    args.age_months_start,
                    args.age_months_end,
                    args.content,
                    args.generated_at,
                    args.now,
                ),
            )
        }
        "get_growth_reports" => {
            let args: GetGrowthReportsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_growth_reports(args.child_id, args.report_type),
            )
        }
        "update_growth_report_content" => {
            let args: UpdateGrowthReportContentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_growth_report_content(args.report_id, args.content, args.now),
            )
        }
        "set_app_setting" => {
            let args: SetAppSettingArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::set_app_setting(args.key, args.value, args.now),
            )
        }
        "get_app_setting" => {
            let args: GetAppSettingArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_app_setting(args.key))
        }
        "insert_dental_record" => {
            let args: InsertDentalRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_dental_record(
                    args.record_id,
                    args.child_id,
                    args.event_type,
                    args.tooth_id,
                    args.tooth_set,
                    args.event_date,
                    args.age_months,
                    args.severity,
                    args.hospital,
                    args.notes,
                    args.photo_path,
                    args.now,
                ),
            )
        }
        "update_dental_record" => {
            let args: UpdateDentalRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_dental_record(
                    args.record_id,
                    args.event_type,
                    args.tooth_id,
                    args.tooth_set,
                    args.event_date,
                    args.age_months,
                    args.severity,
                    args.hospital,
                    args.notes,
                    args.photo_path,
                    args.now,
                ),
            )
        }
        "delete_dental_record" => {
            let args: DeleteDentalRecordArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_dental_record(args.record_id))
        }
        "get_dental_records" => {
            let args: GetDentalRecordsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_dental_records(args.child_id))
        }
        "insert_ortho_clinical_dental_record" => {
            let args: InsertOrthoClinicalDentalRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_ortho_clinical_dental_record(
                    args.record_id,
                    args.child_id,
                    args.event_type,
                    args.event_date,
                    args.age_months,
                    args.hospital,
                    args.notes,
                    args.now,
                ),
            )
        }
        "save_attachment" => {
            let args: SaveAttachmentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                attachment_store::save_attachment(
                    args.attachment_id,
                    args.child_id,
                    args.owner_table,
                    args.owner_id,
                    args.file_name,
                    args.mime_type,
                    args.image_base64,
                    args.caption,
                    args.now,
                ),
            )
        }
        "get_attachments" => {
            let args: GetAttachmentsArgs = parse_args(command, payload)?;
            serialize_result(command, attachment_store::get_attachments(args.child_id))
        }
        "get_attachments_by_owner" => {
            let args: GetAttachmentsByOwnerArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                attachment_store::get_attachments_by_owner(
                    args.child_id,
                    args.owner_table,
                    args.owner_id,
                ),
            )
        }
        "delete_attachment" => {
            let args: DeleteAttachmentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                attachment_store::delete_attachment(args.attachment_id),
            )
        }
        "insert_allergy_record" => {
            let args: InsertAllergyRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_allergy_record(
                    args.record_id,
                    args.child_id,
                    args.allergen,
                    args.category,
                    args.reaction_type,
                    args.severity,
                    args.diagnosed_at,
                    args.age_months_at_diagnosis,
                    args.status,
                    args.status_changed_at,
                    args.confirmed_by,
                    args.notes,
                    args.now,
                ),
            )
        }
        "update_allergy_record" => {
            let args: UpdateAllergyRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_allergy_record(
                    args.record_id,
                    args.allergen,
                    args.category,
                    args.reaction_type,
                    args.severity,
                    args.status,
                    args.status_changed_at,
                    args.confirmed_by,
                    args.notes,
                    args.now,
                ),
            )
        }
        "get_allergy_records" => {
            let args: GetAllergyRecordsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_allergy_records(args.child_id))
        }
        "upsert_sleep_record" => {
            let args: UpsertSleepRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::upsert_sleep_record(
                    args.record_id,
                    args.child_id,
                    args.sleep_date,
                    args.bedtime,
                    args.wake_time,
                    args.duration_minutes,
                    args.nap_count,
                    args.nap_minutes,
                    args.quality,
                    args.age_months,
                    args.notes,
                    args.now,
                ),
            )
        }
        "delete_sleep_record" => {
            let args: DeleteSleepRecordArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_sleep_record(args.record_id))
        }
        "get_sleep_records" => {
            let args: GetSleepRecordsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_sleep_records(args.child_id, args.limit),
            )
        }
        "insert_medical_event" => {
            let args: InsertMedicalEventArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_medical_event(
                    args.event_id,
                    args.child_id,
                    args.event_type,
                    args.title,
                    args.event_date,
                    args.end_date,
                    args.age_months,
                    args.severity,
                    args.result,
                    args.hospital,
                    args.medication,
                    args.dosage,
                    args.notes,
                    args.photo_path,
                    args.now,
                ),
            )
        }
        "update_medical_event" => {
            let args: UpdateMedicalEventArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_medical_event(
                    args.event_id,
                    args.title,
                    args.event_date,
                    args.end_date,
                    args.severity,
                    args.result,
                    args.hospital,
                    args.medication,
                    args.dosage,
                    args.notes,
                    args.photo_path,
                    args.now,
                ),
            )
        }
        "get_medical_events" => {
            let args: GetMedicalEventsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_medical_events(args.child_id))
        }
        "insert_tanner_assessment" => {
            let args: InsertTannerAssessmentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_tanner_assessment(
                    args.assessment_id,
                    args.child_id,
                    args.assessed_at,
                    args.age_months,
                    args.breast_or_genital_stage,
                    args.pubic_hair_stage,
                    args.assessed_by,
                    args.notes,
                    args.now,
                    args.linked_reminder_state_id,
                    args.linked_reminder_rule_id,
                    args.menarche_status,
                    args.menarche_date,
                ),
            )
        }
        "get_tanner_assessments" => {
            let args: GetTannerAssessmentsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_tanner_assessments(args.child_id))
        }
        "delete_tanner_assessment" => {
            let args: DeleteTannerAssessmentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::delete_tanner_assessment(args.assessment_id),
            )
        }
        "insert_fitness_assessment" => {
            let args: InsertFitnessAssessmentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_fitness_assessment(
                    args.assessment_id,
                    args.child_id,
                    args.assessed_at,
                    args.age_months,
                    args.assessment_source,
                    args.run_50m,
                    args.run_800m,
                    args.run_1000m,
                    args.run_50x8,
                    args.sit_and_reach,
                    args.standing_long_jump,
                    args.sit_ups,
                    args.pull_ups,
                    args.rope_skipping,
                    args.vital_capacity,
                    args.run_10m_shuttle,
                    args.tennis_ball_throw,
                    args.double_foot_jump,
                    args.balance_beam,
                    args.foot_arch_status,
                    args.notes,
                    args.now,
                    args.linked_reminder_state_id,
                    args.linked_reminder_rule_id,
                ),
            )
        }
        "get_fitness_assessments" => {
            let args: GetFitnessAssessmentsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_fitness_assessments(args.child_id))
        }
        "delete_fitness_assessment" => {
            let args: DeleteFitnessAssessmentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::delete_fitness_assessment(args.assessment_id),
            )
        }
        "delete_fitness_event" => {
            let args: DeleteFitnessEventArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_fitness_event(args.event_id))
        }
        "insert_outdoor_record" => {
            let args: InsertOutdoorRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_outdoor_record(
                    args.record_id,
                    args.child_id,
                    args.activity_date,
                    args.duration_minutes,
                    args.note,
                    args.now,
                    args.linked_reminder_state_id,
                    args.linked_reminder_rule_id,
                ),
            )
        }
        "update_outdoor_record" => {
            let args: UpdateOutdoorRecordArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_outdoor_record(
                    args.record_id,
                    args.activity_date,
                    args.duration_minutes,
                    args.note,
                    args.now,
                ),
            )
        }
        "delete_outdoor_record" => {
            let args: DeleteOutdoorRecordArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_outdoor_record(args.record_id))
        }
        "get_outdoor_records" => {
            let args: GetOutdoorRecordsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_outdoor_records(args.child_id, args.start_date, args.end_date),
            )
        }
        "get_outdoor_goal" => {
            let args: GetOutdoorGoalArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_outdoor_goal(args.child_id))
        }
        "set_outdoor_goal" => {
            let args: SetOutdoorGoalArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::set_outdoor_goal(args.child_id, args.goal_minutes, args.now),
            )
        }
        "insert_posture_assessment" => {
            let args: InsertPostureAssessmentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_posture_assessment(
                    args.assessment_id,
                    args.child_id,
                    args.assessed_at,
                    args.age_months,
                    args.source,
                    args.shoulder,
                    args.scapula,
                    args.hip,
                    args.leg,
                    args.heel,
                    args.neck,
                    args.pelvis,
                    args.knee,
                    args.adam,
                    args.cobb_angle,
                    args.notes,
                    args.photo_paths,
                    args.now,
                ),
            )
        }
        "get_posture_assessments" => {
            let args: GetPostureAssessmentsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_posture_assessments(args.child_id))
        }
        "save_health_record_capture" => {
            let args: SaveHealthRecordCaptureArgs = parse_args(command, payload)?;
            serialize_result(command, queries::save_health_record_capture(args.input))
        }
        "replace_health_record_capture" => {
            let args: ReplaceHealthRecordCaptureArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::replace_health_record_capture(args.replace_event_id, args.input),
            )
        }
        "get_health_record_events" => {
            let args: GetHealthRecordEventsArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_health_record_events(args.child_id))
        }
        "get_health_record_values" => {
            let args: GetHealthRecordValuesArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_health_record_values(args.child_id))
        }
        "get_profile_section_summaries" => {
            let args: GetProfileSectionSummariesArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_profile_section_summaries(args.child_id),
            )
        }
        "insert_orthodontic_case" => {
            let args: InsertOrthodonticCaseArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_orthodontic_case(
                    args.case_id,
                    args.child_id,
                    args.case_type,
                    args.stage,
                    args.started_at,
                    args.planned_end_at,
                    args.primary_issues,
                    args.provider_name,
                    args.provider_institution,
                    args.notes,
                    args.now,
                ),
            )
        }
        "update_orthodontic_case" => {
            let args: UpdateOrthodonticCaseArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_orthodontic_case(
                    args.case_id,
                    args.case_type,
                    args.stage,
                    args.started_at,
                    args.planned_end_at,
                    args.actual_end_at,
                    args.primary_issues,
                    args.provider_name,
                    args.provider_institution,
                    args.notes,
                    args.now,
                ),
            )
        }
        "delete_orthodontic_case" => {
            let args: DeleteOrthodonticCaseArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_orthodontic_case(args.case_id))
        }
        "get_orthodontic_cases" => {
            let args: GetOrthodonticCasesArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_orthodontic_cases(args.child_id))
        }
        "insert_orthodontic_appliance" => {
            let args: InsertOrthodonticApplianceArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_orthodontic_appliance(
                    args.appliance_id,
                    args.case_id,
                    args.child_id,
                    args.child_birth_date,
                    args.appliance_type,
                    args.status,
                    args.started_at,
                    args.prescribed_hours_per_day,
                    args.prescribed_activations,
                    args.activation_interval_days,
                    args.total_aligners,
                    args.days_per_aligner,
                    args.current_phase,
                    args.phase_started_at,
                    args.review_interval_days,
                    args.next_review_agenda,
                    args.notes,
                    args.now,
                ),
            )
        }
        "update_orthodontic_appliance_status" => {
            let args: UpdateOrthodonticApplianceStatusArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_orthodontic_appliance_status(
                    args.appliance_id,
                    args.status,
                    args.pause_reason,
                    args.ended_at,
                    args.now,
                ),
            )
        }
        "update_orthodontic_appliance_review" => {
            let args: UpdateOrthodonticApplianceReviewArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_orthodontic_appliance_review(
                    args.appliance_id,
                    args.last_review_at,
                    args.next_review_date,
                    args.now,
                ),
            )
        }
        "update_orthodontic_appliance_plan" => {
            let args: UpdateOrthodonticAppliancePlanArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_orthodontic_appliance_plan(
                    args.appliance_id,
                    args.prescribed_hours_per_day,
                    args.total_aligners,
                    args.days_per_aligner,
                    args.activation_interval_days,
                    args.next_review_agenda,
                    args.now,
                ),
            )
        }
        "advance_orthodontic_appliance_phase" => {
            let args: AdvanceOrthodonticAppliancePhaseArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::advance_orthodontic_appliance_phase(
                    args.appliance_id,
                    args.next_phase,
                    args.now,
                ),
            )
        }
        "delete_orthodontic_appliance" => {
            let args: DeleteOrthodonticApplianceArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::delete_orthodontic_appliance(args.appliance_id),
            )
        }
        "get_orthodontic_appliances" => {
            let args: GetOrthodonticAppliancesArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_orthodontic_appliances(args.case_id))
        }
        "insert_orthodontic_checkin" => {
            let args: InsertOrthodonticCheckinArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_orthodontic_checkin(
                    args.checkin_id,
                    args.child_id,
                    args.case_id,
                    args.appliance_id,
                    args.checkin_type,
                    args.checkin_date,
                    args.checkin_at,
                    args.activation_index,
                    args.aligner_index,
                    args.notes,
                    args.now,
                ),
            )
        }
        "delete_orthodontic_checkin" => {
            let args: DeleteOrthodonticCheckinArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::delete_orthodontic_checkin(args.checkin_id),
            )
        }
        "get_orthodontic_checkins" => {
            let args: GetOrthodonticCheckinsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_orthodontic_checkins(args.appliance_id, args.limit_days),
            )
        }
        "get_orthodontic_dashboard" => {
            let args: GetOrthodonticDashboardArgs = parse_args(command, payload)?;
            serialize_result(command, queries::get_orthodontic_dashboard(args.child_id))
        }
        "insert_unwear_interval" => {
            let args: InsertUnwearIntervalArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_unwear_interval(
                    args.interval_id,
                    args.child_id,
                    args.case_id,
                    args.appliance_id,
                    args.start_at,
                    args.end_at,
                    args.reason,
                    args.notes,
                    args.now,
                ),
            )
        }
        "close_unwear_interval" => {
            let args: CloseUnwearIntervalArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::close_unwear_interval(args.interval_id, args.end_at, args.now),
            )
        }
        "update_unwear_interval" => {
            let args: UpdateUnwearIntervalArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_unwear_interval(
                    args.interval_id,
                    args.start_at,
                    args.end_at,
                    args.reason,
                    args.notes,
                    args.now,
                ),
            )
        }
        "delete_unwear_interval" => {
            let args: DeleteUnwearIntervalArgs = parse_args(command, payload)?;
            serialize_result(command, queries::delete_unwear_interval(args.interval_id))
        }
        "get_unwear_intervals" => {
            let args: GetUnwearIntervalsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_unwear_intervals(args.appliance_id, args.limit),
            )
        }
        "get_orthodontic_journey" => {
            let args: GetOrthodonticJourneyArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_orthodontic_journey(args.child_id, args.case_id),
            )
        }
        "insert_orthodontic_photo_session" => {
            let args: InsertOrthodonticPhotoSessionArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::insert_orthodontic_photo_session(
                    args.session_id,
                    args.child_id,
                    args.case_id,
                    args.appliance_id,
                    args.tray_index,
                    args.session_date,
                    args.note,
                    args.now,
                ),
            )
        }
        "update_orthodontic_photo_session" => {
            let args: UpdateOrthodonticPhotoSessionArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::update_orthodontic_photo_session(
                    args.session_id,
                    args.tray_index,
                    args.session_date,
                    args.note,
                    args.now,
                ),
            )
        }
        "get_orthodontic_photo_session" => {
            let args: GetOrthodonticPhotoSessionArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_orthodontic_photo_session(args.session_id),
            )
        }
        "list_orthodontic_photo_sessions_for_case" => {
            let args: ListOrthodonticPhotoSessionsForCaseArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::list_orthodontic_photo_sessions_for_case(args.case_id, args.child_id),
            )
        }
        "list_photo_attachments_for_session" => {
            let args: ListPhotoAttachmentsForSessionArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::list_photo_attachments_for_session(args.session_id),
            )
        }
        "attach_orthodontic_photo" => {
            let args: AttachOrthodonticPhotoArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                orthodontic_photos::attach_orthodontic_photo(
                    args.attachment_id,
                    args.child_id,
                    args.session_id,
                    args.file_name,
                    args.mime_type,
                    args.angle,
                    args.image_base64,
                    args.now,
                ),
            )
        }
        "list_orthodontic_photo_session_bundles" => {
            let args: ListOrthodonticPhotoSessionBundlesArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                orthodontic_photos::list_orthodontic_photo_session_bundles(
                    args.case_id,
                    args.child_id,
                ),
            )
        }
        "read_orthodontic_photo_blob" => {
            let args: ReadOrthodonticPhotoBlobArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                orthodontic_photos::read_orthodontic_photo_blob(args.attachment_id),
            )
        }
        "delete_orthodontic_photo_session" => {
            let args: DeleteOrthodonticPhotoSessionArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                orthodontic_photos::delete_orthodontic_photo_session(
                    args.session_id,
                    args.child_id,
                ),
            )
        }
        "delete_orthodontic_photo_attachment" => {
            let args: DeleteOrthodonticPhotoAttachmentArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                orthodontic_photos::delete_orthodontic_photo_attachment(args.attachment_id),
            )
        }
        "get_vision_followup_settings" => {
            let args: GetVisionFollowupSettingsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::get_vision_followup_settings(args.child_id),
            )
        }
        "set_vision_followup_settings" => {
            let args: SetVisionFollowupSettingsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::set_vision_followup_settings(
                    args.child_id,
                    args.cadence_months,
                    args.custom_next_date,
                    args.now,
                ),
            )
        }
        "clear_vision_followup_settings" => {
            let args: ClearVisionFollowupSettingsArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                queries::clear_vision_followup_settings(args.child_id),
            )
        }
        "export_structured_backup" => {
            let args: ExportStructuredBackupArgs = parse_args(command, payload)?;
            serialize_result(command, queries::export_structured_backup(args.exported_at))
        }
        "import_structured_backup" => {
            let args: ImportStructuredBackupArgs = parse_args(command, payload)?;
            serialize_result(command, queries::import_structured_backup(args.envelope))
        }
        "db_init" => {
            let args: DbInitArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                sqlite::db_init(args.app_account_id, args.admitted_reminder_rule_ids),
            )
        }
        "report_export_register_save_target" => {
            let args: ReportExportRegisterSaveTargetArgs = parse_args(command, payload)?;
            serialize_result(
                command,
                report_export::register_report_save_target(
                    args.save_target_id,
                    PathBuf::from(args.path.trim()),
                    args.kind,
                    args.display_path,
                ),
            )
        }
        "dropped_file_read_image_files_as_base64" => {
            let args: DroppedFileReadImageFilesAsBase64Args = parse_args(command, payload)?;
            serialize_result(
                command,
                dropped_file::read_image_files_as_base64(args.paths),
            )
        }
        _ => Err(ParentOSSidecarError {
            code: "capability-unavailable",
            reason_code: "parentos-sidecar-command-not-registered",
            action_hint: "register_parentos_app_domain_command_in_sidecar_registry",
            source: "host",
            details: serde_json::json!({
                "domain": "parentos-app-domain",
                "command": command,
            }),
        }),
    }
}

fn parse_args<T: DeserializeOwned>(
    command: &str,
    payload: Value,
) -> Result<T, ParentOSSidecarError> {
    serde_json::from_value(payload).map_err(|error| ParentOSSidecarError {
        code: "invalid-payload",
        reason_code: "parentos-sidecar-command-payload-invalid",
        action_hint: "send_strict_parentos_app_domain_command_payload",
        source: "host",
        details: serde_json::json!({
            "domain": "parentos-app-domain",
            "command": command,
            "cause": error.to_string(),
        }),
    })
}

fn serialize_result<T: serde::Serialize>(
    command: &str,
    result: Result<T, String>,
) -> Result<Value, ParentOSSidecarError> {
    let value = result.map_err(|error| app_domain_error(command, error))?;
    serde_json::to_value(value).map_err(|error| ParentOSSidecarError {
        code: "host-internal-error",
        reason_code: "parentos-sidecar-command-result-serialization-failed",
        action_hint: "fix_parentos_app_domain_command_result_dto",
        source: "host",
        details: serde_json::json!({
            "domain": "parentos-app-domain",
            "command": command,
            "cause": error.to_string(),
        }),
    })
}

fn app_domain_error(command: &str, error: String) -> ParentOSSidecarError {
    ParentOSSidecarError {
        code: "host-internal-error",
        reason_code: "parentos-sidecar-command-failed",
        action_hint: "inspect_parentos_app_domain_host_command",
        source: "host",
        details: serde_json::json!({
            "domain": "parentos-app-domain",
            "command": command,
            "cause": error,
        }),
    }
}

fn host_error(reason_code: &'static str, error: String) -> ParentOSSidecarError {
    ParentOSSidecarError {
        code: "host-internal-error",
        reason_code,
        action_hint: "inspect_parentos_electron_sidecar_host_setup",
        source: "host",
        details: serde_json::json!({
            "domain": "parentos-app-domain",
            "cause": error,
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn install_test_roots() -> TempDir {
        let temp_dir = TempDir::new().expect("create temp sidecar root");
        app_storage::install_test_app_storage_roots(
            temp_dir.path().join("data"),
            temp_dir.path().join("cache"),
            temp_dir.path().join("tmp"),
        )
        .expect("install test app storage roots");
        temp_dir
    }

    #[test]
    fn dispatch_family_child_path_reaches_sqlite_host_core() {
        let _temp_dir = install_test_roots();
        let now = "2026-07-08T12:00:00.000Z";

        dispatch_parentos_sidecar_command(
            "db_init",
            serde_json::json!({
                "appAccountId": null,
                "admittedReminderRuleIds": ["PO-REM-VAC-001"],
            }),
        )
        .expect("db_init");
        dispatch_parentos_sidecar_command(
            "create_family",
            serde_json::json!({
                "familyId": "fam_01",
                "displayName": "ParentOS Test Family",
                "now": now,
            }),
        )
        .expect("create_family");
        dispatch_parentos_sidecar_command(
            "create_child",
            serde_json::json!({
                "childId": "child_01",
                "familyId": "fam_01",
                "displayName": "小明",
                "gender": "male",
                "birthDate": "2020-01-02",
                "birthWeightKg": 3.2,
                "birthHeightCm": 50.0,
                "birthHeadCircCm": null,
                "avatarPath": null,
                "nurtureMode": "balanced",
                "nurtureModeOverrides": null,
                "allergies": null,
                "medicalNotes": null,
                "recorderProfiles": null,
                "now": now,
            }),
        )
        .expect("create_child");

        let children = dispatch_parentos_sidecar_command(
            "get_children",
            serde_json::json!({"familyId": "fam_01"}),
        )
        .expect("get_children");

        assert_eq!(children[0]["childId"], "child_01");
        assert_eq!(children[0]["displayName"], "小明");
    }

    #[test]
    fn dispatch_rejects_unknown_payload_fields() {
        let error = dispatch_parentos_sidecar_command(
            "create_family",
            serde_json::json!({
                "familyId": "fam_01",
                "displayName": "ParentOS Test Family",
                "now": "2026-07-08T12:00:00.000Z",
                "extra": true,
            }),
        )
        .expect_err("extra fields must be rejected");

        assert_eq!(error.code, "invalid-payload");
        assert_eq!(
            error.reason_code,
            "parentos-sidecar-command-payload-invalid"
        );
    }
}
