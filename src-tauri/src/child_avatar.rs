use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

use crate::app_storage;

const CHILD_AVATAR_DIR: &str = "children/avatars";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedChildAvatar {
    pub path: String,
}

fn resolve_avatar_root() -> Result<PathBuf, String> {
    let root = app_storage::data_child_path(CHILD_AVATAR_DIR)?;
    fs::create_dir_all(&root).map_err(|error| {
        format!(
            "failed to create child avatar dir ({}): {error}",
            root.display()
        )
    })?;
    Ok(root)
}

fn extension_for_mime_type(mime_type: &str) -> Result<&'static str, String> {
    match mime_type.trim().to_ascii_lowercase().as_str() {
        "image/jpeg" | "image/jpg" => Ok("jpg"),
        "image/png" => Ok("png"),
        "image/webp" => Ok("webp"),
        _ => Err(format!("unsupported child avatar mime type: {mime_type}")),
    }
}

fn sanitize_child_id(child_id: &str) -> Result<String, String> {
    let child_id = child_id.trim();
    if child_id.is_empty() || child_id.contains('/') || child_id.contains('\\') {
        return Err("invalid child_id for avatar".to_string());
    }
    Ok(child_id.to_string())
}

fn delete_child_avatar_files_at(root: &Path, child_id: &str) -> Result<(), String> {
    let child_id = sanitize_child_id(child_id)?;
    for extension in ["jpg", "png", "webp"] {
        let path = root.join(format!("{child_id}.{extension}"));
        match fs::remove_file(&path) {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!(
                    "failed to delete child avatar file ({}): {error}",
                    path.display()
                ));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn save_child_avatar(
    child_id: String,
    mime_type: String,
    image_base64: String,
) -> Result<SavedChildAvatar, String> {
    let child_id = sanitize_child_id(&child_id)?;
    let ext = extension_for_mime_type(&mime_type)?;

    let image_bytes = BASE64_STANDARD
        .decode(image_base64.trim())
        .map_err(|error| format!("invalid child avatar base64 payload: {error}"))?;
    if image_bytes.is_empty() {
        return Err("child avatar payload must not be empty".to_string());
    }

    let file_path = resolve_avatar_root()?.join(format!("{child_id}.{ext}"));
    fs::write(&file_path, &image_bytes).map_err(|error| {
        format!(
            "failed to write child avatar ({}): {error}",
            file_path.display()
        )
    })?;

    Ok(SavedChildAvatar {
        path: file_path.display().to_string(),
    })
}

pub fn delete_child_avatar_files(child_id: &str) -> Result<(), String> {
    let root = resolve_avatar_root()?;
    delete_child_avatar_files_at(&root, child_id)
}

#[cfg(test)]
mod tests {
    use super::{delete_child_avatar_files_at, sanitize_child_id};
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn rejects_path_separators_in_child_id() {
        assert!(sanitize_child_id("../evil").is_err());
        assert!(sanitize_child_id("child/a").is_err());
        assert!(sanitize_child_id("child\\a").is_err());
    }

    #[test]
    fn delete_child_avatar_files_removes_supported_extensions_only_for_child() {
        let tmp = TempDir::new().unwrap();
        let root = tmp.path();
        fs::write(root.join("child-A.jpg"), b"jpg").unwrap();
        fs::write(root.join("child-A.png"), b"png").unwrap();
        fs::write(root.join("child-A.webp"), b"webp").unwrap();
        fs::write(root.join("child-B.jpg"), b"jpg").unwrap();

        delete_child_avatar_files_at(root, "child-A").expect("delete child A avatars");

        assert!(!root.join("child-A.jpg").exists());
        assert!(!root.join("child-A.png").exists());
        assert!(!root.join("child-A.webp").exists());
        assert!(root.join("child-B.jpg").exists());
        delete_child_avatar_files_at(root, "child-A").expect("second delete is idempotent");
    }
}
