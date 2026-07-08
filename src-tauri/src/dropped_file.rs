use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use serde::Serialize;
use std::path::PathBuf;

const MAX_DROPPED_IMAGE_BYTES: u64 = 25 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DroppedImagePayload {
    pub file_name: String,
    pub mime_type: String,
    pub base64: String,
}

fn extension_to_mime(extension: &str) -> Option<&'static str> {
    match extension.to_ascii_lowercase().as_str() {
        "jpg" | "jpeg" => Some("image/jpeg"),
        "png" => Some("image/png"),
        "webp" => Some("image/webp"),
        "gif" => Some("image/gif"),
        "heic" => Some("image/heic"),
        "heif" => Some("image/heif"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

fn read_image_path_as_base64(candidate: PathBuf) -> Result<DroppedImagePayload, String> {
    if !candidate.is_absolute() {
        return Err("dropped image path must be absolute".to_string());
    }
    let file_name = candidate
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name.to_string())
        .ok_or_else(|| "dropped image path is missing a file name".to_string())?;
    let extension = candidate
        .extension()
        .and_then(|ext| ext.to_str())
        .ok_or_else(|| "dropped image is missing an extension".to_string())?;
    let mime_type = extension_to_mime(extension)
        .ok_or_else(|| format!("dropped file is not a supported image type: {extension}"))?;

    let metadata = std::fs::metadata(&candidate).map_err(|error| {
        format!(
            "failed to stat dropped image ({}): {error}",
            candidate.display()
        )
    })?;
    if !metadata.is_file() {
        return Err(format!(
            "dropped image path is not a file: {}",
            candidate.display()
        ));
    }
    if metadata.len() > MAX_DROPPED_IMAGE_BYTES {
        return Err(format!(
            "dropped image exceeds {} byte limit",
            MAX_DROPPED_IMAGE_BYTES
        ));
    }

    let bytes = std::fs::read(&candidate).map_err(|error| {
        format!(
            "failed to read dropped image ({}): {error}",
            candidate.display()
        )
    })?;
    let base64 = BASE64_STANDARD.encode(&bytes);

    Ok(DroppedImagePayload {
        file_name,
        mime_type: mime_type.to_string(),
        base64,
    })
}

pub fn read_image_files_as_base64(paths: Vec<String>) -> Result<Vec<DroppedImagePayload>, String> {
    paths
        .into_iter()
        .map(|path| read_image_path_as_base64(PathBuf::from(path.trim())))
        .collect()
}

#[tauri::command]
pub fn pick_image_files_as_base64(
    title: Option<String>,
) -> Result<Vec<DroppedImagePayload>, String> {
    let start_dir = dirs::picture_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(std::env::temp_dir);
    let dialog = rfd::FileDialog::new()
        .set_directory(&start_dir)
        .set_title(title.as_deref().unwrap_or("Select photos"))
        .add_filter(
            "Images",
            &["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "bmp"],
        );
    let selected = dialog.pick_files().unwrap_or_default();
    read_image_files_as_base64(
        selected
            .into_iter()
            .map(|path| path.display().to_string())
            .collect(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs::{self, OpenOptions};
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_temp_path(file_name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("parentos-dropped-file-test-{nonce}-{file_name}"))
    }

    fn cleanup_path(path: &Path) {
        if path.is_dir() {
            let _ = fs::remove_dir_all(path);
        } else {
            let _ = fs::remove_file(path);
        }
    }

    #[test]
    fn read_image_path_as_base64_accepts_supported_image_file() {
        let path = unique_temp_path("sample.png");
        fs::write(&path, [0x89, b'P', b'N', b'G']).expect("write sample png bytes");

        let payload = read_image_path_as_base64(path.clone()).expect("image payload");

        assert_eq!(
            payload.file_name,
            path.file_name().unwrap().to_string_lossy()
        );
        assert_eq!(payload.mime_type, "image/png");
        assert_eq!(
            payload.base64,
            BASE64_STANDARD.encode([0x89, b'P', b'N', b'G'])
        );
        cleanup_path(&path);
    }

    #[test]
    fn read_image_path_as_base64_rejects_directory() {
        let path = unique_temp_path("directory.png");
        fs::create_dir(&path).expect("create temp directory");

        let error = read_image_path_as_base64(path.clone()).expect_err("directory must fail");

        assert!(error.contains("not a file"));
        cleanup_path(&path);
    }

    #[test]
    fn read_image_path_as_base64_rejects_oversized_file() {
        let path = unique_temp_path("large.png");
        let file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .expect("create temp sparse file");
        file.set_len(MAX_DROPPED_IMAGE_BYTES + 1)
            .expect("resize sparse file");

        let error = read_image_path_as_base64(path.clone()).expect_err("oversized file must fail");

        assert!(error.contains("exceeds"));
        cleanup_path(&path);
    }
}
