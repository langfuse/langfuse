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

const MAX_EXTERNAL_CONNECT_TIMEOUT: Duration = Duration::from_secs(2);
const POOL_IDLE_TIMEOUT: Duration = Duration::from_secs(50);
const TCP_KEEPALIVE: Duration = Duration::from_secs(30);

/// Why an external guardrail provider call could not complete.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum ExternalFailureKind {
    RateLimited,
    Timeout,
    Unavailable,
}

/// Result of evaluating one external guardrail.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) enum ExternalOutcome {
    None,
    /// Provider blocked the request (or intervened without anonymized text).
    Blocked,
    /// Provider anonymized the content blocks and returned masked outputs.
    Anonymized(Vec<String>),
    /// Provider error, timeout, or rate limit; fails closed.
    Failed(ExternalFailureKind),
}

/// Pre-serialized request payloads for external guardrail providers, built once
/// per request so temporary text copies can be dropped before awaiting network I/O.
pub(crate) struct ExternalPayloads {
    bedrock: Option<Bytes>,
}

impl ExternalPayloads {
    pub(crate) fn for_guardrails(guardrails: &[&Guardrail], blocks: &[&str]) -> Self {
        let needs_bedrock = guardrails
            .iter()
            .any(|guardrail| matches!(guardrail.kind, GuardrailKind::Bedrock(_)));
        let bedrock = needs_bedrock
            .then(|| bedrock::serialize_request_blocks(blocks))
            .flatten();
        Self { bedrock }
    }
}

/// Pooled HTTPS client shared across all external guardrail providers.
#[derive(Clone)]
pub(crate) struct ExternalGuardrailClient {
    pub(super) http: ClientWithMiddleware,
    pub(super) policy: Arc<OutboundPolicy>,
    pub(super) timeout: Duration,
    #[cfg(test)]
    pub(super) origin_override: Option<String>,
}

impl ExternalGuardrailClient {
    pub(crate) fn new(policy: OutboundPolicy, timeout: Duration) -> Result<Self, ResolutionError> {
        let client = Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .no_proxy()
            .no_gzip()
            .no_brotli()
            .no_deflate()
            .no_zstd()
            .connect_timeout(timeout.min(MAX_EXTERNAL_CONNECT_TIMEOUT))
            .pool_idle_timeout(POOL_IDLE_TIMEOUT)
            .tcp_keepalive(TCP_KEEPALIVE)
            .pool_max_idle_per_host(16)
            .build()
            .map_err(|_| ResolutionError::Configuration)?;
        Ok(Self {
            http: crate::observability::instrument_client(client, "guardrail.external"),
            policy: Arc::new(policy),
            timeout,
            #[cfg(test)]
            origin_override: None,
        })
    }

    /// Evaluates every external guardrail concurrently using its pre-serialized
    /// payload. Timeouts and errors fail closed ([`ExternalOutcome::Failed`]).
    pub(crate) async fn evaluate_many(
        &self,
        guardrails: &[&Guardrail],
        payloads: &ExternalPayloads,
        organization_id: &str,
    ) -> Vec<ExternalOutcome> {
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

    pub(crate) async fn evaluate_one(
        &self,
        guardrail: &Guardrail,
        payloads: &ExternalPayloads,
        organization_id: &str,
    ) -> ExternalOutcome {
        match &guardrail.kind {
            GuardrailKind::Bedrock(config) => {
                let Some(payload) = payloads.bedrock.clone() else {
                    tracing::warn!(
                        guardrail_id = %guardrail.id,
                        organization_id,
                        reason = "serialization",
                        "external guardrail request failed to serialize; failing closed"
                    );
                    return ExternalOutcome::Failed(ExternalFailureKind::Unavailable);
                };
                bedrock::evaluate_one(self, &guardrail.id, config, payload, organization_id).await
            }
            GuardrailKind::Regex { .. } | GuardrailKind::FailClosed | GuardrailKind::Unknown => {
                ExternalOutcome::None
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn for_test(origin: String, timeout: Duration) -> Self {
        let mut client = Self::new(OutboundPolicy::default(), timeout).unwrap();
        client.origin_override = Some(origin);
        client
    }
}
