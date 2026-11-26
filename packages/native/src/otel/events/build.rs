//! Assemble one decoded span through ordered stages.
//!
//! Skills read the original provider payloads before tool normalization consumes them.
//! Stages share the source's parse cache and metadata diagnostics. The returned event
//! owns its data after that per-span parsing state is dropped.

use std::rc::Rc;

use super::super::attributes::{
    attributes_to_map, is_js_truthy, parse_id, resolve_timestamps, retain_evaluation_value,
    value_as_string, AttributeSource, EventAttributes, JsonParseCache,
};
use super::super::event_skills::extract_skills;
use super::super::input::Span;
use super::super::metadata::{
    apply_context_fields, apply_evaluator_test_metadata_default, extract_metadata,
    should_decode_structured_metadata, MetadataDiagnostics, MetadataDomain,
};
use super::super::providers::{
    claude_managed_agent_session_id, extract_completion_start_time, extract_cost_details,
    extract_input_output, extract_is_app_root, extract_model_name, extract_model_parameters,
    extract_name, extract_prompt_version, extract_prompt_version_lookup, extract_public,
    extract_tags, extract_usage_details, filter_attributes, observation_type,
    should_skip_model_usage_and_cost, ProviderIO,
};
use super::super::tools::normalize_tools_for_observation;
use super::super::types::{JsonObject, OwnedEvent};
use super::super::value::{Object, Value};
use super::EventBuildConfig;

use crate::native_schema::OtelStorageRow;

const INTERNAL_TRACE_ENVIRONMENTS: &[&str] = &[
    "langfuse-prompt-experiment",
    "langfuse-llm-as-a-judge",
    "langfuse-code-eval",
    "langfuse-natural-language-filter",
    "langfuse-in-app-agent",
    "langfuse-topics-internal",
];
pub(super) const AI_GATEWAY_SERVICE_NAME: &str = "langfuse-ai-gateway";
const AI_GATEWAY_INGESTION_API_KEY_PREFIX: &str = "gateway:";
const AI_GATEWAY_KEY_ID_METADATA_KEY: &str = "langfuse.gateway.api_key.id";
const AI_GATEWAY_COST_SOURCE_METADATA_KEY: &str = "langfuse.gateway.cost.source";
const AI_GATEWAY_COST_SOURCE_CALCULATED: &str = "calculated";

pub(super) fn build_event(
    span: Span,
    resource: &JsonObject,
    scope: &Object,
    scope_name: &str,
    scope_version: Option<&str>,
    config: &EventBuildConfig,
) -> Option<OwnedEvent> {
    let mut assembly =
        EventAssembly::new(span, resource, scope, scope_name, scope_version, config)?;
    assembly
        .extract_payloads_and_metadata(resource, scope)
        .extract_skills()
        .normalize_tools()
        .apply_evaluator_defaults()
        .link_prompt()
        .extract_usage_and_cost()
        .attribute_gateway(&config.ingestion_api_key, scope_version)?
        .extract_model()
        .extract_completion_time_and_tags();
    Some(assembly.event)
}

struct EventAssembly<'a> {
    source: EventSource<'a>,
    event: OwnedEvent,
    skip_model_usage_and_cost: bool,
}

impl<'a> EventAssembly<'a> {
    fn new(
        span: Span,
        resource: &JsonObject,
        scope: &Object,
        scope_name: &'a str,
        scope_version: Option<&str>,
        config: &'a EventBuildConfig,
    ) -> Option<Self> {
        let trace_id = span.trace_id.as_deref().map(parse_id).unwrap_or_default();
        let span_id = span.span_id.as_deref().map(parse_id).unwrap_or_default();
        // TypeScript stores string span IDs verbatim, including "". Missing IDs and failed
        // non-string conversions still drop the span.
        let span_id_is_string = span.span_id.as_deref().and_then(Value::as_str).is_some();
        if trace_id.is_empty() || (span_id.is_empty() && !span_id_is_string) {
            return None;
        }
        let mut source = EventSource::new(span, resource, scope_name, scope_version, config);
        let (row, evaluation_fields) =
            source.row(trace_id, span_id, resource, scope, scope_version, config)?;
        let event = OwnedEvent {
            row,
            evaluation_fields,
            prompt_version_lookup: None,
            model_parameters: None,
            provided_usage_details: Default::default(),
            provided_cost_details: Default::default(),
            gateway_calculated_cost: false,
            input: None,
            output: None,
            metadata: JsonObject::new(),
            skills_available: Vec::new(),
            skills_resource_loaded: Vec::new(),
        };
        Some(Self {
            source,
            event,
            skip_model_usage_and_cost: false,
        })
    }

    fn extract_payloads_and_metadata(
        &mut self,
        resource: &JsonObject,
        scope: &Object,
    ) -> &mut Self {
        let payloads = self.source.payloads(&self.event.row);
        self.event.input = payloads.input;
        self.event.output = payloads.output;
        self.event.metadata = self.source.metadata(resource, scope);
        self
    }

    fn extract_skills(&mut self) -> &mut Self {
        // Skill arguments must stay visible before tools can wrap a command as `{prompt, tools}`.
        (
            self.event.skills_available,
            self.event.skills_resource_loaded,
        ) = extract_skills(
            &self.source.attributes,
            &self.event.metadata,
            &self.event.event_type,
            &self.event.name,
            self.event.input.as_ref(),
            self.event.output.as_ref(),
            self.event.level == "ERROR",
        );
        self
    }

    fn normalize_tools(&mut self) -> &mut Self {
        let observation = normalize_tools_for_observation(
            self.event.input.take(),
            self.event.output.take(),
            std::mem::take(&mut self.event.metadata),
            &mut self.source.cache,
        );
        self.event.input = observation.input;
        self.event.output = observation.output;
        self.event.metadata = observation.metadata;
        self.event.row.tool_definitions = observation.tools.tool_definitions;
        self.event.row.tool_calls = observation.tools.tool_calls;
        self.event.row.tool_call_names = observation.tools.tool_call_names;
        self
    }

    fn apply_evaluator_defaults(&mut self) -> &mut Self {
        apply_evaluator_test_metadata_default(
            &mut self.event.row,
            &self.source.attributes,
            &self.event.metadata,
        );
        self
    }

    fn link_prompt(&mut self) -> &mut Self {
        self.event.prompt_version_lookup = self
            .source
            .link_prompt(&mut self.event.row, &mut self.event.evaluation_fields);
        self
    }

    fn extract_usage_and_cost(&mut self) -> &mut Self {
        self.skip_model_usage_and_cost = should_skip_model_usage_and_cost(
            &self.source.attributes,
            self.source.scope_name,
            self.source.span_name(),
            &self.event.event_type,
        );
        if !self.skip_model_usage_and_cost {
            self.event.provided_usage_details = extract_usage_details(
                &self.source.attributes,
                self.source.scope_name,
                &mut self.source.cache,
            );
            self.event.provided_cost_details =
                extract_cost_details(&self.source.attributes, &mut self.source.cache);
        }
        self
    }

    fn attribute_gateway(
        &mut self,
        ingestion_api_key: &str,
        scope_version: Option<&str>,
    ) -> Option<&mut Self> {
        let is_gateway = ingestion_api_key.starts_with(AI_GATEWAY_INGESTION_API_KEY_PREFIX);
        let Some((ingestion_api_key, service_name, service_version)) = resolve_gateway_attribution(
            ingestion_api_key,
            &self.event.metadata,
            self.event.row.service_name.take(),
            self.event.row.service_version.take(),
            scope_version,
        ) else {
            // A missing caller key drops only this gateway span, preserving its siblings.
            tracing::warn!(
                project_id = %self.event.project_id,
                observation_id = %self.event.span_id,
                "Skipping AI gateway span without a caller API key"
            );
            return None;
        };
        self.event.row.ingestion_api_key = ingestion_api_key;
        self.event.row.service_name = service_name;
        self.event.row.service_version = service_version;
        self.event.gateway_calculated_cost = is_gateway
            && self
                .event
                .metadata
                .get(AI_GATEWAY_COST_SOURCE_METADATA_KEY)
                .and_then(Value::as_str)
                == Some(AI_GATEWAY_COST_SOURCE_CALCULATED);
        Some(self)
    }

    fn extract_model(&mut self) -> &mut Self {
        self.event.model_parameters = Some(self.source.model_parameters());
        if !self.skip_model_usage_and_cost {
            self.event.row.provided_model_name = extract_model_name(&self.source.attributes);
        }
        self
    }

    fn extract_completion_time_and_tags(&mut self) -> &mut Self {
        self.event.row.completion_start_time = extract_completion_start_time(
            &self.source.attributes,
            &self.event.start_time,
            &mut self.source.cache,
        );
        self.event.row.tags = extract_tags(
            &self.source.attributes,
            &mut self.source.cache,
            self.source.decode_metadata,
        );
        self
    }
}

/// Source data and per-span parsing state shared by the assembly stages.
struct EventSource<'a> {
    span: Span,
    /// Shared with `cache`, which remembers parses by attribute position.
    attributes: Rc<JsonObject>,
    scope_name: &'a str,
    cache: JsonParseCache,
    diagnostics: MetadataDiagnostics<'a>,
    decode_metadata: bool,
}

impl<'a> EventSource<'a> {
    fn new(
        mut span: Span,
        resource: &JsonObject,
        scope_name: &'a str,
        scope_version: Option<&str>,
        config: &'a EventBuildConfig,
    ) -> Self {
        let attributes = Rc::new(object_attributes(
            span.attributes.take().map(|value| value.into_value()),
        ));
        Self {
            span,
            cache: JsonParseCache::for_attributes(Rc::clone(&attributes)),
            attributes,
            scope_name,
            diagnostics: MetadataDiagnostics::new(
                &config.project_id,
                &config.ingestion_sdk_name,
                &config.ingestion_sdk_version,
            ),
            decode_metadata: should_decode_structured_metadata(
                scope_name,
                scope_version,
                &config.ingestion_sdk_name,
                &config.ingestion_sdk_version,
                resource
                    .get("telemetry.sdk.language")
                    .and_then(Value::as_str),
            ),
        }
    }

    fn span_name(&self) -> &str {
        self.span
            .name
            .as_deref()
            .and_then(Value::as_str)
            .unwrap_or_default()
    }

    fn row(
        &mut self,
        trace_id: String,
        span_id: String,
        resource: &JsonObject,
        scope: &Object,
        scope_version: Option<&str>,
        config: &EventBuildConfig,
    ) -> Option<(OtelStorageRow, Option<Box<JsonObject>>)> {
        let parent_span_id = self
            .span
            .parent_span_id
            .as_deref()
            .filter(|value| !value.is_null())
            .map(parse_id)
            .filter(|value| !value.is_empty());
        let event_type = observation_type(
            &self.attributes,
            resource,
            self.scope_name,
            scope_version,
            self.span_name(),
        );
        let mut evaluation_fields = None;
        let name = extract_name(
            self.span.name.as_deref(),
            &self.attributes,
            &event_type,
            self.scope_name,
            &mut evaluation_fields,
        );
        let Some((start_time, end_time)) = resolve_timestamps(
            self.span.start_time.as_deref(),
            self.span.end_time.as_deref(),
            &config.fallback_time,
        ) else {
            // ClickHouse cannot store such a time. Dropping only this span preserves its siblings.
            // A wrong time unit hits every span of an exporter, so this is counted, not logged.
            metrics::counter!(
                "langfuse.ingestion.otel.conversion_failure",
                "failure_type" => "timestamp_out_of_range", "timestamp_field" => "unknown"
            )
            .increment(1);
            return None;
        };
        let mut attributes = EventAttributes {
            span: &self.attributes,
            resource,
            scope,
            cache: &mut self.cache,
            decode_metadata: self.decode_metadata,
            evaluation_fields: &mut evaluation_fields,
        };
        let mut row = OtelStorageRow::from_attributes(&mut attributes);
        if claude_managed_agent_session_id(&self.attributes, self.scope_name).is_some() {
            row.session_id = attributes.identity(CLAUDE_SESSION_SOURCES);
        }
        apply_context_fields(
            &mut row,
            &self.attributes,
            &mut self.cache,
            &mut self.diagnostics,
        );
        let status_message = row.status_message.or_else(|| {
            let value = self.span.status.as_ref()?.message.as_deref()?;
            retain_evaluation_value(&mut evaluation_fields, "status_message", value);
            value_as_string(value)
        });
        let row = OtelStorageRow {
            project_id: config.project_id.clone(),
            trace_id,
            span_id,
            parent_span_id,
            name,
            event_type,
            environment: extract_environment(
                &self.attributes,
                resource,
                config.is_langfuse_internal,
                &mut self.cache,
            ),
            level: self.level(),
            start_time,
            end_time,
            status_message,
            bookmarked: false,
            public: extract_public(&self.attributes),
            is_app_root: extract_is_app_root(&self.attributes),
            source: config.source.clone(),
            ingestion_sdk_name: config.ingestion_sdk_name.clone(),
            ingestion_sdk_version: config.ingestion_sdk_version.clone(),
            ..row
        };
        Some((row, evaluation_fields))
    }

    fn payloads(&mut self, row: &OtelStorageRow) -> ProviderIO {
        let events = self
            .span
            .events
            .take()
            .map(|events| events.0)
            .unwrap_or_default();
        extract_input_output(
            self.scope_name,
            &self.attributes,
            events,
            row.parent_span_id.as_deref().map(|_| "observation"),
            &mut self.cache,
        )
    }

    fn metadata(&mut self, resource: &JsonObject, scope: &Object) -> JsonObject {
        let mut metadata = JsonObject::new();
        // SDK scopes use root-level metadata; other spans retain the diagnostic attribute map.
        if !self.scope_name.starts_with("langfuse-sdk") {
            let attributes = filter_attributes(&self.attributes, self.scope_name);
            metadata.insert("attributes".into(), Value::Object(attributes));
        }
        metadata.insert("resourceAttributes".into(), Value::Object(resource.clone()));
        metadata.insert("scope".into(), Value::Object(scope.clone()));
        for &domain in METADATA_DOMAINS {
            metadata.extend(extract_metadata(
                &self.attributes,
                domain,
                &mut self.cache,
                self.decode_metadata,
                &mut self.diagnostics,
            ));
        }
        metadata
    }

    fn level(&self) -> String {
        // OTLP status codes are numeric enums: the string "2" must not mark a span as failed.
        let status_error = self.span.status.as_ref().is_some_and(|status| {
            matches!(
                status.code.as_deref(), Some(Value::Number(value)) if value.as_i64() == Some(2)
            )
        });
        parse_observation_level(self.attributes.get("langfuse.observation.level"))
            .or_else(|| status_error.then(|| "ERROR".to_owned()))
            .or_else(|| {
                (self.scope_name == "livekit-agents"
                    && LIVEKIT_DEBUG_SPANS.contains(&self.span_name()))
                .then(|| "DEBUG".to_owned())
            })
            .unwrap_or_else(|| "DEFAULT".to_owned())
    }

    fn link_prompt(
        &mut self,
        row: &mut OtelStorageRow,
        evaluation_fields: &mut Option<Box<JsonObject>>,
    ) -> Option<f64> {
        if row.event_type != "GENERATION" {
            return None;
        }
        // A supplied false, 0, or "" suppresses aliases but must not trigger a lookup.
        // Check truthiness before storage turns false and 0 into nonempty strings.
        let mut read_name = |value: &Value| {
            retain_evaluation_value(evaluation_fields, "prompt_name", value);
            (value_as_string(value), is_js_truthy(value))
        };
        let (name, can_lookup) = PROMPT_NAME_KEYS
            .iter()
            .filter_map(|key| self.attributes.get(*key))
            .find(|value| !value.is_null())
            .map(&mut read_name)
            .or_else(|| {
                parse_prompt(&self.attributes, &mut self.cache)
                    .and_then(|value| value.get("name").map(read_name))
            })
            .unwrap_or_default();
        row.prompt_name = name;
        let lookup = extract_prompt_version_lookup(&self.attributes, &mut self.cache);
        row.prompt_version = extract_prompt_version(&self.attributes, &mut self.cache);
        lookup.filter(|_| can_lookup)
    }

    fn model_parameters(&mut self) -> Value {
        // Pricing and evaluation consume IngestionService's normalized value: falsy values
        // become {}, and JSON text is parsed once more before storage.
        let parameters =
            extract_model_parameters(&self.attributes, self.scope_name, &mut self.cache)
                .filter(is_js_truthy)
                .unwrap_or_else(|| Value::Object(JsonObject::new()));
        match &parameters {
            Value::String(text) => super::super::value::parse_js_string(text).unwrap_or(parameters),
            _ => parameters,
        }
    }
}

const CLAUDE_SESSION_SOURCES: &[AttributeSource] = &[
    AttributeSource::Span("langfuse.session.id"),
    AttributeSource::Span("session.id"),
    AttributeSource::Span("anthropic.session.id"),
];

const PROMPT_NAME_KEYS: &[&str] = &["langfuse.observation.prompt.name", "langfuse.prompt.name"];

// Later domains overwrite values without moving existing keys: metadata_names exposes this order.
const METADATA_DOMAINS: &[MetadataDomain] = &[MetadataDomain::Observation, MetadataDomain::Trace];

// For each key, try the span before the resource; only then try the next alias.
const ENVIRONMENT_KEYS: &[&str] = &[
    "langfuse.environment",
    "deployment.environment.name",
    "deployment.environment",
];

const LEVEL_ALIASES: &[(&str, &[&str])] = &[
    ("DEBUG", &["DEBUG", "TRACE", "VERBOSE"]),
    (
        "DEFAULT",
        &["DEFAULT", "INFO", "LOG", "NOTICE", "OK", "SUCCESS"],
    ),
    ("WARNING", &["WARNING", "WARN"]),
    ("ERROR", &["ERROR", "FATAL", "CRITICAL"]),
];

const LIVEKIT_DEBUG_SPANS: &[&str] = &[
    "user_speaking",
    "eou_detection",
    "llm_request_run",
    "tts_node",
    "tts_request",
    "tts_request_run",
    "tts_stream_adapter",
    "agent_speaking",
    "drain_agent_activity",
    "on_exit",
    "on_enter",
    "llm_fallback_adapter",
    "tts_fallback_adapter",
    "start_agent_activity",
];

/// Resolve the persisted key and service fields for one event.
///
/// A gateway grant authenticates the batch, while each span carries the caller key id in
/// metadata. The resolver returns None for a span without that id, allowing sibling spans in the
/// same OTLP request to continue.
fn resolve_gateway_attribution(
    ingestion_api_key: &str,
    metadata: &JsonObject,
    service_name: Option<String>,
    service_version: Option<String>,
    scope_version: Option<&str>,
) -> Option<(String, Option<String>, Option<String>)> {
    if !ingestion_api_key.starts_with(AI_GATEWAY_INGESTION_API_KEY_PREFIX) {
        if service_name.as_deref() == Some(AI_GATEWAY_SERVICE_NAME) {
            return Some((ingestion_api_key.to_owned(), None, None));
        }
        return Some((ingestion_api_key.to_owned(), service_name, service_version));
    }

    let key_id = metadata
        .get(AI_GATEWAY_KEY_ID_METADATA_KEY)
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())?;
    Some((
        key_id.to_owned(),
        Some(AI_GATEWAY_SERVICE_NAME.to_owned()),
        scope_version.map(str::to_owned),
    ))
}

fn object_attributes(value: Option<Value>) -> JsonObject {
    value
        .map(|mut value| {
            value
                .as_object_mut()
                .and_then(|object| object.shift_remove("attributes"))
                .unwrap_or(value)
        })
        .map(attributes_to_map)
        .unwrap_or_default()
}

fn parse_prompt(attributes: &JsonObject, parse_cache: &mut JsonParseCache) -> Option<Value> {
    match attributes.get("ai.telemetry.metadata.langfusePrompt")? {
        value @ Value::String(_) => parse_cache.parse(Some(value)).cloned(),
        value => Some(value.clone()),
    }
}

fn extract_environment(
    attributes: &JsonObject,
    resource: &JsonObject,
    internal: bool,
    parse_cache: &mut JsonParseCache,
) -> String {
    for &key in ENVIRONMENT_KEYS {
        // Select a truthy span value first, then a truthy resource value, matching the
        // TypeScript `if (value)` fallback. Normalize the selected string and use `default` for
        // other selected shapes.
        let value = attributes
            .get(key)
            .filter(|value| is_js_truthy(value))
            .or_else(|| resource.get(key).filter(|value| is_js_truthy(value)));
        if let Some(value) = value {
            return value
                .as_str()
                .map(|value| normalize_environment(value, internal))
                .unwrap_or_else(|| "default".to_owned());
        }
    }

    // An OpenRouter failure payload with a null completion and a reserved raw-request
    // environment recovers that internal environment before public normalization.
    if resource.get("service.name").and_then(Value::as_str) == Some("openrouter")
        && attributes.get("openrouter.source").and_then(Value::as_str) == Some("openrouter")
    {
        let completion = attributes
            .get("gen_ai.completion")
            .and_then(|value| parse_json_value(value, parse_cache));
        if let Some(raw_environment) = completion
            .as_ref()
            .filter(|value| value.get("completion").is_some_and(Value::is_null))
            .and_then(|value| value.path(["rawRequest", "trace", "environment"]))
            .and_then(Value::as_str)
            .filter(|environment| INTERNAL_TRACE_ENVIRONMENTS.contains(environment))
        {
            // The fallback normalizes the reserved environment with internal=false, matching
            // the public processor contract.
            return normalize_environment(raw_environment, false);
        }
    }

    "default".to_owned()
}

fn parse_observation_level(value: Option<&Value>) -> Option<String> {
    let value = value?.as_str()?.trim().to_ascii_uppercase();
    LEVEL_ALIASES
        .iter()
        .find_map(|&(level, aliases)| aliases.contains(&value.as_str()).then(|| level.to_owned()))
}

fn normalize_environment(value: &str, internal: bool) -> String {
    let mut value = value.to_owned();
    if !internal {
        value = value.to_ascii_lowercase();
        while let Some(rest) = value.strip_prefix("langfuse") {
            value = rest
                .strip_prefix('-')
                .or_else(|| rest.strip_prefix('_'))
                .unwrap_or(rest)
                .to_owned();
        }
    }
    let value = value.chars().take(40).collect::<String>();
    if value.is_empty()
        || !value.bytes().all(|byte| {
            byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-' || byte == b'_'
        })
    {
        "default".to_owned()
    } else {
        value
    }
}

fn parse_json_value(value: &Value, parse_cache: &mut JsonParseCache) -> Option<Value> {
    match value {
        Value::String(_) => parse_cache.parse(Some(value)).cloned(),
        value => Some(value.clone()),
    }
}
