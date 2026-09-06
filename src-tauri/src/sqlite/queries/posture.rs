use rusqlite::params;
use serde::Serialize;

use super::super::get_conn;

include!("posture-record-data-rules.gen.rs");

// ── Posture Assessments (retained-owner domain, rule.parentos.prof.r019) ──

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostureAssessment {
    pub assessment_id: String,
    pub child_id: String,
    pub assessed_at: String,
    pub age_months: i32,
    pub source: Option<String>,
    pub shoulder: Option<String>,
    pub scapula: Option<String>,
    pub hip: Option<String>,
    pub leg: Option<String>,
    pub heel: Option<String>,
    pub neck: Option<String>,
    pub pelvis: Option<String>,
    pub knee: Option<String>,
    pub adam: Option<String>,
    pub cobb_angle: Option<f64>,
    pub notes: Option<String>,
    pub photo_paths: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

fn validate_posture_record_data_rule_id(rule_id: &str) -> Result<(), String> {
    if POSTURE_RECORD_DATA_RULE_IDS.contains(&rule_id) {
        Ok(())
    } else {
        Err(format!(
            "insert_posture_assessment: ruleId '{rule_id}' is not an admitted posture record_data reminder rule"
        ))
    }
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn insert_posture_assessment(
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
    linked_reminder_state_id: Option<String>,
    linked_reminder_rule_id: Option<String>,
    linked_reminder_repeat_index: Option<i32>,
) -> Result<(), String> {
    let mut conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    insert_posture_assessment_with_conn(
        &mut conn,
        assessment_id,
        child_id,
        assessed_at,
        age_months,
        source,
        shoulder,
        scapula,
        hip,
        leg,
        heel,
        neck,
        pelvis,
        knee,
        adam,
        cobb_angle,
        notes,
        photo_paths,
        now,
        linked_reminder_state_id,
        linked_reminder_rule_id,
        linked_reminder_repeat_index,
    )
}

/// PO-CAPT-005 / PO-REMI-013: a reminder-linked posture capture persists the
/// posture_assessments row and completes the bound reminder in one transaction,
/// mirroring insert_vaccine_record_with_conn. An unlinked capture (profile add
/// record) leaves reminder_states untouched.
#[allow(clippy::too_many_arguments)]
// @nimi-authority: rule.parentos.capt.r005
// @nimi-authority: rule.parentos.prof.r019
pub(crate) fn insert_posture_assessment_with_conn(
    conn: &mut rusqlite::Connection,
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
    linked_reminder_state_id: Option<String>,
    linked_reminder_rule_id: Option<String>,
    linked_reminder_repeat_index: Option<i32>,
) -> Result<(), String> {
    let date = chrono::NaiveDate::parse_from_str(&assessed_at, "%Y-%m-%d").map_err(|_| {
        "insert_posture_assessment: assessedAt must be a valid ISO date".to_string()
    })?;
    if date.format("%Y-%m-%d").to_string() != assessed_at {
        return Err("insert_posture_assessment: assessedAt must be a valid ISO date".to_string());
    }
    if cobb_angle.is_some_and(|value| !value.is_finite()) {
        return Err("insert_posture_assessment: cobbAngle must be finite".to_string());
    }
    let photos = photo_paths
        .as_deref()
        .map(serde_json::from_str::<Vec<String>>)
        .transpose()
        .map_err(|_| {
            "insert_posture_assessment: photoPaths must be a JSON string array".to_string()
        })?;
    let has_observation = [
        &shoulder, &scapula, &hip, &leg, &heel, &neck, &pelvis, &knee, &adam, &notes,
    ]
    .iter()
    .any(|value| {
        value
            .as_deref()
            .is_some_and(|value| !value.trim().is_empty())
    });
    let has_photo = photos
        .as_ref()
        .is_some_and(|photos| photos.iter().any(|photo| !photo.trim().is_empty()));
    if !has_observation && cobb_angle.is_none() && !has_photo {
        return Err("insert_posture_assessment: assessment content is required".to_string());
    }

    let linked = match (
        linked_reminder_state_id,
        linked_reminder_rule_id,
        linked_reminder_repeat_index,
    ) {
        (None, None, None) => None,
        (Some(state_id), Some(rule_id), Some(repeat_index)) => {
            if repeat_index < 0 {
                return Err(format!(
                    "insert_posture_assessment: linkedReminderRepeatIndex must be >= 0, got {repeat_index}"
                ));
            }
            validate_posture_record_data_rule_id(&rule_id)?;
            Some((state_id, rule_id, repeat_index))
        }
        _ => {
            return Err(
                "insert_posture_assessment reminder-linked writes require linkedReminderStateId, linkedReminderRuleId and linkedReminderRepeatIndex together"
                    .to_string(),
            );
        }
    };

    if let Some((state_id, rule_id, repeat_index)) = linked {
        let tx = conn
            .transaction()
            .map_err(|e| format!("insert_posture_assessment begin transaction: {e}"))?;
        insert_posture_assessment_row(
            &tx,
            &assessment_id,
            &child_id,
            &assessed_at,
            age_months,
            &source,
            &shoulder,
            &scapula,
            &hip,
            &leg,
            &heel,
            &neck,
            &pelvis,
            &knee,
            &adam,
            cobb_angle,
            &notes,
            &photo_paths,
            &now,
        )?;
        tx.execute(
            "INSERT INTO reminder_states (
                stateId, childId, ruleId, status, activatedAt, completedAt, dismissedAt,
                dismissReason, repeatIndex, nextTriggerAt, snoozedUntil, scheduledDate,
                notApplicable, plannedForDate, surfaceRank, lastSurfacedAt, surfaceCount,
                notes, acknowledgedAt, reflectedAt, practiceStartedAt, practiceLastAt,
                practiceCount, practiceHabituatedAt, consultedAt, consultationConversationId,
                createdAt, updatedAt
             ) VALUES (?1, ?2, ?3, 'completed', NULL, ?4, NULL, NULL, ?5, NULL, NULL,
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
            params![state_id, child_id, rule_id, now, repeat_index],
        )
        .map_err(|e| format!("insert_posture_assessment complete reminder: {e}"))?;
        tx.commit()
            .map_err(|e| format!("insert_posture_assessment commit: {e}"))?;
        return Ok(());
    }

    conn.execute(
        "INSERT INTO posture_assessments
         (assessmentId, childId, assessedAt, ageMonths, source, shoulder, scapula, hip, leg, heel,
          neck, pelvis, knee, adam, cobbAngle, notes, photoPaths, createdAt, updatedAt)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?18)",
        params![
            assessment_id,
            child_id,
            assessed_at,
            age_months,
            source,
            shoulder,
            scapula,
            hip,
            leg,
            heel,
            neck,
            pelvis,
            knee,
            adam,
            cobb_angle,
            notes,
            photo_paths,
            now
        ],
    )
    .map_err(|e| format!("insert_posture_assessment: {e}"))?;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn insert_posture_assessment_row(
    tx: &rusqlite::Transaction<'_>,
    assessment_id: &str,
    child_id: &str,
    assessed_at: &str,
    age_months: i32,
    source: &Option<String>,
    shoulder: &Option<String>,
    scapula: &Option<String>,
    hip: &Option<String>,
    leg: &Option<String>,
    heel: &Option<String>,
    neck: &Option<String>,
    pelvis: &Option<String>,
    knee: &Option<String>,
    adam: &Option<String>,
    cobb_angle: Option<f64>,
    notes: &Option<String>,
    photo_paths: &Option<String>,
    now: &str,
) -> Result<(), String> {
    tx.execute(
        "INSERT INTO posture_assessments
         (assessmentId, childId, assessedAt, ageMonths, source, shoulder, scapula, hip, leg, heel,
          neck, pelvis, knee, adam, cobbAngle, notes, photoPaths, createdAt, updatedAt)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?18)",
        params![
            assessment_id,
            child_id,
            assessed_at,
            age_months,
            source,
            shoulder,
            scapula,
            hip,
            leg,
            heel,
            neck,
            pelvis,
            knee,
            adam,
            cobb_angle,
            notes,
            photo_paths,
            now
        ],
    )
    .map_err(|e| format!("insert_posture_assessment: {e}"))?;
    Ok(())
}

#[tauri::command]
pub fn get_posture_assessments(child_id: String) -> Result<Vec<PostureAssessment>, String> {
    let conn = get_conn()?.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT assessmentId, childId, assessedAt, ageMonths, source, shoulder, scapula, hip,
                    leg, heel, neck, pelvis, knee, adam, cobbAngle, notes, photoPaths,
                    createdAt, updatedAt
             FROM posture_assessments
             WHERE childId = ?1
             ORDER BY assessedAt DESC, createdAt DESC",
        )
        .map_err(|e| format!("get_posture_assessments: {e}"))?;
    let rows = stmt
        .query_map(params![child_id], |row| {
            Ok(PostureAssessment {
                assessment_id: row.get(0)?,
                child_id: row.get(1)?,
                assessed_at: row.get(2)?,
                age_months: row.get(3)?,
                source: row.get(4)?,
                shoulder: row.get(5)?,
                scapula: row.get(6)?,
                hip: row.get(7)?,
                leg: row.get(8)?,
                heel: row.get(9)?,
                neck: row.get(10)?,
                pelvis: row.get(11)?,
                knee: row.get(12)?,
                adam: row.get(13)?,
                cobb_angle: row.get(14)?,
                notes: row.get(15)?,
                photo_paths: row.get(16)?,
                created_at: row.get(17)?,
                updated_at: row.get(18)?,
            })
        })
        .map_err(|e| format!("get_posture_assessments: {e}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("get_posture_assessments collect: {e}"))
}

#[cfg(test)]
mod posture_record_data_tests {
    use super::insert_posture_assessment_with_conn;
    use rusqlite::Connection;

    fn setup_tables() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory db");
        conn.execute_batch(
            "CREATE TABLE posture_assessments (
                assessmentId TEXT PRIMARY KEY,
                childId TEXT NOT NULL,
                assessedAt TEXT NOT NULL,
                ageMonths INTEGER NOT NULL,
                source TEXT,
                shoulder TEXT,
                scapula TEXT,
                hip TEXT,
                leg TEXT,
                heel TEXT,
                neck TEXT,
                pelvis TEXT,
                knee TEXT,
                adam TEXT,
                cobbAngle REAL,
                notes TEXT,
                photoPaths TEXT,
                createdAt TEXT NOT NULL,
                updatedAt TEXT NOT NULL
            );
            CREATE TABLE reminder_states (
                stateId TEXT PRIMARY KEY,
                childId TEXT NOT NULL,
                ruleId TEXT NOT NULL,
                status TEXT NOT NULL,
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
                UNIQUE (childId, ruleId, repeatIndex)
            );",
        )
        .expect("create posture + reminder tables");
        conn
    }

    fn insert(
        conn: &mut Connection,
        linked: Option<(Option<String>, Option<String>, Option<i32>)>,
    ) -> Result<(), String> {
        let (state_id, rule_id, repeat_index) = linked.unwrap_or((None, None, None));
        insert_posture_assessment_with_conn(
            conn,
            "01J6E5YB3W0000000000000100".to_string(),
            "01J6E5YB3W0000000000000101".to_string(),
            "2026-09-03".to_string(),
            192,
            Some("parent".to_string()),
            Some("0".to_string()),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            "2026-09-03T10:00:00+08:00".to_string(),
            state_id,
            rule_id,
            repeat_index,
        )
    }

    fn reminder_row(conn: &Connection) -> (String, Option<String>, i64) {
        conn.query_row(
            "SELECT status, completedAt, repeatIndex FROM reminder_states",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("read reminder state")
    }

    #[test]
    fn linked_insert_completes_reminder_atomically() {
        let mut conn = setup_tables();
        insert(
            &mut conn,
            Some((
                Some("01J6E5YB3W0000000000000200".to_string()),
                Some("PO-REM-POS-003".to_string()),
                Some(3),
            )),
        )
        .expect("linked insert succeeds");

        let posture_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM posture_assessments", [], |row| {
                row.get(0)
            })
            .expect("count posture rows");
        assert_eq!(posture_count, 1);
        let (status, completed_at, repeat_index) = reminder_row(&conn);
        assert_eq!(status, "completed");
        assert!(completed_at.is_some());
        assert_eq!(repeat_index, 3);
    }

    #[test]
    fn linked_insert_upserts_existing_repeat_row() {
        let mut conn = setup_tables();
        conn.execute(
            "INSERT INTO reminder_states (
                stateId, childId, ruleId, status, activatedAt, completedAt, dismissedAt,
                dismissReason, repeatIndex, nextTriggerAt, snoozedUntil, scheduledDate,
                notApplicable, plannedForDate, surfaceRank, lastSurfacedAt, surfaceCount,
                notes, acknowledgedAt, reflectedAt, practiceStartedAt, practiceLastAt,
                practiceCount, practiceHabituatedAt, consultedAt, consultationConversationId,
                createdAt, updatedAt
             ) VALUES ('existing-state', '01J6E5YB3W0000000000000101', 'PO-REM-POS-004',
                'active', NULL, NULL, NULL, NULL, 7, NULL, '2026-09-10', NULL,
                0, NULL, NULL, NULL, 0, NULL, NULL, NULL, NULL, NULL, 0, NULL,
                NULL, NULL, '2026-09-01T00:00:00+08:00', '2026-09-01T00:00:00+08:00')",
            [],
        )
        .expect("seed pending reminder row");

        insert(
            &mut conn,
            Some((
                Some("01J6E5YB3W0000000000000201".to_string()),
                Some("PO-REM-POS-004".to_string()),
                Some(7),
            )),
        )
        .expect("linked insert succeeds");

        let row_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reminder_states", [], |row| row.get(0))
            .expect("count reminder rows");
        assert_eq!(row_count, 1, "upsert must not duplicate the repeat row");
        let (status, completed_at, repeat_index) = reminder_row(&conn);
        assert_eq!(status, "completed");
        assert!(completed_at.is_some());
        assert_eq!(repeat_index, 7);
        let snoozed: Option<String> = conn
            .query_row("SELECT snoozedUntil FROM reminder_states", [], |row| {
                row.get(0)
            })
            .expect("read snoozedUntil");
        assert_eq!(
            snoozed, None,
            "completion clears the snooze on that repeat row"
        );
    }

    #[test]
    fn unlinked_insert_leaves_reminder_states_untouched() {
        let mut conn = setup_tables();
        insert(&mut conn, None).expect("unlinked insert succeeds");

        let posture_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM posture_assessments", [], |row| {
                row.get(0)
            })
            .expect("count posture rows");
        let reminder_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reminder_states", [], |row| row.get(0))
            .expect("count reminder rows");
        assert_eq!(posture_count, 1);
        assert_eq!(reminder_count, 0);
    }

    #[test]
    fn partial_triple_fails_closed_without_posture_row() {
        let mut conn = setup_tables();
        let result = insert(
            &mut conn,
            Some((None, Some("PO-REM-POS-003".to_string()), Some(0))),
        );
        assert!(result.is_err());

        let posture_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM posture_assessments", [], |row| {
                row.get(0)
            })
            .expect("count posture rows");
        assert_eq!(
            posture_count, 0,
            "failed linked write must not persist a row"
        );
    }

    #[test]
    fn unadmitted_rule_id_fails_closed() {
        let mut conn = setup_tables();
        // PO-REM-POS-001 is an admitted posture rule but go_hospital, not record_data.
        let result = insert(
            &mut conn,
            Some((
                Some("01J6E5YB3W0000000000000202".to_string()),
                Some("PO-REM-POS-001".to_string()),
                Some(0),
            )),
        );
        assert!(result.is_err());

        let posture_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM posture_assessments", [], |row| {
                row.get(0)
            })
            .expect("count posture rows");
        let reminder_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM reminder_states", [], |row| row.get(0))
            .expect("count reminder rows");
        assert_eq!(posture_count, 0);
        assert_eq!(reminder_count, 0);
    }
}
