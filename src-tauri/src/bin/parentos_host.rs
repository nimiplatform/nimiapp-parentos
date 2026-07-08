use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};
use std::time::{SystemTime, UNIX_EPOCH};

use nimiplatform_parentos::sidecar_commands::{
    dispatch_parentos_sidecar_command, initialize_parentos_sidecar, ParentOSSidecarError,
    ParentOSSidecarInitInput,
};

const PROTOCOL_VERSION: &str = "2026-07-07.parentos-host.v1";
const PARENTOS_APP_ID: &str = "nimi.parentos";

#[derive(Debug, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase",
    deny_unknown_fields
)]
enum SidecarRequest {
    Init {
        protocol_version: String,
        app_id: String,
        id: String,
        projection_ref: String,
        durable_data_root: String,
        cache_root: String,
        temp_root: String,
    },
    Command {
        protocol_version: String,
        app_id: String,
        id: String,
        projection_ref: String,
        command: String,
        payload: Value,
    },
}

#[derive(Debug, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
enum SidecarResponse {
    Ready {
        protocol_version: &'static str,
        id: String,
        app_id: &'static str,
    },
    Result {
        protocol_version: &'static str,
        id: String,
        result: Value,
    },
    Error {
        protocol_version: &'static str,
        id: String,
        error: SidecarError,
    },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SidecarError {
    code: &'static str,
    reason_code: &'static str,
    action_hint: &'static str,
    source: &'static str,
    details: Value,
}

fn main() {
    if std::env::args().any(|arg| arg == "--self-test") {
        if let Err(error) = run_self_test() {
            eprintln!("parentos_host self-test failed: {error}");
            std::process::exit(1);
        }
        return;
    }

    let stdin = io::stdin();
    let mut stdout = io::BufWriter::new(io::stdout());
    for line in stdin.lock().lines() {
        match line {
            Ok(raw) => {
                if raw.trim().is_empty() {
                    continue;
                }
                let response = handle_line(&raw);
                if let Err(error) = write_response(&mut stdout, response) {
                    eprintln!("parentos_host stdout write failed: {error}");
                    std::process::exit(1);
                }
            }
            Err(error) => {
                eprintln!("parentos_host stdin read failed: {error}");
                std::process::exit(1);
            }
        }
    }
}

fn run_self_test() -> Result<(), String> {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let root = std::env::temp_dir().join(format!(
        "parentos-host-self-test-{}-{nonce}",
        std::process::id()
    ));
    let data = root.join("data");
    let cache = root.join("cache");
    let temp = root.join("tmp");
    std::fs::create_dir_all(&data).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&cache).map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&temp).map_err(|error| error.to_string())?;
    initialize_parentos_sidecar(ParentOSSidecarInitInput {
        projection_ref: "parentos-host-self-test".to_string(),
        durable_data_root: data.display().to_string(),
        cache_root: cache.display().to_string(),
        temp_root: temp.display().to_string(),
    })
    .map_err(|error| format!("{}: {}", error.reason_code, error.details))?;
    let mut stdout = io::BufWriter::new(io::stdout());
    write_response(
        &mut stdout,
        ready_response("parentos-host-self-test".to_string()),
    )
    .map_err(|error| error.to_string())
}

fn handle_line(raw: &str) -> SidecarResponse {
    match serde_json::from_str::<SidecarRequest>(raw) {
        Ok(request) => handle_request(request),
        Err(error) => error_response(
            id_from_raw(raw),
            "invalid-payload",
            "parentos-sidecar-request-invalid",
            "send_strict_parentos_sidecar_json_envelope",
            serde_json::json!({
                "domain": "parentos-app-domain",
                "cause": error.to_string(),
            }),
        ),
    }
}

fn id_from_raw(raw: &str) -> String {
    serde_json::from_str::<Value>(raw)
        .ok()
        .and_then(|value| value.get("id").and_then(Value::as_str).map(str::to_string))
        .unwrap_or_default()
}

fn handle_request(request: SidecarRequest) -> SidecarResponse {
    match request {
        SidecarRequest::Init {
            protocol_version,
            app_id,
            id,
            projection_ref,
            durable_data_root,
            cache_root,
            temp_root,
        } => {
            if let Some(response) = validate_request_header(&protocol_version, &app_id, &id) {
                return response;
            }
            if let Some(response) = validate_projection_ref(&id, &projection_ref) {
                return response;
            }
            match initialize_parentos_sidecar(ParentOSSidecarInitInput {
                projection_ref,
                durable_data_root,
                cache_root,
                temp_root,
            }) {
                Ok(_) => ready_response(id),
                Err(error) => sidecar_error_response(id, error),
            }
        }
        SidecarRequest::Command {
            protocol_version,
            app_id,
            id,
            projection_ref,
            command,
            payload,
        } => {
            if let Some(response) = validate_request_header(&protocol_version, &app_id, &id) {
                return response;
            }
            if let Some(response) = validate_projection_ref(&id, &projection_ref) {
                return response;
            }
            match dispatch_parentos_sidecar_command(&command, payload) {
                Ok(value) => result_response(id, value),
                Err(error) => sidecar_error_response(id, error),
            }
        }
    }
}

fn validate_request_header(
    protocol_version: &str,
    app_id: &str,
    id: &str,
) -> Option<SidecarResponse> {
    if id.trim().is_empty() {
        return Some(error_response(
            String::new(),
            "invalid-payload",
            "parentos-sidecar-id-required",
            "send_parentos_sidecar_request_id",
            serde_json::json!({
                "domain": "parentos-app-domain",
            }),
        ));
    }
    if protocol_version != PROTOCOL_VERSION {
        return Some(error_response(
            id.to_string(),
            "invalid-payload",
            "parentos-sidecar-protocol-version-mismatch",
            "use_parentos_host_v1_protocol",
            serde_json::json!({
                "domain": "parentos-app-domain",
                "expected": PROTOCOL_VERSION,
                "actual": protocol_version,
            }),
        ));
    }
    if app_id != PARENTOS_APP_ID {
        return Some(error_response(
            id.to_string(),
            "forbidden-renderer-access",
            "parentos-sidecar-app-id-mismatch",
            "launch_parentos_sidecar_only_for_nimi_parentos",
            serde_json::json!({
                "domain": "parentos-app-domain",
                "expected": PARENTOS_APP_ID,
                "actual": app_id,
            }),
        ));
    }
    None
}

fn validate_projection_ref(id: &str, projection_ref: &str) -> Option<SidecarResponse> {
    if projection_ref.trim().is_empty() {
        return Some(error_response(
            id.to_string(),
            "invalid-payload",
            "parentos-sidecar-projection-ref-required",
            "send_parentos_runtime_storage_projection_ref",
            serde_json::json!({
                "domain": "parentos-app-domain",
            }),
        ));
    }
    None
}

fn ready_response(id: String) -> SidecarResponse {
    SidecarResponse::Ready {
        protocol_version: PROTOCOL_VERSION,
        id,
        app_id: PARENTOS_APP_ID,
    }
}

fn result_response(id: String, result: Value) -> SidecarResponse {
    SidecarResponse::Result {
        protocol_version: PROTOCOL_VERSION,
        id,
        result,
    }
}

fn sidecar_error_response(id: String, error: ParentOSSidecarError) -> SidecarResponse {
    SidecarResponse::Error {
        protocol_version: PROTOCOL_VERSION,
        id,
        error: SidecarError {
            code: error.code,
            reason_code: error.reason_code,
            action_hint: error.action_hint,
            source: error.source,
            details: error.details,
        },
    }
}

fn error_response(
    id: String,
    code: &'static str,
    reason_code: &'static str,
    action_hint: &'static str,
    details: Value,
) -> SidecarResponse {
    SidecarResponse::Error {
        protocol_version: PROTOCOL_VERSION,
        id,
        error: SidecarError {
            code,
            reason_code,
            action_hint,
            source: "host",
            details,
        },
    }
}

fn write_response<W: Write>(writer: &mut W, response: SidecarResponse) -> io::Result<()> {
    serde_json::to_writer(&mut *writer, &response)?;
    writer.write_all(b"\n")?;
    writer.flush()
}
