//! Pure mapping from finalized execution facts to a Langfuse generation span.
use chrono::{DateTime, SecondsFormat};
use serde_json::{Map, Value, json};

use super::context::GenerationContext;
use crate::{
    capture::{InferenceFacts, InputOmissionReason, MAX_INPUT_CAPTURE_BYTES, RelayOutcome},
    observability::{ErrorOrigin, provider_status_reason},
    resolution::ApiFormat,
};

const USER_ID_ATTRIBUTE: &str = "user.id";

pub(super) fn span(facts: InferenceFacts, context: &GenerationContext) -> Value {
    let full = facts.metadata.get("ingestion_mode").and_then(Value::as_str) == Some("full");
    let (level, message) = observation_status(&facts);
    let mut metadata: Map<String, Value> = context
        .metadata
        .iter()
        .filter(|(key, _)| !reserved_metadata(key))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect();
    // Trusted key attribution and gateway facts take precedence over caller metadata.
    metadata.extend(generation_metadata(&facts));
    if let Some(user_agent) = &context.user_agent {
        metadata.insert(
            "langfuse.gateway.client.user_agent".into(),
            json!(user_agent),
        );
    }
    let observation_type = observation_type(facts.api_format);
    let mut attributes = vec![attribute("langfuse.observation.type", observation_type)];
    attributes.extend(context.attributes.iter().map(|(key, value)| {
        attribute(
            key,
            value
                .as_str()
                .map_or_else(|| value.to_string(), str::to_owned),
        )
    }));
    if let Some((source, user_id)) = user_id_source(&facts, context) {
        if let Some(user_id) = user_id {
            attributes.retain(|attribute| attribute["key"] != USER_ID_ATTRIBUTE);
            attributes.push(attribute(USER_ID_ATTRIBUTE, user_id));
        }
        metadata.insert("langfuse.gateway.user_id_source".into(), json!(source));
    }
    let inference = facts.inference;
    if let Some(model) = inference
        .model
        .or(facts.upstream_model)
        .or(inference.requested_model)
    {
        attributes.push(attribute("langfuse.observation.model.name", model));
    }
    if !inference.model_parameters.is_empty() {
        attributes.push(attribute(
            "langfuse.observation.model.parameters",
            Value::Object(inference.model_parameters).to_string(),
        ));
    }
    if let Some(usage) = inference.usage_details {
        attributes.extend(usage_attributes(
            facts.api_format,
            &facts.metadata,
            &usage,
            inference.provider_metadata.as_ref(),
        ));
    }
    if full {
        if let Some(input) = inference.input {
            attributes.push(attribute("langfuse.observation.input", input.to_string()));
        }
        if let Some(output) = inference.output {
            attributes.push(attribute("langfuse.observation.output", output.to_string()));
        }
    }
    if let Some(completion_start) = facts
        .completion_start_ms
        .and_then(|elapsed| facts.start_time_unix_ms.checked_add(elapsed))
        .and_then(|timestamp| i64::try_from(timestamp).ok())
        .and_then(DateTime::from_timestamp_millis)
    {
        attributes.push(attribute(
            "langfuse.observation.completion_start_time",
            completion_start.to_rfc3339_opts(SecondsFormat::Millis, true),
        ));
    }
    attributes.push(attribute("langfuse.observation.level", level));
    if let Some(message) = message {
        attributes.push(attribute("langfuse.observation.status_message", message));
    }
    attributes.push(attribute(
        "langfuse.observation.metadata",
        Value::Object(metadata).to_string(),
    ));
    let mut span = json!({
        "traceId": context.trace_id,
        "spanId": context.observation_id,
        // Generation capture is independent of the caller's sampling decision.
        "flags": 1,
        "name": facts.api_format.as_str(),
        "kind": 3,
        "startTimeUnixNano": facts.start_time_unix_ms.saturating_mul(1_000_000).to_string(),
        "endTimeUnixNano": facts.start_time_unix_ms.saturating_add(facts.duration_ms).saturating_mul(1_000_000).to_string(),
        "attributes": attributes,
        "status": { "code": if level == "ERROR" { 2 } else { 0 } },
    });
    if let Some(parent) = &context.parent_span_id {
        span["parentSpanId"] = json!(parent);
    }
    if !context.trace_state.is_empty() {
        span["traceState"] = json!(context.trace_state);
    }
    span
}

/// A key bound to a user always attributes to that user's email, or to their
/// internal user ID when the email is unknown, even inside a caller's trace.
/// Keys without a bound user, such as service account keys, take the caller's
/// user ID. Only when the gateway starts the trace do they fall back to the
/// key's name, so a caller's trace keeps the user set on its own spans.
fn user_id_source<'a>(
    facts: &'a InferenceFacts,
    context: &GenerationContext,
) -> Option<(&'static str, Option<&'a str>)> {
    if let Some(owner) = facts
        .metadata
        .get("key_owner_user_id")
        .and_then(Value::as_str)
    {
        let email = facts
            .metadata
            .get("key_owner_email")
            .and_then(Value::as_str);
        return Some(("api_key_owner", Some(email.unwrap_or(owner))));
    }
    if context.attributes.contains_key(USER_ID_ATTRIBUTE) {
        return Some(("client", None));
    }
    if context.parent_span_id.is_some() {
        return None;
    }
    facts
        .metadata
        .get("key_name")
        .and_then(Value::as_str)
        .map(|name| ("api_key_name", Some(name)))
}

pub(super) fn omit_input(span: &mut Value, reason: InputOmissionReason) -> bool {
    let Some(attributes) = span["attributes"].as_array_mut() else {
        return false;
    };
    let Some(index) = attributes
        .iter()
        .position(|attribute| attribute["key"] == "langfuse.observation.input")
    else {
        return false;
    };
    attributes.remove(index);
    if let Some(value) = attributes
        .iter_mut()
        .find(|attribute| attribute["key"] == "langfuse.observation.metadata")
        .map(|attribute| &mut attribute["value"]["stringValue"])
        && let Some(Value::Object(mut metadata)) = value
            .as_str()
            .and_then(|value| serde_json::from_str(value).ok())
    {
        metadata.insert(
            "langfuse.gateway.request.input_omitted".into(),
            json!(reason),
        );
        *value = Value::String(Value::Object(metadata).to_string());
    }
    true
}

fn reserved_metadata(key: &str) -> bool {
    [
        "langfuse.gateway",
        "scope",
        "resourceAttributes",
        "attributes",
    ]
    .iter()
    .any(|reserved| key == *reserved || key.starts_with(&format!("{reserved}.")))
}

fn generation_metadata(facts: &InferenceFacts) -> Map<String, Value> {
    let mut metadata = Map::new();
    if let Some(attribution) = facts
        .metadata
        .get("key_metadata")
        .and_then(Value::as_object)
    {
        for (key, value) in attribution {
            metadata.insert(
                format!("langfuse.gateway.api_key.metadata.{key}"),
                value.clone(),
            );
        }
    }
    for (source, target) in [
        ("organization_id", "organization.id"),
        ("ingestion_mode", "ingestion.mode"),
        ("key_id", "api_key.id"),
        ("key_name", "api_key.name"),
        ("key_owner_user_id", "api_key.owner.user_id"),
        ("key_owner_name", "api_key.owner.name"),
        ("provider_connection_id", "connection.id"),
        ("connection_name", "connection.name"),
        ("provider", "connection.provider"),
    ] {
        if let Some(value) = facts.metadata.get(source).filter(|value| !value.is_null()) {
            metadata.insert(format!("langfuse.gateway.{target}"), value.clone());
        }
    }
    for (key, value) in [
        ("model.requested", &facts.inference.requested_model),
        ("model.upstream", &facts.upstream_model),
        ("model.response", &facts.inference.model),
    ] {
        if let Some(value) = value {
            metadata.insert(format!("langfuse.gateway.{key}"), json!(value));
        }
    }
    metadata.insert(
        "langfuse.gateway.request.api_format".into(),
        json!(facts.api_format.as_str()),
    );
    // Before upstream headers, transport failures become gateway HTTP errors.
    // Once headers arrive, later stream failures cannot change the HTTP status.
    let response_status = facts.http_status.or(match facts.outcome {
        RelayOutcome::Timeout => Some(504),
        RelayOutcome::TransportError => Some(502),
        RelayOutcome::Eof | RelayOutcome::Cancelled => None,
    });
    metadata.insert(
        "langfuse.gateway.response.status_code".into(),
        json!(response_status),
    );
    metadata.extend(upstream_metadata(facts));
    for (key, value) in &facts.inference.request_metadata {
        metadata.insert(
            format!("langfuse.gateway.client.request.{key}"),
            value.clone(),
        );
    }
    // Inserted after caller request metadata so the gateway's own ID always wins.
    for (source, target) in [
        ("request_id", "request.id"),
        ("client_request_id", "client.request.id"),
    ] {
        if let Some(value) = facts.metadata.get(source) {
            metadata.insert(format!("langfuse.gateway.{target}"), value.clone());
        }
    }
    if let Some(omission) = facts.inference.input_omission {
        metadata.insert(
            "langfuse.gateway.request.input_omitted".into(),
            json!(omission.reason),
        );
        if omission.reason == InputOmissionReason::SizeLimit {
            metadata.insert(
                "langfuse.gateway.request.input_limit_bytes".into(),
                json!(MAX_INPUT_CAPTURE_BYTES),
            );
        }
    }
    metadata
}

/// Facts about the provider's answer, or why there was none.
fn upstream_metadata(facts: &InferenceFacts) -> Map<String, Value> {
    let mut metadata = Map::new();
    if let Some(status) = facts.http_status {
        metadata.insert(
            "langfuse.gateway.upstream.status_code".into(),
            json!(status),
        );
    }
    if let Some(retry_after_ms) = facts.retry_after_ms {
        metadata.insert(
            "langfuse.gateway.upstream.retry_after_ms".into(),
            json!(retry_after_ms),
        );
    }
    if let Some((origin, kind)) = error_classification(facts) {
        metadata.insert(
            "langfuse.gateway.error.origin".into(),
            json!(origin.as_str()),
        );
        metadata.insert("langfuse.gateway.error.type".into(), json!(kind));
    }
    metadata.insert(
        "langfuse.gateway.request.body_bytes".into(),
        json!(facts.request_body_bytes),
    );
    if facts.http_status.is_some() {
        metadata.insert(
            "langfuse.gateway.response.body_bytes".into(),
            json!(facts.response_body_bytes),
        );
    }
    for (key, value) in [
        (
            "upstream.response.id",
            &facts.inference.provider_response_id,
        ),
        ("upstream.request.id", &facts.inference.provider_request_id),
    ] {
        if let Some(value) = value {
            metadata.insert(format!("langfuse.gateway.{key}"), json!(value));
        }
    }
    metadata
}

/// Mirrors the failure order of [`observation_status`] and the bounded
/// `error.origin`/`error.reason` values on the gateway's own request telemetry.
fn error_classification(facts: &InferenceFacts) -> Option<(ErrorOrigin, &'static str)> {
    if let Some(status) = facts.http_status.filter(|status| *status >= 400) {
        Some((ErrorOrigin::Provider, provider_status_reason(status)))
    } else if facts.inference.provider_status.as_deref() == Some("failed") {
        Some((ErrorOrigin::Provider, "provider_response_failed"))
    } else {
        match facts.outcome {
            RelayOutcome::Timeout => Some((ErrorOrigin::ProviderTransport, "timeout")),
            RelayOutcome::TransportError => Some((ErrorOrigin::ProviderTransport, "transport")),
            RelayOutcome::Eof | RelayOutcome::Cancelled => None,
        }
    }
}

fn observation_status(facts: &InferenceFacts) -> (&'static str, Option<String>) {
    let failure = if let Some(status) = facts.http_status.filter(|status| *status >= 400) {
        Some(format!("Provider HTTP error ({status})"))
    } else if facts.inference.provider_status.as_deref() == Some("failed") {
        Some("Provider response failed".into())
    } else {
        match facts.outcome {
            RelayOutcome::Timeout => Some("Provider response timed out".into()),
            RelayOutcome::TransportError => Some("Provider transport error".into()),
            RelayOutcome::Eof | RelayOutcome::Cancelled => None,
        }
    };
    if let Some(mut message) = failure {
        if let Some(status) = facts.http_status.filter(|status| *status < 400) {
            message = format!("{message} (HTTP {status})");
        }
        if let Some(error) = &facts.inference.error_message {
            message.push_str(": ");
            message.push_str(error);
        }
        ("ERROR", Some(message))
    } else if facts.outcome == RelayOutcome::Cancelled
        && facts.inference.provider_status.as_deref() != Some("completed")
    {
        ("WARNING", Some("Client cancelled the response".into()))
    } else if facts.inference.provider_status.as_deref() == Some("incomplete") {
        ("WARNING", Some("Provider response incomplete".into()))
    } else {
        ("DEFAULT", None)
    }
}

fn attribute(key: &str, value: impl Into<String>) -> Value {
    json!({"key": key, "value": {"stringValue": value.into()}})
}

fn observation_type(api_format: ApiFormat) -> &'static str {
    if api_format == ApiFormat::OpenAiEmbeddings {
        "embedding"
    } else {
        "generation"
    }
}

fn usage_projection(api_format: ApiFormat, usage: &Value) -> Option<Value> {
    match api_format {
        // Decisions reports usage in the Responses shape.
        ApiFormat::OpenAiResponses | ApiFormat::OpenAiDecisions => openai_usage(
            usage,
            ["input_tokens", "output_tokens", "total_tokens"],
            ["input_tokens_details", "output_tokens_details"],
        ),
        ApiFormat::OpenAiChatCompletions => openai_usage(
            usage,
            ["prompt_tokens", "completion_tokens", "total_tokens"],
            ["prompt_tokens_details", "completion_tokens_details"],
        ),
        ApiFormat::AnthropicMessages => usage.is_object().then(|| usage.clone()),
        // Embeddings report `prompt_tokens` and an equal `total_tokens`. Langfuse
        // would sum the two into its total and double the cost, so only the input
        // counter is kept and Langfuse derives the total from it.
        ApiFormat::OpenAiEmbeddings => {
            let input = usage
                .get("prompt_tokens")
                .filter(|value| value.as_u64().is_some())?;
            Some(json!({ "input": input }))
        }
    }
}

fn usage_attributes(
    api_format: ApiFormat,
    metadata: &Value,
    usage: &Value,
    provider_metadata: Option<&Value>,
) -> Vec<Value> {
    let mut projected = usage_projection(api_format, usage);
    if api_format == ApiFormat::OpenAiChatCompletions {
        match metadata.get("provider").and_then(Value::as_str) {
            Some("xai") => projected = projected.map(xai_chat_usage),
            Some("google_ai_studio" | "vertex") => projected = projected.map(gemini_chat_usage),
            _ => {}
        }
    }
    let usage_details = projected
        .map(|projected| attribute("langfuse.observation.usage_details", projected.to_string()));
    let cost_details = cost_projection(metadata, usage, provider_metadata)
        .map(|cost| attribute("langfuse.observation.cost_details", cost.to_string()));
    usage_details.into_iter().chain(cost_details).collect()
}

/// Some providers report the amount they billed inline in their usage. Langfuse
/// then records it, with its breakdown, instead of inferring costs from model prices.
fn cost_projection(
    metadata: &Value,
    usage: &Value,
    provider_metadata: Option<&Value>,
) -> Option<Value> {
    match metadata.get("provider").and_then(Value::as_str)? {
        "openrouter" => openrouter_cost_details(usage),
        "xai" => xai_cost_details(usage),
        "vercel" => vercel_cost_details(usage)
            .or_else(|| provider_metadata.and_then(vercel_gateway_cost_details)),
        _ => None,
    }
}

/// `cost` is what `OpenRouter` charged, in USD. With a bring-your-own provider key
/// it is only `OpenRouter`'s fee, and the provider bills the inference itself, so
/// the total adds that upstream charge or is left to price inference without it.
fn openrouter_cost_details(usage: &Value) -> Option<Value> {
    let usd = |pointer: &str| {
        usage
            .pointer(pointer)?
            .as_f64()
            .filter(|usd| usd.is_finite() && *usd >= 0.0)
    };
    let cost = usd("/cost")?;
    let mut details = Map::new();
    // Responses names the split input/output; Chat Completions and Messages
    // name it prompt/completions.
    for (key, pointers) in [
        (
            "input",
            [
                "/cost_details/upstream_inference_input_cost",
                "/cost_details/upstream_inference_prompt_cost",
            ],
        ),
        (
            "output",
            [
                "/cost_details/upstream_inference_output_cost",
                "/cost_details/upstream_inference_completions_cost",
            ],
        ),
    ] {
        if let Some(usd) = pointers.into_iter().find_map(usd) {
            details.insert(key.into(), json!(usd));
        }
    }
    let total = if usage.get("is_byok").and_then(Value::as_bool) == Some(true) {
        details.insert("openrouter_fee".into(), json!(cost));
        cost + usd("/cost_details/upstream_inference_cost")?
    } else {
        cost
    };
    details.insert("total".into(), json!(total));
    Some(Value::Object(details))
}

/// xAI bills in integer ticks of 10^-10 USD, server-side tool calls included.
fn xai_cost_details(usage: &Value) -> Option<Value> {
    const TICKS_PER_USD: f64 = 1e10;
    let ticks = usage.get("cost_in_usd_ticks")?.as_u64()?;
    #[expect(
        clippy::cast_precision_loss,
        reason = "ticks stay far below 2^53, so the conversion is exact"
    )]
    Some(json!({ "total": ticks as f64 / TICKS_PER_USD }))
}

/// `cost` is what Vercel debited, in USD, surcharges included. A bring-your-own
/// provider key is billed by the provider, at the list price Vercel reports as
/// the upstream cost or, when that is null, as `market_cost`; the total adds it.
fn vercel_cost_details(usage: &Value) -> Option<Value> {
    let usd = |pointer: &str| {
        usage
            .pointer(pointer)?
            .as_f64()
            .filter(|usd| usd.is_finite() && *usd >= 0.0)
    };
    let cost = usd("/cost")?;
    let total = if usage.get("is_byok").and_then(Value::as_bool) == Some(true) {
        cost + usd("/cost_details/upstream_inference_cost").or_else(|| usd("/market_cost"))?
    } else {
        cost
    };
    Some(json!({ "total": total }))
}

/// Responses and Messages report Vercel's charge only in
/// `provider_metadata.gateway`, as decimal strings. On Vercel's own credentials
/// `cost` is the charge; on a bring-your-own key it is `0`, and `marketCost`
/// holds the provider's list price the customer pays instead. Other or mixed
/// credentials are left to price inference.
fn vercel_gateway_cost_details(provider_metadata: &Value) -> Option<Value> {
    let gateway = provider_metadata.get("gateway")?;
    let credentials = gateway
        .pointer("/routing/modelAttempts")?
        .as_array()?
        .iter()
        .filter_map(|attempt| attempt.get("providerAttempts")?.as_array())
        .flatten()
        .filter(|attempt| attempt.get("success").and_then(Value::as_bool) == Some(true))
        .map(|attempt| attempt.get("credentialType").and_then(Value::as_str))
        .collect::<Vec<_>>();
    let field = match credentials.first()? {
        Some("system") => "cost",
        Some("byok") => "marketCost",
        _ => return None,
    };
    if credentials.iter().any(|kind| *kind != credentials[0]) {
        return None;
    }
    let cost = gateway
        .get(field)?
        .as_str()?
        .parse::<f64>()
        .ok()
        .filter(|usd| usd.is_finite() && *usd >= 0.0)?;
    Some(json!({ "total": cost }))
}

/// xAI's Chat Completions `completion_tokens` leaves out reasoning tokens, and
/// its `text_tokens` overlaps `cached_tokens`. The receiver subtracts every
/// detail from its parent count, so both are brought to `OpenAI`'s meaning.
fn xai_chat_usage(mut usage: Value) -> Value {
    if let Some(details) = usage
        .get_mut("prompt_tokens_details")
        .and_then(Value::as_object_mut)
    {
        details.remove("text_tokens");
    }
    let reasoning = usage
        .pointer("/completion_tokens_details/reasoning_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if let Some(completion) = usage.get("completion_tokens").and_then(Value::as_u64) {
        usage["completion_tokens"] = json!(completion + reasoning);
    }
    usage
}

/// Google's `completion_tokens` leaves out thinking tokens, which it bills as
/// output; only `total_tokens` counts them. Vertex AI's OpenAI-compatible
/// endpoint serves the same Gemini models; where the counts already add up,
/// usage passes through unchanged.
/// <https://discuss.ai.google.dev/t/gemini-3-6-flash-openai-compatible-token-limits-response-fields-and-auth-keys/183372>
fn gemini_chat_usage(mut usage: Value) -> Value {
    let count = |key: &str| usage.get(key).and_then(Value::as_u64).unwrap_or(0);
    let (prompt, total) = (count("prompt_tokens"), count("total_tokens"));
    if total > prompt + count("completion_tokens") {
        usage["completion_tokens"] = json!(total - prompt);
    }
    usage
}

/// The receiver's native `OpenAI` usage schemas are strict at the top level, but
/// accept new numeric detail counters.
fn openai_usage(usage: &Value, counters: [&str; 3], details: [&str; 2]) -> Option<Value> {
    let usage = usage.as_object()?;
    let mut projected = Map::new();
    for key in counters {
        let value = usage.get(key).filter(|value| value.as_u64().is_some())?;
        projected.insert(key.into(), value.clone());
    }
    for key in details {
        match usage.get(key) {
            Some(Value::Null) => {
                projected.insert(key.into(), Value::Null);
            }
            Some(Value::Object(details)) => {
                projected.insert(
                    key.into(),
                    Value::Object(
                        details
                            .iter()
                            .filter(|(_, value)| value.is_null() || value.as_u64().is_some())
                            .map(|(key, value)| (key.clone(), value.clone()))
                            .collect(),
                    ),
                );
            }
            _ => {}
        }
    }
    Some(Value::Object(projected))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> GenerationContext {
        GenerationContext {
            trace_id: "0123456789abcdef0123456789abcdef".into(),
            observation_id: "0123456789abcdef".into(),
            ..GenerationContext::from_headers(&axum::http::HeaderMap::new())
        }
    }

    fn facts() -> InferenceFacts {
        let mut facts = InferenceFacts {
            api_format: ApiFormat::OpenAiResponses,
            start_time_unix_ms: 1_735_689_600_000,
            duration_ms: 900,
            first_byte_ms: Some(50),
            completion_start_ms: Some(125),
            http_status: Some(200),
            retry_after_ms: None,
            upstream_model: None,
            request_body_bytes: 64,
            response_body_bytes: 256,
            metadata: json!({"ingestion_mode": "full", "key_id": "key", "key_metadata": {"team": "search"}}),
            outcome: RelayOutcome::Eof,
            inference: crate::capture::ProviderFacts::default(),
        };
        facts.inference.model = Some("actual-model".into());
        facts.inference.requested_model = Some("requested-model".into());
        facts
            .inference
            .model_parameters
            .insert("service_tier".into(), json!("priority"));
        facts.inference.input = serde_json::value::to_raw_value(
            &json!({"input": "hello", "tools": [{"type": "function"}]}),
        )
        .ok();
        facts.inference.output = Some(json!([{ "type": "message", "content": "world" }]));
        facts.inference.capture_complete = true;
        facts.inference.output_complete = true;
        facts.inference.input_complete = true;
        facts
    }

    fn attributes(span: &Value) -> Map<String, Value> {
        span["attributes"]
            .as_array()
            .unwrap()
            .iter()
            .map(|attribute| {
                (
                    attribute["key"].as_str().unwrap().into(),
                    attribute["value"]["stringValue"].clone(),
                )
            })
            .collect()
    }

    fn metadata(attributes: &Map<String, Value>) -> Value {
        serde_json::from_str(
            attributes["langfuse.observation.metadata"]
                .as_str()
                .unwrap(),
        )
        .unwrap()
    }

    #[test]
    fn response_status_distinguishes_failures_before_and_after_headers() {
        for (http_status, outcome, expected) in [
            (None, RelayOutcome::Timeout, json!(504)),
            (None, RelayOutcome::TransportError, json!(502)),
            (Some(200), RelayOutcome::Timeout, json!(200)),
            (Some(200), RelayOutcome::TransportError, json!(200)),
            (Some(429), RelayOutcome::Eof, json!(429)),
            (None, RelayOutcome::Cancelled, Value::Null),
        ] {
            let mut facts = facts();
            facts.http_status = http_status;
            facts.outcome = outcome;
            let metadata = metadata(&attributes(&span(facts, &context())));
            assert_eq!(
                metadata["langfuse.gateway.response.status_code"], expected,
                "{outcome:?}"
            );
        }
    }

    #[test]
    fn caller_attributes_and_metadata_cannot_replace_trusted_gateway_fields() {
        let mut context = context();
        context.attributes = serde_json::from_value(json!({
            "user.id": "user", "session.id": "session",
            "langfuse.trace.name": "caller workflow", "langfuse.trace.tags": ["tag,one", "tag-two"]
        }))
        .unwrap();
        context.metadata = serde_json::from_value(json!({
            "custom": "value", "team": "untrusted", "langfuse.gateway.response.status_code": "fake",
            "langfuse.gateway.project.id": "wrong-project",
            "langfuse.gateway.api_key.id": "wrong-key",
            "langfuse.gateway.api_key.metadata.team": "wrong-team",
            "langfuse.gateway.request.fake": "fake",
            "scope": "fake", "resourceAttributes.secret": "fake", "attributes": "fake"
        }))
        .unwrap();
        let attrs = attributes(&span(facts(), &context));
        assert_eq!(attrs["user.id"], "user");
        assert_eq!(attrs["session.id"], "session");
        assert_eq!(attrs["langfuse.trace.name"], "caller workflow");
        assert_eq!(
            serde_json::from_str::<Value>(attrs["langfuse.trace.tags"].as_str().unwrap()).unwrap(),
            json!(["tag,one", "tag-two"])
        );
        let metadata = metadata(&attrs);
        assert_eq!(metadata["custom"], "value");
        assert_eq!(metadata["team"], "untrusted");
        assert_eq!(metadata["langfuse.gateway.response.status_code"], 200);
        assert_eq!(metadata["langfuse.gateway.api_key.id"], "key");
        assert_eq!(metadata["langfuse.gateway.api_key.metadata.team"], "search");
        for key in [
            "scope",
            "resourceAttributes.secret",
            "attributes",
            "langfuse.gateway.request.fake",
            "langfuse.gateway.project.id",
        ] {
            assert!(metadata.get(key).is_none(), "caller forged {key}");
        }
        assert!(!attrs.contains_key("langfuse.trace.metadata"));
    }

    // Langfuse stores this metadata key as the span's ingestion API key for
    // gateway uploads, so callers must never be able to set it.
    #[test]
    fn caller_headers_never_supply_the_gateway_key_id() {
        let mut headers = axum::http::HeaderMap::new();
        headers.insert(
            "langfuse-metadata",
            "langfuse.gateway.api_key.id:header-key".parse().unwrap(),
        );
        headers.insert(
            "baggage",
            "langfuse_metadata_langfuse.gateway.api_key.id=baggage-key"
                .parse()
                .unwrap(),
        );
        let context = GenerationContext {
            trace_id: "0123456789abcdef0123456789abcdef".into(),
            observation_id: "0123456789abcdef".into(),
            ..GenerationContext::from_headers(&headers)
        };
        assert!(context.metadata.contains_key("langfuse.gateway.api_key.id"));

        let mut unattributed = facts();
        unattributed.metadata["key_id"] = Value::Null;
        for (facts, expected) in [(facts(), Some("key")), (unattributed, None)] {
            let metadata = metadata(&attributes(&span(facts, &context)));
            assert_eq!(
                metadata.get("langfuse.gateway.api_key.id"),
                expected.map(Value::from).as_ref()
            );
        }
    }

    #[test]
    fn full_generation_preserves_native_content_attribution_and_completion_time() {
        let span = span(facts(), &context());
        assert_eq!(span["traceId"], "0123456789abcdef0123456789abcdef");
        assert_eq!(span["spanId"], "0123456789abcdef");
        assert!(span.get("parentSpanId").is_none());
        assert_eq!(span["startTimeUnixNano"], "1735689600000000000");
        assert_eq!(span["endTimeUnixNano"], "1735689600900000000");
        let attrs = attributes(&span);
        assert_eq!(attrs["langfuse.observation.type"], "generation");
        assert_eq!(attrs["langfuse.observation.model.name"], "actual-model");
        assert_eq!(
            attrs["langfuse.observation.completion_start_time"],
            "2025-01-01T00:00:00.125Z"
        );
        assert_eq!(
            serde_json::from_str::<Value>(attrs["langfuse.observation.input"].as_str().unwrap())
                .unwrap()["tools"][0]["type"],
            "function"
        );
        assert!(attrs.contains_key("langfuse.observation.output"));
        let metadata = metadata(&attrs);
        assert_eq!(
            metadata,
            json!({
                "langfuse.gateway.response.status_code": 200,
                "langfuse.gateway.upstream.status_code": 200,
                "langfuse.gateway.api_key.metadata.team": "search",
                "langfuse.gateway.api_key.id": "key",
                "langfuse.gateway.ingestion.mode": "full",
                "langfuse.gateway.request.api_format": "openai.responses",
                "langfuse.gateway.request.body_bytes": 64,
                "langfuse.gateway.response.body_bytes": 256,
                "langfuse.gateway.model.requested": "requested-model",
                "langfuse.gateway.model.response": "actual-model",
            })
        );
    }

    #[test]
    fn key_metadata_is_only_namespaced_and_cannot_overwrite_gateway_or_otel_metadata() {
        let mut facts = facts();
        facts.metadata["organization_id"] = json!("org");
        facts.metadata["provider_connection_id"] = json!("connection");
        facts.metadata["key_owner_user_id"] = json!("user");
        facts.metadata["key_metadata"] = json!({
            "team": "search", "enabled": true, "cost_center": 42,
            "langfuse.gateway.response.status_code": 500,
            "langfuse.gateway.api_key.id": "spoofed-key",
            "langfuse.gateway.api_key.owner.user_id": "spoofed-user",
            "langfuse.gateway.upstream.request.id": "spoofed-request",
            "langfuse.gateway.future_field": "spoofed-future",
            "langfuse.gateway.api_key.metadata.team": "spoofed-team",
            "agent.name": "spoofed-agent",
            "scope": "spoofed-scope", "scope.name": "spoofed-scope-name",
            "resourceAttributes": "spoofed-resource",
            "attributes": "spoofed-attributes"
        });
        facts.inference.provider_response_id = Some("response".into());
        let mut context = context();
        context
            .metadata
            .insert("agent.name".into(), json!("opencode"));
        let attrs = attributes(&span(facts, &context));
        let metadata = metadata(&attrs);
        for key in ["team", "enabled", "cost_center"] {
            assert!(metadata.get(key).is_none(), "{key}");
        }
        assert_eq!(metadata["langfuse.gateway.api_key.metadata.team"], "search");
        assert_eq!(metadata["langfuse.gateway.api_key.metadata.enabled"], true);
        assert_eq!(
            metadata["langfuse.gateway.api_key.metadata.cost_center"],
            42
        );
        assert_eq!(
            metadata["langfuse.gateway.api_key.metadata.langfuse.gateway.response.status_code"],
            500
        );
        assert_eq!(metadata["langfuse.gateway.response.status_code"], 200);
        assert_eq!(metadata["langfuse.gateway.api_key.id"], "key");
        assert_eq!(metadata["langfuse.gateway.api_key.owner.user_id"], "user");
        assert!(metadata.get("langfuse.gateway.api_key.user.id").is_none());
        assert_eq!(metadata["langfuse.gateway.connection.id"], "connection");
        assert_eq!(
            metadata["langfuse.gateway.upstream.response.id"],
            "response"
        );
        assert!(metadata.get("langfuse.gateway.response.id").is_none());
        assert_eq!(metadata["langfuse.gateway.organization.id"], "org");
        assert_eq!(metadata["agent.name"], "opencode");
        assert_eq!(
            metadata["langfuse.gateway.api_key.metadata.agent.name"],
            "spoofed-agent"
        );
        for key in [
            "scope",
            "scope.name",
            "resourceAttributes",
            "attributes",
            "langfuse.gateway.future_field",
        ] {
            assert!(metadata.get(key).is_none(), "{key}");
        }
        assert_ne!(
            metadata["langfuse.gateway.upstream.request.id"],
            "spoofed-request"
        );
        assert_eq!(
            metadata["langfuse.gateway.api_key.metadata.langfuse.gateway.api_key.metadata.team"],
            "spoofed-team"
        );
    }

    #[test]
    fn usage_mode_omits_content_and_missing_usage_and_uses_requested_model() {
        let mut facts = facts();
        facts.metadata["ingestion_mode"] = json!("usage");
        facts.inference.model = None;
        facts.completion_start_ms = None;
        let attrs = attributes(&span(facts, &context()));
        for key in ["input", "output", "usage_details", "completion_start_time"] {
            assert!(!attrs.contains_key(&format!("langfuse.observation.{key}")));
        }
        assert_eq!(attrs["langfuse.observation.model.name"], "requested-model");
        assert!(metadata(&attrs).get("native_usage").is_none());
    }

    #[test]
    fn event_model_prefers_response_then_upstream_then_requested() {
        for (response, upstream, expected) in [
            (
                Some("response-model"),
                Some("upstream-model"),
                "response-model",
            ),
            (None, Some("upstream-model"), "upstream-model"),
            (None, None, "requested-model"),
        ] {
            let mut facts = facts();
            facts.inference.model = response.map(str::to_owned);
            facts.upstream_model = upstream.map(str::to_owned);
            let attrs = attributes(&span(facts, &context()));
            assert_eq!(attrs["langfuse.observation.model.name"], expected);
            let metadata = metadata(&attrs);
            assert_eq!(
                metadata["langfuse.gateway.model.requested"],
                "requested-model"
            );
            assert_eq!(
                metadata.get("langfuse.gateway.model.upstream"),
                upstream.map(|model| json!(model)).as_ref()
            );
            assert_eq!(
                metadata.get("langfuse.gateway.model.response"),
                response.map(|model| json!(model)).as_ref()
            );
        }
    }

    #[test]
    fn key_and_connection_snapshots_use_gateway_names_and_skip_absent_values() {
        let mut facts = facts();
        facts.metadata["organization_id"] = json!("org");
        facts.metadata["key_name"] = json!("CI key");
        facts.metadata["key_owner_user_id"] = json!("user-1");
        facts.metadata["key_owner_name"] = json!("Alice");
        facts.metadata["provider_connection_id"] = json!("connection");
        facts.metadata["connection_name"] = Value::Null;
        facts.metadata["provider"] = json!("openai");
        let metadata = metadata(&attributes(&span(facts, &context())));
        assert_eq!(metadata["langfuse.gateway.organization.id"], "org");
        assert_eq!(metadata["langfuse.gateway.api_key.name"], "CI key");
        assert_eq!(metadata["langfuse.gateway.api_key.owner.user_id"], "user-1");
        assert_eq!(metadata["langfuse.gateway.api_key.owner.name"], "Alice");
        assert_eq!(metadata["langfuse.gateway.connection.id"], "connection");
        assert_eq!(metadata["langfuse.gateway.connection.provider"], "openai");
        assert!(metadata.get("langfuse.gateway.connection.name").is_none());
    }

    #[test]
    fn user_bound_keys_always_attribute_to_the_key_owner() {
        let mut caller_in_child = context();
        caller_in_child.parent_span_id = Some("fedcba9876543210".into());
        caller_in_child
            .attributes
            .insert("user.id".into(), json!("caller"));
        for context in [context(), caller_in_child] {
            for (email, expected) in [
                (json!("owner@example.com"), "owner@example.com"),
                (Value::Null, "owner"),
            ] {
                let mut owned = facts();
                owned.metadata["key_owner_user_id"] = json!("owner");
                owned.metadata["key_owner_email"] = email;
                let span = span(owned, &context);
                let user_ids: Vec<_> = span["attributes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .filter(|attribute| attribute["key"] == "user.id")
                    .map(|attribute| attribute["value"]["stringValue"].clone())
                    .collect();
                assert_eq!(user_ids, [json!(expected)]);
                let metadata = metadata(&attributes(&span));
                assert_eq!(metadata["langfuse.gateway.user_id_source"], "api_key_owner");
                assert_eq!(metadata["langfuse.gateway.api_key.owner.user_id"], "owner");
            }
        }
    }

    #[test]
    fn keys_without_a_bound_user_take_the_callers_user_id() {
        let mut caller = context();
        caller.parent_span_id = Some("fedcba9876543210".into());
        caller.attributes.insert("user.id".into(), json!("caller"));
        let attrs = attributes(&span(facts(), &caller));
        assert_eq!(attrs["user.id"], "caller");
        assert_eq!(
            metadata(&attrs)["langfuse.gateway.user_id_source"],
            "client"
        );

        let attrs = attributes(&span(facts(), &context()));
        assert!(!attrs.contains_key("user.id"));
        assert!(
            metadata(&attrs)
                .get("langfuse.gateway.user_id_source")
                .is_none()
        );
    }

    #[test]
    fn keys_without_a_bound_user_default_to_the_key_name() {
        let mut named = facts();
        named.metadata["key_name"] = json!("checkout-agent");
        let attrs = attributes(&span(named, &context()));
        assert_eq!(attrs["user.id"], "checkout-agent");
        assert_eq!(
            metadata(&attrs)["langfuse.gateway.user_id_source"],
            "api_key_name"
        );

        let mut caller = context();
        caller.attributes.insert("user.id".into(), json!("caller"));
        let mut named = facts();
        named.metadata["key_name"] = json!("checkout-agent");
        let attrs = attributes(&span(named, &caller));
        assert_eq!(attrs["user.id"], "caller");
        assert_eq!(
            metadata(&attrs)["langfuse.gateway.user_id_source"],
            "client"
        );

        let mut child = context();
        child.parent_span_id = Some("fedcba9876543210".into());
        let mut named = facts();
        named.metadata["key_name"] = json!("checkout-agent");
        let attrs = attributes(&span(named, &child));
        assert!(!attrs.contains_key("user.id"));
        assert!(
            metadata(&attrs)
                .get("langfuse.gateway.user_id_source")
                .is_none()
        );
    }

    #[test]
    fn client_user_agent_is_recorded_as_gateway_metadata() {
        let mut context = context();
        context.user_agent = Some("codex_cli_rs/0.1".into());
        let metadata = metadata(&attributes(&span(facts(), &context)));
        assert_eq!(
            metadata["langfuse.gateway.client.user_agent"],
            "codex_cli_rs/0.1"
        );
    }

    #[test]
    fn failures_carry_error_origin_type_and_upstream_rate_limit_details() {
        for (http_status, provider_status, outcome, expected) in [
            (
                Some(429),
                None,
                RelayOutcome::Eof,
                Some(("provider", "provider_rate_limited")),
            ),
            (
                Some(401),
                None,
                RelayOutcome::Eof,
                Some(("provider", "provider_auth")),
            ),
            (
                Some(400),
                None,
                RelayOutcome::Eof,
                Some(("provider", "provider_4xx")),
            ),
            (
                Some(503),
                None,
                RelayOutcome::Eof,
                Some(("provider", "provider_5xx")),
            ),
            (
                Some(200),
                Some("failed"),
                RelayOutcome::Eof,
                Some(("provider", "provider_response_failed")),
            ),
            (
                None,
                None,
                RelayOutcome::Timeout,
                Some(("provider_transport", "timeout")),
            ),
            (
                Some(200),
                None,
                RelayOutcome::TransportError,
                Some(("provider_transport", "transport")),
            ),
            (Some(200), None, RelayOutcome::Cancelled, None),
            (Some(200), None, RelayOutcome::Eof, None),
        ] {
            let mut facts = facts();
            facts.http_status = http_status;
            facts.inference.provider_status = provider_status.map(str::to_owned);
            facts.outcome = outcome;
            let metadata = metadata(&attributes(&span(facts, &context())));
            assert_eq!(
                metadata.get("langfuse.gateway.error.origin").cloned(),
                expected.map(|(origin, _)| json!(origin)),
                "{http_status:?} {outcome:?}"
            );
            assert_eq!(
                metadata.get("langfuse.gateway.error.type").cloned(),
                expected.map(|(_, kind)| json!(kind)),
                "{http_status:?} {outcome:?}"
            );
            assert_eq!(
                metadata
                    .get("langfuse.gateway.upstream.status_code")
                    .cloned(),
                http_status.map(|status| json!(status))
            );
            assert_eq!(
                metadata
                    .get("langfuse.gateway.response.body_bytes")
                    .is_some(),
                http_status.is_some()
            );
        }

        let mut facts = facts();
        facts.http_status = Some(429);
        facts.retry_after_ms = Some(30_000);
        let metadata = metadata(&attributes(&span(facts, &context())));
        assert_eq!(metadata["langfuse.gateway.upstream.retry_after_ms"], 30_000);
    }

    #[test]
    fn usage_projection_preserves_new_numeric_details_without_unknown_top_level_fields() {
        let mut facts = facts();
        let usage = json!({
            "input_tokens": 20, "output_tokens": 10, "total_tokens": 30,
            "input_tokens_details": {"cached_tokens": 4, "future_counter": 3, "optional": null, "future_object": {}},
            "output_tokens_details": null,
            "future_usage": {"cost": 123},
        });
        facts.inference.usage_details = Some(usage);
        let attrs = attributes(&span(facts, &context()));
        assert!(metadata(&attrs).get("native_usage").is_none());
        let projected: Value = serde_json::from_str(
            attrs["langfuse.observation.usage_details"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            projected,
            json!({
                "input_tokens": 20, "output_tokens": 10, "total_tokens": 30,
                "input_tokens_details": {"cached_tokens": 4, "future_counter": 3, "optional": null},
                "output_tokens_details": null,
            })
        );
    }

    #[test]
    fn unsupported_usage_omits_usage_without_invented_totals() {
        let mut facts = facts();
        facts.inference.usage_details = Some(json!({"input_tokens": 9}));
        let attrs = attributes(&span(facts, &context()));
        assert!(!attrs.contains_key("langfuse.observation.usage_details"));
        assert!(metadata(&attrs).get("native_usage").is_none());
    }

    fn projected_usage(api_format: ApiFormat, usage: Value) -> Option<Value> {
        let mut facts = facts();
        facts.api_format = api_format;
        facts.inference.usage_details = Some(usage);
        let attrs = attributes(&span(facts, &context()));
        attrs
            .get("langfuse.observation.usage_details")
            .map(|value| serde_json::from_str(value.as_str().unwrap()).unwrap())
    }

    #[test]
    fn inline_provider_cost_becomes_the_total_cost() {
        let cost_details = |provider: &str, usage: Value| {
            let mut facts = facts();
            facts.metadata["provider"] = json!(provider);
            facts.inference.usage_details = Some(usage);
            attributes(&span(facts, &context()))
                .get("langfuse.observation.cost_details")
                .map(|value| serde_json::from_str::<Value>(value.as_str().unwrap()).unwrap())
        };
        let usage = json!({
            "input_tokens": 20, "output_tokens": 10, "total_tokens": 30,
            "cost": 0.25, "is_byok": false,
            "cost_details": {
                "upstream_inference_cost": 0.25,
                "upstream_inference_input_cost": 0.05,
                "upstream_inference_output_cost": 0.2,
            },
        });
        assert_eq!(
            cost_details("openrouter", usage.clone()),
            Some(json!({"input": 0.05, "output": 0.2, "total": 0.25}))
        );
        assert_eq!(
            cost_details("openrouter", json!({"cost": 0.25})),
            Some(json!({"total": 0.25}))
        );
        let chat = json!({
            "cost": 0.25,
            "cost_details": {
                "upstream_inference_prompt_cost": 0.05,
                "upstream_inference_completions_cost": 0.2,
            },
        });
        assert_eq!(
            cost_details("openrouter", chat),
            Some(json!({"input": 0.05, "output": 0.2, "total": 0.25}))
        );
        // Other providers' usage never sets a cost, even with the same fields.
        assert_eq!(cost_details("openai", usage), None);

        // A bring-your-own key pays OpenRouter's fee plus the provider's charge.
        let byok = json!({
            "prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30,
            "cost": 0.5, "is_byok": true,
            "cost_details": {
                "upstream_inference_cost": 10.0,
                "upstream_inference_input_cost": 4.0,
                "upstream_inference_output_cost": 6.0,
            },
        });
        assert_eq!(
            cost_details("openrouter", byok),
            Some(json!({"input": 4.0, "output": 6.0, "openrouter_fee": 0.5, "total": 10.5}))
        );
        assert_eq!(
            cost_details("openrouter", json!({"cost": 0.5, "is_byok": true})),
            None
        );

        let xai = json!({
            "input_tokens": 189,
            "input_tokens_details": {"cached_tokens": 128},
            "output_tokens": 219,
            "output_tokens_details": {"reasoning_tokens": 196},
            "total_tokens": 408,
            "num_sources_used": 0,
            "num_server_side_tools_used": 0,
            "cost_in_usd_ticks": 6_493_500,
            "context_details": {"input_tokens": 189, "output_tokens": 226},
        });
        assert_eq!(
            cost_details("xai", xai),
            Some(json!({"total": 0.000_649_35}))
        );
        assert_eq!(cost_details("xai", json!({"cost_in_usd_ticks": -1})), None);
    }

    #[test]
    fn vercel_cost_becomes_the_total_cost() {
        let cost_details = |usage: Value| {
            let mut facts = facts();
            facts.metadata["provider"] = json!("vercel");
            facts.inference.usage_details = Some(usage);
            attributes(&span(facts, &context()))
                .get("langfuse.observation.cost_details")
                .map(|value| serde_json::from_str::<Value>(value.as_str().unwrap()).unwrap())
        };
        // A real Vercel Chat Completions usage; its prompt and completion costs
        // are only set for bring-your-own keys.
        let vercel = json!({
            "prompt_tokens": 47, "completion_tokens": 10, "total_tokens": 57,
            "cost": 0.000_043_01, "is_byok": false,
            "prompt_tokens_details": {"cached_tokens": 0, "audio_tokens": 0, "video_tokens": 0},
            "cost_details": {
                "upstream_inference_cost": null,
                "upstream_inference_prompt_cost": 0,
                "upstream_inference_completions_cost": 0,
            },
            "completion_tokens_details": {"reasoning_tokens": 0, "image_tokens": 0},
            "cache_creation_input_tokens": 0,
            "market_cost": 0.000_043_01,
            "gateway_cost": 0.000_043_01,
        });
        assert_eq!(cost_details(vercel), Some(json!({"total": 0.000_043_01})));
        // A real Vercel usage for a call on a provider key.
        let vercel_byok = json!({
            "prompt_tokens": 7, "completion_tokens": 13, "total_tokens": 20,
            "cost": 0, "is_byok": true,
            "cost_details": {
                "upstream_inference_cost": 0.000_017,
                "upstream_inference_prompt_cost": 0,
                "upstream_inference_completions_cost": 0,
            },
            "market_cost": 0.000_017,
        });
        assert_eq!(cost_details(vercel_byok), Some(json!({"total": 0.000_017})));
        let vercel_byok_without_upstream = json!({
            "cost": 0.0, "is_byok": true, "market_cost": 0.000_017,
            "cost_details": {"upstream_inference_cost": null},
        });
        assert_eq!(
            cost_details(vercel_byok_without_upstream),
            Some(json!({"total": 0.000_017}))
        );
        assert_eq!(cost_details(json!({"cost": 0.0, "is_byok": true})), None);
        // Messages usage carries no cost; Vercel reports it in provider metadata.
        assert_eq!(
            cost_details(json!({"input_tokens": 630, "output_tokens": 124})),
            None
        );
    }

    #[test]
    fn vercel_gateway_metadata_cost_is_used_when_usage_has_none() {
        let cost_details = |api_format: ApiFormat, usage: Value, gateway: Value| {
            let mut facts = facts();
            facts.metadata["provider"] = json!("vercel");
            facts.api_format = api_format;
            facts.inference.usage_details = Some(usage);
            facts.inference.provider_metadata = Some(json!({"gateway": gateway}));
            attributes(&span(facts, &context()))
                .get("langfuse.observation.cost_details")
                .map(|value| serde_json::from_str::<Value>(value.as_str().unwrap()).unwrap())
        };
        let routing = |credential_type: &str| {
            json!({"modelAttempts": [{"success": true, "providerAttempts": [
                {"credentialType": credential_type, "success": true, "statusCode": 200},
            ]}]})
        };
        // Real Vercel replies, trimmed to their usage and billing: a Responses
        // call on Vercel's credentials and a Messages call on a provider key.
        let responses_usage = json!({
            "input_tokens": 49, "output_tokens": 47, "total_tokens": 96,
            "input_tokens_details": {"cached_tokens": 0, "cache_write_tokens": 0},
            "output_tokens_details": {"reasoning_tokens": 0},
        });
        let system = json!({
            "routing": routing("system"),
            "cost": "0.00014542", "marketCost": "0.00014542", "surchargeCost": "0",
            "gatewayCost": "0.00014542", "inferenceCost": "0.00014542",
        });
        assert_eq!(
            cost_details(ApiFormat::OpenAiResponses, responses_usage, system),
            Some(json!({"total": 0.000_145_42}))
        );
        let messages_usage = json!({"input_tokens": 7, "output_tokens": 13});
        let byok = |credential_type: &str| {
            json!({
                "routing": routing(credential_type),
                "cost": "0", "marketCost": "0.000017", "surchargeCost": "0", "gatewayCost": "0",
            })
        };
        assert_eq!(
            cost_details(
                ApiFormat::AnthropicMessages,
                messages_usage.clone(),
                byok("byok")
            ),
            Some(json!({"total": 0.000_017}))
        );
        assert_eq!(
            cost_details(ApiFormat::AnthropicMessages, messages_usage, byok("other")),
            None
        );
    }

    #[test]
    fn anthropic_usage_is_uploaded_as_native() {
        let native = json!({
            "input_tokens": 7, "output_tokens": 445,
            "cache_creation_input_tokens": 2089, "cache_read_input_tokens": 16399,
            "cache_creation": {"ephemeral_5m_input_tokens": 2000, "ephemeral_1h_input_tokens": 89},
            "output_tokens_details": {"thinking_tokens": 300},
            "server_tool_use": {"web_search_requests": 1},
            "service_tier": "standard", "inference_geo": null
        });
        assert_eq!(
            projected_usage(ApiFormat::AnthropicMessages, native.clone()),
            Some(native)
        );
        assert_eq!(
            projected_usage(ApiFormat::AnthropicMessages, json!({"input_tokens": 7})),
            Some(json!({"input_tokens": 7}))
        );
        // The Anthropic shape never projects through the OpenAI rules.
        assert_eq!(
            projected_usage(
                ApiFormat::OpenAiResponses,
                json!({"input_tokens": 7, "output_tokens": 1, "cache_read_input_tokens": 5})
            ),
            None
        );
    }

    #[test]
    fn chat_completions_usage_projects_into_the_receivers_completion_schema() {
        let native = json!({
            "prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30,
            "prompt_tokens_details": {"cached_tokens": 4, "audio_tokens": 0},
            "completion_tokens_details": {"reasoning_tokens": 6, "accepted_prediction_tokens": null, "future_object": {}},
            "future_usage": {"cost": 123},
        });
        assert_eq!(
            projected_usage(ApiFormat::OpenAiChatCompletions, native),
            Some(json!({
                "prompt_tokens": 20, "completion_tokens": 10, "total_tokens": 30,
                "prompt_tokens_details": {"cached_tokens": 4, "audio_tokens": 0},
                "completion_tokens_details": {"reasoning_tokens": 6, "accepted_prediction_tokens": null},
            }))
        );
        // Each OpenAI contract projects only its own counter names.
        assert_eq!(
            projected_usage(
                ApiFormat::OpenAiChatCompletions,
                json!({"input_tokens": 2, "output_tokens": 1, "total_tokens": 3})
            ),
            None
        );
        assert_eq!(
            projected_usage(
                ApiFormat::OpenAiResponses,
                json!({"prompt_tokens": 2, "completion_tokens": 1, "total_tokens": 3})
            ),
            None
        );
    }

    #[test]
    fn xai_chat_completions_usage_counts_reasoning_as_output() {
        let mut facts = facts();
        facts.api_format = ApiFormat::OpenAiChatCompletions;
        facts.metadata["provider"] = json!("xai");
        facts.inference.usage_details = Some(json!({
            "prompt_tokens": 187, "completion_tokens": 13, "total_tokens": 342,
            "prompt_tokens_details": {"text_tokens": 187, "audio_tokens": 0, "image_tokens": 0, "cached_tokens": 128},
            "completion_tokens_details": {"reasoning_tokens": 142, "audio_tokens": 0, "accepted_prediction_tokens": 0, "rejected_prediction_tokens": 0},
            "num_sources_used": 0,
            "cost_in_usd_ticks": 4_868_500,
        }));
        let attrs = attributes(&span(facts, &context()));
        let usage: Value = serde_json::from_str(
            attrs["langfuse.observation.usage_details"]
                .as_str()
                .unwrap(),
        )
        .unwrap();
        assert_eq!(
            usage,
            json!({
                "prompt_tokens": 187, "completion_tokens": 155, "total_tokens": 342,
                "prompt_tokens_details": {"audio_tokens": 0, "image_tokens": 0, "cached_tokens": 128},
                "completion_tokens_details": {"reasoning_tokens": 142, "audio_tokens": 0, "accepted_prediction_tokens": 0, "rejected_prediction_tokens": 0},
            })
        );
    }

    #[test]
    fn gemini_chat_completions_usage_counts_thinking_as_output() {
        for provider in ["google_ai_studio", "vertex"] {
            let mut facts = facts();
            facts.api_format = ApiFormat::OpenAiChatCompletions;
            facts.metadata["provider"] = json!(provider);
            facts.inference.usage_details = Some(json!({
                "prompt_tokens": 15, "completion_tokens": 18, "total_tokens": 175,
            }));
            let attrs = attributes(&span(facts, &context()));
            let usage: Value = serde_json::from_str(
                attrs["langfuse.observation.usage_details"]
                    .as_str()
                    .unwrap(),
            )
            .unwrap();
            assert_eq!(
                usage,
                json!({"prompt_tokens": 15, "completion_tokens": 160, "total_tokens": 175}),
                "{provider}"
            );
        }
    }

    #[test]
    fn provider_request_metadata_is_namespaced_and_keeps_native_types() {
        let mut facts = facts();
        facts.inference.request_metadata = serde_json::from_value(json!({
            "metadata": {"customer": "customer-1"},
            "prompt_cache_key": "cache-key",
            "safety_identifier": "safety-id",
            "user": "legacy-user"
        }))
        .unwrap();
        let attrs = attributes(&span(facts, &context()));
        let metadata = metadata(&attrs);
        assert_eq!(
            metadata["langfuse.gateway.client.request.metadata"],
            json!({"customer": "customer-1"})
        );
        assert_eq!(
            metadata["langfuse.gateway.client.request.prompt_cache_key"],
            "cache-key"
        );
        assert_eq!(
            metadata["langfuse.gateway.client.request.safety_identifier"],
            "safety-id"
        );
        assert_eq!(
            metadata["langfuse.gateway.client.request.user"],
            "legacy-user"
        );
        for key in ["metadata", "prompt_cache_key", "safety_identifier", "user"] {
            assert!(metadata.get(key).is_none());
            assert!(
                metadata
                    .get(format!("langfuse.gateway.request.{key}"))
                    .is_none()
            );
        }
    }

    #[test]
    fn omitted_input_is_explained_in_gateway_metadata() {
        let mut facts = facts();
        facts.inference.input = None;
        facts.request_body_bytes = MAX_INPUT_CAPTURE_BYTES + 1;
        facts.inference.input_omission = Some(crate::capture::InputOmission {
            reason: InputOmissionReason::SizeLimit,
            body_bytes: MAX_INPUT_CAPTURE_BYTES + 1,
        });
        let attrs = attributes(&span(facts, &context()));
        assert!(!attrs.contains_key("langfuse.observation.input"));
        let metadata = metadata(&attrs);
        assert_eq!(
            metadata["langfuse.gateway.request.input_omitted"],
            "size_limit"
        );
        assert_eq!(
            metadata["langfuse.gateway.request.body_bytes"],
            MAX_INPUT_CAPTURE_BYTES + 1
        );
        assert_eq!(
            metadata["langfuse.gateway.request.input_limit_bytes"],
            MAX_INPUT_CAPTURE_BYTES
        );

        let mut facts = self::facts();
        facts.inference.input_omission = Some(crate::capture::InputOmission {
            reason: InputOmissionReason::ContentEncoding,
            body_bytes: 10,
        });
        let metadata = self::metadata(&attributes(&span(facts, &context())));
        assert_eq!(
            metadata["langfuse.gateway.request.input_omitted"],
            "content_encoding"
        );
        assert!(
            metadata
                .get("langfuse.gateway.request.input_limit_bytes")
                .is_none()
        );
    }

    #[test]
    fn provider_errors_include_http_status_and_available_details() {
        for (status, provider_status, error, expected) in [
            (429, None, None, "Provider HTTP error (429)"),
            (
                429,
                None,
                Some("rate_limit_exceeded: Too many requests"),
                "Provider HTTP error (429): rate_limit_exceeded: Too many requests",
            ),
            (
                200,
                Some("failed"),
                Some("server_error: Please retry"),
                "Provider response failed (HTTP 200): server_error: Please retry",
            ),
        ] {
            let mut facts = facts();
            facts.http_status = Some(status);
            facts.inference.provider_status = provider_status.map(str::to_owned);
            facts.inference.error_message = error.map(str::to_owned);
            let attrs = attributes(&span(facts, &context()));
            assert_eq!(attrs["langfuse.observation.status_message"], expected);
            assert_eq!(attrs["langfuse.observation.level"], "ERROR");
        }
    }

    #[test]
    fn provider_and_transport_failures_are_errors_while_cancellation_stays_distinct() {
        for (http_status, provider_status, outcome, level, code) in [
            (Some(429), None, RelayOutcome::Eof, "ERROR", 2),
            (Some(200), Some("failed"), RelayOutcome::Eof, "ERROR", 2),
            (None, None, RelayOutcome::TransportError, "ERROR", 2),
            (Some(200), None, RelayOutcome::Timeout, "ERROR", 2),
            (Some(200), None, RelayOutcome::Cancelled, "WARNING", 0),
            (
                Some(200),
                Some("completed"),
                RelayOutcome::Cancelled,
                "DEFAULT",
                0,
            ),
            (
                Some(200),
                Some("failed"),
                RelayOutcome::Cancelled,
                "ERROR",
                2,
            ),
            (
                Some(200),
                Some("incomplete"),
                RelayOutcome::Cancelled,
                "WARNING",
                0,
            ),
            (
                Some(200),
                Some("completed"),
                RelayOutcome::Timeout,
                "ERROR",
                2,
            ),
            (
                Some(200),
                Some("completed"),
                RelayOutcome::TransportError,
                "ERROR",
                2,
            ),
            (
                Some(200),
                Some("incomplete"),
                RelayOutcome::Eof,
                "WARNING",
                0,
            ),
        ] {
            let mut facts = facts();
            facts.http_status = http_status;
            facts.inference.provider_status = provider_status.map(str::to_owned);
            facts.outcome = outcome;
            let span = span(facts, &context());
            let attrs = attributes(&span);
            assert_eq!(attrs["langfuse.observation.level"], level);
            assert_eq!(span["status"]["code"], code);
            assert_eq!(
                attrs.contains_key("langfuse.observation.status_message"),
                level != "DEFAULT"
            );
            assert!(metadata(&attrs).get("relay_outcome").is_none());
        }
    }
}
