use std::{
    io::{self, Write},
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::http::{HeaderValue, header};
use reqwest::{Client, Url};
use reqwest_middleware::ClientWithMiddleware;
use serde::Serialize;
use serde_json::{Value, json};

use super::Grant;
use crate::resolution::{ControlPlaneConfig, ResolutionError, signing};

const INGESTION_PATH: &str = "/api/public/otel/v1/traces";
const MAX_PAYLOAD_BYTES: usize = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES: usize = 64 * 1024;
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(30);

pub(super) struct Uploader {
    client: ClientWithMiddleware,
    endpoint: Url,
    service_key: String,
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum ExportError {
    Expired,
    Payload,
    Transport,
    Rejected {
        status: u16,
        retry_after: Option<Duration>,
    },
    Response,
    Partial,
}

impl ExportError {
    pub fn reason(&self) -> &'static str {
        match self {
            Self::Expired => "expired_grant",
            Self::Payload => "payload",
            Self::Transport => "transport",
            Self::Rejected { .. } => "http_status",
            Self::Response => "invalid_response",
            Self::Partial => "rejected_spans",
        }
    }

    pub fn is_transient(&self) -> bool {
        match self {
            Self::Transport => true,
            Self::Rejected { status, .. } => matches!(status, 408 | 429 | 500 | 502 | 503 | 504),
            _ => false,
        }
    }

    pub fn retry_after(&self) -> Option<Duration> {
        match self {
            Self::Rejected { retry_after, .. } => *retry_after,
            _ => None,
        }
    }
}

impl Uploader {
    pub fn new(config: &ControlPlaneConfig) -> Result<Self, ResolutionError> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .connect_timeout(Duration::from_secs(2))
            .timeout(UPLOAD_TIMEOUT)
            .pool_max_idle_per_host(16)
            .build()
            .map_err(|_| ResolutionError::Configuration)?;
        Ok(Self {
            client: crate::observability::instrument_client(client, "ingestion"),
            endpoint: config.endpoint(INGESTION_PATH),
            service_key: config.service_key().to_owned(),
        })
    }

    pub async fn export(&self, grant: &Grant, spans: &[impl Serialize]) -> Result<(), ExportError> {
        let payload = json!({"resourceSpans": [{
            "resource": {"attributes": [{"key": "service.name", "value": {"stringValue": "langfuse-ai-gateway"}}]},
            "scopeSpans": [{"scope": {"name": "langfuse-ai-gateway", "version": env!("CARGO_PKG_VERSION")}, "spans": spans}]
        }]});
        let mut body = LimitedBody(Vec::new());
        serde_json::to_writer(&mut body, &payload).map_err(|_| ExportError::Payload)?;
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|_| ExportError::Expired)?;
        let remaining = Duration::from_secs(grant.expires_at)
            .checked_sub(now)
            .filter(|duration| !duration.is_zero())
            .ok_or(ExportError::Expired)?;
        let mut authorization = HeaderValue::from_str(&format!("Bearer {}", grant.access_token))
            .map_err(|_| ExportError::Payload)?;
        authorization.set_sensitive(true);
        let mut signature = HeaderValue::from_str(&signing::authorization(
            &self.service_key,
            &grant.access_token,
            now.as_secs(),
        ))
        .map_err(|_| ExportError::Payload)?;
        signature.set_sensitive(true);
        let mut response = self
            .client
            .post(self.endpoint.clone())
            .header(header::AUTHORIZATION, authorization)
            .header("langfuse-gateway-authorization", signature)
            .header(header::CONTENT_TYPE, "application/json")
            .header(header::ACCEPT_ENCODING, "identity")
            .header("x-langfuse-sdk-name", "langfuse-ai-gateway")
            .header("x-langfuse-sdk-version", env!("CARGO_PKG_VERSION"))
            .header("x-langfuse-ingestion-version", "4")
            .timeout(UPLOAD_TIMEOUT.min(remaining))
            .body(body.0)
            .send()
            .await
            .map_err(|_| ExportError::Transport)?;
        let status = response.status().as_u16();
        if status != 200 {
            let retry_after = response
                .headers()
                .get(header::RETRY_AFTER)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.trim().parse().ok())
                .map(Duration::from_secs);
            return Err(ExportError::Rejected {
                status,
                retry_after,
            });
        }
        if response
            .content_length()
            .is_some_and(|size| size > MAX_RESPONSE_BYTES as u64)
        {
            return Err(ExportError::Response);
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|_| ExportError::Response)? {
            if chunk.len() > MAX_RESPONSE_BYTES - bytes.len() {
                return Err(ExportError::Response);
            }
            bytes.extend_from_slice(&chunk);
        }
        let result: Value = serde_json::from_slice(&bytes).map_err(|_| ExportError::Response)?;
        if !result.is_object() {
            return Err(ExportError::Response);
        }
        if let Some(partial) = result.get("partialSuccess") {
            if !partial.is_object() {
                return Err(ExportError::Response);
            }
            let rejected = match partial.get("rejectedSpans") {
                None => 0,
                Some(Value::String(value)) => {
                    value.parse::<u64>().map_err(|_| ExportError::Response)?
                }
                Some(value) => value.as_u64().ok_or(ExportError::Response)?,
            };
            if rejected > 0 {
                return Err(ExportError::Partial);
            }
        }
        Ok(())
    }
}

struct LimitedBody(Vec<u8>);

impl Write for LimitedBody {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        if bytes.len() > MAX_PAYLOAD_BYTES - self.0.len() {
            return Err(io::Error::other("telemetry payload limit"));
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }
    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}
