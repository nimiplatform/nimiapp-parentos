use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_REPORT_EXPORT_BYTES: usize = 60 * 1024 * 1024;
const REPORT_SAVE_GRANT_TTL_MS: u128 = 5 * 60 * 1000;

#[derive(Debug, Clone)]
struct ReportSaveTarget {
    path: PathBuf,
    display_path: String,
    expires_at_epoch_ms: u128,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportSaveGrant {
    save_target_id: String,
    display_path: String,
}

static REPORT_SAVE_TARGETS: OnceLock<Mutex<HashMap<String, ReportSaveTarget>>> = OnceLock::new();

fn save_targets() -> &'static Mutex<HashMap<String, ReportSaveTarget>> {
    REPORT_SAVE_TARGETS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn picker_start_dir() -> PathBuf {
    dirs::document_dir()
        .or_else(dirs::download_dir)
        .or_else(dirs::home_dir)
        .unwrap_or_else(std::env::temp_dir)
}

fn filter_for_kind(kind: &str) -> (&'static str, &'static [&'static str]) {
    match kind {
        "pdf" => ("PDF Document", &["pdf"]),
        "png" => ("PNG Image", &["png"]),
        "csv" => ("CSV File", &["csv"]),
        _ => ("File", &["*"]),
    }
}

/// Opens the OS-native "Save as" dialog without producing any file
/// content. Returning the chosen path up front lets the renderer show
/// the dialog *immediately* on click — render + encode then happens
/// while the user is already committed to a destination.
///
/// Returns `Ok(None)` if the user cancels.
#[tauri::command]
pub fn report_export_create_save_grant(
    default_filename: String,
    kind: String,
    title: Option<String>,
) -> Result<Option<ReportSaveGrant>, String> {
    let trimmed_filename = default_filename.trim();
    if trimmed_filename.is_empty() {
        return Err("default filename is required".to_string());
    }

    let (filter_label, filter_exts) = filter_for_kind(kind.as_str());
    let dialog = rfd::FileDialog::new()
        .set_directory(picker_start_dir())
        .set_file_name(trimmed_filename)
        .set_title(title.as_deref().unwrap_or("保存报告"))
        .add_filter(filter_label, filter_exts);

    let Some(target) = dialog.save_file() else {
        return Ok(None);
    };
    let target = ensure_kind_extension(target, kind.as_str())?;
    if !target.is_absolute() {
        return Err("report save target must be absolute".to_string());
    }
    let display_path = display_only_path(&target);
    let save_target_id = next_save_target_id();
    save_targets()
        .lock()
        .map_err(|error| error.to_string())?
        .insert(
            save_target_id.clone(),
            ReportSaveTarget {
                path: target,
                display_path: display_path.clone(),
                expires_at_epoch_ms: current_epoch_millis() + REPORT_SAVE_GRANT_TTL_MS,
            },
        );
    Ok(Some(ReportSaveGrant {
        save_target_id,
        display_path,
    }))
}

/// Registers a native-host-selected report save target as a one-shot grant.
#[allow(dead_code)]
pub fn register_report_save_grant(
    save_target_id: String,
    target: PathBuf,
    kind: String,
    display_path: Option<String>,
) -> Result<ReportSaveGrant, String> {
    let grant_id = save_target_id.trim().to_string();
    if grant_id.is_empty() {
        return Err("report save target grant id is required".to_string());
    }
    let target = ensure_kind_extension(target, kind.as_str())?;
    if !target.is_absolute() {
        return Err("report save target must be absolute".to_string());
    }
    let display_path = display_path
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| display_only_path(&target));
    save_targets()
        .lock()
        .map_err(|error| error.to_string())?
        .insert(
            grant_id.clone(),
            ReportSaveTarget {
                path: target,
                display_path: display_path.clone(),
                expires_at_epoch_ms: current_epoch_millis() + REPORT_SAVE_GRANT_TTL_MS,
            },
        );
    Ok(ReportSaveGrant {
        save_target_id: grant_id,
        display_path,
    })
}

#[tauri::command]
pub fn report_export_write_grant(
    save_target_id: String,
    base64_data: String,
) -> Result<ReportSaveGrant, String> {
    let bytes = BASE64_STANDARD
        .decode(base64_data.as_bytes())
        .map_err(|error| format!("invalid base64 payload: {error}"))?;
    if bytes.is_empty() {
        return Err("report export payload is empty".to_string());
    }
    if bytes.len() > MAX_REPORT_EXPORT_BYTES {
        return Err(format!(
            "report export exceeds {} byte limit",
            MAX_REPORT_EXPORT_BYTES
        ));
    }

    let grant_id = save_target_id.trim().to_string();
    let target = save_targets()
        .lock()
        .map_err(|error| error.to_string())?
        .remove(&grant_id)
        .ok_or_else(|| "report save target grant is missing or already consumed".to_string())?;

    if current_epoch_millis() > target.expires_at_epoch_ms {
        return Err("report save target grant expired".to_string());
    }

    atomic_write_report_export(&target.path, &bytes)?;

    Ok(ReportSaveGrant {
        save_target_id: grant_id,
        display_path: target.display_path,
    })
}

fn ensure_kind_extension(mut target: PathBuf, kind: &str) -> Result<PathBuf, String> {
    if let Some(extension) = target.extension().and_then(|value| value.to_str()) {
        return match kind {
            "pdf" | "png" | "csv" if extension.eq_ignore_ascii_case(kind) => Ok(target),
            "pdf" | "png" | "csv" => Err(format!(
                "report save target extension .{} does not match report kind {}",
                extension, kind
            )),
            _ => Ok(target),
        };
    }
    match kind {
        "pdf" | "png" | "csv" => {
            target.set_extension(kind);
        }
        _ => {}
    }
    Ok(target)
}

fn atomic_write_report_export(target: &std::path::Path, bytes: &[u8]) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "report save target parent directory is missing".to_string())?;
    let mut temp_file = tempfile::NamedTempFile::new_in(parent).map_err(|error| {
        format!(
            "failed to create temporary report export beside {}: {error}",
            target.display()
        )
    })?;
    temp_file.write_all(bytes).map_err(|error| {
        format!(
            "failed to write temporary report export beside {}: {error}",
            target.display()
        )
    })?;
    temp_file.flush().map_err(|error| {
        format!(
            "failed to flush temporary report export beside {}: {error}",
            target.display()
        )
    })?;
    temp_file.as_file().sync_all().map_err(|error| {
        format!(
            "failed to sync temporary report export beside {}: {error}",
            target.display()
        )
    })?;
    temp_file.persist(target).map_err(|error| {
        format!(
            "failed to persist report export ({}): {}",
            target.display(),
            error.error
        )
    })?;
    Ok(())
}

fn display_only_path(target: &std::path::Path) -> String {
    target
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| "report-export".to_string())
}

fn next_save_target_id() -> String {
    let millis = current_epoch_millis();
    format!("parentos-report-save-{}-{millis}", std::process::id())
}

fn current_epoch_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_grant_rejects_wrong_extension_for_known_kind() {
        let target = std::env::temp_dir().join(format!(
            "parentos-report-wrong-extension-{}.txt",
            std::process::id()
        ));

        let result = register_report_save_grant(
            "wrong-extension-grant".to_string(),
            target,
            "pdf".to_string(),
            None,
        );

        assert!(
            result.is_err(),
            "report save grants must fail closed when the selected path extension does not match the report kind"
        );
    }

    #[test]
    fn write_grant_rejects_expired_targets() {
        let grant_id = format!("expired-grant-{}", std::process::id());
        let target = std::env::temp_dir().join(format!(
            "parentos-expired-report-{}.pdf",
            std::process::id()
        ));
        save_targets()
            .lock()
            .expect("report save target lock")
            .insert(
                grant_id.clone(),
                ReportSaveTarget {
                    path: target,
                    display_path: "expired-report.pdf".to_string(),
                    expires_at_epoch_ms: current_epoch_millis()
                        .saturating_sub(REPORT_SAVE_GRANT_TTL_MS + 1),
                },
            );

        let payload = BASE64_STANDARD.encode(b"%PDF-1.7");
        let result = report_export_write_grant(grant_id, payload);

        assert!(
            result.is_err(),
            "expired report save grants must not be accepted as reusable raw path authority"
        );
    }

    #[test]
    fn write_grant_consumes_target_once_and_rejects_reuse() {
        let grant_id = format!("one-shot-grant-{}", std::process::id());
        let target = std::env::temp_dir().join(format!(
            "parentos-one-shot-report-{}.pdf",
            std::process::id()
        ));
        let _ = std::fs::remove_file(&target);
        let grant = register_report_save_grant(
            grant_id.clone(),
            target.clone(),
            "pdf".to_string(),
            Some("display-only-report.pdf".to_string()),
        )
        .expect("register report save grant");

        let payload = BASE64_STANDARD.encode(b"%PDF-1.7 one shot");
        let first = report_export_write_grant(grant.save_target_id.clone(), payload.clone())
            .expect("first grant write succeeds");
        let second = report_export_write_grant(grant.save_target_id, payload)
            .expect_err("report save grant must be consumed after the first write");

        assert_eq!(first.display_path, "display-only-report.pdf");
        assert_eq!(
            std::fs::read(&target).expect("read written report"),
            b"%PDF-1.7 one shot"
        );
        assert!(second.contains("missing") || second.contains("consumed"));
        let _ = std::fs::remove_file(&target);
    }

    #[test]
    fn write_grant_rejects_display_path_replay() {
        let grant_id = format!("display-replay-grant-{}", std::process::id());
        let target = std::env::temp_dir().join(format!(
            "parentos-display-replay-report-{}.pdf",
            std::process::id()
        ));
        let grant = register_report_save_grant(
            grant_id,
            target,
            "pdf".to_string(),
            Some("display-only-report.pdf".to_string()),
        )
        .expect("register report save grant");

        let result = report_export_write_grant(
            grant.display_path.clone(),
            BASE64_STANDARD.encode(b"%PDF-1.7"),
        );

        assert!(
            result.is_err(),
            "displayPath must not replay as raw path or grant authority"
        );
    }

    #[test]
    fn write_grant_rejects_oversized_payload_before_consuming_target() {
        let grant_id = format!("oversized-grant-{}", std::process::id());
        let target = std::env::temp_dir().join(format!(
            "parentos-oversized-report-{}.pdf",
            std::process::id()
        ));
        let grant = register_report_save_grant(grant_id, target.clone(), "pdf".to_string(), None)
            .expect("register report save grant");
        let payload = BASE64_STANDARD.encode(vec![b'a'; MAX_REPORT_EXPORT_BYTES + 1]);

        let result = report_export_write_grant(grant.save_target_id.clone(), payload);
        let second_try =
            report_export_write_grant(grant.save_target_id, BASE64_STANDARD.encode(b"%PDF-1.7"));

        assert!(result
            .expect_err("oversized payload must fail")
            .contains("exceeds"));
        assert!(
            second_try.is_ok(),
            "oversized payload rejection must not consume the host-owned save grant"
        );
        let _ = std::fs::remove_file(&target);
    }
}
