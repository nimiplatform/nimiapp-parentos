pub mod migrations;
pub mod queries;

use rusqlite::Connection;
use std::ops::{Deref, DerefMut};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard};

use crate::app_storage;

static DB_CONN: std::sync::OnceLock<Mutex<Connection>> = std::sync::OnceLock::new();
static DB_SCOPE: std::sync::OnceLock<Mutex<String>> = std::sync::OnceLock::new();
static DB_OPERATION_BARRIER: std::sync::OnceLock<Mutex<()>> = std::sync::OnceLock::new();
static DB_CONNECTION_HANDLE: DbConnectionHandle = DbConnectionHandle;

const DEVICE_LOCAL_DB_SCOPE: &str = "device-local";

pub struct DbConnectionHandle;

pub struct DbConnectionGuard {
    _operation_guard: MutexGuard<'static, ()>,
    conn_guard: MutexGuard<'static, Connection>,
}

impl Deref for DbConnectionGuard {
    type Target = Connection;

    fn deref(&self) -> &Self::Target {
        &self.conn_guard
    }
}

impl DerefMut for DbConnectionGuard {
    fn deref_mut(&mut self) -> &mut Self::Target {
        &mut self.conn_guard
    }
}

impl DbConnectionHandle {
    pub fn lock(&self) -> Result<DbConnectionGuard, String> {
        let operation_guard = db_operation_barrier()
            .lock()
            .map_err(|error| error.to_string())?;
        let conn_mutex = DB_CONN
            .get()
            .ok_or_else(|| "parentos sqlite connection is not initialized".to_string())?;
        let conn_guard = conn_mutex.lock().map_err(|error| error.to_string())?;
        Ok(DbConnectionGuard {
            _operation_guard: operation_guard,
            conn_guard,
        })
    }
}

fn db_scope_lock() -> &'static Mutex<String> {
    DB_SCOPE.get_or_init(|| Mutex::new(DEVICE_LOCAL_DB_SCOPE.to_string()))
}

fn db_operation_barrier() -> &'static Mutex<()> {
    DB_OPERATION_BARRIER.get_or_init(|| Mutex::new(()))
}

fn hash_app_account_id(app_account_id: &str) -> u64 {
    const FNV_OFFSET: u64 = 0xcbf29ce484222325;
    const FNV_PRIME: u64 = 0x100000001b3;

    let mut hash = FNV_OFFSET;
    for byte in app_account_id.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(FNV_PRIME);
    }
    hash
}

fn normalize_db_scope(app_account_id: Option<&str>) -> String {
    let normalized_account = app_account_id
        .map(str::trim)
        .filter(|value| !value.is_empty());
    match normalized_account {
        Some(app_account_id) => format!("account-{:016x}", hash_app_account_id(app_account_id)),
        None => DEVICE_LOCAL_DB_SCOPE.to_string(),
    }
}

fn resolve_db_path_for_scope(scope: &str) -> Result<PathBuf, String> {
    let sqlite_dir = app_storage::data_child_path("sqlite")?;
    std::fs::create_dir_all(&sqlite_dir).map_err(|error| {
        format!(
            "failed to create ParentOS sqlite dir ({}): {error}",
            sqlite_dir.display()
        )
    })?;
    if scope == DEVICE_LOCAL_DB_SCOPE {
        return Ok(sqlite_dir.join("local.db"));
    }

    let accounts_dir = sqlite_dir.join("accounts");
    std::fs::create_dir_all(&accounts_dir).map_err(|error| {
        format!(
            "failed to create ParentOS account sqlite dir ({}): {error}",
            accounts_dir.display()
        )
    })?;
    Ok(accounts_dir.join(format!("{scope}.db")))
}

#[cfg(test)]
pub fn resolve_db_path() -> Result<PathBuf, String> {
    let scope = db_scope_lock()
        .lock()
        .map_err(|error| error.to_string())?
        .clone();
    resolve_db_path_for_scope(&scope)
}

fn open_connection_for_scope(scope: &str) -> Result<Connection, String> {
    let db_path = resolve_db_path_for_scope(scope)?;
    let conn = Connection::open(&db_path)
        .map_err(|e| format!("failed to open parentos db at {}: {e}", db_path.display()))?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|e| format!("failed to set pragmas: {e}"))?;
    migrations::run_migrations(&conn)?;
    Ok(conn)
}

pub fn get_conn() -> Result<&'static DbConnectionHandle, String> {
    if DB_CONN.get().is_some() {
        return Ok(&DB_CONNECTION_HANDLE);
    }

    let _operation_guard = db_operation_barrier()
        .lock()
        .map_err(|error| error.to_string())?;
    if DB_CONN.get().is_none() {
        let scope = db_scope_lock()
            .lock()
            .map_err(|error| error.to_string())?
            .clone();
        let conn = Mutex::new(open_connection_for_scope(&scope)?);
        let _ = DB_CONN.set(conn);
    }

    DB_CONN
        .get()
        .map(|_| &DB_CONNECTION_HANDLE)
        .ok_or_else(|| "failed to initialize parentos sqlite connection".to_string())
}

#[tauri::command]
pub fn db_init(app_account_id: Option<String>) -> Result<String, String> {
    let _operation_guard = db_operation_barrier()
        .lock()
        .map_err(|error| error.to_string())?;
    let requested_scope = normalize_db_scope(app_account_id.as_deref());
    let mut current_scope = db_scope_lock().lock().map_err(|error| error.to_string())?;

    if let Some(conn_mutex) = DB_CONN.get() {
        if *current_scope != requested_scope {
            let mut conn = conn_mutex.lock().map_err(|error| error.to_string())?;
            *conn = open_connection_for_scope(&requested_scope)?;
            *current_scope = requested_scope.clone();
        }
    } else {
        let conn = Mutex::new(open_connection_for_scope(&requested_scope)?);
        let _ = DB_CONN.set(conn);
        *current_scope = requested_scope.clone();
    }

    Ok(resolve_db_path_for_scope(&requested_scope)?
        .display()
        .to_string())
}

#[cfg(test)]
mod tests {
    use super::{db_init, resolve_db_path};
    use std::path::{Path, PathBuf};
    use std::sync::{Mutex, OnceLock};

    static TEST_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

    fn test_app_root(label: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "parentos-sqlite-app-storage-tests-{label}-{}",
            std::process::id()
        ));
        path
    }

    fn install_test_storage(label: &str) -> PathBuf {
        let app_root = test_app_root(label);
        let data_root = app_root.join("data");
        let cache_root = app_root.join("cache");
        let temp_root = app_root.join("tmp");
        crate::app_storage::install_test_app_storage_roots(
            data_root.clone(),
            cache_root,
            temp_root,
        )
        .expect("install test app storage roots");
        data_root
    }

    fn is_device_local_sqlite_path(path: impl AsRef<Path>) -> bool {
        path.as_ref()
            .ends_with(Path::new("sqlite").join("local.db"))
    }

    #[test]
    fn db_init_uses_device_local_app_storage_path() {
        let _guard = TEST_MUTEX
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("lock sqlite test mutex");
        install_test_storage("device-local");

        let db_path = db_init(None).expect("init device-local db");
        assert!(
            is_device_local_sqlite_path(&db_path),
            "unexpected path: {db_path}"
        );
        assert!(resolve_db_path()
            .expect("resolve current db path")
            .ends_with(Path::new("sqlite").join("local.db")));
    }

    #[test]
    fn db_init_switches_to_account_scoped_path() {
        let _guard = TEST_MUTEX
            .get_or_init(|| Mutex::new(()))
            .lock()
            .expect("lock sqlite test mutex");
        install_test_storage("account");

        let device_local_path = db_init(None).expect("init device-local db");
        let account_path = db_init(Some("user-123".to_string())).expect("init scoped db");

        assert!(is_device_local_sqlite_path(&device_local_path));
        assert_ne!(device_local_path, account_path);
        let account_path_buf = PathBuf::from(&account_path);
        assert!(
            account_path_buf
                .parent()
                .is_some_and(|parent| parent.ends_with(Path::new("sqlite").join("accounts")))
                && account_path_buf
                    .file_name()
                    .and_then(|file_name| file_name.to_str())
                    .is_some_and(
                        |file_name| file_name.starts_with("account-") && file_name.ends_with(".db")
                    ),
            "unexpected scoped path: {account_path}"
        );
        assert_eq!(
            resolve_db_path()
                .expect("resolve current db path")
                .display()
                .to_string(),
            account_path
        );
    }
}
