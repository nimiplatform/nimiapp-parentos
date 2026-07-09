use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use tauri::Manager;

use nimi_shell_tauri::capabilities::storage;

#[cfg(test)]
pub const PARENTOS_APP_ID: &str = "nimi.parentos";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParentOSAppStorageRoots {
    pub data_root: PathBuf,
    pub cache_root: PathBuf,
    pub temp_root: PathBuf,
}

static APP_STORAGE_ROOTS: OnceLock<RwLock<Option<ParentOSAppStorageRoots>>> = OnceLock::new();

fn app_storage_roots_cell() -> &'static RwLock<Option<ParentOSAppStorageRoots>> {
    APP_STORAGE_ROOTS.get_or_init(|| RwLock::new(None))
}

fn install_app_storage_roots(
    roots: ParentOSAppStorageRoots,
) -> Result<ParentOSAppStorageRoots, String> {
    let cell = app_storage_roots_cell();
    let mut guard = cell.write().map_err(|error| error.to_string())?;
    if let Some(existing_roots) = guard.as_ref() {
        if existing_roots != &roots {
            return Err(
                "ParentOS app storage roots are already prepared with a different Runtime projection; restart the app after Runtime storage repair"
                    .to_string(),
            );
        }
        return Ok(existing_roots.clone());
    }
    *guard = Some(roots.clone());
    Ok(roots)
}

pub fn install_host_app_storage_roots(
    durable_data_root: String,
    cache_root: String,
    temp_root: String,
) -> Result<ParentOSAppStorageRoots, String> {
    let roots = ParentOSAppStorageRoots {
        data_root: storage::canonical_storage_root(
            &durable_data_root,
            "ParentOS durable data root",
        )?,
        cache_root: storage::canonical_storage_root(&cache_root, "ParentOS cache root")?,
        temp_root: storage::canonical_storage_root(&temp_root, "ParentOS temp root")?,
    };
    install_app_storage_roots(roots)
}

pub fn app_storage_roots() -> Result<ParentOSAppStorageRoots, String> {
    app_storage_roots_cell()
        .read()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| {
            "ParentOS app storage roots are not bound by the host before local data access"
                .to_string()
        })
}

pub fn allow_data_root_in_asset_scope(
    app: &tauri::AppHandle,
    roots: &ParentOSAppStorageRoots,
) -> Result<(), String> {
    app.state::<tauri::Scopes>()
        .allow_directory(&roots.data_root, true)
        .map_err(|error| {
            format!(
                "failed to allow ParentOS app data root in asset scope ({}): {error}",
                roots.data_root.display()
            )
        })
}

pub fn data_root() -> Result<PathBuf, String> {
    Ok(app_storage_roots()?.data_root)
}

pub fn data_child_path(child: impl AsRef<Path>) -> Result<PathBuf, String> {
    let data_root = data_root()?;
    let data_root_text = data_root
        .to_str()
        .ok_or_else(|| "ParentOS durable data root is not valid UTF-8".to_string())?;
    storage::scoped_storage_child(data_root_text, "ParentOS durable data root", child)
}

#[cfg(test)]
pub fn install_test_app_storage_roots(
    data_root: PathBuf,
    cache_root: PathBuf,
    temp_root: PathBuf,
) -> Result<ParentOSAppStorageRoots, String> {
    let roots = ParentOSAppStorageRoots {
        data_root: storage::canonical_storage_root(
            data_root
                .to_str()
                .ok_or_else(|| "test ParentOS data root is not valid UTF-8".to_string())?,
            "test ParentOS durable data root",
        )?,
        cache_root: storage::canonical_storage_root(
            cache_root
                .to_str()
                .ok_or_else(|| "test ParentOS cache root is not valid UTF-8".to_string())?,
            "test ParentOS cache root",
        )?,
        temp_root: storage::canonical_storage_root(
            temp_root
                .to_str()
                .ok_or_else(|| "test ParentOS temp root is not valid UTF-8".to_string())?,
            "test ParentOS temp root",
        )?,
    };
    let cell = app_storage_roots_cell();
    let mut guard = cell.write().map_err(|error| error.to_string())?;
    *guard = Some(roots.clone());
    Ok(roots)
}

#[cfg(test)]
mod tests {
    use super::{install_host_app_storage_roots, PARENTOS_APP_ID};
    use tempfile::TempDir;

    #[test]
    fn parentos_app_storage_owner_is_canonical_nimi_app_id() {
        assert_eq!(PARENTOS_APP_ID, "nimi.parentos");
    }

    #[test]
    fn host_storage_roots_are_canonicalized() {
        let root = TempDir::new().expect("temp storage root");
        let roots = install_host_app_storage_roots(
            root.path().join("data").display().to_string(),
            root.path().join("cache").display().to_string(),
            root.path().join("tmp").display().to_string(),
        )
        .expect("install host roots");

        assert!(roots.data_root.is_absolute());
        assert!(roots.cache_root.is_absolute());
        assert!(roots.temp_root.is_absolute());
    }
}
