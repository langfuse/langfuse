//! Declare each event column once: its name, Rust types, default and OTLP attribute keys.
//!
//! `macros` uses this list to generate `OtelStorageRow` for normalization and
//! `PreparedEventRow` for ClickHouse encoding, plus conversion and media-restoration
//! methods. `OtelStorageRow::into_prepared` converts fields and applies defaults;
//! the encoder reads the resulting `PreparedEventRow`.
//!
//! Fields marked `media(resolved)` contain upload references or restored inline
//! text from media processing on `OwnedEvent`. Row restoration replaces temporary
//! media references in the remaining string fields.

use serde::Serialize;
use serde_json::Value;

use crate::native_codec::{DateTime64Micros, Decimal64, SkillReference, SkillResourceLoaded};
use crate::otel::attributes::AttributeSource::{Resource, Scope, Span};

const OPTIONAL_EXPERIMENT_EVALUATION_FIELDS: [&str; 7] = [
    "experiment_id",
    "experiment_name",
    "experiment_description",
    "experiment_dataset_id",
    "experiment_item_id",
    "experiment_item_expected_output",
    "experiment_item_root_span_id",
];

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DefaultPolicy {
    None,
    Literal(&'static str),
    Metadata(&'static str),
    MetadataFallback(&'static str, &'static str),
    MetadataEquals(&'static str, &'static str),
}

#[macro_use]
mod macros;

impl OtelStorageRow {
    /// Estimate the fields read for a trace after overflow has replaced uploaded payloads.
    pub fn estimated_dispatch_bytes(&self) -> usize {
        // Small spans still cost a row to read. The fixed allowance approximates the
        // per-row overhead observed in replays without serializing every stored column.
        const ROW_OVERHEAD_BYTES: usize = 1_536;
        let text = [
            Some(&self.project_id),
            Some(&self.trace_id),
            Some(&self.span_id),
            self.parent_span_id.as_ref(),
            Some(&self.name),
            self.trace_name.as_ref(),
            self.session_id.as_ref(),
            Some(&self.environment),
            Some(&self.event_type),
            Some(&self.level),
            self.status_message.as_ref(),
            self.input.as_ref(),
            self.output.as_ref(),
        ];
        let payload_bytes = text
            .into_iter()
            .flatten()
            .chain(&self.metadata_names)
            .chain(&self.metadata_values)
            .chain(&self.tool_calls)
            .chain(&self.tool_call_names)
            .chain(
                self.tool_definitions
                    .iter()
                    .flat_map(|(name, definition)| [name, definition]),
            )
            .map(String::len)
            .sum::<usize>();
        ROW_OVERHEAD_BYTES + payload_bytes
    }

    pub fn evaluation_value(&self) -> Result<Value, serde_json::Error> {
        let mut value = serde_json::to_value(self)?;
        let object = value.as_object_mut().expect("row is an object");
        object.insert("id".into(), Value::String(self.span_id.clone()));

        // TypeScript leaves missing experiment attributes undefined, so evaluation
        // uploads omit those keys even though the storage row allows nulls.
        for field in OPTIONAL_EXPERIMENT_EVALUATION_FIELDS {
            if object.get(field).is_some_and(Value::is_null) {
                object.remove(field);
            }
        }
        Ok(value)
    }
}

// Keep encoded columns in `events_full` order.
// Put columns with metadata defaults before the metadata arrays: `into_prepared`
// reads those arrays for defaults before moving them into the result.
clickhouse_table_schema! {
    project_id: String => DefaultPolicy::None,
    trace_id: String => DefaultPolicy::None,
    span_id: String => DefaultPolicy::None,
    parent_span_id logical(Option<String>): String => DefaultPolicy::None,
    name: String => DefaultPolicy::None,
    environment: String => DefaultPolicy::Literal("default"),
    version logical(Option<String>) otel(text [Span("langfuse.version"), Resource("service.version")]): String => DefaultPolicy::None,
    release logical(Option<String>) otel(text [Span("langfuse.release"), Resource("langfuse.release")]): String => DefaultPolicy::None,
    trace_name logical(Option<String>) otel(text [Span("langfuse.trace.name")]): String => DefaultPolicy::None,
    user_id logical(Option<String>) otel(identity [Span("langfuse.user.id"), Span("user.id"), Span("langfuse.observation.metadata.langfuse_user_id"), Span("langfuse.trace.metadata.langfuse_user_id"), Span("ai.telemetry.metadata.userId"), Resource("langfuse.user.id"), Resource("user.id"), Span("user.name"), Resource("user.name")]): String => DefaultPolicy::None,
    session_id logical(Option<String>) otel(identity [Span("langfuse.session.id"), Span("session.id"), Span("gen_ai.conversation.id"), Span("langfuse.observation.metadata.langfuse_session_id"), Span("langfuse.trace.metadata.langfuse_session_id"), Span("ai.telemetry.metadata.sessionId")]): String => DefaultPolicy::None,
    level: String => DefaultPolicy::None,
    status_message logical(Option<String>) otel(text [Span("langfuse.observation.status_message")]): String => DefaultPolicy::None,
    prompt_id logical(Option<String>): String => DefaultPolicy::None,
    prompt_name logical(Option<String>): String => DefaultPolicy::None,
    model_id logical(Option<String>): String => DefaultPolicy::None,
    provided_model_name logical(Option<String>): String => DefaultPolicy::None,
    model_parameters logical(Option<String>): String => DefaultPolicy::None,
    input logical(Option<String>) media(resolved): String => DefaultPolicy::None,
    output logical(Option<String>) media(resolved): String => DefaultPolicy::None,
    evaluator_id logical(Option<String>) otel(truthy_text [Span("langfuse.evaluator.id")]) default(metadata): String => DefaultPolicy::Metadata("evaluator_id"),
    evaluation_rule_id logical(Option<String>) otel(truthy_text [Span("langfuse.evaluation.rule.id")]) default(metadata): String => {
        DefaultPolicy::MetadataFallback("evaluation_rule_id", "job_configuration_id")
    },
    experiment_id logical(Option<String>) otel(truthy_text [Span("langfuse.experiment.id")]): String => DefaultPolicy::None,
    experiment_name logical(Option<String>) otel(truthy_text [Span("langfuse.experiment.name")]): String => DefaultPolicy::None,
    experiment_description logical(Option<String>) otel(truthy_text [Span("langfuse.experiment.description")]): String => DefaultPolicy::None,
    experiment_dataset_id logical(Option<String>) otel(truthy_text [Span("langfuse.experiment.dataset.id")]): String => DefaultPolicy::None,
    experiment_item_id logical(Option<String>) otel(truthy_text [Span("langfuse.experiment.item.id")]): String => DefaultPolicy::None,
    experiment_item_expected_output logical(Option<String>) otel(truthy_text [Span("langfuse.experiment.item.expected_output")]): String => DefaultPolicy::None,
    experiment_item_root_span_id logical(Option<String>) otel(truthy_text [Span("langfuse.experiment.item.root_observation_id")]): String => DefaultPolicy::None,
    source: String => DefaultPolicy::None,
    service_name logical(Option<String>) otel(text [Resource("service.name")]): String => DefaultPolicy::None,
    service_version logical(Option<String>) otel(text [Resource("service.version")]): String => DefaultPolicy::None,
    scope_name logical(Option<String>) otel(scope_name [Scope("name")]): String => DefaultPolicy::None,
    scope_version logical(Option<String>) otel(text [Scope("version")]): String => DefaultPolicy::None,
    telemetry_sdk_language logical(Option<String>) otel(text [Resource("telemetry.sdk.language")]): String => DefaultPolicy::None,
    telemetry_sdk_name logical(Option<String>) otel(text [Resource("telemetry.sdk.name")]): String => DefaultPolicy::None,
    telemetry_sdk_version logical(Option<String>) otel(text [Resource("telemetry.sdk.version")]): String => DefaultPolicy::None,
    blob_storage_file_path: String => DefaultPolicy::None,
    ingestion_api_key: String => DefaultPolicy::None,
    ingestion_sdk_name: String => DefaultPolicy::Literal("unknown"),
    ingestion_sdk_version: String => DefaultPolicy::Literal("unknown"),
    event_type as "type": String => DefaultPolicy::None,
    start_time logical(String): DateTime64Micros => DefaultPolicy::None,
    created_at logical(String): DateTime64Micros => DefaultPolicy::None,
    updated_at logical(String): DateTime64Micros => DefaultPolicy::None,
    event_ts logical(String): DateTime64Micros => DefaultPolicy::None,
    end_time logical(String): Option<DateTime64Micros> => DefaultPolicy::None,
    completion_start_time logical(Option<String>): Option<DateTime64Micros> => DefaultPolicy::None,
    experiment_item_version logical(Option<String>): Option<DateTime64Micros> => DefaultPolicy::None,
    prompt_version: Option<u16> => DefaultPolicy::None,
    is_app_root: bool => DefaultPolicy::None,
    bookmarked: bool => DefaultPolicy::None,
    public: bool => DefaultPolicy::None,
    evaluator_execution_is_test: bool => {
        DefaultPolicy::MetadataEquals("evaluator_test", "true")
    },
    is_deleted: u8 => DefaultPolicy::None,
    tags: Vec<String> => DefaultPolicy::None,
    tool_calls: Vec<String> => DefaultPolicy::None,
    tool_call_names: Vec<String> => DefaultPolicy::None,
    skills_available: Vec<SkillReference> => DefaultPolicy::None,
    skills_resource_loaded: Vec<SkillResourceLoaded> => DefaultPolicy::None,
    metadata_names: Vec<String> => DefaultPolicy::None,
    metadata_values media(resolved): Vec<String> => DefaultPolicy::None,
    experiment_metadata_names: Vec<String> => DefaultPolicy::None,
    experiment_metadata_values: Vec<String> => DefaultPolicy::None,
    experiment_item_metadata_names: Vec<String> => DefaultPolicy::None,
    experiment_item_metadata_values: Vec<String> => DefaultPolicy::None,
    provided_usage_details logical(std::collections::BTreeMap<String, serde_json::Value>): std::collections::BTreeMap<String, u64> => DefaultPolicy::None,
    usage_details logical(std::collections::BTreeMap<String, serde_json::Value>): std::collections::BTreeMap<String, u64> => DefaultPolicy::None,
    provided_cost_details logical(std::collections::BTreeMap<String, serde_json::Value>): std::collections::BTreeMap<String, Decimal64> => DefaultPolicy::None,
    cost_details logical(std::collections::BTreeMap<String, serde_json::Value>): std::collections::BTreeMap<String, Decimal64> => DefaultPolicy::None,
    usage_pricing_tier_id logical(Option<String>): Option<String> => DefaultPolicy::None,
    usage_pricing_tier_name logical(Option<String>): Option<String> => DefaultPolicy::None,
    tool_definitions: std::collections::BTreeMap<String, String> => DefaultPolicy::None,
}
