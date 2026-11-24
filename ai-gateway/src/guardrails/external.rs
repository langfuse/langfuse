//! Pooled HTTPS client and concurrent dispatcher for external guardrail
//! providers. Timeouts and provider errors fail closed so unscreened prompts
//! never bypass a configured guardrail.
use std::{sync::Arc, time::Duration};

use axum::body::Bytes;
use futures_util::future::join_all;
use reqwest::Client;
use reqwest_middleware::ClientWithMiddleware;

use crate::{
    guardrails::{Guardrail, GuardrailKind, bedrock},
    providers::OutboundPolicy,
    resolution::ResolutionError,
};

const EXTERNAL_GUARDRAIL_TIMEOUT: Duration = Duration::from_secs(5);
const EXTERNAL_CONNECT_TIMEOUT: Duration = Duration::from_secs(3);
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(50);
const TCP_KEEPALIVE: Duration = Duration::from_secs(30);

/// Pre-serialized request payloads for external guardrail providers, built once
/// per request so `turn_text` can be dropped before awaiting network I/O.
pub(crate) struct ExternalPayloads {
    bedrock: Option<Bytes>,
}

impl ExternalPayloads {
    pub(crate) fn serialize(guardrails: &[&Guardrail], text: &str) -> Self {
        let needs_bedrock = guardrails
            .iter()
            .any(|guardrail| matches!(guardrail.kind, GuardrailKind::Bedrock(_)));
        let bedrock = needs_bedrock
            .then(|| bedrock::serialize_request(text))
            .flatten();
        Self { bedrock }
    }
}

/// Pooled HTTPS client shared across all external guardrail providers.
#[derive(Clone)]
pub(crate) struct ExternalGuardrailClient {
    client: ClientWithMiddleware,
    policy: Arc<OutboundPolicy>,
    timeout: Duration,
    #[cfg(test)]
    origin_override: Option<String>,
}

impl ExternalGuardrailClient {
    pub(crate) fn new(policy: OutboundPolicy) -> Result<Self, ResolutionError> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .connect_timeout(EXTERNAL_CONNECT_TIMEOUT)
            .pool_idle_timeout(POOL_IDLE_TIMEOUT)
            .tcp_keepalive(TCP_KEEPALIVE)
            .pool_max_idle_per_host(16)
            .build()
            .map_err(|_| ResolutionError::Configuration)?;
        Ok(Self {
            client: crate::observability::instrument_client(client, "guardrail.external"),
            policy: Arc::new(policy),
            timeout: EXTERNAL_GUARDRAIL_TIMEOUT,
            #[cfg(test)]
            origin_override: None,
        })
    }

    /// Evaluates every external guardrail concurrently using its pre-serialized
    /// payload. Timeouts and errors fail closed (`true`).
    pub(crate) async fn evaluate_many(
        &self,
        guardrails: &[&Guardrail],
        payloads: &ExternalPayloads,
        organization_id: &str,
    ) -> Vec<bool> {
        if guardrails.is_empty() {
            return Vec::new();
        }
        join_all(
            guardrails
                .iter()
                .map(|guardrail| self.evaluate_one(guardrail, payloads, organization_id)),
        )
        .await
    }

    async fn evaluate_one(
        &self,
        guardrail: &Guardrail,
        payloads: &ExternalPayloads,
        organization_id: &str,
    ) -> bool {
        match &guardrail.kind {
            GuardrailKind::Bedrock(config) => {
                let Some(payload) = payloads.bedrock.clone() else {
                    tracing::warn!(
                        guardrail_id = %guardrail.id,
                        organization_id,
                        reason = "serialization",
                        "external guardrail request failed to serialize; failing closed"
                    );
                    return true;
                };
                #[cfg(test)]
                let origin_override = self.origin_override.as_deref();
                #[cfg(not(test))]
                let origin_override: Option<&str> = None;
                bedrock::evaluate_one(
                    &self.client,
                    &self.policy,
                    self.timeout,
                    origin_override,
                    &guardrail.id,
                    config,
                    payload,
                    organization_id,
                )
                .await
            }
            GuardrailKind::Regex { .. } | GuardrailKind::Unknown => false,
        }
    }

    #[cfg(test)]
    pub(crate) fn for_test(origin: String, timeout: Duration) -> Self {
        let mut client = Self::new(OutboundPolicy::default()).unwrap();
        client.timeout = timeout;
        client.origin_override = Some(origin);
        client
    }
}
