use base64::engine::general_purpose::STANDARD as BASE64_STANDARD;
use base64::Engine;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

pub const MAX_IMAGE_OBJECT_BYTES: usize = 25 * 1024 * 1024;
pub const MAX_AUDIO_OBJECT_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_MEDIA_PARTITION_BYTES: u64 = 2 * 1024 * 1024 * 1024;

static MEDIA_WRITE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub fn decode_bounded_base64(
    payload: &str,
    label: &str,
    max_decoded_bytes: usize,
) -> Result<Vec<u8>, String> {
    let encoded = payload.trim();
    let max_encoded_bytes = max_decoded_bytes
        .checked_add(2)
        .and_then(|value| value.checked_div(3))
        .and_then(|value| value.checked_mul(4))
        .ok_or_else(|| format!("{label} size limit is invalid"))?;
    if encoded.len() > max_encoded_bytes {
        return Err(format!(
            "{label} encoded payload exceeds {max_decoded_bytes} decoded bytes"
        ));
    }
    let bytes = BASE64_STANDARD
        .decode(encoded)
        .map_err(|error| format!("invalid {label} base64 payload: {error}"))?;
    if bytes.is_empty() {
        return Err(format!("{label} payload must not be empty"));
    }
    if bytes.len() > max_decoded_bytes {
        return Err(format!("{label} payload exceeds {max_decoded_bytes} bytes"));
    }
    Ok(bytes)
}

pub fn write_media_file(
    partition_root: &Path,
    target: &Path,
    bytes: &[u8],
    label: &str,
    max_object_bytes: usize,
) -> Result<(), String> {
    if bytes.is_empty() || bytes.len() > max_object_bytes {
        return Err(format!(
            "{label} must contain between 1 and {max_object_bytes} bytes"
        ));
    }
    let _guard = MEDIA_WRITE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "ParentOS media write lock is poisoned".to_string())?;

    let canonical_root = partition_root
        .canonicalize()
        .map_err(|error| format!("failed to canonicalize ParentOS data partition: {error}"))?;
    let parent = target
        .parent()
        .ok_or_else(|| format!("{label} target has no parent directory"))?;
    let canonical_parent = parent
        .canonicalize()
        .map_err(|error| format!("failed to canonicalize {label} directory: {error}"))?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err(format!("{label} target is outside ParentOS data partition"));
    }

    let replaced_bytes = match fs::symlink_metadata(target) {
        Ok(metadata) if metadata.file_type().is_symlink() || !metadata.is_file() => {
            return Err(format!("{label} target is not a canonical regular file"));
        }
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(error) => return Err(format!("failed to inspect {label} target: {error}")),
    };
    let current_bytes = partition_size(&canonical_root)?;
    let projected_bytes = current_bytes
        .checked_sub(replaced_bytes)
        .and_then(|value| value.checked_add(bytes.len() as u64))
        .ok_or_else(|| "ParentOS media partition size overflow".to_string())?;
    if projected_bytes > MAX_MEDIA_PARTITION_BYTES {
        return Err(format!(
            "ParentOS data partition quota exceeded: {projected_bytes} > {MAX_MEDIA_PARTITION_BYTES} bytes"
        ));
    }

    let mut temporary = tempfile::NamedTempFile::new_in(&canonical_parent)
        .map_err(|error| format!("failed to create temporary {label}: {error}"))?;
    temporary
        .write_all(bytes)
        .and_then(|()| temporary.flush())
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|error| format!("failed to write temporary {label}: {error}"))?;
    temporary
        .persist(target)
        .map_err(|error| format!("failed to atomically persist {label}: {}", error.error))?;
    Ok(())
}

fn partition_size(root: &Path) -> Result<u64, String> {
    let mut pending = vec![root.to_path_buf()];
    let mut total = 0_u64;
    while let Some(directory) = pending.pop() {
        for entry in fs::read_dir(&directory)
            .map_err(|error| format!("failed to scan ParentOS data partition: {error}"))?
        {
            let entry =
                entry.map_err(|error| format!("failed to scan partition entry: {error}"))?;
            let metadata = fs::symlink_metadata(entry.path())
                .map_err(|error| format!("failed to inspect partition entry: {error}"))?;
            if metadata.file_type().is_symlink() {
                return Err("ParentOS data partition contains a symbolic link".to_string());
            }
            if metadata.is_dir() {
                pending.push(entry.path());
            } else if metadata.is_file() {
                total = total
                    .checked_add(metadata.len())
                    .ok_or_else(|| "ParentOS data partition size overflow".to_string())?;
            } else {
                return Err("ParentOS data partition contains a non-regular entry".to_string());
            }
        }
    }
    Ok(total)
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine;
    use tempfile::TempDir;

    #[test]
    fn rejects_oversized_payload_before_decode() {
        let encoded = "A".repeat(9);
        let error = decode_bounded_base64(&encoded, "fixture", 6).unwrap_err();
        assert!(error.contains("encoded payload exceeds"));
    }

    #[test]
    fn writes_and_replaces_inside_partition_atomically() {
        let partition = TempDir::new().unwrap();
        let media = partition.path().join("media");
        fs::create_dir(&media).unwrap();
        let target = media.join("item.bin");
        write_media_file(partition.path(), &target, b"first", "fixture", 16).unwrap();
        write_media_file(partition.path(), &target, b"second", "fixture", 16).unwrap();
        assert_eq!(fs::read(target).unwrap(), b"second");
    }

    #[test]
    fn decoded_limit_is_enforced() {
        let payload = BASE64_STANDARD.encode(b"1234567");
        assert!(decode_bounded_base64(&payload, "fixture", 6).is_err());
    }

    #[test]
    fn quota_rejection_leaves_no_target_or_temporary_file() {
        let partition = TempDir::new().unwrap();
        let media = partition.path().join("media");
        fs::create_dir(&media).unwrap();
        let occupied = fs::File::create(partition.path().join("occupied.bin")).unwrap();
        occupied.set_len(MAX_MEDIA_PARTITION_BYTES).unwrap();
        let target = media.join("item.bin");

        let error = write_media_file(partition.path(), &target, b"x", "fixture", 16)
            .expect_err("partition quota must fail closed");

        assert!(error.contains("quota exceeded"));
        assert!(!target.exists());
        assert_eq!(fs::read_dir(media).unwrap().count(), 0);
    }
}
