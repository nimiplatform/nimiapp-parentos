use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Number as JsonNumber, Value as JsonValue};
use std::collections::{BTreeMap, BTreeSet};

use super::get_conn;

// @nimi-authority: rule.parentos.shell.r009

pub const STRUCTURED_BACKUP_FORMAT_VERSION: &str = "parentos-structured-backup-v1";
pub const PARENTOS_APP_ID: &str = "nimi.parentos";

const STRUCTURED_TABLES: &[&str] = &[
    "families",
    "children",
    "app_settings",
    "milestone_records",
    "reminder_states",
    "vaccine_records",
    "posture_assessments",
    "journal_entries",
    "journal_tags",
    "ai_conversations",
    "ai_messages",
    "growth_reports",
    "dental_records",
    "orthodontic_cases",
    "orthodontic_appliances",
    "orthodontic_checkins",
    "orthodontic_unwear_intervals",
    "allergy_records",
    "sleep_records",
    "medical_events",
    "tanner_assessments",
    "fitness_assessments",
    "outdoor_records",
    "vision_followup_settings",
    "health_record_events",
    "health_record_values",
    "custom_todos",
];

const MEDIA_PATH_COLUMNS: &[(&str, &str)] = &[
    ("children", "avatarPath"),
    ("milestone_records", "photoPath"),
    ("vaccine_records", "photoPath"),
    ("posture_assessments", "photoPaths"),
    ("journal_entries", "voicePath"),
    ("journal_entries", "photoPaths"),
    ("dental_records", "photoPath"),
    ("medical_events", "photoPath"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct StructuredBackupEnvelope {
    pub format_version: String,
    pub app_id: String,
    pub exported_at: String,
    pub tables: BTreeMap<String, Vec<JsonMap<String, JsonValue>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredBackupImportSummary {
    pub table_count: usize,
    pub row_count: usize,
}

#[derive(Debug, Clone, Copy)]
enum SqlAffinity {
    Integer,
    Real,
    Text,
    Blob,
}

#[derive(Debug)]
struct ColumnSchema {
    name: String,
    affinity: SqlAffinity,
    required: bool,
}

#[derive(Debug)]
struct ValidatedTable {
    name: String,
    columns: Vec<String>,
    rows: Vec<Vec<SqlValue>>,
}

#[tauri::command]
pub fn export_structured_backup(exported_at: String) -> Result<StructuredBackupEnvelope, String> {
    if exported_at.trim().is_empty() {
        return Err("export_structured_backup: exportedAt is required (PO-SHELL-009)".to_string());
    }
    let conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    export_structured_backup_with_conn(&conn, exported_at)
}

pub(crate) fn export_structured_backup_with_conn(
    conn: &Connection,
    exported_at: String,
) -> Result<StructuredBackupEnvelope, String> {
    let mut tables = BTreeMap::new();
    for table in STRUCTURED_TABLES {
        let schema = read_table_schema(conn, table)?;
        let columns = schema
            .iter()
            .map(|column| column.name.as_str())
            .collect::<Vec<_>>();
        let select_columns = columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!("SELECT {select_columns} FROM {}", quote_identifier(table));
        let mut statement = conn
            .prepare(&sql)
            .map_err(|e| format!("export_structured_backup prepare {table}: {e}"))?;
        let rows = statement
            .query_map([], |row| {
                let mut object = JsonMap::new();
                for (index, column) in columns.iter().enumerate() {
                    let value = if is_media_path_column(table, column) {
                        JsonValue::Null
                    } else {
                        sqlite_value_to_json(row.get_ref(index)?)?
                    };
                    object.insert((*column).to_string(), value);
                }
                Ok(object)
            })
            .map_err(|e| format!("export_structured_backup query {table}: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("export_structured_backup collect {table}: {e}"))?;
        tables.insert((*table).to_string(), rows);
    }

    Ok(StructuredBackupEnvelope {
        format_version: STRUCTURED_BACKUP_FORMAT_VERSION.to_string(),
        app_id: PARENTOS_APP_ID.to_string(),
        exported_at,
        tables,
    })
}

#[tauri::command]
pub fn import_structured_backup(
    envelope: StructuredBackupEnvelope,
) -> Result<StructuredBackupImportSummary, String> {
    let mut conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    import_structured_backup_with_conn(&mut conn, envelope)
}

pub(crate) fn import_structured_backup_with_conn(
    conn: &mut Connection,
    envelope: StructuredBackupEnvelope,
) -> Result<StructuredBackupImportSummary, String> {
    let validated = validate_envelope(conn, &envelope)?;
    reject_media_backed_current_state(conn)?;
    let row_count = validated.iter().map(|table| table.rows.len()).sum();

    let transaction = conn
        .transaction()
        .map_err(|e| format!("import_structured_backup begin transaction: {e}"))?;
    transaction
        .execute_batch("PRAGMA defer_foreign_keys = ON;")
        .map_err(|e| format!("import_structured_backup defer foreign keys: {e}"))?;

    for table in STRUCTURED_TABLES.iter().rev() {
        transaction
            .execute(&format!("DELETE FROM {}", quote_identifier(table)), [])
            .map_err(|e| format!("import_structured_backup clear {table}: {e}"))?;
    }

    for table in &validated {
        if table.rows.is_empty() {
            continue;
        }
        let column_list = table
            .columns
            .iter()
            .map(|column| quote_identifier(column))
            .collect::<Vec<_>>()
            .join(", ");
        let placeholders = (1..=table.columns.len())
            .map(|index| format!("?{index}"))
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "INSERT INTO {} ({column_list}) VALUES ({placeholders})",
            quote_identifier(&table.name)
        );
        let mut statement = transaction
            .prepare(&sql)
            .map_err(|e| format!("import_structured_backup prepare {}: {e}", table.name))?;
        for (row_index, row) in table.rows.iter().enumerate() {
            statement
                .execute(params_from_iter(row.iter()))
                .map_err(|e| {
                    format!(
                        "import_structured_backup insert {} row {}: {e}",
                        table.name, row_index
                    )
                })?;
        }
    }

    let foreign_key_error = {
        let mut statement = transaction
            .prepare("PRAGMA foreign_key_check")
            .map_err(|e| format!("import_structured_backup foreign key check: {e}"))?;
        let mut rows = statement
            .query([])
            .map_err(|e| format!("import_structured_backup foreign key query: {e}"))?;
        rows.next()
            .map_err(|e| format!("import_structured_backup foreign key result: {e}"))?
            .is_some()
    };
    if foreign_key_error {
        return Err(
            "import_structured_backup: foreign-key verification failed (PO-SHELL-009)".to_string(),
        );
    }

    transaction
        .commit()
        .map_err(|e| format!("import_structured_backup commit: {e}"))?;
    Ok(StructuredBackupImportSummary {
        table_count: validated.len(),
        row_count,
    })
}

fn validate_envelope(
    conn: &Connection,
    envelope: &StructuredBackupEnvelope,
) -> Result<Vec<ValidatedTable>, String> {
    if envelope.format_version != STRUCTURED_BACKUP_FORMAT_VERSION {
        return Err(format!(
            "import_structured_backup: unsupported formatVersion '{}' (PO-SHELL-009)",
            envelope.format_version
        ));
    }
    if envelope.app_id != PARENTOS_APP_ID {
        return Err(format!(
            "import_structured_backup: appId must be {PARENTOS_APP_ID} (PO-SHELL-009)"
        ));
    }
    if envelope.exported_at.trim().is_empty() {
        return Err("import_structured_backup: exportedAt is required (PO-SHELL-009)".to_string());
    }

    let expected_tables = STRUCTURED_TABLES
        .iter()
        .map(|table| (*table).to_string())
        .collect::<BTreeSet<_>>();
    let actual_tables = envelope.tables.keys().cloned().collect::<BTreeSet<_>>();
    if actual_tables != expected_tables {
        return Err(format!(
            "import_structured_backup: table set mismatch; expected {expected_tables:?}, received {actual_tables:?} (PO-SHELL-009)"
        ));
    }

    let mut validated = Vec::with_capacity(STRUCTURED_TABLES.len());
    for table in STRUCTURED_TABLES {
        let schema = read_table_schema(conn, table)?;
        let expected_columns = schema
            .iter()
            .map(|column| column.name.clone())
            .collect::<BTreeSet<_>>();
        let source_rows = envelope
            .tables
            .get(*table)
            .expect("exact table set was validated");
        let mut rows = Vec::with_capacity(source_rows.len());
        for (row_index, source_row) in source_rows.iter().enumerate() {
            let actual_columns = source_row.keys().cloned().collect::<BTreeSet<_>>();
            if actual_columns != expected_columns {
                return Err(format!(
                    "import_structured_backup: column set mismatch for {table} row {row_index}; expected {expected_columns:?}, received {actual_columns:?} (PO-SHELL-009)"
                ));
            }
            let mut values = Vec::with_capacity(schema.len());
            for column in &schema {
                let value = source_row
                    .get(&column.name)
                    .expect("exact column set was validated");
                if is_media_path_column(table, &column.name) && !value.is_null() {
                    return Err(format!(
                        "import_structured_backup: media path {table}.{} must be null (PO-SHELL-009)",
                        column.name
                    ));
                }
                values.push(json_value_to_sql(table, row_index, column, value)?);
            }
            rows.push(values);
        }
        validated.push(ValidatedTable {
            name: (*table).to_string(),
            columns: schema.into_iter().map(|column| column.name).collect(),
            rows,
        });
    }
    Ok(validated)
}

fn read_table_schema(conn: &Connection, table: &str) -> Result<Vec<ColumnSchema>, String> {
    let sql = format!("PRAGMA table_info({})", quote_identifier(table));
    let mut statement = conn
        .prepare(&sql)
        .map_err(|e| format!("structured backup inspect {table}: {e}"))?;
    let columns = statement
        .query_map([], |row| {
            let declared_type: String = row.get(2)?;
            let not_null: i64 = row.get(3)?;
            let primary_key: i64 = row.get(5)?;
            Ok(ColumnSchema {
                name: row.get(1)?,
                affinity: parse_affinity(&declared_type),
                required: not_null != 0 || primary_key != 0,
            })
        })
        .map_err(|e| format!("structured backup query schema {table}: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("structured backup collect schema {table}: {e}"))?;
    if columns.is_empty() {
        return Err(format!(
            "structured backup table {table} is missing (PO-SHELL-009)"
        ));
    }
    Ok(columns)
}

fn parse_affinity(declared_type: &str) -> SqlAffinity {
    let normalized = declared_type.to_ascii_uppercase();
    if normalized.contains("INT") {
        SqlAffinity::Integer
    } else if normalized.contains("CHAR")
        || normalized.contains("CLOB")
        || normalized.contains("TEXT")
    {
        SqlAffinity::Text
    } else if normalized.contains("REAL")
        || normalized.contains("FLOA")
        || normalized.contains("DOUB")
    {
        SqlAffinity::Real
    } else {
        SqlAffinity::Blob
    }
}

fn json_value_to_sql(
    table: &str,
    row_index: usize,
    column: &ColumnSchema,
    value: &JsonValue,
) -> Result<SqlValue, String> {
    if value.is_null() {
        if column.required {
            return Err(format!(
                "import_structured_backup: {table} row {row_index} column {} cannot be null (PO-SHELL-009)",
                column.name
            ));
        }
        return Ok(SqlValue::Null);
    }

    let invalid = || {
        format!(
            "import_structured_backup: incompatible value for {table} row {row_index} column {} (PO-SHELL-009)",
            column.name
        )
    };
    match column.affinity {
        SqlAffinity::Integer => value.as_i64().map(SqlValue::Integer).ok_or_else(invalid),
        SqlAffinity::Real => value.as_f64().map(SqlValue::Real).ok_or_else(invalid),
        SqlAffinity::Text => value
            .as_str()
            .map(|text| SqlValue::Text(text.to_string()))
            .ok_or_else(invalid),
        SqlAffinity::Blob => Err(invalid()),
    }
}

fn sqlite_value_to_json(value: ValueRef<'_>) -> rusqlite::Result<JsonValue> {
    match value {
        ValueRef::Null => Ok(JsonValue::Null),
        ValueRef::Integer(value) => Ok(JsonValue::Number(JsonNumber::from(value))),
        ValueRef::Real(value) => JsonNumber::from_f64(value)
            .map(JsonValue::Number)
            .ok_or_else(|| rusqlite::Error::IntegralValueOutOfRange(0, 0)),
        ValueRef::Text(value) => std::str::from_utf8(value)
            .map(|text| JsonValue::String(text.to_string()))
            .map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(
                    0,
                    rusqlite::types::Type::Text,
                    Box::new(error),
                )
            }),
        ValueRef::Blob(_) => Err(rusqlite::Error::InvalidColumnType(
            0,
            "structured-backup".to_string(),
            rusqlite::types::Type::Blob,
        )),
    }
}

fn reject_media_backed_current_state(conn: &Connection) -> Result<(), String> {
    for table in ["attachments", "orthodontic_photo_sessions"] {
        let count: i64 = conn
            .query_row(
                &format!("SELECT COUNT(*) FROM {}", quote_identifier(table)),
                [],
                |row| row.get(0),
            )
            .map_err(|e| format!("import_structured_backup inspect {table}: {e}"))?;
        if count != 0 {
            return Err(format!(
                "import_structured_backup: current database contains {table} media state; structured restore is blocked (PO-SHELL-009)"
            ));
        }
    }
    for (table, column) in MEDIA_PATH_COLUMNS {
        let count: i64 = conn
            .query_row(
                &format!(
                    "SELECT COUNT(*) FROM {} WHERE {} IS NOT NULL AND TRIM({}) <> ''",
                    quote_identifier(table),
                    quote_identifier(column),
                    quote_identifier(column)
                ),
                [],
                |row| row.get(0),
            )
            .map_err(|e| {
                format!("import_structured_backup inspect media path {table}.{column}: {e}")
            })?;
        if count != 0 {
            return Err(format!(
                "import_structured_backup: current database contains reusable media path {table}.{column}; structured restore is blocked (PO-SHELL-009)"
            ));
        }
    }
    Ok(())
}

fn is_media_path_column(table: &str, column: &str) -> bool {
    MEDIA_PATH_COLUMNS
        .iter()
        .any(|candidate| candidate == &(table, column))
}

fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('\"', "\"\""))
}

#[cfg(test)]
mod tests {
    use super::{
        export_structured_backup_with_conn, import_structured_backup_with_conn, PARENTOS_APP_ID,
        STRUCTURED_BACKUP_FORMAT_VERSION,
    };
    use crate::sqlite::migrations::run_migrations;
    use rusqlite::{params, Connection};

    fn setup_database() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        conn.execute_batch("PRAGMA foreign_keys = ON;")
            .expect("enable foreign keys");
        run_migrations(&conn).expect("run migrations");
        conn.execute(
            "INSERT INTO families (familyId, displayName, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?3)",
            params!["family-before", "Before", "2026-08-28T00:00:00Z"],
        )
        .expect("insert family");
        conn.execute(
            "INSERT INTO children (childId, familyId, displayName, gender, birthDate, avatarPath, nurtureMode, createdAt, updatedAt) VALUES (?1, ?2, ?3, ?4, ?5, NULL, 'balanced', ?6, ?6)",
            params!["child-before", "family-before", "Before child", "female", "2020-01-01", "2026-08-28T00:00:00Z"],
        )
        .expect("insert child");
        conn
    }

    #[test]
    fn exports_versioned_exact_table_envelope_and_redacts_paths() {
        let conn = setup_database();
        conn.execute(
            "UPDATE children SET avatarPath = 'C:/private/avatar.png' WHERE childId = 'child-before'",
            [],
        )
        .expect("set private path");

        let envelope =
            export_structured_backup_with_conn(&conn, "2026-08-28T01:00:00Z".to_string())
                .expect("export structured backup");
        assert_eq!(envelope.format_version, STRUCTURED_BACKUP_FORMAT_VERSION);
        assert_eq!(envelope.app_id, PARENTOS_APP_ID);
        assert_eq!(
            envelope.tables["children"][0]["avatarPath"],
            serde_json::Value::Null
        );
        assert!(!envelope.tables.contains_key("attachments"));
        assert!(!envelope.tables.contains_key("orthodontic_photo_sessions"));
    }

    #[test]
    fn invalid_foreign_key_rolls_back_complete_restore() {
        let mut conn = setup_database();
        let mut envelope =
            export_structured_backup_with_conn(&conn, "2026-08-28T01:00:00Z".to_string())
                .expect("export structured backup");
        envelope.tables.get_mut("children").expect("children table")[0]
            .insert("familyId".to_string(), serde_json::json!("missing-family"));

        assert!(import_structured_backup_with_conn(&mut conn, envelope).is_err());
        let family_name: String = conn
            .query_row(
                "SELECT displayName FROM families WHERE familyId = 'family-before'",
                [],
                |row| row.get(0),
            )
            .expect("original family survives rollback");
        assert_eq!(family_name, "Before");
    }

    #[test]
    fn valid_envelope_replaces_all_structured_tables_in_one_commit() {
        let mut conn = setup_database();
        let mut envelope =
            export_structured_backup_with_conn(&conn, "2026-08-28T01:00:00Z".to_string())
                .expect("export structured backup");
        envelope.tables.get_mut("families").expect("families table")[0]
            .insert("displayName".to_string(), serde_json::json!("Restored"));

        let summary = import_structured_backup_with_conn(&mut conn, envelope)
            .expect("restore valid structured backup");
        let family_name: String = conn
            .query_row(
                "SELECT displayName FROM families WHERE familyId = 'family-before'",
                [],
                |row| row.get(0),
            )
            .expect("read restored family");
        assert_eq!(summary.table_count, 27);
        assert_eq!(summary.row_count, 2);
        assert_eq!(family_name, "Restored");
    }

    #[test]
    fn malformed_row_is_rejected_before_current_rows_change() {
        let mut conn = setup_database();
        let mut envelope =
            export_structured_backup_with_conn(&conn, "2026-08-28T01:00:00Z".to_string())
                .expect("export structured backup");
        envelope.tables.get_mut("families").expect("families table")[0].remove("displayName");

        assert!(import_structured_backup_with_conn(&mut conn, envelope).is_err());
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM families", [], |row| row.get(0))
            .expect("count original rows");
        assert_eq!(count, 1);
    }

    #[test]
    fn current_media_path_blocks_structured_restore() {
        let mut conn = setup_database();
        let envelope =
            export_structured_backup_with_conn(&conn, "2026-08-28T01:00:00Z".to_string())
                .expect("export structured backup");
        conn.execute(
            "UPDATE children SET avatarPath = 'C:/private/avatar.png' WHERE childId = 'child-before'",
            [],
        )
        .expect("set private path");

        assert!(import_structured_backup_with_conn(&mut conn, envelope).is_err());
    }
}
