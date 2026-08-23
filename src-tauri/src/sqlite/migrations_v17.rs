use std::collections::HashSet;

use rusqlite::Connection;
use serde::Deserialize;

/// Schema v17: purge orphan `reminder_states` rows whose ruleIds are not in
/// the compiled reminder catalog.
///
/// Pre-contract code paths (and in-flight migrations from older builds) can
/// leave `reminder_states` rows whose ruleId doesn't appear in any admitted
/// YAML source. After the v9 `dental-auto-*` purge and v3 dismissed-row
/// check, active rows with stale ruleIds can still survive — for example
/// when the orthodontic protocol catalog admitted `PO-ORTHO-*` rules under
/// a different id during early development. Those rows now trip the
/// PO-TIME-007 fail-close invariant in `buildReminderAgenda` and freeze the
/// timeline / reminders pages. This migration deletes them so the UI stays
/// usable without weakening the runtime fail-close contract.
///
/// Catalog union (must mirror the `generate-knowledge-base.ts` compile step):
///
///   - `data/structured/parentos/reminder-rules.yaml`           — base catalog
///   - `data/structured/parentos/reminder-rules-extended.yaml`  — extended catalog
///   - `data/structured/parentos/orthodontic-protocols.yaml`    — `PO-ORTHO-*` and `PO-DEN-FOLLOWUP-*`
///
/// Idempotent: a no-op when `reminder_states` has no orphans, which is the
/// expected steady state after this migration runs once.
pub(super) fn apply_v17(conn: &Connection) -> Result<(), String> {
    let admitted = load_admitted_rule_ids()?;
    purge_orphan_reminder_states_against_set(conn, &admitted)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReminderRulesYaml {
    rules: Vec<RuleIdRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OrthodonticProtocolsYaml {
    rules: Vec<RuleIdRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuleIdRecord {
    rule_id: String,
}

fn load_admitted_rule_ids() -> Result<HashSet<String>, String> {
    let base: ReminderRulesYaml = serde_yaml::from_str(include_str!(
        "../../../data/structured/parentos/reminder-rules.yaml",
    ))
    .map_err(|e| {
        format!("migration v17 parse data/structured/parentos/reminder-rules.yaml failed: {e}")
    })?;
    let extended: ReminderRulesYaml = serde_yaml::from_str(include_str!(
        "../../../data/structured/parentos/reminder-rules-extended.yaml",
    ))
    .map_err(|e| {
        format!(
            "migration v17 parse data/structured/parentos/reminder-rules-extended.yaml failed: {e}"
        )
    })?;
    let ortho: OrthodonticProtocolsYaml = serde_yaml::from_str(include_str!(
        "../../../data/structured/parentos/orthodontic-protocols.yaml",
    ))
    .map_err(|e| {
        format!(
            "migration v17 parse data/structured/parentos/orthodontic-protocols.yaml failed: {e}"
        )
    })?;

    let mut set = HashSet::new();
    for record in base.rules {
        set.insert(record.rule_id);
    }
    for record in extended.rules {
        set.insert(record.rule_id);
    }
    for record in ortho.rules {
        set.insert(record.rule_id);
    }
    Ok(set)
}

// @nimi-authority: rule.parentos.time.r007
pub(crate) fn validate_persisted_reminder_states_for_rule_ids(
    conn: &Connection,
    admitted_rule_ids: &[String],
) -> Result<(), String> {
    if admitted_rule_ids.is_empty() {
        return Err("runtime reminder catalog must not be empty (PO-TIME-007)".to_string());
    }

    let mut admitted = HashSet::with_capacity(admitted_rule_ids.len());
    for rule_id in admitted_rule_ids {
        if rule_id.is_empty() || rule_id.trim() != rule_id {
            return Err(format!(
                "runtime reminder catalog contains invalid ruleId '{rule_id}' (PO-TIME-007)"
            ));
        }
        if !admitted.insert(rule_id.clone()) {
            return Err(format!(
                "runtime reminder catalog contains duplicate ruleId '{rule_id}' (PO-TIME-007)"
            ));
        }
    }

    let mut orphan_rule_ids = find_orphan_reminder_rule_ids(conn, &admitted)?;
    if orphan_rule_ids.is_empty() {
        return Ok(());
    }

    orphan_rule_ids.sort();
    Err(format!(
        "persisted reminder_states reference unknown ruleId(s): {} (PO-TIME-007)",
        orphan_rule_ids.join(", ")
    ))
}

fn find_orphan_reminder_rule_ids(
    conn: &Connection,
    admitted: &HashSet<String>,
) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare("SELECT DISTINCT ruleId FROM reminder_states")
        .map_err(|e| format!("migration v17 prepare reminder_states scan failed: {e}"))?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| format!("migration v17 query reminder_states ruleIds failed: {e}"))?;

    let mut orphan_rule_ids: Vec<String> = Vec::new();
    for row in rows {
        let rule_id =
            row.map_err(|e| format!("migration v17 read reminder_states ruleId failed: {e}"))?;
        if !admitted.contains(&rule_id) {
            orphan_rule_ids.push(rule_id);
        }
    }

    Ok(orphan_rule_ids)
}

fn purge_orphan_reminder_states_against_set(
    conn: &Connection,
    admitted: &HashSet<String>,
) -> Result<(), String> {
    for rule_id in find_orphan_reminder_rule_ids(conn, admitted)? {
        conn.execute("DELETE FROM reminder_states WHERE ruleId = ?1", [&rule_id])
            .map_err(|e| format!("migration v17 purge ruleId '{rule_id}' failed: {e}"))?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_persisted_reminder_states_for_rule_ids;
    use rusqlite::{params, Connection};

    #[test]
    fn runtime_catalog_fails_closed_without_deleting_unknown_rule_ids() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE reminder_states (
                stateId TEXT PRIMARY KEY,
                ruleId TEXT NOT NULL
            );",
        )
        .expect("create reminder_states");
        for (state_id, rule_id) in [
            ("state-admitted", "PO-REM-VAC-001"),
            ("state-unknown", "PO-REM-UNKNOWN-001"),
        ] {
            conn.execute(
                "INSERT INTO reminder_states (stateId, ruleId) VALUES (?1, ?2)",
                params![state_id, rule_id],
            )
            .expect("insert reminder state");
        }

        let error =
            validate_persisted_reminder_states_for_rule_ids(&conn, &["PO-REM-VAC-001".to_string()])
                .expect_err("unknown persisted ruleIds must fail closed");
        assert!(error.contains("PO-REM-UNKNOWN-001"));
        assert!(error.contains("PO-TIME-007"));

        let remaining: Vec<String> = conn
            .prepare("SELECT ruleId FROM reminder_states ORDER BY ruleId")
            .expect("prepare remaining ruleIds")
            .query_map([], |row| row.get(0))
            .expect("query remaining ruleIds")
            .collect::<Result<_, _>>()
            .expect("read remaining ruleIds");
        assert_eq!(remaining, vec!["PO-REM-UNKNOWN-001", "PO-REM-VAC-001"]);
    }

    #[test]
    fn runtime_catalog_rejects_empty_input() {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE reminder_states (
                stateId TEXT PRIMARY KEY,
                ruleId TEXT NOT NULL
            );",
        )
        .expect("create reminder_states");

        let error = validate_persisted_reminder_states_for_rule_ids(&conn, &[])
            .expect_err("empty catalog must fail closed");
        assert!(error.contains("PO-TIME-007"));
    }
}
