use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_REPORT_EXPORT_BYTES: usize = 60 * 1024 * 1024;

#[derive(Debug, Clone)]
struct ReportSaveTarget {
    path: PathBuf,
    display_path: String,
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
    let target = ensure_kind_extension(target, kind.as_str());
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
    let target = ensure_kind_extension(target, kind.as_str());
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

    std::fs::write(&target.path, &bytes).map_err(|error| {
        format!(
            "failed to write report export ({}): {error}",
            target.path.display()
        )
    })?;

    Ok(ReportSaveGrant {
        save_target_id: grant_id,
        display_path: target.display_path,
    })
}

fn ensure_kind_extension(mut target: PathBuf, kind: &str) -> PathBuf {
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_some()
    {
        return target;
    }
    match kind {
        "pdf" | "png" | "csv" => {
            target.set_extension(kind);
        }
        _ => {}
    }
    target
}

fn display_only_path(target: &std::path::Path) -> String {
    target
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| "report-export".to_string())
}

fn next_save_target_id() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0);
    format!("parentos-report-save-{}-{millis}", std::process::id())
}
