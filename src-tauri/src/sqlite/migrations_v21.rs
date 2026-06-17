use rusqlite::{params, Connection};

/// Schema v21: enforce the hard-cut retirement of `growth_measurements`.
///
/// The current ParentOS baseline uses `health_record_events` +
/// `health_record_values` only. A `growth_measurements` table in a runtime
/// database is an unsupported local artifact; silently dropping it would be an
/// ungated destructive action, and silently backfilling it would re-admit
/// historical migration semantics. Fail closed instead.
pub(super) fn apply_v21(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
            params!["growth_measurements"],
            |row| row.get(0),
        )
        .map_err(|e| format!("migration v21 check retired growth_measurements table failed: {e}"))?;

    if count > 0 {
        return Err(
            "migration v21 rejects retired table growth_measurements; current ParentOS baseline has no admitted historical backfill or destructive drop path"
                .to_string(),
        );
    }

    Ok(())
}
