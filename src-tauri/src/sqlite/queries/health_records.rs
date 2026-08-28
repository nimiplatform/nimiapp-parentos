use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use super::super::get_conn;

include!("vaccine-reminder-rules.gen.rs");

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthRecordCaptureValueInput {
    pub value_id: String,
    pub metric_id: String,
    pub value_number: Option<f64>,
    pub value_text: Option<String>,
    pub value_json: Option<String>,
    pub unit: Option<String>,
    pub qualifier: Option<String>,
    pub record_kind: String,
    pub source_value_ids: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveHealthRecordCaptureInput {
    pub event_id: String,
    pub child_id: String,
    pub protocol_id: String,
    pub group_id: String,
    pub record_kind: String,
    pub source_surface: String,
    pub recorded_at: String,
    pub effective_date: String,
    pub age_months: i32,
    pub recorder_id: Option<String>,
    pub linked_reminder_state_id: Option<String>,
    pub linked_reminder_rule_id: Option<String>,
    pub notes: Option<String>,
    pub metadata_json: Option<String>,
    pub now: String,
    pub values: Vec<HealthRecordCaptureValueInput>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveHealthRecordCaptureResult {
    pub event_id: String,
    pub value_ids: Vec<String>,
    pub persisted_value_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthRecordEventRow {
    pub event_id: String,
    pub child_id: String,
    pub protocol_id: String,
    pub group_id: String,
    pub record_kind: String,
    pub source_surface: String,
    pub recorded_at: String,
    pub effective_date: String,
    pub age_months: i32,
    pub recorder_id: Option<String>,
    pub linked_reminder_state_id: Option<String>,
    pub linked_reminder_rule_id: Option<String>,
    pub notes: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthRecordValueRow {
    pub value_id: String,
    pub event_id: String,
    pub child_id: String,
    pub metric_id: String,
    pub value_number: Option<f64>,
    pub value_text: Option<String>,
    pub value_json: Option<String>,
    pub unit: Option<String>,
    pub qualifier: Option<String>,
    pub record_kind: String,
    pub source_value_ids: Option<String>,
    pub created_at: String,
}

fn is_supported_health_event_kind(value: &str) -> bool {
    matches!(
        value,
        "manual" | "imported" | "ocr_confirmed" | "reminder_linked" | "derived"
    )
}

fn is_supported_health_source_surface(value: &str) -> bool {
    matches!(
        value,
        "profile_console" | "profile_detail" | "reminder" | "ocr_tool" | "import"
    )
}

fn is_supported_health_value_kind(value: &str) -> bool {
    matches!(value, "measured" | "derived" | "parent_confirmed_import")
}

fn validate_vaccine_rule_id(rule_id: &str) -> Result<(), String> {
    if VACCINE_REMINDER_RULE_IDS.contains(&rule_id) {
        Ok(())
    } else {
        Err(format!(
            "insert_vaccine_record: ruleId '{rule_id}' is not an admitted vaccine reminder rule"
        ))
    }
}

#[derive(Debug, Deserialize)]
struct HealthMetricRegistryYaml {
    metrics: Vec<HealthMetricAuthorityYaml>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthMetricAuthorityYaml {
    metric_id: String,
    group_id: String,
    #[serde(default)]
    unit: Option<String>,
    #[serde(default)]
    capture_protocol_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
struct HealthCaptureProtocolsYaml {
    protocols: Vec<HealthCaptureProtocolAuthorityYaml>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealthCaptureProtocolAuthorityYaml {
    protocol_id: String,
    group_id: String,
    #[serde(default)]
    metric_ids: Vec<String>,
    storage_target: String,
}

#[derive(Debug)]
pub(crate) struct HealthMetricAuthority {
    pub(crate) group_id: String,
    pub(crate) unit: Option<String>,
    pub(crate) capture_protocol_ids: HashSet<String>,
}

#[derive(Debug)]
pub(crate) struct HealthCaptureProtocolAuthority {
    pub(crate) group_id: String,
    pub(crate) metric_ids: HashSet<String>,
    pub(crate) storage_target: String,
}

#[derive(Debug)]
pub(crate) struct HealthRecordAuthority {
    pub(crate) metrics_by_id: HashMap<String, HealthMetricAuthority>,
    pub(crate) protocols_by_id: HashMap<String, HealthCaptureProtocolAuthority>,
}

static HEALTH_RECORD_AUTHORITY: OnceLock<Result<HealthRecordAuthority, String>> = OnceLock::new();

pub(crate) fn health_record_authority() -> Result<&'static HealthRecordAuthority, String> {
    match HEALTH_RECORD_AUTHORITY.get_or_init(load_health_record_authority) {
        Ok(authority) => Ok(authority),
        Err(error) => Err(error.clone()),
    }
}

fn load_health_record_authority() -> Result<HealthRecordAuthority, String> {
    let metrics_yaml: HealthMetricRegistryYaml = serde_yaml::from_str(include_str!(
        "../../../../data/structured/parentos/health-metric-registry.yaml"
    ))
    .map_err(|e| format!("parse data/structured/parentos/health-metric-registry.yaml: {e}"))?;
    let protocols_yaml: HealthCaptureProtocolsYaml = serde_yaml::from_str(include_str!(
        "../../../../data/structured/parentos/health-capture-protocols.yaml"
    ))
    .map_err(|e| format!("parse data/structured/parentos/health-capture-protocols.yaml: {e}"))?;

    let metrics_by_id = metrics_yaml
        .metrics
        .into_iter()
        .map(|metric| {
            (
                metric.metric_id,
                HealthMetricAuthority {
                    group_id: metric.group_id,
                    unit: metric.unit,
                    capture_protocol_ids: metric.capture_protocol_ids.into_iter().collect(),
                },
            )
        })
        .collect();
    let protocols_by_id = protocols_yaml
        .protocols
        .into_iter()
        .map(|protocol| {
            (
                protocol.protocol_id,
                HealthCaptureProtocolAuthority {
                    group_id: protocol.group_id,
                    metric_ids: protocol.metric_ids.into_iter().collect(),
                    storage_target: protocol.storage_target,
                },
            )
        })
        .collect();

    Ok(HealthRecordAuthority {
        metrics_by_id,
        protocols_by_id,
    })
}

fn non_empty(value: &str, field_name: &str) -> Result<(), String> {
    if value.trim().is_empty() {
        return Err(format!("{field_name} is required"));
    }
    Ok(())
}

fn validate_health_record_capture(input: &SaveHealthRecordCaptureInput) -> Result<(), String> {
    non_empty(&input.event_id, "eventId")?;
    non_empty(&input.child_id, "childId")?;
    non_empty(&input.protocol_id, "protocolId")?;
    non_empty(&input.group_id, "groupId")?;
    non_empty(&input.recorded_at, "recordedAt")?;
    non_empty(&input.effective_date, "effectiveDate")?;
    non_empty(&input.now, "now")?;
    if !is_supported_health_event_kind(input.record_kind.trim()) {
        return Err(format!(
            "unsupported health recordKind \"{}\"",
            input.record_kind
        ));
    }
    if !is_supported_health_source_surface(input.source_surface.trim()) {
        return Err(format!(
            "unsupported health sourceSurface \"{}\"",
            input.source_surface
        ));
    }
    if input.values.is_empty() {
        return Err("health capture requires at least one value".to_string());
    }

    let authority = health_record_authority()?;
    let protocol_id = input.protocol_id.trim();
    let group_id = input.group_id.trim();
    let Some(protocol) = authority.protocols_by_id.get(protocol_id) else {
        return Err(format!(
            "unknown health capture protocol id \"{}\"",
            input.protocol_id
        ));
    };
    if protocol.storage_target != "health_record_event" {
        return Err(format!(
            "health capture protocol \"{}\" has storageTarget \"{}\" and cannot be saved as health_record_event",
            input.protocol_id, protocol.storage_target
        ));
    }
    if protocol.group_id != group_id {
        return Err(format!(
            "health capture protocol \"{}\" belongs to group \"{}\", not \"{}\"",
            input.protocol_id, protocol.group_id, input.group_id
        ));
    }

    let mut value_ids = std::collections::HashSet::new();
    for value in &input.values {
        non_empty(&value.value_id, "valueId")?;
        non_empty(&value.metric_id, "metricId")?;
        let metric_id = value.metric_id.trim();
        let Some(metric) = authority.metrics_by_id.get(metric_id) else {
            return Err(format!("unknown health metric id \"{}\"", value.metric_id));
        };
        if metric.group_id != group_id {
            return Err(format!(
                "health metric \"{}\" belongs to group \"{}\", not \"{}\"",
                value.metric_id, metric.group_id, input.group_id
            ));
        }
        if !protocol.metric_ids.contains(metric_id) {
            return Err(format!(
                "health metric \"{}\" is not admitted by protocol \"{}\"",
                value.metric_id, input.protocol_id
            ));
        }
        if value.record_kind.trim() != "derived"
            && !metric.capture_protocol_ids.contains(protocol_id)
        {
            return Err(format!(
                "health metric \"{}\" does not admit protocol \"{}\"",
                value.metric_id, input.protocol_id
            ));
        }
        if !value_ids.insert(value.value_id.trim().to_string()) {
            return Err(format!("duplicate health valueId \"{}\"", value.value_id));
        }
        if !is_supported_health_value_kind(value.record_kind.trim()) {
            return Err(format!(
                "unsupported health value recordKind \"{}\"",
                value.record_kind
            ));
        }
        if let Some(number) = value.value_number {
            if !number.is_finite() {
                return Err(format!(
                    "health value \"{}\" has non-finite valueNumber",
                    value.value_id
                ));
            }
        }
        if value.value_number.is_none()
            && value
                .value_text
                .as_deref()
                .map(str::trim)
                .filter(|text| !text.is_empty())
                .is_none()
            && value
                .value_json
                .as_deref()
                .map(str::trim)
                .filter(|json| !json.is_empty())
                .is_none()
        {
            return Err(format!(
                "health value \"{}\" requires valueNumber, valueText, or valueJson",
                value.value_id
            ));
        }
        if value.record_kind.trim() == "derived"
            && value
                .source_value_ids
                .as_deref()
                .map(str::trim)
                .filter(|ids| !ids.is_empty())
                .is_none()
        {
            return Err(format!(
                "derived health value \"{}\" requires sourceValueIds",
                value.value_id
            ));
        }
    }
    Ok(())
}

pub(crate) fn save_health_record_capture_with_conn(
    conn: &mut Connection,
    input: SaveHealthRecordCaptureInput,
) -> Result<SaveHealthRecordCaptureResult, String> {
    validate_health_record_capture(&input)?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("save_health_record_capture begin transaction: {e}"))?;
    let result = insert_health_record_capture_rows(&tx, input)?;
    tx.commit()
        .map_err(|e| format!("save_health_record_capture commit: {e}"))?;

    Ok(result)
}

fn insert_health_record_capture_rows(
    tx: &rusqlite::Transaction<'_>,
    input: SaveHealthRecordCaptureInput,
) -> Result<SaveHealthRecordCaptureResult, String> {
    tx.execute(
        "INSERT INTO health_record_events (
            eventId, childId, protocolId, groupId, recordKind, sourceSurface,
            recordedAt, effectiveDate, ageMonths, recorderId,
            linkedReminderStateId, linkedReminderRuleId, notes, metadataJson,
            createdAt, updatedAt
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?15)",
        params![
            &input.event_id,
            &input.child_id,
            &input.protocol_id,
            &input.group_id,
            &input.record_kind,
            &input.source_surface,
            &input.recorded_at,
            &input.effective_date,
            input.age_months,
            &input.recorder_id,
            &input.linked_reminder_state_id,
            &input.linked_reminder_rule_id,
            &input.notes,
            &input.metadata_json,
            &input.now,
        ],
    )
    .map_err(|e| format!("save_health_record_capture insert event: {e}"))?;

    let mut value_ids = Vec::with_capacity(input.values.len());
    for value in input.values {
        tx.execute(
            "INSERT INTO health_record_values (
                valueId, eventId, childId, metricId, valueNumber, valueText,
                valueJson, unit, qualifier, recordKind, sourceValueIds, createdAt
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                &value.value_id,
                &input.event_id,
                &input.child_id,
                &value.metric_id,
                value.value_number,
                &value.value_text,
                &value.value_json,
                &value.unit,
                &value.qualifier,
                &value.record_kind,
                &value.source_value_ids,
                &input.now,
            ],
        )
        .map_err(|e| format!("save_health_record_capture insert value: {e}"))?;
        value_ids.push(value.value_id);
    }

    Ok(SaveHealthRecordCaptureResult {
        event_id: input.event_id,
        persisted_value_count: value_ids.len(),
        value_ids,
    })
}

#[tauri::command]
pub fn save_health_record_capture(
    input: SaveHealthRecordCaptureInput,
) -> Result<SaveHealthRecordCaptureResult, String> {
    let mut conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    save_health_record_capture_with_conn(&mut conn, input)
}

#[tauri::command]
pub fn replace_health_record_capture(
    replace_event_id: String,
    input: SaveHealthRecordCaptureInput,
) -> Result<SaveHealthRecordCaptureResult, String> {
    non_empty(&replace_event_id, "replaceEventId")?;
    validate_health_record_capture(&input)?;

    let mut conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("replace_health_record_capture begin transaction: {e}"))?;
    let changed = tx
        .execute(
            "DELETE FROM health_record_events WHERE eventId = ?1 AND childId = ?2",
            params![&replace_event_id, &input.child_id],
        )
        .map_err(|e| format!("replace_health_record_capture delete old event: {e}"))?;
    if changed == 0 {
        return Err(format!(
            "replace_health_record_capture found no health_record_events row for replaceEventId \"{}\" and childId \"{}\"",
            replace_event_id, input.child_id
        ));
    }
    let result = insert_health_record_capture_rows(&tx, input)?;
    tx.commit()
        .map_err(|e| format!("replace_health_record_capture commit: {e}"))?;
    Ok(result)
}

#[tauri::command]
pub fn get_health_record_events(child_id: String) -> Result<Vec<HealthRecordEventRow>, String> {
    let conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT eventId, childId, protocolId, groupId, recordKind, sourceSurface,
                    recordedAt, effectiveDate, ageMonths, recorderId,
                    linkedReminderStateId, linkedReminderRuleId, notes, metadataJson,
                    createdAt, updatedAt
             FROM health_record_events
             WHERE childId = ?1
             ORDER BY effectiveDate DESC, createdAt DESC",
        )
        .map_err(|e| format!("get_health_record_events prepare: {e}"))?;
    let rows = stmt
        .query_map(params![child_id], |row| {
            Ok(HealthRecordEventRow {
                event_id: row.get(0)?,
                child_id: row.get(1)?,
                protocol_id: row.get(2)?,
                group_id: row.get(3)?,
                record_kind: row.get(4)?,
                source_surface: row.get(5)?,
                recorded_at: row.get(6)?,
                effective_date: row.get(7)?,
                age_months: row.get(8)?,
                recorder_id: row.get(9)?,
                linked_reminder_state_id: row.get(10)?,
                linked_reminder_rule_id: row.get(11)?,
                notes: row.get(12)?,
                metadata_json: row.get(13)?,
                created_at: row.get(14)?,
                updated_at: row.get(15)?,
            })
        })
        .map_err(|e| format!("get_health_record_events query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("get_health_record_events collect: {e}"))
}

#[tauri::command]
pub fn get_health_record_values(child_id: String) -> Result<Vec<HealthRecordValueRow>, String> {
    let conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT valueId, eventId, childId, metricId, valueNumber, valueText, valueJson,
                    unit, qualifier, recordKind, sourceValueIds, createdAt
             FROM health_record_values
             WHERE childId = ?1
             ORDER BY createdAt DESC, valueId DESC",
        )
        .map_err(|e| format!("get_health_record_values prepare: {e}"))?;
    let rows = stmt
        .query_map(params![child_id], |row| {
            Ok(HealthRecordValueRow {
                value_id: row.get(0)?,
                event_id: row.get(1)?,
                child_id: row.get(2)?,
                metric_id: row.get(3)?,
                value_number: row.get(4)?,
                value_text: row.get(5)?,
                value_json: row.get(6)?,
                unit: row.get(7)?,
                qualifier: row.get(8)?,
                record_kind: row.get(9)?,
                source_value_ids: row.get(10)?,
                created_at: row.get(11)?,
            })
        })
        .map_err(|e| format!("get_health_record_values query: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("get_health_record_values collect: {e}"))
}

// ── Profile Section Summaries ─────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionSummary {
    pub section_id: String,
    pub record_count: i64,
    pub last_updated_at: Option<String>,
    pub state: String, // "ok" | "empty" | "error"
    pub error_message: Option<String>,
}

/// Section definition: (sectionId, SQL for COUNT, SQL for MAX timestamp)
const SECTION_QUERIES: &[(&str, &str, &str)] = &[
    (
        "growth",
        "SELECT COUNT(*) FROM health_record_values WHERE childId = ?1 AND metricId IN ('growth.height','growth.weight','growth.head_circumference','growth.bmi')",
        "SELECT MAX(createdAt) FROM health_record_values WHERE childId = ?1 AND metricId IN ('growth.height','growth.weight','growth.head_circumference','growth.bmi')",
    ),
    (
        "milestones",
        "SELECT COUNT(*) FROM milestone_records WHERE childId = ?1",
        "SELECT MAX(createdAt) FROM milestone_records WHERE childId = ?1",
    ),
    (
        "vaccines",
        "SELECT COUNT(*) FROM vaccine_records WHERE childId = ?1",
        "SELECT MAX(createdAt) FROM vaccine_records WHERE childId = ?1",
    ),
    (
        "vision",
        "SELECT COUNT(*) FROM health_record_values WHERE childId = ?1 AND metricId IN ('vision.left_visual_acuity','vision.right_visual_acuity','vision.left_axial_length','vision.right_axial_length','vision.left_iop','vision.right_iop')",
        "SELECT MAX(createdAt) FROM health_record_values WHERE childId = ?1 AND metricId IN ('vision.left_visual_acuity','vision.right_visual_acuity','vision.left_axial_length','vision.right_axial_length','vision.left_iop','vision.right_iop')",
    ),
    (
        "dental",
        "SELECT COUNT(*) FROM health_record_values WHERE childId = ?1 AND metricId = 'dental.event'",
        "SELECT MAX(createdAt) FROM health_record_values WHERE childId = ?1 AND metricId = 'dental.event'",
    ),
    (
        "allergies",
        "SELECT COUNT(*) FROM allergy_records WHERE childId = ?1",
        "SELECT MAX(COALESCE(updatedAt, createdAt)) FROM allergy_records WHERE childId = ?1",
    ),
    (
        "sleep",
        "SELECT COUNT(*) FROM health_record_values WHERE childId = ?1 AND metricId = 'sleep.duration_minutes'",
        "SELECT MAX(createdAt) FROM health_record_values WHERE childId = ?1 AND metricId = 'sleep.duration_minutes'",
    ),
    (
        "medical-events",
        "SELECT COUNT(*) FROM health_record_values WHERE childId = ?1 AND metricId = 'medical.event'",
        "SELECT MAX(e.updatedAt) FROM health_record_events e JOIN health_record_values v ON v.eventId = e.eventId WHERE v.childId = ?1 AND v.metricId = 'medical.event'",
    ),
    (
        "posture",
        // posture has no dedicated table yet (PO-PROF-019)
        "SELECT 0",
        "SELECT NULL",
    ),
    (
        "tanner",
        "SELECT COUNT(*) FROM health_record_values WHERE childId = ?1 AND metricId IN ('development.tanner_breast_stage','development.tanner_genital_stage','development.tanner_pubic_hair_stage','development.bone_age_years','development.body_fat_percentage')",
        "SELECT MAX(createdAt) FROM health_record_values WHERE childId = ?1 AND metricId IN ('development.tanner_breast_stage','development.tanner_genital_stage','development.tanner_pubic_hair_stage','development.bone_age_years','development.body_fat_percentage')",
    ),
    (
        "fitness",
        "SELECT COUNT(*) FROM health_record_values WHERE childId = ?1 AND metricId IN ('fitness.run_50m','fitness.vital_capacity','fitness.run_800m','fitness.run_1000m','fitness.run_50x8','fitness.sit_and_reach','fitness.standing_long_jump','fitness.sit_ups','fitness.pull_ups','fitness.rope_skipping','fitness.run_10m_shuttle','fitness.tennis_ball_throw','fitness.double_foot_jump','fitness.balance_beam','fitness.foot_arch_status')",
        "SELECT MAX(createdAt) FROM health_record_values WHERE childId = ?1 AND metricId IN ('fitness.run_50m','fitness.vital_capacity','fitness.run_800m','fitness.run_1000m','fitness.run_50x8','fitness.sit_and_reach','fitness.standing_long_jump','fitness.sit_ups','fitness.pull_ups','fitness.rope_skipping','fitness.run_10m_shuttle','fitness.tennis_ball_throw','fitness.double_foot_jump','fitness.balance_beam','fitness.foot_arch_status')",
    ),
    (
        "outdoor",
        "SELECT COUNT(*) FROM health_record_values WHERE childId = ?1 AND metricId = 'outdoor.activity_minutes'",
        "SELECT MAX(createdAt) FROM health_record_values WHERE childId = ?1 AND metricId = 'outdoor.activity_minutes'",
    ),
];

#[tauri::command]
pub fn get_profile_section_summaries(child_id: String) -> Result<Vec<SectionSummary>, String> {
    let conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    let mut results = Vec::with_capacity(SECTION_QUERIES.len());

    for &(section_id, count_sql, max_sql) in SECTION_QUERIES {
        let summary = (|| -> Result<SectionSummary, String> {
            let count: i64 = if count_sql.contains("?1") {
                conn.query_row(count_sql, params![child_id], |row| row.get(0))
            } else {
                conn.query_row(count_sql, [], |row| row.get(0))
            }
            .map_err(|e| format!("{section_id} count: {e}"))?;

            let last_updated: Option<String> = if max_sql.contains("?1") {
                conn.query_row(max_sql, params![child_id], |row| row.get(0))
            } else {
                conn.query_row(max_sql, [], |row| row.get(0))
            }
            .map_err(|e| format!("{section_id} max: {e}"))?;

            let state = if count > 0 { "ok" } else { "empty" };
            Ok(SectionSummary {
                section_id: section_id.to_string(),
                record_count: count,
                last_updated_at: last_updated,
                state: state.to_string(),
                error_message: None,
            })
        })();

        match summary {
            Ok(s) => results.push(s),
            Err(e) => results.push(SectionSummary {
                section_id: section_id.to_string(),
                record_count: 0,
                last_updated_at: None,
                state: "error".to_string(),
                error_message: Some(e),
            }),
        }
    }

    Ok(results)
}

// ── Vaccine Records ────────────────────────────────────────

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn insert_vaccine_record(
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
) -> Result<(), String> {
    validate_vaccine_rule_id(&rule_id)?;
    let mut conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    insert_vaccine_record_with_conn(
        &mut conn,
        record_id,
        reminder_state_id,
        child_id,
        rule_id,
        vaccine_name,
        vaccinated_at,
        age_months,
        batch_number,
        hospital,
        adverse_reaction,
        photo_path,
        now,
    )
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn insert_vaccine_record_with_conn(
    conn: &mut Connection,
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
) -> Result<(), String> {
    validate_vaccine_rule_id(&rule_id)?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("insert_vaccine_record begin transaction: {e}"))?;
    let duplicate_count: i64 = tx
        .query_row(
            "SELECT COUNT(*) FROM vaccine_records WHERE childId = ?1 AND ruleId = ?2",
            params![child_id, rule_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("insert_vaccine_record duplicate check: {e}"))?;
    if duplicate_count != 0 {
        return Err(format!(
            "insert_vaccine_record: vaccine rule already recorded for child (PO-PROF-006): {rule_id}"
        ));
    }
    tx.execute(
        "INSERT INTO vaccine_records (recordId, childId, ruleId, vaccineName, vaccinatedAt, ageMonths, batchNumber, hospital, adverseReaction, photoPath, createdAt) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)",
        params![record_id, child_id, rule_id, vaccine_name, vaccinated_at, age_months, batch_number, hospital, adverse_reaction, photo_path, now],
    )
    .map_err(|e| format!("insert_vaccine_record: {e}"))?;
    tx.execute(
        "INSERT INTO reminder_states (
            stateId, childId, ruleId, status, activatedAt, completedAt, dismissedAt,
            dismissReason, repeatIndex, nextTriggerAt, snoozedUntil, scheduledDate,
            notApplicable, plannedForDate, surfaceRank, lastSurfacedAt, surfaceCount,
            notes, acknowledgedAt, reflectedAt, practiceStartedAt, practiceLastAt,
            practiceCount, practiceHabituatedAt, consultedAt, consultationConversationId,
            createdAt, updatedAt
         ) VALUES (?1, ?2, ?3, 'completed', NULL, ?4, NULL, NULL, 0, NULL, NULL,
            NULL, 0, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, 0, NULL,
            NULL, NULL, ?4, ?4)
         ON CONFLICT(childId, ruleId, repeatIndex) DO UPDATE SET
            status='completed', activatedAt=NULL, completedAt=?4, dismissedAt=NULL,
            dismissReason=NULL, nextTriggerAt=NULL, snoozedUntil=NULL, scheduledDate=NULL,
            notApplicable=0, plannedForDate=NULL, surfaceRank=NULL, lastSurfacedAt=NULL,
            surfaceCount=0, notes=NULL, acknowledgedAt=NULL, reflectedAt=NULL,
            practiceStartedAt=NULL, practiceLastAt=NULL, practiceCount=0,
            practiceHabituatedAt=NULL, consultedAt=NULL,
            consultationConversationId=NULL, updatedAt=?4",
        params![reminder_state_id, child_id, rule_id, now],
    )
    .map_err(|e| format!("insert_vaccine_record complete reminder: {e}"))?;
    tx.commit()
        .map_err(|e| format!("insert_vaccine_record commit: {e}"))
}

#[cfg(test)]
mod vaccine_record_tests {
    use super::{
        delete_vaccine_record_with_conn, insert_vaccine_record_with_conn, validate_vaccine_rule_id,
    };
    use rusqlite::Connection;

    fn setup_vaccine_tables(reminder_status_constraint: bool) -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE vaccine_records (
                recordId TEXT PRIMARY KEY,
                childId TEXT NOT NULL,
                ruleId TEXT NOT NULL,
                vaccineName TEXT NOT NULL,
                vaccinatedAt TEXT NOT NULL,
                ageMonths INTEGER NOT NULL,
                batchNumber TEXT,
                hospital TEXT,
                adverseReaction TEXT,
                photoPath TEXT,
                createdAt TEXT NOT NULL,
                UNIQUE(childId, ruleId)
            );",
        )
        .expect("create vaccine table");
        let status_definition = if reminder_status_constraint {
            "TEXT NOT NULL CHECK(status = 'pending')"
        } else {
            "TEXT NOT NULL"
        };
        conn.execute_batch(&format!(
            "CREATE TABLE reminder_states (
                stateId TEXT PRIMARY KEY,
                childId TEXT NOT NULL,
                ruleId TEXT NOT NULL,
                status {status_definition},
                activatedAt TEXT,
                completedAt TEXT,
                dismissedAt TEXT,
                dismissReason TEXT,
                repeatIndex INTEGER NOT NULL,
                nextTriggerAt TEXT,
                snoozedUntil TEXT,
                scheduledDate TEXT,
                notApplicable INTEGER NOT NULL,
                plannedForDate TEXT,
                surfaceRank INTEGER,
                lastSurfacedAt TEXT,
                surfaceCount INTEGER NOT NULL,
                notes TEXT,
                acknowledgedAt TEXT,
                reflectedAt TEXT,
                practiceStartedAt TEXT,
                practiceLastAt TEXT,
                practiceCount INTEGER NOT NULL,
                practiceHabituatedAt TEXT,
                consultedAt TEXT,
                consultationConversationId TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL,
                UNIQUE(childId, ruleId, repeatIndex)
            );"
        ))
        .expect("create reminder table");
        conn
    }

    fn insert_vaccine(conn: &mut Connection) -> Result<(), String> {
        insert_vaccine_record_with_conn(
            conn,
            "01J6E5YB3W0000000000000002".to_string(),
            "01J6E5YB3W0000000000000003".to_string(),
            "01J6E5YB3W0000000000000001".to_string(),
            "PO-REM-VAC-001".to_string(),
            "乙肝疫苗".to_string(),
            "2026-08-28".to_string(),
            0,
            None,
            None,
            None,
            None,
            "2026-08-28T10:00:00+08:00".to_string(),
        )
    }

    #[test]
    fn rejects_placeholder_or_custom_vaccine_rule_ids() {
        assert!(validate_vaccine_rule_id("custom-vac-01H00000000000000000000000").is_err());
        assert!(validate_vaccine_rule_id("custom-vac-next-01H00000000000000000000000").is_err());
    }

    #[test]
    fn accepts_generated_vaccine_rule_ids() {
        assert!(validate_vaccine_rule_id("PO-REM-VAC-001").is_ok());
    }

    #[test]
    fn insert_and_delete_keep_vaccine_and_reminder_state_atomic() {
        let mut conn = setup_vaccine_tables(false);
        insert_vaccine(&mut conn).expect("insert vaccine and complete reminder");

        let vaccine_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM vaccine_records", [], |row| row.get(0))
            .expect("count vaccines");
        let reminder_status: (String, Option<String>) = conn
            .query_row(
                "SELECT status, completedAt FROM reminder_states",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read reminder state");
        assert_eq!(vaccine_count, 1);
        assert_eq!(reminder_status.0, "completed");
        assert!(reminder_status.1.is_some());

        delete_vaccine_record_with_conn(
            &mut conn,
            "01J6E5YB3W0000000000000002".to_string(),
            "2026-08-28T11:00:00+08:00".to_string(),
        )
        .expect("delete vaccine and restore reminder");

        let vaccine_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM vaccine_records", [], |row| row.get(0))
            .expect("count vaccines after delete");
        let reminder_status: (String, Option<String>) = conn
            .query_row(
                "SELECT status, completedAt FROM reminder_states",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("read restored reminder state");
        assert_eq!(vaccine_count, 0);
        assert_eq!(reminder_status, ("pending".to_string(), None));
    }

    #[test]
    fn reminder_failure_rolls_back_vaccine_insert() {
        let mut conn = setup_vaccine_tables(true);
        assert!(insert_vaccine(&mut conn).is_err());
        let vaccine_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM vaccine_records", [], |row| row.get(0))
            .expect("count vaccines after rollback");
        assert_eq!(vaccine_count, 0);
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaccineRecord {
    pub record_id: String,
    pub child_id: String,
    pub rule_id: String,
    pub vaccine_name: String,
    pub vaccinated_at: String,
    pub age_months: i32,
    pub batch_number: Option<String>,
    pub hospital: Option<String>,
    pub adverse_reaction: Option<String>,
    pub photo_path: Option<String>,
    pub created_at: String,
}

#[tauri::command]
pub fn update_vaccine_record(
    record_id: String,
    vaccinated_at: String,
    age_months: i32,
    batch_number: Option<String>,
    hospital: Option<String>,
    adverse_reaction: Option<String>,
) -> Result<(), String> {
    let mut conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("update_vaccine_record begin transaction: {e}"))?;
    let pairing: Option<(String, String)> = tx
        .query_row(
            "SELECT vr.childId, vr.ruleId
             FROM vaccine_records vr
             JOIN reminder_states rs
               ON rs.childId = vr.childId AND rs.ruleId = vr.ruleId AND rs.repeatIndex = 0
             WHERE vr.recordId = ?1 AND rs.status = 'completed' AND rs.completedAt IS NOT NULL",
            params![record_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("update_vaccine_record validate reminder pairing: {e}"))?;
    if pairing.is_none() {
        return Err(format!(
            "update_vaccine_record: missing completed reminder pairing for record {record_id} (PO-PROF-006)"
        ));
    }
    let affected = tx
        .execute(
            "UPDATE vaccine_records SET vaccinatedAt = ?2, ageMonths = ?3, batchNumber = ?4, hospital = ?5, adverseReaction = ?6 WHERE recordId = ?1",
            params![record_id, vaccinated_at, age_months, batch_number, hospital, adverse_reaction],
        )
        .map_err(|e| format!("update_vaccine_record: {e}"))?;
    if affected == 0 {
        return Err(format!(
            "update_vaccine_record: no vaccine record found with id {record_id}"
        ));
    }
    tx.commit()
        .map_err(|e| format!("update_vaccine_record commit: {e}"))
}

#[tauri::command]
pub fn delete_vaccine_record(record_id: String, now: String) -> Result<(), String> {
    let mut conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    delete_vaccine_record_with_conn(&mut conn, record_id, now)
}

pub(crate) fn delete_vaccine_record_with_conn(
    conn: &mut Connection,
    record_id: String,
    now: String,
) -> Result<(), String> {
    let tx = conn
        .transaction()
        .map_err(|e| format!("delete_vaccine_record begin transaction: {e}"))?;
    let pairing: Option<(String, String)> = tx
        .query_row(
            "SELECT childId, ruleId FROM vaccine_records WHERE recordId = ?1",
            params![record_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| format!("delete_vaccine_record locate record: {e}"))?;
    let Some((child_id, rule_id)) = pairing else {
        return Err(format!(
            "delete_vaccine_record: no vaccine record found with id {record_id}"
        ));
    };
    let affected = tx
        .execute(
            "DELETE FROM vaccine_records WHERE recordId = ?1",
            params![record_id],
        )
        .map_err(|e| format!("delete_vaccine_record: {e}"))?;
    if affected == 0 {
        return Err(format!(
            "delete_vaccine_record: no vaccine record found with id {record_id}"
        ));
    }
    let reminder_affected = tx
        .execute(
            "UPDATE reminder_states SET
                status='pending', activatedAt=NULL, completedAt=NULL, dismissedAt=NULL,
                dismissReason=NULL, nextTriggerAt=NULL, snoozedUntil=NULL,
                scheduledDate=NULL, notApplicable=0, plannedForDate=NULL,
                surfaceRank=NULL, lastSurfacedAt=NULL, surfaceCount=0, notes=NULL,
                acknowledgedAt=NULL, reflectedAt=NULL, practiceStartedAt=NULL,
                practiceLastAt=NULL, practiceCount=0, practiceHabituatedAt=NULL,
                consultedAt=NULL, consultationConversationId=NULL, updatedAt=?1
             WHERE childId=?2 AND ruleId=?3 AND repeatIndex=0",
            params![now, child_id, rule_id],
        )
        .map_err(|e| format!("delete_vaccine_record restore reminder: {e}"))?;
    if reminder_affected != 1 {
        return Err(format!(
            "delete_vaccine_record: expected one reminder pairing for child={child_id} rule={rule_id}, found {reminder_affected} (PO-PROF-006)"
        ));
    }
    tx.commit()
        .map_err(|e| format!("delete_vaccine_record commit: {e}"))
}

#[tauri::command]
pub fn get_vaccine_records(child_id: String) -> Result<Vec<VaccineRecord>, String> {
    let conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT recordId, childId, ruleId, vaccineName, vaccinatedAt, ageMonths, batchNumber, hospital, adverseReaction, photoPath, createdAt FROM vaccine_records WHERE childId = ?1 ORDER BY vaccinatedAt").map_err(|e| format!("get_vaccine_records: {e}"))?;
    let rows = stmt
        .query_map(params![child_id], |row| {
            Ok(VaccineRecord {
                record_id: row.get(0)?,
                child_id: row.get(1)?,
                rule_id: row.get(2)?,
                vaccine_name: row.get(3)?,
                vaccinated_at: row.get(4)?,
                age_months: row.get(5)?,
                batch_number: row.get(6)?,
                hospital: row.get(7)?,
                adverse_reaction: row.get(8)?,
                photo_path: row.get(9)?,
                created_at: row.get(10)?,
            })
        })
        .map_err(|e| format!("get_vaccine_records: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("get_vaccine_records collect: {e}"))
}

include!("health_records_dental.inc.rs");
include!("health_records_tail.inc.rs");
