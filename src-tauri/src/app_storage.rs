use std::path::{Path, PathBuf};
use std::sync::{OnceLock, RwLock};

use serde::Deserialize;
use tauri::Manager;

pub const PARENTOS_APP_ID: &str = "nimi.parentos";

const STORAGE_POLICY_REF: &str = "nimi-data-app-roots";
const READY_STORAGE_STATE: &str = "ready";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParentOSAppStorageRoots {
    pub data_root: PathBuf,
    pub cache_root: PathBuf,
    pub temp_root: PathBuf,
}

#[derive(Debug, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParentOSAppStorageProjectionInput {
    pub app_id: String,
    pub state: String,
    pub storage_policy_ref: String,
    pub durable_data_root: String,
    pub cache_root: String,
    pub temp_root: String,
}

static APP_STORAGE_ROOTS: OnceLock<RwLock<Option<ParentOSAppStorageRoots>>> = OnceLock::new();

fn app_storage_roots_cell() -> &'static RwLock<Option<ParentOSAppStorageRoots>> {
    APP_STORAGE_ROOTS.get_or_init(|| RwLock::new(None))
}

fn require_ready_projection(projection: &ParentOSAppStorageProjectionInput) -> Result<(), String> {
    if projection.app_id.trim() != PARENTOS_APP_ID {
        return Err(format!(
            "ParentOS storage projection expected {PARENTOS_APP_ID}, got {}",
            projection.app_id
        ));
    }
    if projection.state.trim() != READY_STORAGE_STATE {
        return Err(format!(
            "ParentOS storage projection requires Runtime ready state, got {}",
            projection.state
        ));
    }
    if projection.storage_policy_ref.trim() != STORAGE_POLICY_REF {
        return Err(format!(
            "ParentOS storage projection expected storagePolicyRef {STORAGE_POLICY_REF}, got {}",
            projection.storage_policy_ref
        ));
    }
    Ok(())
}

fn roots_from_projection(
    projection: &ParentOSAppStorageProjectionInput,
) -> Result<ParentOSAppStorageRoots, String> {
    require_ready_projection(projection)?;
    Ok(ParentOSAppStorageRoots {
        data_root: nimi_shell_tauri::runtime_app_storage::canonical_storage_root(
            &projection.durable_data_root,
            "ParentOS durable data root",
        )?,
        cache_root: nimi_shell_tauri::runtime_app_storage::canonical_storage_root(
            &projection.cache_root,
            "ParentOS cache root",
        )?,
        temp_root: nimi_shell_tauri::runtime_app_storage::canonical_storage_root(
            &projection.temp_root,
            "ParentOS temp root",
        )?,
    })
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

pub fn app_storage_roots() -> Result<ParentOSAppStorageRoots, String> {
    app_storage_roots_cell()
        .read()
        .map_err(|error| error.to_string())?
        .clone()
        .ok_or_else(|| {
            "ParentOS app storage roots are not prepared; call prepare_parentos_app_storage with the Runtime SDK storage projection before local data access"
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

pub fn prepare_app_storage(
    app: &tauri::AppHandle,
    projection: ParentOSAppStorageProjectionInput,
) -> Result<ParentOSAppStorageRoots, String> {
    let roots = roots_from_projection(&projection)?;
    let roots = install_app_storage_roots(roots)?;
    allow_data_root_in_asset_scope(app, &roots)?;
    Ok(roots)
}

pub fn data_root() -> Result<PathBuf, String> {
    Ok(app_storage_roots()?.data_root)
}

pub fn data_child_path(child: impl AsRef<Path>) -> Result<PathBuf, String> {
    let data_root = data_root()?;
    let data_root_text = data_root
        .to_str()
        .ok_or_else(|| "ParentOS durable data root is not valid UTF-8".to_string())?;
    nimi_shell_tauri::runtime_app_storage::scoped_storage_child(
        data_root_text,
        "ParentOS durable data root",
        child,
    )
}

#[cfg(test)]
pub fn install_test_app_storage_roots(
    data_root: PathBuf,
    cache_root: PathBuf,
    temp_root: PathBuf,
) -> Result<ParentOSAppStorageRoots, String> {
    let roots = ParentOSAppStorageRoots {
        data_root: nimi_shell_tauri::runtime_app_storage::canonical_storage_root(
            data_root
                .to_str()
                .ok_or_else(|| "test ParentOS data root is not valid UTF-8".to_string())?,
            "test ParentOS durable data root",
        )?,
        cache_root: nimi_shell_tauri::runtime_app_storage::canonical_storage_root(
            cache_root
                .to_str()
                .ok_or_else(|| "test ParentOS cache root is not valid UTF-8".to_string())?,
            "test ParentOS cache root",
        )?,
        temp_root: nimi_shell_tauri::runtime_app_storage::canonical_storage_root(
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
    use super::{
        roots_from_projection, ParentOSAppStorageProjectionInput, PARENTOS_APP_ID,
        STORAGE_POLICY_REF,
    };

    fn ready_projection() -> ParentOSAppStorageProjectionInput {
        ParentOSAppStorageProjectionInput {
            app_id: PARENTOS_APP_ID.to_string(),
            state: "ready".to_string(),
            storage_policy_ref: STORAGE_POLICY_REF.to_string(),
            durable_data_root: "/tmp/data".to_string(),
            cache_root: "/tmp/cache".to_string(),
            temp_root: "/tmp/tmp".to_string(),
        }
    }

    #[test]
    fn parentos_app_storage_owner_is_canonical_nimi_app_id() {
        assert_eq!(PARENTOS_APP_ID, "nimi.parentos");
    }

    #[test]
    fn rejects_projection_for_another_app() {
        let mut projection = ready_projection();
        projection.app_id = "nimi.other".to_string();
        assert!(roots_from_projection(&projection).is_err());
    }

    #[test]
    fn rejects_non_ready_projection() {
        let mut projection = ready_projection();
        projection.state = "storage_unavailable".to_string();
        assert!(roots_from_projection(&projection).is_err());
    }

    #[test]
    fn rejects_unexpected_storage_policy() {
        let mut projection = ready_projection();
        projection.storage_policy_ref = "legacy-data-root".to_string();
        assert!(roots_from_projection(&projection).is_err());
    }
}
