use rusqlite::types::{Value as SqlValue, ValueRef};
use rusqlite::{params_from_iter, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{Map as JsonMap, Number as JsonNumber, Value as JsonValue};
use std::collections::{BTreeMap, BTreeSet};

#[path = "backup_archive.rs"]
mod backup_archive;
pub use backup_archive::{export_complete_backup, restore_complete_backup};

fn schema_version(conn: &Connection) -> Result<i64, String> {
    conn.query_row("SELECT MAX(version) FROM _schema_version", [], |row| {
        row.get(0)
    })
    .map_err(|error| error.to_string())
}

// @nimi-authority: rule.parentos.shell.r009

pub const BACKUP_FORMAT_VERSION: &str = "parentos-complete-backup-v1";
pub const PARENTOS_APP_ID: &str = "nimi.parentos";

const BACKUP_TABLES: &[&str] = &[
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
    "orthodontic_photo_sessions",
    "attachments",
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
    ("attachments", "filePath"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct BackupEnvelope {
    pub format_version: String,
    pub app_id: String,
    pub exported_at: String,
    pub schema_version: i64,
    pub tables: BTreeMap<String, Vec<JsonMap<String, JsonValue>>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupSummary {
    pub table_count: usize,
    pub row_count: usize,
    pub media_count: usize,
    pub cleanup_pending: bool,
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

pub(crate) fn snapshot_tables(
    conn: &Connection,
    exported_at: String,
) -> Result<BackupEnvelope, String> {
    let mut actual = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_schema_version'").map_err(|e| e.to_string())?;
    let names = actual
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<BTreeSet<_>, _>>()
        .map_err(|e| e.to_string())?;
    if names != BACKUP_TABLES.iter().map(|s| s.to_string()).collect() {
        return Err("Backup table coverage differs from the live database (PO-SHELL-009)".into());
    }
    let mut tables = BTreeMap::new();
    for table in BACKUP_TABLES {
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
            .map_err(|e| format!("export_backup prepare {table}: {e}"))?;
        let rows = statement
            .query_map([], |row| {
                let mut object = JsonMap::new();
                for (index, column) in columns.iter().enumerate() {
                    let value = sqlite_value_to_json(row.get_ref(index)?)?;
                    object.insert((*column).to_string(), value);
                }
                Ok(object)
            })
            .map_err(|e| format!("export_backup query {table}: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("export_backup collect {table}: {e}"))?;
        tables.insert((*table).to_string(), rows);
    }

    Ok(BackupEnvelope {
        format_version: BACKUP_FORMAT_VERSION.to_string(),
        app_id: PARENTOS_APP_ID.to_string(),
        exported_at,
        schema_version: schema_version(conn)?,
        tables,
    })
}

pub(crate) fn replace_tables(
    conn: &mut Connection,
    envelope: BackupEnvelope,
) -> Result<BackupSummary, String> {
    let validated = validate_envelope(conn, &envelope)?;
    let row_count = validated.iter().map(|table| table.rows.len()).sum();

    let transaction = conn
        .transaction()
        .map_err(|e| format!("restore_backup begin transaction: {e}"))?;
    transaction
        .execute_batch("PRAGMA defer_foreign_keys = ON;")
        .map_err(|e| format!("restore_backup defer foreign keys: {e}"))?;

    for table in BACKUP_TABLES.iter().rev() {
        transaction
            .execute(&format!("DELETE FROM {}", quote_identifier(table)), [])
            .map_err(|e| format!("restore_backup clear {table}: {e}"))?;
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
            .map_err(|e| format!("restore_backup prepare {}: {e}", table.name))?;
        for (row_index, row) in table.rows.iter().enumerate() {
            statement
                .execute(params_from_iter(row.iter()))
                .map_err(|e| {
                    format!(
                        "restore_backup insert {} row {}: {e}",
                        table.name, row_index
                    )
                })?;
        }
    }

    let foreign_key_error = {
        let mut statement = transaction
            .prepare("PRAGMA foreign_key_check")
            .map_err(|e| format!("restore_backup foreign key check: {e}"))?;
        let mut rows = statement
            .query([])
            .map_err(|e| format!("restore_backup foreign key query: {e}"))?;
        rows.next()
            .map_err(|e| format!("restore_backup foreign key result: {e}"))?
            .is_some()
    };
    if foreign_key_error {
        return Err("restore_backup: foreign-key verification failed (PO-SHELL-009)".to_string());
    }

    transaction
        .commit()
        .map_err(|e| format!("restore_backup commit: {e}"))?;
    Ok(BackupSummary {
        table_count: validated.len(),
        row_count,
        media_count: 0,
        cleanup_pending: false,
    })
}

fn validate_envelope(
    conn: &Connection,
    envelope: &BackupEnvelope,
) -> Result<Vec<ValidatedTable>, String> {
    if envelope.format_version != BACKUP_FORMAT_VERSION {
        return Err(format!(
            "restore_backup: unsupported formatVersion '{}' (PO-SHELL-009)",
            envelope.format_version
        ));
    }
    if envelope.app_id != PARENTOS_APP_ID {
        return Err(format!(
            "restore_backup: appId must be {PARENTOS_APP_ID} (PO-SHELL-009)"
        ));
    }
    if envelope.schema_version != schema_version(conn)? {
        return Err("Backup database schema version differs from this app (PO-SHELL-009)".into());
    }
    if chrono::DateTime::parse_from_rfc3339(&envelope.exported_at).is_err() {
        return Err("restore_backup: exportedAt is required (PO-SHELL-009)".to_string());
    }

    let expected_tables = BACKUP_TABLES
        .iter()
        .map(|table| (*table).to_string())
        .collect::<BTreeSet<_>>();
    let actual_tables = envelope.tables.keys().cloned().collect::<BTreeSet<_>>();
    if actual_tables != expected_tables {
        return Err(format!(
            "restore_backup: table set mismatch; expected {expected_tables:?}, received {actual_tables:?} (PO-SHELL-009)"
        ));
    }

    let mut validated = Vec::with_capacity(BACKUP_TABLES.len());
    for table in BACKUP_TABLES {
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
                    "restore_backup: column set mismatch for {table} row {row_index}; expected {expected_columns:?}, received {actual_columns:?} (PO-SHELL-009)"
                ));
            }
            let mut values = Vec::with_capacity(schema.len());
            for column in &schema {
                let value = source_row
                    .get(&column.name)
                    .expect("exact column set was validated");
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
        .map_err(|e| format!("complete backup inspect {table}: {e}"))?;
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
        .map_err(|e| format!("complete backup query schema {table}: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("complete backup collect schema {table}: {e}"))?;
    if columns.is_empty() {
        return Err(format!(
            "complete backup table {table} is missing (PO-SHELL-009)"
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
                "restore_backup: {table} row {row_index} column {} cannot be null (PO-SHELL-009)",
                column.name
            ));
        }
        return Ok(SqlValue::Null);
    }

    let invalid = || {
        format!(
            "restore_backup: incompatible value for {table} row {row_index} column {} (PO-SHELL-009)",
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
            "complete-backup".to_string(),
            rusqlite::types::Type::Blob,
        )),
    }
}

fn quote_identifier(identifier: &str) -> String {
    format!("\"{}\"", identifier.replace('\"', "\"\""))
}
