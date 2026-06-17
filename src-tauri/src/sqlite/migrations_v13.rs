use rusqlite::Connection;

/// Schema v13: introduce the canonical PO-HREC health record event/value
/// storage pair admitted by `local-storage.yaml`.
///
/// ParentOS is pre-alpha and the current storage baseline has no admitted
/// pre-cutover data migration path. This migration creates only canonical
/// tables and indexes. Retired folded tables are not read, backfilled, or
/// treated as migration inputs.
pub(super) fn apply_v13(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(HEALTH_RECORD_STORAGE_SQL)
        .map_err(|e| format!("migration v13 create health record storage failed: {e}"))?;
    Ok(())
}

const HEALTH_RECORD_STORAGE_SQL: &str = "
    CREATE TABLE IF NOT EXISTS health_record_events (
        eventId               TEXT PRIMARY KEY,
        childId               TEXT NOT NULL REFERENCES children(childId) ON DELETE CASCADE,
        protocolId            TEXT NOT NULL,
        groupId               TEXT NOT NULL,
        recordKind            TEXT NOT NULL CHECK (recordKind IN ('manual', 'imported', 'ocr_confirmed', 'reminder_linked', 'derived')),
        sourceSurface         TEXT NOT NULL CHECK (sourceSurface IN ('profile_console', 'profile_detail', 'reminder', 'ocr_tool', 'import')),
        recordedAt            TEXT NOT NULL,
        effectiveDate         TEXT NOT NULL,
        ageMonths             INTEGER NOT NULL,
        recorderId            TEXT,
        linkedReminderStateId TEXT REFERENCES reminder_states(stateId) ON DELETE SET NULL,
        linkedReminderRuleId  TEXT,
        notes                 TEXT,
        metadataJson          TEXT,
        createdAt             TEXT NOT NULL,
        updatedAt             TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_health_record_events_child_effective_date
        ON health_record_events(childId, effectiveDate);
    CREATE INDEX IF NOT EXISTS idx_health_record_events_child_group_effective_date
        ON health_record_events(childId, groupId, effectiveDate);
    CREATE INDEX IF NOT EXISTS idx_health_record_events_child_linked_reminder_state
        ON health_record_events(childId, linkedReminderStateId);
    CREATE INDEX IF NOT EXISTS idx_health_record_events_protocol
        ON health_record_events(protocolId);

    CREATE TABLE IF NOT EXISTS health_record_values (
        valueId        TEXT PRIMARY KEY,
        eventId        TEXT NOT NULL REFERENCES health_record_events(eventId) ON DELETE CASCADE,
        childId        TEXT NOT NULL REFERENCES children(childId) ON DELETE CASCADE,
        metricId       TEXT NOT NULL,
        valueNumber    REAL,
        valueText      TEXT,
        valueJson      TEXT,
        unit           TEXT,
        qualifier      TEXT,
        recordKind     TEXT NOT NULL CHECK (recordKind IN ('measured', 'derived', 'parent_confirmed_import')),
        sourceValueIds TEXT,
        createdAt      TEXT NOT NULL,
        CHECK (valueNumber IS NOT NULL OR valueText IS NOT NULL OR valueJson IS NOT NULL)
    );

    CREATE INDEX IF NOT EXISTS idx_health_record_values_event
        ON health_record_values(eventId);
    CREATE INDEX IF NOT EXISTS idx_health_record_values_child_metric
        ON health_record_values(childId, metricId);
    CREATE INDEX IF NOT EXISTS idx_health_record_values_child_metric_created_at
        ON health_record_values(childId, metricId, createdAt);
";
