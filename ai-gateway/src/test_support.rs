use std::{
    future::Future,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{SystemTime, UNIX_EPOCH},
};

use axum::{
    Router,
    body::Body,
    http::{Request, Response},
    routing::any,
};
use serde_json::json;
use tokio::{net::TcpListener, task::JoinHandle};

use crate::resolution::{
    ApiFormat, ControlPlaneClient, ControlPlaneConfig, ResolvedRequestContext,
};

pub(crate) struct FakeServer {
    pub url: String,
    calls: Arc<AtomicUsize>,
    task: JoinHandle<()>,
}

impl FakeServer {
    pub async fn start<F, Fut>(handler: F) -> Self
    where
        F: Fn(Request<Body>) -> Fut + Clone + Send + Sync + 'static,
        Fut: Future<Output = Response<Body>> + Send + 'static,
    {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let calls = Arc::new(AtomicUsize::new(0));
        let count = calls.clone();
        let app = Router::new().fallback(any(move |request| {
            count.fetch_add(1, Ordering::SeqCst);
            handler(request)
        }));
        let task = tokio::spawn(async move {
            axum::serve(listener, app).await.unwrap();
        });
        Self { url, calls, task }
    }

    pub fn calls(&self) -> usize {
        self.calls.load(Ordering::SeqCst)
    }

    pub fn control_plane(&self) -> ControlPlaneClient {
        ControlPlaneClient::new(ControlPlaneConfig::new(&self.url, "test-service-key").unwrap())
            .unwrap()
    }
}

impl Drop for FakeServer {
    fn drop(&mut self) {
        self.task.abort();
    }
}

<<<<<<< HEAD
=======
pub(crate) fn upload_text(body: &[u8]) -> String {
    let mut text = String::new();
    std::io::Read::read_to_string(&mut flate2::read::GzDecoder::new(body), &mut text).unwrap();
    text
}

pub(crate) fn upload_json(body: &[u8]) -> serde_json::Value {
    serde_json::from_str(&upload_text(body)).unwrap()
}

>>>>>>> fbab56e64 (perf(ai-gateway): gzip telemetry uploads)
pub(crate) fn ingestion_token(organization: &str, project: &str) -> String {
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
    let segment = |value: serde_json::Value| URL_SAFE_NO_PAD.encode(value.to_string());
    format!(
        "{}.{}.private-ingestion-token",
        segment(json!({"alg": "ES256", "typ": "JWT"})),
        segment(json!({
            "version": 1,
            "organization_id": organization,
            "project_id": project,
            "ingestion_mode": "usage",
            "scope": "gateway-ingest",
        })),
    )
}

pub(crate) fn resolution_response_for(
    api_format: ApiFormat,
    provider_secret: &str,
) -> Response<Body> {
    let expires_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + 300;
    let connection = match api_format {
        ApiFormat::OpenAiResponses => json!({
            "id": "connection-1", "provider": "openai", "api_format": "openai.responses",
            "base_url": "https://api.openai.com/v1",
            "auth": {"type": "Bearer", "token": provider_secret}
        }),
        ApiFormat::AnthropicMessages => json!({
            "id": "connection-1", "provider": "anthropic", "api_format": "anthropic.messages",
            "base_url": "https://api.anthropic.com/v1",
            "auth": {"type": "x-api-key", "header": "x-api-key", "value": provider_secret}
        }),
    };
    let body = json!({
        "version": 1,
        "connection": connection,
        "attribution": {
            "organization_id": "org-1", "project_id": "project-1", "key_id": "key-1", "key_metadata": {},
            "provider_connection_id": "provider-connection-1"
        },
        "ingestion_mode": "usage",
        "ingestion": {"access_token": ingestion_token("org-1", "project-1"), "token_type": "Bearer", "expires_at": expires_at}
    });
    Response::builder()
        .header("content-type", "application/json")
        .body(Body::from(body.to_string()))
        .unwrap()
}

pub(crate) fn resolution_response(provider_token: &str) -> Response<Body> {
    resolution_response_for(ApiFormat::OpenAiResponses, provider_token)
}

pub(crate) async fn resolved_request_context(provider_token: &str) -> ResolvedRequestContext {
    resolved_request_context_with_mode(provider_token, "usage").await
}

pub(crate) async fn resolved_request_context_with_mode(
    provider_token: &str,
    mode: &'static str,
) -> ResolvedRequestContext {
    resolved_request_context_for(ApiFormat::OpenAiResponses, provider_token, mode).await
}

pub(crate) async fn resolved_request_context_for(
    api_format: ApiFormat,
    provider_secret: &str,
    mode: &'static str,
) -> ResolvedRequestContext {
    let secret = provider_secret.to_owned();
    let web = FakeServer::start(move |_| {
        let secret = secret.clone();
        async move {
            let bytes = axum::body::to_bytes(
                resolution_response_for(api_format, &secret).into_body(),
                4096,
            )
            .await
            .unwrap();
            let mut body: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
            body["ingestion_mode"] = mode.into();
            Response::builder()
                .header("content-type", "application/json")
                .body(Body::from(body.to_string()))
                .unwrap()
        }
    })
    .await;
    web.control_plane()
        .resolve("gateway-secret", api_format)
        .await
        .unwrap()
}
