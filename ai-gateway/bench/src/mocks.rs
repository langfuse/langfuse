//! Local mock servers for Control Plane (/resolve + /ingestion), Upstream LLM,
//! and AWS Bedrock ApplyGuardrail.
use std::{
    net::SocketAddr,
    sync::{Arc, RwLock},
    time::Duration,
};

use axum::{
    Json, Router,
    body::Bytes,
    extract::{DefaultBodyLimit, State},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Deserialize;
use tokio::net::TcpListener;

use crate::payloads::ResolveGuardrail;

pub const VICTIM_KEY: &str = "gw_bench_victim_class_a";
pub const AGGRESSOR_KEY: &str = "gw_bench_aggressor_class_b";

#[derive(Clone, Copy, Debug)]
pub enum BedrockMode {
    None,
    Anonymize,
    Block,
}

#[derive(Clone, Debug)]
pub struct MockConfig {
    pub class_b_guardrails: Vec<ResolveGuardrail>,
    pub ingestion_mode: &'static str,
    pub llm_delay: Duration,
    pub bedrock_delay: Duration,
    pub bedrock_mode: BedrockMode,
}

impl Default for MockConfig {
    fn default() -> Self {
        Self {
            class_b_guardrails: Vec::new(),
            ingestion_mode: "none",
            llm_delay: Duration::from_millis(200),
            bedrock_delay: Duration::from_millis(150),
            bedrock_mode: BedrockMode::Anonymize,
        }
    }
}

pub struct MockCluster {
    pub control_plane_url: String,
    pub bedrock_origin: String,
    pub config: Arc<RwLock<MockConfig>>,
}

#[derive(Clone)]
struct ControlPlaneState {
    llm_base_url: String,
    config: Arc<RwLock<MockConfig>>,
}

impl MockCluster {
    pub async fn start(initial: MockConfig) -> Self {
        let config = Arc::new(RwLock::new(initial));

        let llm_addr = spawn_router(
            Router::new()
                .route("/v1/chat/completions", post(handle_llm_chat))
                .layer(DefaultBodyLimit::disable())
                .with_state(Arc::clone(&config)),
        )
        .await;
        let llm_base_url = format!("http://{llm_addr}/v1");

        let cp_state = ControlPlaneState {
            llm_base_url,
            config: Arc::clone(&config),
        };
        let cp_addr = spawn_router(
            Router::new()
                .route("/api/public/health", get(|| async { StatusCode::OK }))
                .route("/api/internal/ai-gateway/v1/resolve", post(handle_resolve))
                .route(
                    "/api/internal/ai-gateway/v1/ingestion",
                    post(|| async { StatusCode::OK }),
                )
                .with_state(cp_state),
        )
        .await;

        let bedrock_addr = spawn_router(
            Router::new()
                .route(
                    "/guardrail/{id}/version/{version}/apply",
                    post(handle_bedrock_apply),
                )
                .layer(DefaultBodyLimit::disable())
                .with_state(Arc::clone(&config)),
        )
        .await;

        Self {
            control_plane_url: format!("http://{cp_addr}"),
            bedrock_origin: format!("http://{bedrock_addr}"),
            config,
        }
    }

    pub fn update(&self, next: MockConfig) {
        let mut guard = self
            .config
            .write()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        *guard = next;
    }
}

async fn spawn_router(router: Router) -> SocketAddr {
    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind mock listener");
    let addr = listener.local_addr().expect("mock local_addr");
    tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    addr
}

async fn handle_resolve(State(state): State<ControlPlaneState>, headers: HeaderMap) -> Response {
    let bearer = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .unwrap_or_default();

    let (org_id, project_id, key_id, guardrails, ingestion_mode) = {
        let cfg = state
            .config
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if bearer == AGGRESSOR_KEY {
            (
                "org-aggressor",
                "proj-aggressor",
                "key-aggressor",
                cfg.class_b_guardrails.clone(),
                cfg.ingestion_mode,
            )
        } else {
            (
                "org-victim",
                "proj-victim",
                "key-victim",
                Vec::new(),
                cfg.ingestion_mode,
            )
        }
    };

    let ingestion = if ingestion_mode == "none" {
        serde_json::Value::Null
    } else {
        serde_json::json!({
            "access_token": make_mock_jwt(org_id, project_id),
            "token_type": "Bearer",
            "expires_at": 4_102_444_800u64,
        })
    };

    let body = serde_json::json!({
        "version": 1,
        "connection": {
            "id": "conn-mock-openai",
            "name": "mock-openai",
            "provider": "openai",
            "provider_model": "gpt-4o-mini",
            "api_format": "openai.chat-completions",
            "base_url": state.llm_base_url,
            "auth": {
                "type": "Bearer",
                "token": "mock-upstream-key"
            },
            "extra_headers": {}
        },
        "attribution": {
            "organization_id": org_id,
            "project_id": project_id,
            "key_id": key_id,
            "key_metadata": {},
            "provider_connection_id": "conn-mock-openai"
        },
        "ingestion_mode": ingestion_mode,
        "ingestion": ingestion,
        "spend_limits": [],
        "guardrails": guardrails
    });
    (StatusCode::OK, Json(body)).into_response()
}

fn make_mock_jwt(org_id: &str, project_id: &str) -> String {
    let header = URL_SAFE_NO_PAD.encode(r#"{"alg":"HS256","typ":"JWT"}"#);
    let payload_json = format!(r#"{{"organization_id":"{org_id}","project_id":"{project_id}"}}"#);
    let payload = URL_SAFE_NO_PAD.encode(payload_json);
    format!("{header}.{payload}.benchsig")
}

const LLM_JSON_RESPONSE: &str = r#"{"id":"chatcmpl-bench","object":"chat.completion","created":1764000000,"model":"gpt-4o-mini","choices":[{"index":0,"message":{"role":"assistant","content":"ok"},"finish_reason":"stop"}],"usage":{"prompt_tokens":16,"completion_tokens":2,"total_tokens":18}}"#;

const LLM_SSE_RESPONSE: &str = "data: {\"id\":\"chatcmpl-bench\",\"object\":\"chat.completion.chunk\",\"created\":1764000000,\"model\":\"gpt-4o-mini\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"ok\"},\"finish_reason\":null}]}\n\ndata: {\"id\":\"chatcmpl-bench\",\"object\":\"chat.completion.chunk\",\"created\":1764000000,\"model\":\"gpt-4o-mini\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":16,\"completion_tokens\":2,\"total_tokens\":18}}\n\ndata: [DONE]\n\n";

async fn handle_llm_chat(State(config): State<Arc<RwLock<MockConfig>>>, body: Bytes) -> Response {
    let delay = config
        .read()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .llm_delay;
    if !delay.is_zero() {
        tokio::time::sleep(delay).await;
    }
    let tail = &body[body.len().saturating_sub(128)..];
    let streaming = tail.windows(13).any(|w| w == b"\"stream\":true");
    if streaming {
        (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "text/event-stream")],
            LLM_SSE_RESPONSE,
        )
            .into_response()
    } else {
        (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/json")],
            LLM_JSON_RESPONSE,
        )
            .into_response()
    }
}

#[derive(Deserialize)]
struct BedrockReq {
    content: Vec<BedrockContent>,
}

#[derive(Deserialize)]
struct BedrockContent {
    text: BedrockText,
}

#[derive(Deserialize)]
struct BedrockText {
    text: String,
}

async fn handle_bedrock_apply(
    State(config): State<Arc<RwLock<MockConfig>>>,
    body: Bytes,
) -> Response {
    let (delay, mode) = {
        let cfg = config
            .read()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        (cfg.bedrock_delay, cfg.bedrock_mode)
    };
    if !delay.is_zero() {
        tokio::time::sleep(delay).await;
    }
    match mode {
        BedrockMode::None => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"action":"NONE"}"#,
        )
            .into_response(),
        BedrockMode::Block => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/json")],
            r#"{"action":"GUARDRAIL_INTERVENED","outputs":[{"text":"Blocked by Bedrock"}],"assessments":[{"topicPolicy":{"topics":[{"name":"restricted","action":"BLOCKED","detected":true}]}}]}"#,
        )
            .into_response(),
        BedrockMode::Anonymize => {
            let parsed = serde_json::from_slice::<BedrockReq>(&body);
            let outputs: Vec<serde_json::Value> = match parsed {
                Ok(req) => req
                    .content
                    .into_iter()
                    .map(|item| {
                        let replaced = item
                            .text
                            .text
                            .replace("dana.smith@example.com", "{EMAIL}");
                        let text = if replaced == item.text.text {
                            format!("[ANONYMIZED] {}", item.text.text)
                        } else {
                            replaced
                        };
                        serde_json::json!({ "text": text })
                    })
                    .collect(),
                Err(_) => vec![serde_json::json!({ "text": "[ANONYMIZED]" })],
            };
            let resp = serde_json::json!({
                "action": "GUARDRAIL_INTERVENED",
                "outputs": outputs,
                "assessments": [{
                    "sensitiveInformationPolicy": {
                        "piiEntities": [{
                            "type": "EMAIL",
                            "action": "ANONYMIZED",
                            "detected": true
                        }]
                    }
                }]
            });
            (StatusCode::OK, Json(resp)).into_response()
        }
    }
}
