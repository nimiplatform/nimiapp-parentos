use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use futures_util::future::{BoxFuture, FutureExt};
use nimi_shell_tauri::capabilities::runtime::{
    self, generated, RuntimeBridgeAppSession, RuntimeBridgeHostHooks, RuntimeBridgeMetadata,
    RuntimeBridgeProtectedAccessToken, RuntimeBridgeTrustedMetadata,
    RuntimeBridgeTrustedMetadataRequest,
};
use prost_types::Timestamp;
use tokio::sync::Mutex;
use tonic::metadata::MetadataValue;
use tonic::transport::Channel;

pub const PARENTOS_RUNTIME_APP_ID: &str = "nimi.parentos";
pub const PARENTOS_RUNTIME_APP_INSTANCE_ID: &str = "nimi.parentos.local-developer";
pub const PARENTOS_RUNTIME_DEVICE_ID: &str = "parentos-local-developer-device";
pub const PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID: &str = "nimi.parentos.platform-runtime-session";
pub const PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID: &str = "platform-runtime-session";
pub const PARENTOS_RUNTIME_CALLER_KIND: &str = "local-developer-app";
pub const PARENTOS_RUNTIME_PROTECTED_SCOPES: &[&str] = &["ai.spend.meter"];

const PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS: i32 = 3600;
const PARENTOS_RUNTIME_APP_SESSION_REFRESH_SKEW_MS: i64 = 30_000;
const PARENTOS_RUNTIME_PROTECTED_SCOPE_CATALOG_VERSION: &str = "sdk-v2";
const PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS: i32 = 3600;
const PARENTOS_RUNTIME_PROTECTED_TOKEN_REFRESH_SKEW_MS: i64 = 60_000;
const PARENTOS_RUNTIME_PROTECTED_CONSENT_ID: &str = "parentos-runtime-account";
const PARENTOS_RUNTIME_PROTECTED_POLICY_VERSION: &str = "parentos-runtime-account-v1";
const DEFAULT_RUNTIME_GRPC_ADDR: &str = "127.0.0.1:46371";
static PARENTOS_RUNTIME_CLIENT_ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ParentOSRuntimeAuthConfig {
    pub runtime_endpoint: String,
    pub developer_registration: bool,
    pub app_id: String,
    pub account_app_instance_id: String,
    pub account_device_id: String,
    pub app_session_instance_id: String,
    pub app_session_device_id: String,
    pub protected_scopes: Vec<String>,
}

#[derive(Clone, Debug)]
struct CachedAppSession {
    session_id: String,
    session_token: String,
    expires_at_ms: i64,
}

#[derive(Clone, Debug)]
struct CachedProtectedAccess {
    subject_user_id: String,
    scope_signature: String,
    token_id: String,
    secret: String,
    expires_at_ms: i64,
}

pub trait ParentOSRuntimeAuthClient: Send + Sync + 'static {
    fn register_app(
        &self,
        request: generated::RegisterAppRequest,
    ) -> BoxFuture<'static, Result<generated::RegisterAppResponse, String>>;

    fn open_session(
        &self,
        request: generated::OpenSessionRequest,
    ) -> BoxFuture<'static, Result<generated::OpenSessionResponse, String>>;

    fn get_account_session_status(
        &self,
        request: generated::GetAccountSessionStatusRequest,
    ) -> BoxFuture<'static, Result<generated::GetAccountSessionStatusResponse, String>>;

    fn authorize_external_principal(
        &self,
        request: generated::AuthorizeExternalPrincipalRequest,
    ) -> BoxFuture<'static, Result<generated::AuthorizeExternalPrincipalResponse, String>>;
}

pub struct ParentOSRuntimeAuthProvider<C: ParentOSRuntimeAuthClient> {
    config: ParentOSRuntimeAuthConfig,
    client: Arc<C>,
    account_caller_registered: Mutex<bool>,
    app_session_registered: Mutex<bool>,
    app_session: Mutex<Option<CachedAppSession>>,
    protected_access: Mutex<Option<CachedProtectedAccess>>,
}

impl<C: ParentOSRuntimeAuthClient> ParentOSRuntimeAuthProvider<C> {
    pub fn new(config: ParentOSRuntimeAuthConfig, client: Arc<C>) -> Self {
        Self {
            config,
            client,
            account_caller_registered: Mutex::new(false),
            app_session_registered: Mutex::new(false),
            app_session: Mutex::new(None),
            protected_access: Mutex::new(None),
        }
    }

    pub async fn trusted_metadata_for_request(
        &self,
        request: RuntimeBridgeTrustedMetadataRequest,
    ) -> Result<Option<RuntimeBridgeTrustedMetadata>, String> {
        self.trusted_metadata_for_method(request.method_id.as_str())
            .await
            .map(Some)
    }

    pub async fn trusted_metadata_for_method(
        &self,
        _method_id: &str,
    ) -> Result<RuntimeBridgeTrustedMetadata, String> {
        self.ensure_account_caller_registered().await?;
        let app_session = self.resolve_app_session().await?;
        let subject_user_id = self.resolve_subject_user_id().await?;
        let protected_access = match subject_user_id {
            Some(subject_user_id) => Some(self.resolve_protected_access(&subject_user_id).await?),
            None => None,
        };

        Ok(RuntimeBridgeTrustedMetadata {
            metadata: Some(RuntimeBridgeMetadata {
                app_id: Some(self.config.app_id.clone()),
                participant_id: Some(self.config.app_id.clone()),
                caller_kind: Some(PARENTOS_RUNTIME_CALLER_KIND.to_string()),
                caller_id: Some(self.config.account_app_instance_id.clone()),
                ..RuntimeBridgeMetadata::default()
            }),
            authorization: None,
            protected_access_token: protected_access.map(|token| {
                RuntimeBridgeProtectedAccessToken {
                    token_id: token.token_id,
                    secret: token.secret,
                }
            }),
            app_session: Some(RuntimeBridgeAppSession {
                session_id: app_session.session_id,
                session_token: app_session.session_token,
            }),
        })
    }

    async fn ensure_account_caller_registered(&self) -> Result<(), String> {
        let mut registered = self.account_caller_registered.lock().await;
        if *registered {
            return Ok(());
        }
        let response = self
            .client
            .register_app(parentos_account_caller_registration_request(&self.config))
            .await?;
        if !response.accepted {
            return Err(format!(
                "PARENTOS_RUNTIME_ACCOUNT_CALLER_REGISTER_APP_REJECTED:{}",
                reason_code_name(response.reason_code)
            ));
        }
        *registered = true;
        Ok(())
    }

    async fn ensure_app_session_registered(&self) -> Result<(), String> {
        let mut registered = self.app_session_registered.lock().await;
        if *registered {
            return Ok(());
        }
        let response = self
            .client
            .register_app(parentos_app_session_registration_request(&self.config))
            .await?;
        if !response.accepted {
            return Err(format!(
                "PARENTOS_RUNTIME_APP_SESSION_REGISTER_APP_REJECTED:{}",
                reason_code_name(response.reason_code)
            ));
        }
        *registered = true;
        Ok(())
    }

    async fn resolve_app_session(&self) -> Result<CachedAppSession, String> {
        let now = now_ms();
        {
            let cached = self.app_session.lock().await;
            if let Some(session) = cached.as_ref() {
                if session.expires_at_ms - now > PARENTOS_RUNTIME_APP_SESSION_REFRESH_SKEW_MS {
                    return Ok(session.clone());
                }
            }
        }

        self.ensure_app_session_registered().await?;
        let response = self
            .client
            .open_session(parentos_open_session_request(&self.config))
            .await?;
        let session_id = normalize_runtime_text(response.session_id);
        let session_token = normalize_runtime_text(response.session_token);
        if session_id.is_empty() || session_token.is_empty() {
            return Err(format!(
                "PARENTOS_RUNTIME_OPEN_SESSION_FAILED:{}",
                reason_code_name(response.reason_code)
            ));
        }
        let session = CachedAppSession {
            session_id,
            session_token,
            expires_at_ms: timestamp_ms(response.expires_at.as_ref()).unwrap_or_else(|| {
                now_ms() + i64::from(PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS) * 1000
            }),
        };
        *self.app_session.lock().await = Some(session.clone());
        Ok(session)
    }

    async fn resolve_subject_user_id(&self) -> Result<Option<String>, String> {
        let response = self
            .client
            .get_account_session_status(generated::GetAccountSessionStatusRequest {
                caller: Some(parentos_account_caller()),
            })
            .await?;
        if response.state != generated::AccountSessionState::Authenticated as i32 {
            return Ok(None);
        }
        let subject_user_id = normalize_runtime_text(
            response
                .account_projection
                .map(|projection| projection.account_id)
                .unwrap_or_default(),
        );
        if subject_user_id.is_empty() {
            return Ok(None);
        }
        Ok(Some(subject_user_id))
    }

    async fn resolve_protected_access(
        &self,
        subject_user_id: &str,
    ) -> Result<CachedProtectedAccess, String> {
        let now = now_ms();
        let scope_signature = self.config.protected_scopes.join("\n");
        {
            let cached = self.protected_access.lock().await;
            if let Some(token) = cached.as_ref() {
                if token.subject_user_id == subject_user_id
                    && token.scope_signature == scope_signature
                    && token.expires_at_ms - now > PARENTOS_RUNTIME_PROTECTED_TOKEN_REFRESH_SKEW_MS
                {
                    return Ok(token.clone());
                }
            }
        }

        let response = self
            .client
            .authorize_external_principal(parentos_protected_access_request(
                &self.config,
                subject_user_id,
            ))
            .await?;
        let token_id = normalize_runtime_text(response.token_id);
        let secret = normalize_runtime_text(response.secret);
        if token_id.is_empty() || secret.is_empty() {
            return Err("PARENTOS_RUNTIME_PROTECTED_ACCESS_MISSING_CREDENTIALS".to_string());
        }
        let token = CachedProtectedAccess {
            subject_user_id: subject_user_id.to_string(),
            scope_signature,
            token_id,
            secret,
            expires_at_ms: timestamp_ms(response.expires_at.as_ref()).unwrap_or_else(|| {
                now_ms() + i64::from(PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS) * 1000
            }),
        };
        *self.protected_access.lock().await = Some(token.clone());
        Ok(token)
    }
}

pub fn install_parentos_tauri_runtime_auth_provider() -> Result<(), String> {
    let config = parentos_runtime_auth_config_for_mode(
        cfg!(debug_assertions),
        resolve_runtime_endpoint().as_str(),
    );
    let client = Arc::new(GrpcParentOSRuntimeAuthClient::new(
        config.runtime_endpoint.clone(),
    ));
    let provider = Arc::new(ParentOSRuntimeAuthProvider::new(config, client));
    runtime::set_runtime_bridge_host_hooks(RuntimeBridgeHostHooks {
        trusted_metadata: Some(Arc::new(move |request| {
            let provider = provider.clone();
            Box::pin(async move { provider.trusted_metadata_for_request(request).await })
        })),
        ..RuntimeBridgeHostHooks::default()
    })
}

pub fn parentos_runtime_auth_config_for_mode(
    developer_registration: bool,
    runtime_endpoint: &str,
) -> ParentOSRuntimeAuthConfig {
    ParentOSRuntimeAuthConfig {
        runtime_endpoint: normalize_runtime_endpoint(runtime_endpoint),
        developer_registration,
        app_id: PARENTOS_RUNTIME_APP_ID.to_string(),
        account_app_instance_id: PARENTOS_RUNTIME_APP_INSTANCE_ID.to_string(),
        account_device_id: PARENTOS_RUNTIME_DEVICE_ID.to_string(),
        app_session_instance_id: PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID.to_string(),
        app_session_device_id: PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID.to_string(),
        protected_scopes: PARENTOS_RUNTIME_PROTECTED_SCOPES
            .iter()
            .map(|scope| scope.to_string())
            .collect(),
    }
}

pub fn parentos_account_caller() -> generated::AccountCaller {
    generated::AccountCaller {
        app_id: PARENTOS_RUNTIME_APP_ID.to_string(),
        app_instance_id: PARENTOS_RUNTIME_APP_INSTANCE_ID.to_string(),
        device_id: PARENTOS_RUNTIME_DEVICE_ID.to_string(),
        mode: generated::AccountCallerMode::LocalDeveloperApp as i32,
        scopes: Vec::new(),
        launch_host_id: String::new(),
        launch_nonce: String::new(),
        release_descriptor_ref: String::new(),
    }
}

fn parentos_account_caller_registration_request(
    config: &ParentOSRuntimeAuthConfig,
) -> generated::RegisterAppRequest {
    generated::RegisterAppRequest {
        app_id: config.app_id.clone(),
        app_instance_id: config.account_app_instance_id.clone(),
        device_id: config.account_device_id.clone(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        capabilities: config.protected_scopes.clone(),
        mode_manifest: Some(generated::AppModeManifest {
            app_mode: generated::AppMode::Full as i32,
            runtime_required: true,
            realm_required: true,
            world_relation: generated::WorldRelation::None as i32,
        }),
        developer_registration: config.developer_registration,
    }
}

fn parentos_app_session_registration_request(
    config: &ParentOSRuntimeAuthConfig,
) -> generated::RegisterAppRequest {
    generated::RegisterAppRequest {
        app_id: config.app_id.clone(),
        app_instance_id: config.app_session_instance_id.clone(),
        device_id: config.app_session_device_id.clone(),
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        capabilities: config.protected_scopes.clone(),
        mode_manifest: Some(generated::AppModeManifest {
            app_mode: generated::AppMode::Full as i32,
            runtime_required: true,
            realm_required: true,
            world_relation: generated::WorldRelation::None as i32,
        }),
        developer_registration: config.developer_registration,
    }
}

fn parentos_open_session_request(
    config: &ParentOSRuntimeAuthConfig,
) -> generated::OpenSessionRequest {
    generated::OpenSessionRequest {
        app_id: config.app_id.clone(),
        app_instance_id: config.app_session_instance_id.clone(),
        device_id: config.app_session_device_id.clone(),
        subject_user_id: String::new(),
        ttl_seconds: PARENTOS_RUNTIME_APP_SESSION_TTL_SECONDS,
    }
}

fn parentos_protected_access_request(
    config: &ParentOSRuntimeAuthConfig,
    subject_user_id: &str,
) -> generated::AuthorizeExternalPrincipalRequest {
    generated::AuthorizeExternalPrincipalRequest {
        domain: "app-auth".to_string(),
        app_id: config.app_id.clone(),
        external_principal_id: config.app_id.clone(),
        external_principal_type: generated::ExternalPrincipalType::App as i32,
        subject_user_id: subject_user_id.to_string(),
        consent_id: PARENTOS_RUNTIME_PROTECTED_CONSENT_ID.to_string(),
        consent_version: "v1".to_string(),
        decision_at: Some(current_runtime_timestamp()),
        policy_version: PARENTOS_RUNTIME_PROTECTED_POLICY_VERSION.to_string(),
        policy_mode: generated::PolicyMode::Custom as i32,
        preset: generated::AuthorizationPreset::Unspecified as i32,
        scopes: config.protected_scopes.clone(),
        resource_selectors: Some(generated::ResourceSelectors {
            conversation_ids: Vec::new(),
            message_ids: Vec::new(),
            document_ids: Vec::new(),
            labels: HashMap::new(),
        }),
        can_delegate: false,
        max_delegation_depth: 0,
        ttl_seconds: PARENTOS_RUNTIME_PROTECTED_TOKEN_TTL_SECONDS,
        scope_catalog_version: PARENTOS_RUNTIME_PROTECTED_SCOPE_CATALOG_VERSION.to_string(),
        policy_override: false,
    }
}

#[derive(Clone)]
struct GrpcParentOSRuntimeAuthClient {
    runtime_endpoint: String,
}

impl GrpcParentOSRuntimeAuthClient {
    fn new(runtime_endpoint: String) -> Self {
        Self { runtime_endpoint }
    }

    async fn channel(&self) -> Result<Channel, String> {
        Channel::from_shared(format_grpc_endpoint(self.runtime_endpoint.as_str()))
            .map_err(|error| format!("PARENTOS_RUNTIME_ENDPOINT_INVALID:{error}"))?
            .connect()
            .await
            .map_err(|error| format!("PARENTOS_RUNTIME_ENDPOINT_UNAVAILABLE:{error}"))
    }
}

impl ParentOSRuntimeAuthClient for GrpcParentOSRuntimeAuthClient {
    fn register_app(
        &self,
        request: generated::RegisterAppRequest,
    ) -> BoxFuture<'static, Result<generated::RegisterAppResponse, String>> {
        let this = self.clone();
        async move {
            let mut client = generated::runtime_auth_service_client::RuntimeAuthServiceClient::new(
                this.channel().await?,
            );
            let idempotency_key = parentos_runtime_client_id(
                format!(
                    "runtime-register-app-parentos-{}",
                    sanitize_client_id_segment(request.app_instance_id.as_str())
                )
                .as_str(),
            );
            client
                .register_app(tonic_request(request, Some(idempotency_key.as_str()))?)
                .await
                .map(|response| response.into_inner())
                .map_err(|status| format!("PARENTOS_RUNTIME_REGISTER_APP_RPC_FAILED:{status}"))
        }
        .boxed()
    }

    fn open_session(
        &self,
        request: generated::OpenSessionRequest,
    ) -> BoxFuture<'static, Result<generated::OpenSessionResponse, String>> {
        let this = self.clone();
        async move {
            let mut client = generated::runtime_auth_service_client::RuntimeAuthServiceClient::new(
                this.channel().await?,
            );
            let idempotency_key = parentos_runtime_client_id(
                format!(
                    "runtime-open-session-parentos-{}",
                    sanitize_client_id_segment(request.app_instance_id.as_str())
                )
                .as_str(),
            );
            client
                .open_session(tonic_request(request, Some(idempotency_key.as_str()))?)
                .await
                .map(|response| response.into_inner())
                .map_err(|status| format!("PARENTOS_RUNTIME_OPEN_SESSION_RPC_FAILED:{status}"))
        }
        .boxed()
    }

    fn get_account_session_status(
        &self,
        request: generated::GetAccountSessionStatusRequest,
    ) -> BoxFuture<'static, Result<generated::GetAccountSessionStatusResponse, String>> {
        let this = self.clone();
        async move {
            let mut client =
                generated::runtime_account_service_client::RuntimeAccountServiceClient::new(
                    this.channel().await?,
                );
            client
                .get_account_session_status(tonic_request(request, None)?)
                .await
                .map(|response| response.into_inner())
                .map_err(|status| format!("PARENTOS_RUNTIME_ACCOUNT_STATUS_RPC_FAILED:{status}"))
        }
        .boxed()
    }

    fn authorize_external_principal(
        &self,
        request: generated::AuthorizeExternalPrincipalRequest,
    ) -> BoxFuture<'static, Result<generated::AuthorizeExternalPrincipalResponse, String>> {
        let this = self.clone();
        async move {
            let idempotency_key = format!(
                "parentos-runtime-protected-{}",
                sanitize_client_id_segment(request.subject_user_id.as_str())
            );
            let idempotency_key = parentos_runtime_client_id(idempotency_key.as_str());
            let mut client =
                generated::runtime_grant_service_client::RuntimeGrantServiceClient::new(
                    this.channel().await?,
                );
            client
                .authorize_external_principal(tonic_request(
                    request,
                    Some(idempotency_key.as_str()),
                )?)
                .await
                .map(|response| response.into_inner())
                .map_err(|status| format!("PARENTOS_RUNTIME_PROTECTED_ACCESS_RPC_FAILED:{status}"))
        }
        .boxed()
    }
}

fn tonic_request<T>(
    message: T,
    idempotency_key: Option<&str>,
) -> Result<tonic::Request<T>, String> {
    let mut request = tonic::Request::new(message);
    insert_metadata(&mut request, "x-nimi-protocol-version", "1.0.0")?;
    insert_metadata(&mut request, "x-nimi-participant-protocol-version", "1.0.0")?;
    insert_metadata(&mut request, "x-nimi-app-id", PARENTOS_RUNTIME_APP_ID)?;
    insert_metadata(
        &mut request,
        "x-nimi-participant-id",
        PARENTOS_RUNTIME_APP_ID,
    )?;
    insert_metadata(
        &mut request,
        "x-nimi-caller-id",
        PARENTOS_RUNTIME_APP_INSTANCE_ID,
    )?;
    insert_metadata(
        &mut request,
        "x-nimi-caller-kind",
        PARENTOS_RUNTIME_CALLER_KIND,
    )?;
    insert_metadata(&mut request, "x-nimi-domain", "app-auth")?;
    if let Some(idempotency_key) = idempotency_key {
        insert_metadata(&mut request, "x-nimi-idempotency-key", idempotency_key)?;
    }
    Ok(request)
}

fn insert_metadata<T>(
    request: &mut tonic::Request<T>,
    key: &'static str,
    value: &str,
) -> Result<(), String> {
    let value = MetadataValue::try_from(value)
        .map_err(|_| format!("PARENTOS_RUNTIME_METADATA_INVALID:{key}"))?;
    request.metadata_mut().insert(key, value);
    Ok(())
}

fn resolve_runtime_endpoint() -> String {
    std::env::var("NIMI_RUNTIME_GRPC_ADDR")
        .ok()
        .map(|value| normalize_runtime_endpoint(value.as_str()))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_RUNTIME_GRPC_ADDR.to_string())
}

fn normalize_runtime_endpoint(value: &str) -> String {
    value
        .trim()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .to_string()
}

fn format_grpc_endpoint(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    }
}

fn normalize_runtime_text(value: String) -> String {
    value.trim().to_string()
}

fn timestamp_ms(timestamp: Option<&Timestamp>) -> Option<i64> {
    let timestamp = timestamp?;
    let millis = timestamp.seconds.saturating_mul(1000) + i64::from(timestamp.nanos / 1_000_000);
    if millis > 0 {
        Some(millis)
    } else {
        None
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

fn current_runtime_timestamp() -> Timestamp {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    Timestamp {
        seconds: now.as_secs().min(i64::MAX as u64) as i64,
        nanos: now.subsec_nanos() as i32,
    }
}

fn parentos_runtime_client_id(prefix: &str) -> String {
    let timestamp = current_runtime_timestamp();
    let counter = PARENTOS_RUNTIME_CLIENT_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    let normalized_prefix = sanitize_client_id_prefix(prefix);
    format!(
        "{}-{}{:09}-{}-{}",
        normalized_prefix,
        timestamp.seconds.max(0),
        timestamp.nanos.max(0),
        std::process::id(),
        counter
    )
}

fn sanitize_client_id_prefix(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | ':' | '-') {
                ch
            } else {
                '-'
            }
        })
        .take(96)
        .collect();
    let trimmed = sanitized.trim_matches(|ch| ch == '-' || ch == '_' || ch == ':' || ch == '.');
    if trimmed
        .chars()
        .next()
        .map(|ch| ch.is_ascii_alphanumeric())
        .unwrap_or(false)
    {
        trimmed.to_string()
    } else {
        "parentos-runtime-call".to_string()
    }
}

fn sanitize_client_id_segment(value: &str) -> String {
    let sanitized: String = value
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | ':' | '-') {
                ch
            } else {
                '_'
            }
        })
        .take(80)
        .collect();
    if sanitized.is_empty() {
        "unknown".to_string()
    } else {
        sanitized
    }
}

fn reason_code_name(value: i32) -> &'static str {
    generated::ReasonCode::try_from(value)
        .ok()
        .map(|code| code.as_str_name())
        .unwrap_or("REASON_CODE_UNSPECIFIED")
}

#[cfg(test)]
pub struct TestParentOSRuntimeAuthClient {
    register_app_requests: std::sync::Mutex<Vec<generated::RegisterAppRequest>>,
    open_session_requests: std::sync::Mutex<Vec<generated::OpenSessionRequest>>,
    account_status_requests: std::sync::Mutex<Vec<generated::GetAccountSessionStatusRequest>>,
    authorize_external_principal_requests:
        std::sync::Mutex<Vec<generated::AuthorizeExternalPrincipalRequest>>,
    account: std::sync::Mutex<(String, generated::AccountSessionState)>,
    session_counter: std::sync::atomic::AtomicUsize,
    protected_counter: std::sync::atomic::AtomicUsize,
}

#[cfg(test)]
impl TestParentOSRuntimeAuthClient {
    pub fn authenticated(subject_user_id: &str) -> Self {
        Self::with_account(
            subject_user_id,
            generated::AccountSessionState::Authenticated,
        )
    }

    pub fn anonymous() -> Self {
        Self::with_account("", generated::AccountSessionState::Anonymous)
    }

    fn with_account(subject_user_id: &str, state: generated::AccountSessionState) -> Self {
        Self {
            register_app_requests: std::sync::Mutex::new(Vec::new()),
            open_session_requests: std::sync::Mutex::new(Vec::new()),
            account_status_requests: std::sync::Mutex::new(Vec::new()),
            authorize_external_principal_requests: std::sync::Mutex::new(Vec::new()),
            account: std::sync::Mutex::new((subject_user_id.to_string(), state)),
            session_counter: std::sync::atomic::AtomicUsize::new(0),
            protected_counter: std::sync::atomic::AtomicUsize::new(0),
        }
    }

    pub fn set_account_subject(
        &self,
        subject_user_id: &str,
        state: generated::AccountSessionState,
    ) {
        *self.account.lock().expect("account lock") = (subject_user_id.to_string(), state);
    }

    pub fn register_app_requests(&self) -> Vec<generated::RegisterAppRequest> {
        self.register_app_requests
            .lock()
            .expect("register lock")
            .clone()
    }

    pub fn open_session_requests(&self) -> Vec<generated::OpenSessionRequest> {
        self.open_session_requests
            .lock()
            .expect("session lock")
            .clone()
    }

    pub fn account_status_requests(&self) -> Vec<generated::GetAccountSessionStatusRequest> {
        self.account_status_requests
            .lock()
            .expect("account status lock")
            .clone()
    }

    pub fn authorize_external_principal_requests(
        &self,
    ) -> Vec<generated::AuthorizeExternalPrincipalRequest> {
        self.authorize_external_principal_requests
            .lock()
            .expect("protected lock")
            .clone()
    }
}

#[cfg(test)]
impl ParentOSRuntimeAuthClient for TestParentOSRuntimeAuthClient {
    fn register_app(
        &self,
        request: generated::RegisterAppRequest,
    ) -> BoxFuture<'static, Result<generated::RegisterAppResponse, String>> {
        self.register_app_requests
            .lock()
            .expect("register lock")
            .push(request.clone());
        async move {
            Ok(generated::RegisterAppResponse {
                app_instance_id: request.app_instance_id,
                accepted: true,
                reason_code: generated::ReasonCode::ActionExecuted as i32,
            })
        }
        .boxed()
    }

    fn open_session(
        &self,
        request: generated::OpenSessionRequest,
    ) -> BoxFuture<'static, Result<generated::OpenSessionResponse, String>> {
        self.open_session_requests
            .lock()
            .expect("session lock")
            .push(request);
        let index = self
            .session_counter
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
            + 1;
        async move {
            Ok(generated::OpenSessionResponse {
                session_id: format!("session-{index}"),
                issued_at: Some(current_runtime_timestamp()),
                expires_at: Some(Timestamp {
                    seconds: current_runtime_timestamp().seconds + 3600,
                    nanos: 0,
                }),
                session_token: format!("session-token-{index}"),
                reason_code: generated::ReasonCode::ActionExecuted as i32,
            })
        }
        .boxed()
    }

    fn get_account_session_status(
        &self,
        request: generated::GetAccountSessionStatusRequest,
    ) -> BoxFuture<'static, Result<generated::GetAccountSessionStatusResponse, String>> {
        self.account_status_requests
            .lock()
            .expect("account status lock")
            .push(request);
        let (subject_user_id, state) = self.account.lock().expect("account lock").clone();
        async move {
            Ok(generated::GetAccountSessionStatusResponse {
                state: state as i32,
                account_projection: if state == generated::AccountSessionState::Authenticated {
                    Some(generated::AccountProjection {
                        account_id: subject_user_id,
                        display_name: String::new(),
                        realm_environment_id: String::new(),
                        workspace_memberships: Vec::new(),
                    })
                } else {
                    None
                },
                reason_code: generated::ReasonCode::ActionExecuted as i32,
                account_reason_code: generated::AccountReasonCode::ActionExecuted as i32,
                production_inert: false,
            })
        }
        .boxed()
    }

    fn authorize_external_principal(
        &self,
        request: generated::AuthorizeExternalPrincipalRequest,
    ) -> BoxFuture<'static, Result<generated::AuthorizeExternalPrincipalResponse, String>> {
        self.authorize_external_principal_requests
            .lock()
            .expect("protected lock")
            .push(request.clone());
        let index = self
            .protected_counter
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst)
            + 1;
        async move {
            let subject_user_id = request.subject_user_id;
            Ok(generated::AuthorizeExternalPrincipalResponse {
                token_id: format!("protected-{subject_user_id}-{index}"),
                app_id: request.app_id,
                subject_user_id: subject_user_id.clone(),
                external_principal_id: request.external_principal_id,
                effective_scopes: request.scopes,
                resource_selectors: request.resource_selectors,
                consent_ref: None,
                policy_version: request.policy_version,
                issued_scope_catalog_version: request.scope_catalog_version,
                can_delegate: false,
                expires_at: Some(Timestamp {
                    seconds: current_runtime_timestamp().seconds + 3600,
                    nanos: 0,
                }),
                secret: format!("protected-secret-{subject_user_id}-{index}"),
            })
        }
        .boxed()
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use nimi_shell_tauri::capabilities::runtime::generated::{
        AccountCallerMode, AccountSessionState,
    };

    use super::{
        parentos_account_caller, parentos_runtime_auth_config_for_mode, parentos_runtime_client_id,
        ParentOSRuntimeAuthProvider, TestParentOSRuntimeAuthClient, PARENTOS_RUNTIME_APP_ID,
        PARENTOS_RUNTIME_APP_INSTANCE_ID, PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID,
        PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID, PARENTOS_RUNTIME_CALLER_KIND,
        PARENTOS_RUNTIME_DEVICE_ID,
    };

    #[test]
    fn parentos_account_caller_matches_sdk_local_developer_helper() {
        let caller = parentos_account_caller();

        assert_eq!(caller.app_id, PARENTOS_RUNTIME_APP_ID);
        assert_eq!(caller.app_instance_id, PARENTOS_RUNTIME_APP_INSTANCE_ID);
        assert_eq!(caller.device_id, PARENTOS_RUNTIME_DEVICE_ID);
        assert_eq!(caller.mode, AccountCallerMode::LocalDeveloperApp as i32);
        assert_eq!(caller.scopes, Vec::<String>::new());
    }

    #[test]
    fn parentos_provider_uses_runtime_caller_kind_with_local_developer_account_mode() {
        assert_eq!(PARENTOS_RUNTIME_CALLER_KIND, "local-developer-app");
        assert_eq!(
            AccountCallerMode::LocalDeveloperApp.as_str_name(),
            "ACCOUNT_CALLER_MODE_LOCAL_DEVELOPER_APP"
        );
    }

    #[test]
    fn parentos_protected_access_idempotency_uses_unique_client_id_suffix() {
        let first = parentos_runtime_client_id("parentos-runtime-protected-subject-a");
        let second = parentos_runtime_client_id("parentos-runtime-protected-subject-a");

        assert_ne!(first, second);
        assert!(first.starts_with("parentos-runtime-protected-subject-a-"));
        assert!(second.starts_with("parentos-runtime-protected-subject-a-"));
    }

    #[tokio::test]
    async fn provider_executes_register_app_session_and_protected_access_phases() {
        let client = Arc::new(TestParentOSRuntimeAuthClient::authenticated("subject-a"));
        let provider = ParentOSRuntimeAuthProvider::new(
            parentos_runtime_auth_config_for_mode(true, "127.0.0.1:46371"),
            client.clone(),
        );

        let trusted = provider
            .trusted_metadata_for_method("/nimi.runtime.v1.RuntimeAiService/ExecuteScenario")
            .await
            .expect("trusted metadata");

        assert_eq!(client.register_app_requests().len(), 2);
        assert_eq!(client.open_session_requests().len(), 1);
        assert_eq!(client.account_status_requests().len(), 1);
        assert_eq!(client.authorize_external_principal_requests().len(), 1);

        let register_requests = client.register_app_requests();
        let account_register = &register_requests[0];
        assert_eq!(account_register.app_id, PARENTOS_RUNTIME_APP_ID);
        assert_eq!(
            account_register.app_instance_id,
            PARENTOS_RUNTIME_APP_INSTANCE_ID
        );
        assert_eq!(account_register.device_id, PARENTOS_RUNTIME_DEVICE_ID);
        assert_eq!(
            account_register.capabilities,
            vec!["ai.spend.meter".to_string()]
        );
        assert!(account_register.developer_registration);
        let app_session_register = &register_requests[1];
        assert_eq!(app_session_register.app_id, PARENTOS_RUNTIME_APP_ID);
        assert_eq!(
            app_session_register.app_instance_id,
            PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID
        );
        assert_eq!(
            app_session_register.device_id,
            PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID
        );
        assert_eq!(
            app_session_register.capabilities,
            vec!["ai.spend.meter".to_string()]
        );
        assert!(app_session_register.developer_registration);
        let open_session = client.open_session_requests().remove(0);
        assert_eq!(
            open_session.app_instance_id,
            PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID
        );
        assert_eq!(
            open_session.device_id,
            PARENTOS_RUNTIME_APP_SESSION_DEVICE_ID
        );

        let session = trusted.app_session.expect("app session");
        assert_eq!(session.session_id, "session-1");
        assert_eq!(session.session_token, "session-token-1");
        let protected = trusted.protected_access_token.expect("protected access");
        assert_eq!(protected.token_id, "protected-subject-a-1");
        assert_eq!(protected.secret, "protected-secret-subject-a-1");
        let metadata = trusted.metadata.expect("identity metadata");
        assert_eq!(metadata.app_id.as_deref(), Some(PARENTOS_RUNTIME_APP_ID));
        assert_eq!(
            metadata.participant_id.as_deref(),
            Some(PARENTOS_RUNTIME_APP_ID)
        );
        assert_eq!(
            metadata.caller_id.as_deref(),
            Some(PARENTOS_RUNTIME_APP_INSTANCE_ID)
        );
        assert_eq!(
            metadata.caller_kind.as_deref(),
            Some(PARENTOS_RUNTIME_CALLER_KIND)
        );
    }

    #[tokio::test]
    async fn provider_uses_subject_aware_protected_access_cache() {
        let client = Arc::new(TestParentOSRuntimeAuthClient::authenticated("subject-a"));
        let provider = ParentOSRuntimeAuthProvider::new(
            parentos_runtime_auth_config_for_mode(true, "127.0.0.1:46371"),
            client.clone(),
        );

        provider
            .trusted_metadata_for_method("/nimi.runtime.v1.RuntimeAiService/ExecuteScenario")
            .await
            .expect("first metadata");
        provider
            .trusted_metadata_for_method("/nimi.runtime.v1.RuntimeAiService/ExecuteScenario")
            .await
            .expect("cached metadata");
        assert_eq!(client.authorize_external_principal_requests().len(), 1);
        assert_eq!(client.register_app_requests().len(), 2);

        client.set_account_subject("subject-b", AccountSessionState::Authenticated);
        let trusted = provider
            .trusted_metadata_for_method("/nimi.runtime.v1.RuntimeAiService/ExecuteScenario")
            .await
            .expect("subject-b metadata");
        assert_eq!(client.authorize_external_principal_requests().len(), 2);
        assert_eq!(
            trusted
                .protected_access_token
                .as_ref()
                .map(|token| token.token_id.as_str()),
            Some("protected-subject-b-2")
        );
    }

    #[tokio::test]
    async fn provider_returns_only_app_session_for_anonymous_account() {
        let client = Arc::new(TestParentOSRuntimeAuthClient::anonymous());
        let provider = ParentOSRuntimeAuthProvider::new(
            parentos_runtime_auth_config_for_mode(false, "127.0.0.1:46371"),
            client.clone(),
        );

        let trusted = provider
            .trusted_metadata_for_method("/nimi.runtime.v1.RuntimeAiService/ExecuteScenario")
            .await
            .expect("anonymous metadata");

        assert_eq!(client.authorize_external_principal_requests().len(), 0);
        assert!(trusted.app_session.is_some());
        assert!(trusted.protected_access_token.is_none());
        let register_requests = client.register_app_requests();
        assert_eq!(register_requests.len(), 2);
        assert!(register_requests
            .iter()
            .all(|request| !request.developer_registration));
        assert_eq!(
            register_requests[0].app_instance_id,
            PARENTOS_RUNTIME_APP_INSTANCE_ID
        );
        assert_eq!(
            register_requests[1].app_instance_id,
            PARENTOS_RUNTIME_APP_SESSION_INSTANCE_ID
        );
    }
}
