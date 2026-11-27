//! Pooled HTTPS client and concurrent dispatcher for external guardrail
//! providers. Timeouts and provider errors fail closed so unscreened prompts
//! never bypass a configured guardrail.
use std::{
    collections::BTreeMap,
    mem::{Discriminant, discriminant},
    sync::Arc,
    time::Duration,
};

use axum::body::Bytes;
use futures_util::future::join_all;
use reqwest::{
    Body, Client, StatusCode, Url,
    header::{
        ACCEPT, ACCEPT_ENCODING, AUTHORIZATION, CONTENT_LENGTH, CONTENT_TYPE, HeaderName,
        HeaderValue,
    },
};
use reqwest_middleware::ClientWithMiddleware;
use reqwest_tracing::DisableOtelPropagation;
use secrecy::{ExposeSecret, SecretString};

use crate::{
    guardrails::{
        Guardrail, GuardrailLocation,
        bedrock::{self, BedrockGuardrail},
        decision_model::{self, DecisionModelGuardrail},
        lakera::{self, LakeraGuardrail},
        openai_moderation::{self, OpenAiModerationGuardrail},
        text::Speaker,
    },
    providers::{OutboundPolicy, PolicyResolver},
    resolution::{ApiFormat, Provider, ResolutionError, valid_extra_header, valid_token},
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

/// Why one external guardrail HTTP call failed; logged and mapped to a fail-closed outcome.
pub(crate) enum ExternalCallFailure {
    InvalidUrl,
    BlockedDestination,
    InvalidCredential,
    Serialization,
    RequestTooLarge,
    Transport,
    Timeout,
    HttpStatus(StatusCode),
    ResponseTooLarge,
    InvalidResponse,
    UnexpectedAction,
}

impl ExternalCallFailure {
    fn reason(&self) -> &'static str {
        match self {
            Self::InvalidUrl => "invalid_url",
            Self::BlockedDestination => "blocked_destination",
            Self::InvalidCredential => "invalid_credential",
            Self::Serialization => "serialization",
            Self::RequestTooLarge => "request_too_large",
            Self::Transport => "transport",
            Self::Timeout => "timeout",
            Self::HttpStatus(_) => "http_status",
            Self::ResponseTooLarge => "response_too_large",
            Self::InvalidResponse => "invalid_response",
            Self::UnexpectedAction => "unexpected_action",
        }
    }

    fn status(&self) -> Option<u16> {
        match self {
            Self::HttpStatus(status) => Some(status.as_u16()),
            Self::InvalidUrl
            | Self::BlockedDestination
            | Self::InvalidCredential
            | Self::Serialization
            | Self::RequestTooLarge
            | Self::Transport
            | Self::Timeout
            | Self::ResponseTooLarge
            | Self::InvalidResponse
            | Self::UnexpectedAction => None,
        }
    }

    fn kind(&self) -> ExternalFailureKind {
        match self {
            Self::Timeout => ExternalFailureKind::Timeout,
            Self::HttpStatus(StatusCode::TOO_MANY_REQUESTS) => ExternalFailureKind::RateLimited,
            Self::InvalidUrl
            | Self::BlockedDestination
            | Self::InvalidCredential
            | Self::Serialization
            | Self::RequestTooLarge
            | Self::Transport
            | Self::HttpStatus(_)
            | Self::ResponseTooLarge
            | Self::InvalidResponse
            | Self::UnexpectedAction => ExternalFailureKind::Unavailable,
        }
    }

    /// Logs the failure without provider bodies or credentials and returns the
    /// fail-closed outcome.
    pub(crate) fn into_outcome(
        self,
        provider: &'static str,
        guardrail_id: &str,
        organization_id: &str,
        region: &str,
    ) -> ExternalOutcome {
        tracing::warn!(
            provider,
            guardrail_id,
            organization_id,
            region,
            reason = self.reason(),
            status = self.status(),
            "external guardrail check failed; failing closed"
        );
        ExternalOutcome::Failed(self.kind())
    }
}

/// One text block an external guardrail screens, with the chat role it had.
#[derive(Clone, Copy, Debug)]
pub(crate) struct ExternalBlock<'a> {
    pub text: &'a str,
    pub speaker: Speaker,
}

#[cfg(test)]
impl<'a> ExternalBlock<'a> {
    pub(crate) fn user(text: &'a str) -> Self {
        Self {
            text,
            speaker: Speaker::User,
        }
    }
}

/// An external guardrail provider together with its resolved configuration.
/// Adding a provider means adding a variant here and arms in this impl.
#[derive(Clone, Debug)]
pub(crate) enum ExternalGuardrail {
    Bedrock(BedrockGuardrail),
    OpenAiModeration(OpenAiModerationGuardrail),
    Lakera(LakeraGuardrail),
    DecisionModel(DecisionModelGuardrail),
}

/// Provider fields of a `/resolve` guardrail; each provider reads its own.
pub(crate) struct ExternalFields {
    pub guardrail_id: Option<String>,
    pub guardrail_version: Option<String>,
    pub region: Option<String>,
    pub project_id: Option<String>,
    pub provider: Option<Provider>,
    pub base_url: Option<String>,
    pub model: Option<String>,
    pub instructions: Option<String>,
    pub threshold: Option<f64>,
    pub api_key: Option<SecretString>,
    pub extra_headers: BTreeMap<String, SecretString>,
}

impl ExternalGuardrail {
    /// Builds the provider named by the `/resolve` `type`, `Ok(None)` for a type
    /// this gateway does not know, or the name of a missing required field.
    pub(crate) fn from_resolve(
        kind: &str,
        fields: ExternalFields,
    ) -> Result<Option<Self>, &'static str> {
        let ExternalFields {
            guardrail_id,
            guardrail_version,
            region,
            project_id,
            provider,
            base_url,
            model,
            instructions,
            threshold,
            api_key,
            extra_headers,
        } = fields;
        Ok(Some(match kind {
            "bedrock" => Self::Bedrock(BedrockGuardrail {
                guardrail_id: guardrail_id.ok_or("guardrail_id")?,
                guardrail_version: guardrail_version.ok_or("guardrail_version")?,
                region: region.ok_or("region")?,
                api_key: api_key.ok_or("api_key")?,
            }),
            "openai_moderation" => Self::OpenAiModeration(OpenAiModerationGuardrail {
                region: region.ok_or("region")?,
                api_key: api_key.ok_or("api_key")?,
            }),
            "lakera" => Self::Lakera(LakeraGuardrail {
                region: region.ok_or("region")?,
                project_id,
                api_key: api_key.ok_or("api_key")?,
            }),
            "decision_model" => Self::DecisionModel(DecisionModelGuardrail {
                provider: provider.ok_or("provider")?,
                base_url: base_url.ok_or("base_url")?,
                model: model.ok_or("model")?,
                instructions: instructions.ok_or("instructions")?,
                threshold: threshold.ok_or("threshold")?,
                api_key: api_key.ok_or("api_key")?,
                extra_headers,
            }),
            _ => return Ok(None),
        }))
    }

    /// Whether `/resolve` sent a usable configuration. An unknown region of
    /// `OpenAI` Moderation or Lakera fails only that guardrail closed at check
    /// time, so Web can add regions before every gateway knows them.
    pub(crate) fn is_valid(&self) -> bool {
        match self {
            Self::Bedrock(config) => {
                crate::resolution::bedrock::is_aws_region(&config.region)
                    && !config.guardrail_id.trim().is_empty()
                    && !config.guardrail_version.trim().is_empty()
                    && valid_token(config.api_key.expose_secret())
            }
            Self::OpenAiModeration(config) => valid_token(config.api_key.expose_secret()),
            Self::Lakera(config) => {
                config.project_id.as_deref().is_none_or(valid_token)
                    && valid_token(config.api_key.expose_secret())
            }
            Self::DecisionModel(config) => {
                config.provider.supports(ApiFormat::OpenAiDecisions)
                    && config
                        .provider
                        .allows_base_url(ApiFormat::OpenAiDecisions, &config.base_url)
                    && !config.model.trim().is_empty()
                    && !config.instructions.trim().is_empty()
                    && config.threshold.is_finite()
                    && (0.0..=1.0).contains(&config.threshold)
                    && valid_token(config.api_key.expose_secret())
                    && config
                        .extra_headers
                        .iter()
                        .all(|(name, value)| valid_extra_header(name, value.expose_secret()))
            }
        }
    }

    /// Serializes `blocks` the way this provider reads them.
    fn serialize(
        &self,
        blocks: &[ExternalBlock<'_>],
        texts: &[&str],
        location: GuardrailLocation,
    ) -> Option<Bytes> {
        match self {
            Self::Bedrock(_) => bedrock::serialize_blocks(texts, location),
            Self::OpenAiModeration(_) => openai_moderation::serialize_blocks(texts),
            Self::Lakera(_) => lakera::serialize_blocks(blocks),
            Self::DecisionModel(_) => decision_model::serialize_blocks(blocks),
        }
    }

    async fn evaluate(
        &self,
        client: &ExternalGuardrailClient,
        guardrail_id: &str,
        payload: ExternalPayload,
        organization_id: &str,
    ) -> ExternalOutcome {
        match self {
            Self::Bedrock(config) => {
                bedrock::evaluate_one(client, guardrail_id, config, payload.body, organization_id)
                    .await
            }
            Self::OpenAiModeration(config) => {
                openai_moderation::evaluate_one(
                    client,
                    guardrail_id,
                    config,
                    payload,
                    organization_id,
                )
                .await
            }
            Self::Lakera(config) => {
                lakera::evaluate_one(client, guardrail_id, config, payload.body, organization_id)
                    .await
            }
            Self::DecisionModel(config) => {
                decision_model::evaluate_one(
                    client,
                    guardrail_id,
                    config,
                    &payload.body,
                    organization_id,
                )
                .await
            }
        }
    }
}

/// One provider's serialized request and the number of text blocks it carries.
#[derive(Clone)]
pub(crate) struct ExternalPayload {
    pub body: Bytes,
    pub blocks: usize,
}

/// Pre-serialized request payloads, one per provider in the batch, built once
/// per request so temporary text copies can be dropped before awaiting network I/O.
pub(crate) struct ExternalPayloads(Vec<(Discriminant<ExternalGuardrail>, Option<ExternalPayload>)>);

impl ExternalPayloads {
    /// How many provider payloads [`Self::for_guardrails`] serializes for
    /// `guardrails`, each holding its own copy of the scoped text.
    pub(crate) fn count_for(guardrails: &[&Guardrail]) -> usize {
        let mut providers: Vec<Discriminant<ExternalGuardrail>> = Vec::new();
        for external in guardrails
            .iter()
            .filter_map(|guardrail| guardrail.kind.external())
        {
            if !providers.contains(&discriminant(external)) {
                providers.push(discriminant(external));
            }
        }
        providers.len()
    }

    pub(crate) fn for_guardrails(
        guardrails: &[&Guardrail],
        blocks: &[ExternalBlock<'_>],
        location: GuardrailLocation,
    ) -> Self {
        let texts: Vec<&str> = blocks.iter().map(|block| block.text).collect();
        let mut payloads = Vec::new();
        for external in guardrails
            .iter()
            .filter_map(|guardrail| guardrail.kind.external())
        {
            let provider = discriminant(external);
            if payloads
                .iter()
                .any(|(serialized, _)| *serialized == provider)
            {
                continue;
            }
            let payload =
                external
                    .serialize(blocks, &texts, location)
                    .map(|body| ExternalPayload {
                        body,
                        blocks: blocks.len(),
                    });
            payloads.push((provider, payload));
        }
        Self(payloads)
    }

    fn get(&self, external: &ExternalGuardrail) -> Option<ExternalPayload> {
        let provider = discriminant(external);
        self.0
            .iter()
            .find(|(serialized, _)| *serialized == provider)
            .and_then(|(_, payload)| payload.clone())
    }
}

/// Whether an external guardrail targets an official provider origin (which may
/// resolve to private VPC-endpoint addresses) or a user-supplied custom base URL
/// (which requires full SSRF URL and DNS-resolution checks).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum DestinationKind {
    Official,
    Custom,
}

/// Parameters for an external guardrail JSON POST request.
pub(crate) struct ExternalJsonRequest<'a> {
    pub url: Url,
    pub destination: DestinationKind,
    pub api_key: &'a SecretString,
    pub extra_headers: &'a BTreeMap<String, SecretString>,
    pub body: Body,
    pub content_length: usize,
    pub response_limit: usize,
}

fn external_client_builder(timeout: Duration) -> reqwest::ClientBuilder {
    Client::builder()
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
}

/// Pooled HTTPS client shared across all external guardrail providers.
#[derive(Clone)]
pub(crate) struct ExternalGuardrailClient {
    pub(super) http: ClientWithMiddleware,
    custom_base_url_http: ClientWithMiddleware,
    pub(super) policy: Arc<OutboundPolicy>,
    pub(super) timeout: Duration,
    #[cfg(test)]
    pub(super) origin_override: Option<String>,
}

impl ExternalGuardrailClient {
    pub(crate) fn new(policy: OutboundPolicy, timeout: Duration) -> Result<Self, ResolutionError> {
        let policy = Arc::new(policy);
        let client = external_client_builder(timeout)
            .build()
            .map_err(|_| ResolutionError::Configuration)?;
        let custom_base_url_client = external_client_builder(timeout)
            .dns_resolver(PolicyResolver(Arc::clone(&policy)))
            .build()
            .map_err(|_| ResolutionError::Configuration)?;
        Ok(Self {
            http: crate::observability::instrument_client(client, "guardrail.external"),
            custom_base_url_http: crate::observability::instrument_client(
                custom_base_url_client,
                "guardrail.external",
            ),
            policy,
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
        let Some(external) = guardrail.kind.external() else {
            return ExternalOutcome::None;
        };
        let Some(payload) = payloads.get(external) else {
            tracing::warn!(
                guardrail_id = %guardrail.id,
                organization_id,
                reason = "serialization",
                "external guardrail request failed to serialize; failing closed"
            );
            return ExternalOutcome::Failed(ExternalFailureKind::Unavailable);
        };
        external
            .evaluate(self, &guardrail.id, payload, organization_id)
            .await
    }

    /// POSTs a JSON body with bearer auth under the per-call timeout and returns
    /// the body of a `200 OK` response, bounded by `response_limit` bytes.
    pub(crate) async fn post_json(
        &self,
        url: Url,
        api_key: &SecretString,
        body: Body,
        content_length: usize,
        response_limit: usize,
    ) -> Result<Vec<u8>, ExternalCallFailure> {
        let extra_headers = BTreeMap::new();
        self.post_json_request(ExternalJsonRequest {
            url,
            destination: DestinationKind::Official,
            api_key,
            extra_headers: &extra_headers,
            body,
            content_length,
            response_limit,
        })
        .await
    }

    /// POSTs a JSON body with bearer auth and optional extra headers under the
    /// per-call timeout, returning a `200 OK` body bounded by `response_limit`.
    pub(crate) async fn post_json_request(
        &self,
        params: ExternalJsonRequest<'_>,
    ) -> Result<Vec<u8>, ExternalCallFailure> {
        let ExternalJsonRequest {
            url,
            destination,
            api_key,
            extra_headers,
            body,
            content_length,
            response_limit,
        } = params;
        let http = match destination {
            DestinationKind::Official => {
                if self.policy.check_allowed_host(&url).is_err() {
                    return Err(ExternalCallFailure::BlockedDestination);
                }
                &self.http
            }
            DestinationKind::Custom => {
                if self.policy.check_url(&url).is_err() {
                    return Err(ExternalCallFailure::BlockedDestination);
                }
                &self.custom_base_url_http
            }
        };
        let mut authorization =
            HeaderValue::from_str(&format!("Bearer {}", api_key.expose_secret()))
                .map_err(|_| ExternalCallFailure::InvalidCredential)?;
        authorization.set_sensitive(true);
        let mut request = http.post(url).with_extension(DisableOtelPropagation);
        for (name, value) in extra_headers {
            let header_name = HeaderName::from_bytes(name.as_bytes())
                .map_err(|_| ExternalCallFailure::InvalidCredential)?;
            let mut header_value = HeaderValue::from_str(value.expose_secret())
                .map_err(|_| ExternalCallFailure::InvalidCredential)?;
            header_value.set_sensitive(true);
            request = request.header(header_name, header_value);
        }
        let request = request
            .header(AUTHORIZATION, authorization)
            .header(CONTENT_TYPE, "application/json")
            .header(CONTENT_LENGTH, content_length)
            .header(ACCEPT, "application/json")
            .header(ACCEPT_ENCODING, "identity")
            .body(body);
        tokio::time::timeout(self.timeout, async {
            let response = request
                .send()
                .await
                .map_err(|_| ExternalCallFailure::Transport)?;
            let status = response.status();
            if status != StatusCode::OK {
                return Err(ExternalCallFailure::HttpStatus(status));
            }
            read_bounded_body(response, response_limit).await
        })
        .await
        .map_err(|_| ExternalCallFailure::Timeout)?
    }

    #[cfg(test)]
    pub(crate) fn for_test(origin: String, timeout: Duration) -> Self {
        let mut client = Self::new(OutboundPolicy::default(), timeout).unwrap();
        client.origin_override = Some(origin);
        client
    }
}

async fn read_bounded_body(
    mut response: reqwest::Response,
    limit: usize,
) -> Result<Vec<u8>, ExternalCallFailure> {
    if response
        .content_length()
        .is_some_and(|length| usize::try_from(length).unwrap_or(usize::MAX) > limit)
    {
        return Err(ExternalCallFailure::ResponseTooLarge);
    }
    let mut body = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| ExternalCallFailure::Transport)?
    {
        if chunk.len() > limit.saturating_sub(body.len()) {
            return Err(ExternalCallFailure::ResponseTooLarge);
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
}
