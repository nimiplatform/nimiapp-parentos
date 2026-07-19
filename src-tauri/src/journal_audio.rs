use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::app_storage;
use crate::media_storage::{decode_bounded_base64, write_media_file, MAX_AUDIO_OBJECT_BYTES};

const JOURNAL_AUDIO_DIR: &str = "journal/audio";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedJournalVoiceAudio {
    pub path: String,
}

fn resolve_audio_root() -> Result<PathBuf, String> {
    let root = app_storage::data_child_path(JOURNAL_AUDIO_DIR)?;
    fs::create_dir_all(&root).map_err(|error| {
        format!(
            "failed to create journal audio dir ({}): {error}",
            root.display()
        )
    })?;
    Ok(root)
}

fn sanitize_segment(value: &str, label: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{label} must not be empty"));
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(format!("{label} must not contain path separators"));
    }
    Ok(trimmed.to_string())
}

fn delete_child_dir_at(root: &Path, child_id: &str) -> Result<(), String> {
    let child_id = sanitize_segment(child_id, "child_id")?;
    let dir = root.join(child_id);
    match fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!(
            "failed to delete child journal audio dir ({}): {error}",
            dir.display()
        )),
    }
}

fn extension_for_mime_type(mime_type: &str) -> Result<&'static str, String> {
    match mime_type.trim().to_ascii_lowercase().as_str() {
        "audio/webm" | "audio/webm;codecs=opus" => Ok("webm"),
        "audio/ogg" | "audio/ogg;codecs=opus" => Ok("ogg"),
        "audio/wav" | "audio/wave" | "audio/x-wav" => Ok("wav"),
        "audio/mp4" | "audio/aac" | "audio/x-m4a" => Ok("m4a"),
        "audio/mpeg" => Ok("mp3"),
        unsupported => Err(format!(
            "unsupported journal voice mime type: {unsupported}"
        )),
    }
}

fn ensure_audio_path_is_owned(path: &Path) -> Result<(), String> {
    let root = resolve_audio_root()?;
    if path.exists() {
        let canonical_root = root
            .canonicalize()
            .map_err(|error| format!("failed to canonicalize journal audio root: {error}"))?;
        let canonical_path = path
            .canonicalize()
            .map_err(|error| format!("failed to canonicalize journal audio path: {error}"))?;
        if canonical_path.starts_with(&canonical_root) {
            return Ok(());
        }
    } else if path.starts_with(&root) {
        return Ok(());
    }
    Err(format!(
        "journal voice path is outside owned storage root: {}",
        path.display()
    ))
}

#[tauri::command]
pub fn save_journal_voice_audio(
    child_id: String,
    entry_id: String,
    mime_type: String,
    audio_base64: String,
) -> Result<SavedJournalVoiceAudio, String> {
    let child_id = sanitize_segment(&child_id, "child_id")?;
    let entry_id = sanitize_segment(&entry_id, "entry_id")?;
    let extension = extension_for_mime_type(&mime_type)?;
    let audio_bytes =
        decode_bounded_base64(&audio_base64, "journal voice", MAX_AUDIO_OBJECT_BYTES)?;

    let child_dir = resolve_audio_root()?.join(&child_id);
    fs::create_dir_all(&child_dir).map_err(|error| {
        format!(
            "failed to create child journal audio dir ({}): {error}",
            child_dir.display()
        )
    })?;

    let file_path = child_dir.join(format!("{entry_id}.{extension}"));
    write_media_file(
        &app_storage::data_root()?,
        &file_path,
        &audio_bytes,
        "journal voice audio",
        MAX_AUDIO_OBJECT_BYTES,
    )?;

    Ok(SavedJournalVoiceAudio {
        path: file_path.display().to_string(),
    })
}

#[tauri::command]
pub fn delete_journal_voice_audio(path: String) -> Result<(), String> {
    let candidate = PathBuf::from(path.trim());
    if !candidate.is_absolute() {
        return Err("journal voice delete path must be absolute".to_string());
    }
    ensure_audio_path_is_owned(&candidate)?;
    if !candidate.exists() {
        return Ok(());
    }
    fs::remove_file(&candidate).map_err(|error| {
        format!(
            "failed to delete journal voice audio ({}): {error}",
            candidate.display()
        )
    })
}

pub fn delete_child_dir(child_id: &str) -> Result<(), String> {
    let root = resolve_audio_root()?;
    delete_child_dir_at(&root, child_id)
}

#[cfg(test)]
mod tests {
    use super::{delete_child_dir_at, delete_journal_voice_audio, save_journal_voice_audio};
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn rejects_unsupported_mime_types() {
        let result = save_journal_voice_audio(
            "child-1".to_string(),
            "entry-1".to_string(),
            "audio/unknown".to_string(),
            "YQ==".to_string(),
        );
        assert!(result.is_err());
    }

    #[test]
    fn delete_requires_absolute_path() {
        let result = delete_journal_voice_audio("relative/file.webm".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn delete_child_dir_purges_only_that_child() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::create_dir_all(root.join("child-A")).unwrap();
        fs::create_dir_all(root.join("child-B")).unwrap();
        fs::write(root.join("child-A").join("entry-1.webm"), b"a").unwrap();
        fs::write(root.join("child-B").join("entry-2.webm"), b"b").unwrap();

        delete_child_dir_at(root, "child-A").expect("delete child A");

        assert!(!root.join("child-A").exists());
        assert!(root.join("child-B").join("entry-2.webm").exists());
        delete_child_dir_at(root, "child-A").expect("second delete is idempotent");
    }
}
