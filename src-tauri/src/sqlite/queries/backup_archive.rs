use super::*;
use crate::{app_storage, media_storage, sqlite};
use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::path::{Path, PathBuf};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

// @nimi-authority: rule.parentos.shell.r009
const MAX_RECORD_BYTES: u64 = 64 * 1024 * 1024;
const MAX_ENTRIES: usize = 60_000;
const MEDIA_ROOTS: &[&str] = &[
    "children/avatars",
    "journal/photos",
    "journal/audio",
    "attachments",
    "orthodontic/photos",
];

fn io_error(error: impl std::fmt::Display) -> String {
    format!("Complete backup failed (PO-SHELL-009): {error}")
}

pub fn export_complete_backup(path: String) -> Result<BackupSummary, String> {
    let conn = sqlite::get_conn()?.lock()?;
    export_archive(&conn, &app_storage::data_root()?, Path::new(&path))
}

pub fn restore_complete_backup(path: String) -> Result<BackupSummary, String> {
    let mut conn = sqlite::get_conn()?.lock()?;
    restore_archive(&mut conn, &app_storage::data_root()?, Path::new(&path))
}

// Media is never copied through the renderer or the JSON sidecar protocol.
fn export_archive(conn: &Connection, root: &Path, target: &Path) -> Result<BackupSummary, String> {
    let root = root.canonicalize().map_err(io_error)?;
    let mut envelope = snapshot_tables(conn, chrono::Utc::now().to_rfc3339())?;
    let mut files = BTreeMap::<String, PathBuf>::new();
    map_media(&mut envelope, |value, child, column| {
        if inline_image(value)? {
            return Ok(value.to_string());
        }
        let source = Path::new(value);
        reject_links(source)?;
        let canonical = source.canonicalize().map_err(|_| {
            io_error("A referenced media file is missing or unreadable; no backup was saved")
        })?;
        let relative = canonical
            .strip_prefix(&root)
            .map_err(|_| io_error("Referenced media is outside app storage"))?
            .to_str()
            .ok_or_else(|| io_error("Media path is not UTF-8"))?
            .replace('\\', "/");
        validate_media_name(&relative, child)?;
        validate_media_field(&relative, column)?;
        if !canonical.is_file() {
            return Err(io_error("Referenced media is not a regular file"));
        }
        files.insert(relative.clone(), canonical);
        Ok(relative)
    })?;
    if files.len() >= MAX_ENTRIES {
        return Err(io_error("Too many media files"));
    }
    validate_records(conn, &envelope)?;
    let records = serde_json::to_vec(&envelope).map_err(io_error)?;
    if records.len() as u64 > MAX_RECORD_BYTES {
        return Err(io_error("Record data exceeds 64 MiB"));
    }
    let parent = target
        .parent()
        .ok_or_else(|| io_error("Backup destination has no parent"))?;
    let parent = parent.canonicalize().map_err(io_error)?;
    // Saving inside live storage could overwrite a database or referenced file.
    if parent.starts_with(&root) {
        return Err(io_error(
            "Choose a backup destination outside the app data directory",
        ));
    }
    let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(io_error)?;
    let mut archive = ZipWriter::new(temporary.as_file_mut());
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
    archive
        .start_file("records.json", options)
        .map_err(io_error)?;
    archive.write_all(&records).map_err(io_error)?;
    let mut total = 0;
    for (name, source) in &files {
        let mut file = File::open(source).map_err(io_error)?;
        let size = file.metadata().map_err(io_error)?.len();
        validate_media_size(name, size, &mut total)?;
        archive
            .start_file(format!("media/{name}"), options)
            .map_err(io_error)?;
        let copied =
            std::io::copy(&mut (&mut file).take(size + 1), &mut archive).map_err(io_error)?;
        if copied != size {
            return Err(io_error("Media changed while backing up"));
        }
    }
    archive.finish().map_err(io_error)?;
    temporary.as_file().sync_all().map_err(io_error)?;
    temporary.persist(target).map_err(io_error)?;
    Ok(summary(&envelope, files.len()))
}

fn restore_archive(
    conn: &mut Connection,
    root: &Path,
    source: &Path,
) -> Result<BackupSummary, String> {
    let root = root.canonicalize().map_err(io_error)?;
    let mut file = File::open(source).map_err(io_error)?;
    if file.metadata().map_err(io_error)?.len()
        > media_storage::MAX_MEDIA_PARTITION_BYTES + MAX_RECORD_BYTES + 32 * 1024 * 1024
    {
        return Err(io_error("Backup exceeds supported storage size"));
    }
    // Our bounded format uses ordinary ZIP with no comment. Check the declared
    // count before ZipArchive constructs its name map (which deduplicates names).
    let length = file.metadata().map_err(io_error)?.len();
    if length < 22 {
        return Err(io_error(
            "Select a complete .parentos backup; old JSON backups are not supported",
        ));
    }
    file.seek(SeekFrom::End(-22)).map_err(io_error)?;
    let mut footer = [0u8; 22];
    file.read_exact(&mut footer).map_err(io_error)?;
    let count = u16::from_le_bytes([footer[10], footer[11]]) as usize;
    let central_size = u32::from_le_bytes(footer[12..16].try_into().unwrap()) as u64;
    let central_start = u32::from_le_bytes(footer[16..20].try_into().unwrap()) as u64;
    if footer[..4] != *b"PK\x05\x06"
        || footer[4..8] != [0; 4]
        || footer[8..10] != footer[10..12]
        || footer[20..22] != [0; 2]
        || count == 0
        || count > MAX_ENTRIES
        || central_start + central_size + 22 != length
    {
        return Err(io_error("Invalid complete backup archive structure"));
    }
    file.rewind().map_err(io_error)?;
    let mut archive = ZipArchive::new(file).map_err(|_| {
        io_error("Select a complete .parentos backup; old JSON backups are not supported")
    })?;
    if archive.len() != count
        || archive.offset() != 0
        || archive.central_directory_start() != central_start
    {
        return Err(io_error(
            "Duplicate entries or inconsistent archive directory",
        ));
    }
    if archive.len() == 0 || archive.len() > MAX_ENTRIES {
        return Err(io_error("Invalid archive entry count"));
    }
    let mut names = BTreeSet::new();
    let mut total = 0;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(io_error)?;
        let name = entry.name().to_string();
        if !names.insert(name.clone())
            || entry.is_dir()
            || entry.is_symlink()
            || entry.compression() != CompressionMethod::Stored
        {
            return Err(io_error("Duplicate, linked or unsupported archive entry"));
        }
        if name == "records.json" {
            if entry.size() > MAX_RECORD_BYTES {
                return Err(io_error("Record data exceeds 64 MiB"));
            }
        } else {
            let relative = name
                .strip_prefix("media/")
                .ok_or_else(|| io_error("Unexpected archive entry"))?;
            validate_media_name(relative, None)?;
            validate_media_size(relative, entry.size(), &mut total)?;
        }
    }
    let mut records = Vec::new();
    archive
        .by_name("records.json")
        .map_err(io_error)?
        .take(MAX_RECORD_BYTES + 1)
        .read_to_end(&mut records)
        .map_err(io_error)?;
    if records.len() as u64 > MAX_RECORD_BYTES {
        return Err(io_error("Record data exceeds 64 MiB"));
    }
    let mut envelope: BackupEnvelope = serde_json::from_slice(&records).map_err(io_error)?;
    validate_records(conn, &envelope)?;
    reject_other_account_child_collisions(conn, &root, &envelope)?;
    let mut referenced = BTreeSet::new();
    map_media(&mut envelope, |value, child, column| {
        if inline_image(value)? {
            return Ok(value.to_string());
        }
        validate_media_name(value, child)?;
        validate_media_field(value, column)?;
        referenced.insert(value.to_string());
        Ok(value.to_string())
    })?;
    let expected: BTreeSet<_> = std::iter::once("records.json".to_string())
        .chain(referenced.iter().map(|name| format!("media/{name}")))
        .collect();
    if expected != names {
        return Err(io_error("Backup has missing or unreferenced media files"));
    }

    // New immutable filenames keep pre-restore media usable even if the process
    // stops before the SQLite commit. No filesystem/SQLite dual commit is needed.
    let mut previous = snapshot_tables(conn, chrono::Utc::now().to_rfc3339())?;
    let mut previous_paths = BTreeSet::new();
    map_media(&mut previous, |value, _, _| {
        if !value.starts_with("data:") {
            previous_paths.insert(PathBuf::from(value));
        }
        Ok(value.to_string())
    })?;
    let mut staged = StagedMedia::default();
    let mut destinations = BTreeMap::new();
    let restore_id = ulid::Ulid::new().to_string();
    for relative in &referenced {
        let relative_path = Path::new(relative);
        let extension = relative_path
            .extension()
            .and_then(|s| s.to_str())
            .ok_or_else(|| io_error("Media extension is missing"))?;
        let parent = if let Some(avatar) = relative.strip_prefix("children/avatars/") {
            // Original avatar layout is childId.ext; restored avatars use a child
            // directory, which is also removed by the ordinary child cascade.
            if !avatar.contains('/') {
                PathBuf::from("children/avatars").join(relative_path.file_stem().unwrap())
            } else {
                relative_path.parent().unwrap().to_path_buf()
            }
        } else {
            relative_path.parent().unwrap().to_path_buf()
        };
        let directory = root.join(parent);
        create_owned_directory(&root, &directory)?;
        let destination =
            directory.join(format!("{restore_id}-{}.{}", ulid::Ulid::new(), extension));
        let mut entry = archive
            .by_name(&format!("media/{relative}"))
            .map_err(io_error)?;
        let size = entry.size();
        let mut bytes = Vec::new();
        (&mut entry)
            .take(size + 1)
            .read_to_end(&mut bytes)
            .map_err(io_error)?;
        if bytes.len() as u64 != size {
            return Err(io_error("Media size differs from archive metadata"));
        }
        media_storage::write_media_file(
            &root,
            &destination,
            &bytes,
            "restored media",
            media_limit(relative),
        )?;
        staged.paths.push(destination.clone());
        destinations.insert(
            relative.clone(),
            destination
                .to_str()
                .ok_or_else(|| io_error("Restored path is not UTF-8"))?
                .to_string(),
        );
    }
    map_media(&mut envelope, |value, _, _| {
        if inline_image(value)? {
            return Ok(value.to_string());
        }
        destinations
            .get(value)
            .cloned()
            .ok_or_else(|| io_error("Media mapping is missing"))
    })?;
    let mut result = replace_tables(conn, envelope)?;
    result.media_count = staged.paths.len();
    staged.committed = true;
    // Cleanup follows the commit; it can never turn a successful restore into
    // a reported failure. Protect files still referenced by another account.
    result.cleanup_pending = cleanup_replaced_media(&root, &previous_paths, &staged.paths).is_err();
    Ok(result)
}

// Existing media deletion is child-scoped. Importing the same child IDs into
// two local accounts would let one account's child deletion affect the other.
fn reject_other_account_child_collisions(
    conn: &Connection,
    root: &Path,
    envelope: &BackupEnvelope,
) -> Result<(), String> {
    let current = conn
        .path()
        .filter(|path| !path.is_empty())
        .map(Path::new)
        .map(Path::canonicalize)
        .transpose()
        .map_err(io_error)?;
    let incoming: BTreeSet<_> = envelope.tables["children"]
        .iter()
        .filter_map(|row| row["childId"].as_str())
        .collect();
    for path in account_databases(root)? {
        if current.as_ref() == Some(&path.canonicalize().map_err(io_error)?) {
            continue;
        }
        let other = Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
            .map_err(io_error)?;
        let mut statement = other
            .prepare("SELECT childId FROM children")
            .map_err(io_error)?;
        let children = statement
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(io_error)?;
        for child in children {
            if incoming.contains(child.map_err(io_error)?.as_str()) {
                return Err(io_error("Another account on this device already contains a child from this backup. Switch to that account to restore it"));
            }
        }
    }
    Ok(())
}

fn account_databases(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut databases = Vec::new();
    for directory in [root.join("sqlite"), root.join("sqlite/accounts")] {
        if !directory.exists() {
            continue;
        }
        reject_links(&directory)?;
        for entry in fs::read_dir(directory).map_err(io_error)? {
            let path = entry.map_err(io_error)?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("db") {
                continue;
            }
            reject_links(&path)?;
            databases.push(path);
        }
    }
    Ok(databases)
}

fn cleanup_replaced_media(
    root: &Path,
    previous: &BTreeSet<PathBuf>,
    restored: &[PathBuf],
) -> Result<(), String> {
    let mut retained: BTreeSet<PathBuf> = restored.iter().cloned().collect();
    for path in account_databases(root)? {
        let database =
            Connection::open_with_flags(path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .map_err(io_error)?;
        for (table, column) in MEDIA_PATH_COLUMNS {
            let mut statement = database
                .prepare(&format!(
                    "SELECT {} FROM {} WHERE {} IS NOT NULL",
                    quote_identifier(column),
                    quote_identifier(table),
                    quote_identifier(column)
                ))
                .map_err(io_error)?;
            let values = statement
                .query_map([], |row| row.get::<_, String>(0))
                .map_err(io_error)?;
            for value in values {
                let value = value.map_err(io_error)?;
                let paths = if *column == "photoPaths" {
                    serde_json::from_str::<Vec<String>>(&value).map_err(io_error)?
                } else {
                    vec![value]
                };
                for path in paths {
                    if !path.starts_with("data:") && Path::new(&path).exists() {
                        retained.insert(Path::new(&path).canonicalize().map_err(io_error)?);
                    }
                }
            }
        }
    }
    for path in previous {
        if !path.exists() {
            continue;
        }
        reject_links(path)?;
        let canonical = path.canonicalize().map_err(io_error)?;
        let relative = canonical
            .strip_prefix(root)
            .map_err(io_error)?
            .to_str()
            .ok_or_else(|| io_error("Invalid previous media path"))?
            .replace('\\', "/");
        validate_media_name(&relative, None)?;
        if !retained.contains(&canonical) {
            fs::remove_file(canonical).map_err(io_error)?;
        }
    }
    Ok(())
}

#[derive(Default)]
struct StagedMedia {
    paths: Vec<PathBuf>,
    committed: bool,
}
impl Drop for StagedMedia {
    fn drop(&mut self) {
        if !self.committed {
            for path in &self.paths {
                if let Err(error) = fs::remove_file(path) {
                    eprintln!("Failed to remove staged backup media: {error}");
                }
            }
        }
    }
}

fn summary(envelope: &BackupEnvelope, media_count: usize) -> BackupSummary {
    BackupSummary {
        table_count: envelope.tables.len(),
        row_count: envelope.tables.values().map(Vec::len).sum(),
        media_count,
        cleanup_pending: false,
    }
}

fn map_media(
    envelope: &mut BackupEnvelope,
    mut map: impl FnMut(&str, Option<&str>, &str) -> Result<String, String>,
) -> Result<(), String> {
    for (table, column) in MEDIA_PATH_COLUMNS {
        for row in envelope
            .tables
            .get_mut(*table)
            .ok_or_else(|| io_error("Missing media table"))?
        {
            let child = row
                .get("childId")
                .and_then(JsonValue::as_str)
                .map(str::to_string);
            let value = row
                .get_mut(*column)
                .ok_or_else(|| io_error("Missing media column"))?;
            if value.is_null() {
                continue;
            }
            let text = value
                .as_str()
                .ok_or_else(|| io_error("Invalid media reference"))?;
            if text.is_empty() {
                return Err(io_error("Empty media reference"));
            }
            if matches!(*column, "voicePath" | "filePath") && text.starts_with("data:") {
                return Err(io_error(
                    "Voice recordings and attachments require archived media files",
                ));
            }
            *value = if *column == "photoPaths" {
                let paths: Vec<String> = serde_json::from_str(text).map_err(io_error)?;
                let mapped = paths
                    .iter()
                    .map(|path| map(path, child.as_deref(), column))
                    .collect::<Result<Vec<_>, _>>()?;
                JsonValue::String(serde_json::to_string(&mapped).map_err(io_error)?)
            } else {
                JsonValue::String(map(text, child.as_deref(), column)?)
            };
        }
    }
    Ok(())
}

fn inline_image(value: &str) -> Result<bool, String> {
    if !value.starts_with("data:") {
        return Ok(false);
    }
    let (header, payload) = value
        .split_once(',')
        .ok_or_else(|| io_error("Malformed inline media"))?;
    if !matches!(
        header,
        "data:image/jpeg;base64"
            | "data:image/png;base64"
            | "data:image/webp;base64"
            | "data:image/gif;base64"
            | "data:image/heic;base64"
            | "data:image/heif;base64"
    ) {
        return Err(io_error("Unsupported inline image"));
    }
    media_storage::decode_bounded_base64(
        payload,
        "inline image",
        media_storage::MAX_IMAGE_OBJECT_BYTES,
    )?;
    Ok(true)
}

fn validate_media_name(name: &str, child: Option<&str>) -> Result<(), String> {
    if name.len() > 1024
        || name.contains('\\')
        || name.split('/').any(|s| {
            s.is_empty()
                || s == "."
                || s == ".."
                || s.ends_with('.')
                || s.ends_with(' ')
                || s.chars().any(|c| c.is_control() || ":*?\"<>|".contains(c))
        })
    {
        return Err(io_error("Unsafe media path"));
    }
    let (root, rest) = MEDIA_ROOTS
        .iter()
        .find_map(|root| {
            name.strip_prefix(&format!("{root}/"))
                .map(|rest| (*root, rest))
        })
        .ok_or_else(|| io_error("Media path is outside admitted roots"))?;
    let first = rest.split('/').next().unwrap_or_default();
    if let Some(child) = child {
        let owned = if root == "children/avatars" && !rest.contains('/') {
            Path::new(first).file_stem().and_then(|s| s.to_str()) == Some(child)
        } else {
            first == child
        };
        if !owned {
            return Err(io_error("Media belongs to a different child"));
        }
    }
    if root != "children/avatars" && !rest.contains('/') {
        return Err(io_error("Media child directory is missing"));
    }
    let extension = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let allowed = if root == "journal/audio" {
        matches!(
            extension.as_str(),
            "webm" | "ogg" | "wav" | "mp3" | "m4a" | "mp4" | "aac"
        )
    } else {
        matches!(
            extension.as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "gif" | "heic" | "heif"
        )
    };
    if !allowed {
        return Err(io_error("Unsupported media file extension"));
    }
    Ok(())
}

fn media_limit(name: &str) -> usize {
    if name.starts_with("journal/audio/") {
        media_storage::MAX_AUDIO_OBJECT_BYTES
    } else {
        media_storage::MAX_IMAGE_OBJECT_BYTES
    }
}

fn validate_media_field(name: &str, column: &str) -> Result<(), String> {
    let audio = name.starts_with("journal/audio/");
    if audio != (column == "voicePath")
        || (column == "avatarPath" && !name.starts_with("children/avatars/"))
        || (column == "filePath"
            && !name.starts_with("attachments/")
            && !name.starts_with("orthodontic/photos/"))
    {
        return Err(io_error("Media storage type does not match its record"));
    }
    Ok(())
}
fn validate_media_size(name: &str, size: u64, total: &mut u64) -> Result<(), String> {
    *total = total
        .checked_add(size)
        .ok_or_else(|| io_error("Media size overflow"))?;
    if size == 0
        || size > media_limit(name) as u64
        || *total > media_storage::MAX_MEDIA_PARTITION_BYTES
    {
        return Err(io_error("Media exceeds app storage limits"));
    }
    Ok(())
}

fn reject_links(path: &Path) -> Result<(), String> {
    for ancestor in path.ancestors() {
        if fs::symlink_metadata(ancestor)
            .map_err(io_error)?
            .file_type()
            .is_symlink()
        {
            return Err(io_error("Symbolic links are not permitted in backup media"));
        }
    }
    Ok(())
}

fn create_owned_directory(root: &Path, directory: &Path) -> Result<(), String> {
    let relative = directory.strip_prefix(root).map_err(io_error)?;
    let mut current = root.to_path_buf();
    for part in relative.components() {
        current.push(part);
        match fs::create_dir(&current) {
            Ok(()) => (),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => (),
            Err(error) => return Err(io_error(error)),
        }
        reject_links(&current)?;
        if !current.canonicalize().map_err(io_error)?.starts_with(root) {
            return Err(io_error("Media directory escaped app storage"));
        }
    }
    Ok(())
}

// Exercise all real SQLite constraints in an isolated database before touching
// current records or staging media, including constraints on empty tables.
fn validate_records(conn: &Connection, envelope: &BackupEnvelope) -> Result<(), String> {
    validate_envelope(conn, envelope)?;
    let mut validation = Connection::open_in_memory().map_err(io_error)?;
    validation
        .execute_batch("PRAGMA foreign_keys=ON;")
        .map_err(io_error)?;
    crate::sqlite::migrations::run_migrations(&validation)?;
    replace_tables(&mut validation, envelope.clone())?;
    let owners = [
        ("health_record_events", "eventId"),
        ("vaccine_records", "recordId"),
        ("milestone_records", "recordId"),
        ("allergy_records", "recordId"),
        ("orthodontic_cases", "caseId"),
        ("orthodontic_appliances", "applianceId"),
        ("orthodontic_checkins", "checkinId"),
        ("orthodontic_unwear_intervals", "intervalId"),
        ("orthodontic_photo_sessions", "sessionId"),
    ];
    for attachment in &envelope.tables["attachments"] {
        let owner = attachment["ownerTable"]
            .as_str()
            .ok_or_else(|| io_error("Invalid attachment owner"))?;
        let (_, key) = owners
            .iter()
            .find(|(name, _)| *name == owner)
            .ok_or_else(|| io_error("Unknown attachment owner"))?;
        let found = envelope.tables[owner].iter().any(|row| {
            row[*key] == attachment["ownerId"] && row["childId"] == attachment["childId"]
        });
        if !found {
            return Err(io_error(
                "Attachment owner is missing or belongs to a different child",
            ));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::TempDir;

    fn database() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        crate::sqlite::migrations::run_migrations(&conn).unwrap();
        conn.execute_batch("INSERT INTO families VALUES ('family', 'Family', '2026-09-29', '2026-09-29');
            INSERT INTO children (childId, familyId, displayName, gender, birthDate, nurtureMode, createdAt, updatedAt)
            VALUES ('child', 'family', 'Child', 'female', '2020-01-01', 'balanced', '2026-09-29', '2026-09-29');
            INSERT INTO orthodontic_cases (caseId,childId,caseType,stage,startedAt,createdAt,updatedAt)
            VALUES ('case','child','fixed-braces','active','2026-09-29','2026-09-29','2026-09-29');
            INSERT INTO orthodontic_photo_sessions (sessionId,childId,caseId,sessionDate,createdAt,updatedAt)
            VALUES ('session','child','case','2026-09-29','2026-09-29','2026-09-29');").unwrap();
        conn
    }

    fn media_fixture(conn: &Connection, root: &Path) {
        let paths = [
            "children/avatars/child.png",
            "journal/photos/child/photo.png",
            "journal/audio/child/voice.wav",
            "attachments/child/image.png",
            "orthodontic/photos/child/session/front.jpg",
        ];
        for name in paths {
            let path = root.join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            // Binary payloads test lossless archive transport, not media decoding.
            fs::write(path, format!("original bytes for {name}")).unwrap();
        }
        conn.execute(
            "UPDATE children SET avatarPath=?1",
            [root.join(paths[0]).to_str().unwrap()],
        )
        .unwrap();
        conn.execute("INSERT INTO journal_entries (entryId, childId, contentType, voicePath, photoPaths, recordedAt, ageMonths, createdAt, updatedAt) VALUES ('entry','child','voice',?1,?2,'2026-09-29',80,'2026-09-29','2026-09-29')", params![root.join(paths[2]).to_str(), serde_json::to_string(&[root.join(paths[1]).to_str()]).unwrap()]).unwrap();
        for (id, owner, owner_id, name, metadata) in [
            ("attachment", "orthodontic_cases", "case", paths[3], None),
            (
                "photo",
                "orthodontic_photo_sessions",
                "session",
                paths[4],
                Some("{\"angle\":\"front\"}"),
            ),
        ] {
            conn.execute("INSERT INTO attachments (attachmentId,childId,ownerTable,ownerId,filePath,fileName,mimeType,metadataJson,createdAt) VALUES (?1,'child',?2,?3,?4,'photo','image/jpeg',?5,'2026-09-29')", params![id,owner,owner_id,root.join(name).to_str(),metadata]).unwrap();
        }
    }

    fn rewrite_archive(path: &Path, change: impl FnOnce(&mut BTreeMap<String, Vec<u8>>)) {
        let mut entries = BTreeMap::new();
        {
            let mut archive = ZipArchive::new(File::open(path).unwrap()).unwrap();
            for i in 0..archive.len() {
                let mut entry = archive.by_index(i).unwrap();
                let mut bytes = Vec::new();
                entry.read_to_end(&mut bytes).unwrap();
                entries.insert(entry.name().to_string(), bytes);
            }
        }
        change(&mut entries);
        let mut archive = ZipWriter::new(File::create(path).unwrap());
        for (name, bytes) in entries {
            archive
                .start_file(
                    name,
                    SimpleFileOptions::default().compression_method(CompressionMethod::Stored),
                )
                .unwrap();
            archive.write_all(&bytes).unwrap();
        }
        archive.finish().unwrap();
    }

    #[test]
    fn complete_round_trip_between_roots_preserves_all_media_and_metadata() {
        let source = TempDir::new().unwrap();
        let target = TempDir::new().unwrap();
        let output = TempDir::new().unwrap();
        let conn = database();
        media_fixture(&conn, source.path());
        let backup = output.path().join("family.parentos");
        let exported = export_archive(&conn, source.path(), &backup).unwrap();
        assert_eq!(exported.table_count, 29);
        assert_eq!(exported.media_count, 5);
        let mut dest = database();
        media_fixture(&dest, target.path()); // Existing media no longer blocks restore.
        let result = restore_archive(&mut dest, target.path(), &backup).unwrap();
        assert_eq!(result.media_count, 5);
        let mut restored = snapshot_tables(&dest, chrono::Utc::now().to_rfc3339()).unwrap();
        let mut bytes = Vec::new();
        map_media(&mut restored, |value, _, _| {
            let file = Path::new(value);
            assert!(file.starts_with(target.path().canonicalize().unwrap()));
            bytes.push(fs::read(file).unwrap());
            Ok(value.into())
        })
        .unwrap();
        assert_eq!(bytes.len(), 5);
        assert!(bytes.contains(&b"original bytes for journal/audio/child/voice.wav".to_vec()));
        assert!(bytes
            .contains(&b"original bytes for orthodontic/photos/child/session/front.jpg".to_vec()));
        let metadata: String = dest
            .query_row(
                "SELECT metadataJson FROM attachments WHERE attachmentId='photo'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(metadata, "{\"angle\":\"front\"}");
        // A second export and restore must also understand restored filenames.
        let second = output.path().join("second.parentos");
        export_archive(&dest, target.path(), &second).unwrap();
        restore_archive(&mut dest, target.path(), &second).unwrap();
    }

    #[test]
    fn missing_source_media_does_not_replace_existing_backup() {
        let source = TempDir::new().unwrap();
        let output = TempDir::new().unwrap();
        let conn = database();
        media_fixture(&conn, source.path());
        fs::remove_file(source.path().join("journal/audio/child/voice.wav")).unwrap();
        let backup = output.path().join("family.parentos");
        fs::write(&backup, b"previous backup").unwrap();
        assert!(export_archive(&conn, source.path(), &backup).is_err());
        assert_eq!(fs::read(backup).unwrap(), b"previous backup");
    }

    #[test]
    fn malformed_archives_preserve_current_records_and_files() {
        for fault in [
            "missing-media",
            "extra-media",
            "traversal",
            "foreign-key",
            "unknown-version",
            "missing-column",
            "wrong-app",
            "owner",
        ] {
            let source = TempDir::new().unwrap();
            let target = TempDir::new().unwrap();
            let output = TempDir::new().unwrap();
            let conn = database();
            media_fixture(&conn, source.path());
            let backup = output.path().join("family.parentos");
            export_archive(&conn, source.path(), &backup).unwrap();
            rewrite_archive(&backup, |entries| match fault {
                "missing-media" => {
                    entries.remove("media/journal/audio/child/voice.wav");
                }
                "extra-media" => {
                    entries.insert("media/journal/photos/child/extra.png".into(), vec![1]);
                }
                "traversal" => {
                    entries.insert(
                        "media/journal/photos/child/../../escape.png".into(),
                        vec![1],
                    );
                }
                _ => {
                    let mut envelope: BackupEnvelope =
                        serde_json::from_slice(&entries["records.json"]).unwrap();
                    match fault {
                        "foreign-key" => {
                            envelope.tables.get_mut("children").unwrap()[0]["familyId"] =
                                serde_json::json!("absent");
                        }
                        "unknown-version" => {
                            envelope.format_version = "parentos-structured-backup-v1".into();
                        }
                        "missing-column" => {
                            envelope.tables.get_mut("children").unwrap()[0].remove("gender");
                        }
                        "wrong-app" => {
                            envelope.app_id = "other.app".into();
                        }
                        "owner" => {
                            envelope.tables.get_mut("attachments").unwrap()[0]["ownerId"] =
                                serde_json::json!("absent");
                        }
                        _ => unreachable!(),
                    }
                    entries.insert(
                        "records.json".into(),
                        serde_json::to_vec(&envelope).unwrap(),
                    );
                }
            });
            let mut dest = database();
            media_fixture(&dest, target.path());
            dest.execute("UPDATE children SET displayName='Before restore'", [])
                .unwrap();
            assert!(
                restore_archive(&mut dest, target.path(), &backup).is_err(),
                "{fault}"
            );
            let name: String = dest
                .query_row("SELECT displayName FROM children", [], |r| r.get(0))
                .unwrap();
            assert_eq!(name, "Before restore", "{fault}");
            assert_eq!(
                fs::read(target.path().join("journal/audio/child/voice.wav")).unwrap(),
                b"original bytes for journal/audio/child/voice.wav"
            );
        }
    }

    #[test]
    fn constraint_failure_after_staging_rolls_back_database_and_removes_new_media() {
        let source = TempDir::new().unwrap();
        let target = TempDir::new().unwrap();
        let output = TempDir::new().unwrap();
        let conn = database();
        media_fixture(&conn, source.path());
        let backup = output.path().join("family.parentos");
        export_archive(&conn, source.path(), &backup).unwrap();
        let mut dest = database();
        media_fixture(&dest, target.path());
        dest.execute_batch("CREATE TRIGGER reject_restore BEFORE INSERT ON families BEGIN SELECT RAISE(ABORT, 'disk constraint failure'); END;").unwrap();
        let before = media_storage::partition_size(target.path()).unwrap();
        assert!(restore_archive(&mut dest, target.path(), &backup).is_err());
        assert_eq!(
            media_storage::partition_size(target.path()).unwrap(),
            before
        );
        let count: i64 = dest
            .query_row("SELECT COUNT(*) FROM children", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn corrupt_media_crc_rejects_restore() {
        let source = TempDir::new().unwrap();
        let target = TempDir::new().unwrap();
        let output = TempDir::new().unwrap();
        let conn = database();
        media_fixture(&conn, source.path());
        let backup = output.path().join("family.parentos");
        export_archive(&conn, source.path(), &backup).unwrap();
        let mut bytes = fs::read(&backup).unwrap();
        let needle = b"original bytes for journal/audio";
        let offset = bytes
            .windows(needle.len())
            .position(|w| w == needle)
            .unwrap();
        bytes[offset] ^= 0xff;
        fs::write(&backup, bytes).unwrap();
        let mut dest = database();
        assert!(restore_archive(&mut dest, target.path(), &backup).is_err());
        assert_eq!(media_storage::partition_size(target.path()).unwrap(), 0);
    }
}
