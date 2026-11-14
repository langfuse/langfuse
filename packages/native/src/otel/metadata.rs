//! Read metadata and experiment/evaluator fields from OTLP attributes.
//!
//! `extract_metadata` combines a JSON metadata object with dotted keys such as
//! `langfuse.observation.metadata.foo`. `MetadataDomain` selects the attribute
//! prefix. One `MetadataDiagnostics` per span reports rejected blobs with project
//! and SDK tags, counting each attribute and reason once. `apply_context_fields`
//! writes experiment and evaluator fields into `OtelStorageRow`.

use std::collections::HashSet;
use std::sync::LazyLock;

use super::attributes::{is_js_truthy, JsonParseCache};
use super::types::{flatten_object_owned, JsonObject};
use super::value::Value;
use chrono::{DateTime, NaiveDate, NaiveDateTime, Timelike};

pub const TRACE_METADATA: &str = "langfuse.trace.metadata";
pub const OBSERVATION_METADATA: &str = "langfuse.observation.metadata";
pub const GENERIC_METADATA: &str = "langfuse.metadata";
pub const AI_METADATA: &str = "ai.telemetry.metadata";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MetadataDomain {
    Trace,
    Observation,
    Experiment,
    ExperimentItem,
}

impl MetadataDomain {
    fn prefix(self) -> &'static str {
        match self {
            Self::Trace => TRACE_METADATA,
            Self::Observation => OBSERVATION_METADATA,
            Self::Experiment => "langfuse.experiment.metadata",
            Self::ExperimentItem => "langfuse.experiment.item.metadata",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::Trace => "trace",
            Self::Observation => "observation",
            Self::Experiment => "experiment",
            Self::ExperimentItem => "experiment_item",
        }
    }
}

/// Per-span diagnostics for metadata values discarded during native conversion.
///
/// The tracker carries the request attribution needed by Datadog and suppresses
/// duplicate reports when the compatibility `langfuse.metadata` value is checked
/// for both trace and observation fields. It allocates only after the first drop.
#[derive(Default)]
pub struct MetadataDiagnostics<'a> {
    project_id: &'a str,
    sdk_name: &'a str,
    sdk_version: &'a str,
    reported: HashSet<(&'static str, &'static str)>,
}

impl<'a> MetadataDiagnostics<'a> {
    pub fn new(project_id: &'a str, sdk_name: &'a str, sdk_version: &'a str) -> Self {
        Self {
            project_id,
            sdk_name,
            sdk_version,
            reported: HashSet::new(),
        }
    }

    fn record_value(&mut self, domain: MetadataDomain, attribute_key: &'static str, value: &Value) {
        match value {
            Value::Null | Value::Array(_) | Value::Object(_) => {}
            Value::String(value) => self.record(
                domain,
                attribute_key,
                "parse_failure",
                Some(classify_decode_failure(value.as_str())),
            ),
            Value::Bool(_) | Value::Number(_) => {
                self.record(domain, attribute_key, "primitive", None)
            }
        }
    }

    fn record(
        &mut self,
        domain: MetadataDomain,
        attribute_key: &'static str,
        reason: &'static str,
        kind: Option<&'static str>,
    ) {
        if !self.reported.insert((attribute_key, reason)) {
            return;
        }
        let project_id = self.project_id.to_owned();
        let sdk_name = sanitize_sdk_metric_tag_value(self.sdk_name);
        let sdk_version = sanitize_sdk_metric_tag_value(self.sdk_version);
        let mut labels = vec![
            metrics::Label::new("reason", reason),
            metrics::Label::new("source", "otel"),
            metrics::Label::new("domain", domain.label()),
            metrics::Label::new("projectId", project_id),
            metrics::Label::new("attributeKey", attribute_key),
            metrics::Label::new("sdkName", sdk_name),
            metrics::Label::new("sdkVersion", sdk_version),
        ];
        if let Some(kind) = kind {
            labels.push(metrics::Label::new("kind", kind));
        }
        metrics::counter!("langfuse.ingestion.metadata_dropped", labels).increment(1);
    }
}

fn sanitize_sdk_metric_tag_value(value: &str) -> String {
    let sanitized = value
        .chars()
        .filter(|character| {
            let code_point = *character as u32;
            code_point > 31 && code_point != 127 && !matches!(*character, ',' | '|' | ':' | '=')
        })
        .collect::<String>();
    let bounded = sanitized.trim().chars().take(32).collect::<String>();
    if bounded.is_empty() {
        "unknown".to_owned()
    } else {
        bounded
    }
}

/// Extract the effective metadata object while retaining insertion order from the input map.
pub fn extract_metadata(
    attributes: &JsonObject,
    domain: MetadataDomain,
    parse_cache: &mut JsonParseCache,
    decode_values: bool,
    diagnostics: &mut MetadataDiagnostics<'_>,
) -> JsonObject {
    let prefix = domain.prefix();
    let primary = attributes.get(prefix);
    if let Some(value) = primary.filter(|value| !value.is_null() && !is_js_truthy(value)) {
        diagnostics.record_value(domain, prefix, value);
    }
    let (top_level, top_level_key) = if primary.is_some_and(is_js_truthy) {
        (primary, prefix)
    } else {
        (attributes.get(GENERIC_METADATA), GENERIC_METADATA)
    };
    let base = parse_metadata_value(top_level, domain, top_level_key, parse_cache, diagnostics);

    extract_prefixed_metadata(
        attributes,
        base,
        [
            (prefix, decode_values),
            (GENERIC_METADATA, false),
            (AI_METADATA, false),
        ],
        parse_cache,
    )
}

fn extract_prefixed_metadata<const N: usize>(
    attributes: &JsonObject,
    mut result: JsonObject,
    prefixes: [(&str, bool); N],
    parse_cache: &mut JsonParseCache,
) -> JsonObject {
    let markers = prefixes.map(|(prefix, decode)| (format!("{prefix}."), decode));
    for (key, value) in attributes {
        let key_text = key.as_str();
        if matches!(
            key_text,
            "ai.telemetry.metadata.userId"
                | "ai.telemetry.metadata.sessionId"
                | "ai.telemetry.metadata.tags"
                | "ai.telemetry.metadata.langfusePrompt"
        ) {
            continue;
        }
        for (marker, decode) in &markers {
            let Some(metadata_key) = key.strip_prefix(marker) else {
                continue;
            };
            // The TypeScript accumulator skips this reserved dotted key. The JSON parser
            // keeps a `__proto__` key inside the parsed blob as an own data property.
            if metadata_key.is_empty() || metadata_key.as_utf8() == Some("__proto__") {
                continue;
            }
            result.insert(
                metadata_key,
                if *decode {
                    decode_metadata_value(value, parse_cache)
                } else {
                    value.clone()
                },
            );
        }
    }
    result
}

/// Langfuse SDK scopes supply their own version; other scopes use the exporting SDK's
/// request version. The request SDK name takes precedence over the resource language.
pub fn should_decode_structured_metadata(
    scope_name: &str,
    scope_version: Option<&str>,
    header_sdk_name: &str,
    header_sdk_version: &str,
    telemetry_sdk_language: Option<&str>,
) -> bool {
    let canonical_sdk =
        normalize_ingestion_sdk_name(header_sdk_name).or(match telemetry_sdk_language {
            Some("python") => Some("python"),
            Some("nodejs" | "webjs") => Some("javascript"),
            _ => None,
        });
    let Some(canonical_sdk) = canonical_sdk else {
        return false;
    };
    let version = if scope_name.starts_with("langfuse-sdk") {
        scope_version
    } else {
        Some(header_sdk_version)
    };
    let Some(version) = version.and_then(parse_sdk_major) else {
        return false;
    };

    version >= if canonical_sdk == "python" { 5 } else { 6 }
}

fn normalize_ingestion_sdk_name(value: &str) -> Option<&'static str> {
    match value.trim().to_ascii_lowercase().as_str() {
        "python" | "langfuse-python" => Some("python"),
        "javascript"
        | "js"
        | "typescript"
        | "ts"
        | "langfuse-js"
        | "langfuse-ts"
        | "@langfuse/client"
        | "@langfuse/browser"
        | "@langfuse/core"
        | "@langfuse/langchain"
        | "@langfuse/otel"
        | "@langfuse/openai"
        | "@langfuse/tracing"
        | "@langfuse/vercel-ai-sdk" => Some("javascript"),
        _ => None,
    }
}

fn parse_sdk_major(value: &str) -> Option<u64> {
    static SDK_VERSION: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
        fancy_regex::Regex::new(r"^v?(\d+)\.(\d+)\.(\d+)(?:[.+-].+|(?i:(?:a|b|rc)\d+))?$")
            .expect("static SDK version regex is valid")
    });
    let captures = SDK_VERSION.captures(value.trim()).ok()??;
    let major = parse_safe_version_number(captures.get(1)?.as_str())?;
    parse_safe_version_number(captures.get(2)?.as_str())?;
    parse_safe_version_number(captures.get(3)?.as_str())?;
    Some(major)
}

fn parse_safe_version_number(value: &str) -> Option<u64> {
    let number = value.parse::<u64>().ok()?;
    (number <= 9_007_199_254_740_991).then_some(number)
}

fn decode_metadata_value(value: &Value, parse_cache: &mut JsonParseCache) -> Value {
    let Value::String(encoded) = value else {
        return value.clone();
    };
    if let Some(decoded) = parse_cache.parse(Some(value)).cloned() {
        return decoded;
    }
    metrics::counter!(
        "langfuse.ingestion.metadata_undecoded",
        "kind" => classify_decode_failure(encoded.as_str())
    )
    .increment(1);
    value.clone()
}

fn classify_decode_failure(value: &str) -> &'static str {
    let head = value.chars().take(64).collect::<String>();
    let head = head.trim_start();
    if head.is_empty() {
        return "empty";
    }
    let python_container = head
        .strip_prefix('{')
        .or_else(|| head.strip_prefix('['))
        .is_some_and(|rest| rest.trim_start().starts_with('\''));
    let python_scalar = ["True", "False", "None"].iter().any(|candidate| {
        head.strip_prefix(candidate).is_some_and(|rest| {
            rest.chars()
                .next()
                .is_none_or(|character| !character.is_ascii_alphanumeric() && character != '_')
        })
    });
    if python_container || python_scalar {
        return "python_repr";
    }
    if let Some(opening) = head
        .chars()
        .next()
        .filter(|character| *character == '{' || *character == '[')
    {
        let expected_close = if opening == '{' { '}' } else { ']' };
        let tail = value.chars().rev().take(64).collect::<String>();
        let last = tail.trim_start().chars().next();
        return if last == Some(expected_close) {
            "loose_json"
        } else {
            "truncated_json"
        };
    }
    "unquoted_string"
}

pub fn extract_metadata_from_prefix(
    attributes: &JsonObject,
    domain: MetadataDomain,
    parse_cache: &mut JsonParseCache,
    diagnostics: &mut MetadataDiagnostics<'_>,
) -> JsonObject {
    let prefix = domain.prefix();
    let base = parse_metadata_value(
        attributes.get(prefix),
        domain,
        prefix,
        parse_cache,
        diagnostics,
    );
    extract_prefixed_metadata(attributes, base, [(prefix, false)], parse_cache)
}

pub fn apply_context_fields(
    row: &mut crate::native_schema::OtelStorageRow,
    attributes: &JsonObject,
    parse_cache: &mut JsonParseCache,
    diagnostics: &mut MetadataDiagnostics<'_>,
) {
    (
        row.experiment_metadata_names,
        row.experiment_metadata_values,
    ) = flatten_object_owned(extract_metadata_from_prefix(
        attributes,
        MetadataDomain::Experiment,
        parse_cache,
        diagnostics,
    ));
    (
        row.experiment_item_metadata_names,
        row.experiment_item_metadata_values,
    ) = flatten_object_owned(extract_metadata_from_prefix(
        attributes,
        MetadataDomain::ExperimentItem,
        parse_cache,
        diagnostics,
    ));
    row.experiment_item_version =
        parse_experiment_item_version(attributes.get("langfuse.experiment.item.version"));
    row.evaluator_execution_is_test = match attributes.get("langfuse.evaluator.execution.is_test") {
        Some(value) if !value.is_null() => is_evaluator_test_value(value),
        _ => false,
    };
}

/// Apply the ClickHouse evaluator-test default after the final metadata map exists.
///
/// The TypeScript path derives this default when all explicit evaluation attributes are nullish.
/// Call this after context extraction so ordinary spans reuse the final metadata map for the
/// default decision and metadata parsing runs once.
pub fn apply_evaluator_test_metadata_default(
    row: &mut crate::native_schema::OtelStorageRow,
    attributes: &JsonObject,
    metadata: &JsonObject,
) {
    let explicit = [
        "langfuse.evaluator.id",
        "langfuse.evaluation.rule.id",
        "langfuse.evaluator.execution.is_test",
    ]
    .into_iter()
    .any(|key| attributes.get(key).is_some_and(|value| !value.is_null()));
    if !explicit {
        row.evaluator_execution_is_test = metadata
            .get("evaluator_test")
            .is_some_and(is_evaluator_test_value);
    }
}

fn parse_metadata_value(
    value: Option<&Value>,
    domain: MetadataDomain,
    attribute_key: &'static str,
    parse_cache: &mut JsonParseCache,
    diagnostics: &mut MetadataDiagnostics<'_>,
) -> JsonObject {
    let Some(value) = value else {
        return JsonObject::new();
    };
    match value {
        Value::Object(value) => value.clone(),
        Value::Array(value) => array_to_object(value),
        Value::Null => JsonObject::new(),
        Value::String(encoded) => {
            let Some(parsed) = parse_cache.parse(Some(value)) else {
                diagnostics.record(
                    domain,
                    attribute_key,
                    "parse_failure",
                    Some(classify_decode_failure(encoded.as_str())),
                );
                return JsonObject::new();
            };
            match parsed {
                Value::Object(value) => value.clone(),
                Value::Array(value) => array_to_object(value),
                Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
                    diagnostics.record(domain, attribute_key, "non_object_top_level", None);
                    JsonObject::new()
                }
            }
        }
        Value::Bool(_) | Value::Number(_) => {
            diagnostics.record(domain, attribute_key, "primitive", None);
            JsonObject::new()
        }
    }
}

fn array_to_object(values: &[Value]) -> JsonObject {
    values
        .iter()
        .enumerate()
        .map(|(index, value)| (index.to_string().into(), value.clone()))
        .collect()
}

fn is_evaluator_test_value(value: &Value) -> bool {
    matches!(value, Value::Bool(true)) || value.as_str() == Some("true")
}

/// Convert an experiment item's timestamp to the ClickHouse text shape.
///
/// Accept complete ISO dates and timestamps, interpreting times without an offset as UTC.
/// Chrono also accepts leap seconds; reject them to match JavaScript `Date`.
fn parse_experiment_item_version(value: Option<&Value>) -> Option<String> {
    let value = match value {
        None | Some(Value::Null) => return None,
        Some(value) => super::attributes::javascript_string(value),
    };
    if value.is_empty() {
        return None;
    }

    let without_z = value.strip_suffix('Z').unwrap_or(&value);
    let parsed = DateTime::parse_from_rfc3339(&value)
        .or_else(|_| DateTime::parse_from_str(&value, "%Y-%m-%dT%H:%M:%S%.f%z"))
        .or_else(|_| DateTime::parse_from_str(&value, "%Y-%m-%dT%H:%M%z"))
        .ok()
        .map(|value| value.naive_utc())
        .or_else(|| {
            [
                "%Y-%m-%dT%H:%M:%S%.f",
                "%Y-%m-%dT%H:%M",
                "%Y-%m-%d %H:%M:%S%.f",
                "%Y-%m-%d %H:%M",
            ]
            .into_iter()
            .find_map(|format| NaiveDateTime::parse_from_str(without_z, format).ok())
        })
        .or_else(|| {
            NaiveDate::parse_from_str(without_z, "%Y-%m-%d")
                .ok()
                .and_then(|date| date.and_hms_opt(0, 0, 0))
        })?;
    (parsed.nanosecond() < 1_000_000_000)
        .then(|| parsed.format("%Y-%m-%d %H:%M:%S%.3f").to_string())
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::otel::value::json;
    use std::sync::{atomic::Ordering, Arc, Mutex};

    #[derive(Default)]
    pub(crate) struct CapturingRecorder(
        pub(crate) Mutex<Vec<(metrics::Key, Arc<metrics::atomics::AtomicU64>)>>,
    );

    impl metrics::Recorder for CapturingRecorder {
        fn describe_counter(
            &self,
            _key: metrics::KeyName,
            _unit: Option<metrics::Unit>,
            _description: metrics::SharedString,
        ) {
        }

        fn describe_gauge(
            &self,
            _key: metrics::KeyName,
            _unit: Option<metrics::Unit>,
            _description: metrics::SharedString,
        ) {
        }

        fn describe_histogram(
            &self,
            _key: metrics::KeyName,
            _unit: Option<metrics::Unit>,
            _description: metrics::SharedString,
        ) {
        }

        fn register_counter(
            &self,
            key: &metrics::Key,
            _metadata: &metrics::Metadata<'_>,
        ) -> metrics::Counter {
            let value = Arc::new(metrics::atomics::AtomicU64::new(0));
            self.0
                .lock()
                .unwrap()
                .push((key.clone(), Arc::clone(&value)));
            metrics::Counter::from_arc(value)
        }

        fn register_gauge(
            &self,
            _key: &metrics::Key,
            _metadata: &metrics::Metadata<'_>,
        ) -> metrics::Gauge {
            metrics::Gauge::noop()
        }

        fn register_histogram(
            &self,
            _key: &metrics::Key,
            _metadata: &metrics::Metadata<'_>,
        ) -> metrics::Histogram {
            metrics::Histogram::noop()
        }
    }

    fn context_fields(
        attributes: &JsonObject,
        cache: &mut JsonParseCache,
    ) -> crate::native_schema::OtelStorageRow {
        let empty = JsonObject::new();
        let mut row = crate::native_schema::OtelStorageRow::from_attributes(
            &mut super::super::attributes::EventAttributes {
                span: attributes,
                resource: &empty,
                scope: &empty,
                cache,
                decode_metadata: false,
            },
        );
        apply_context_fields(
            &mut row,
            attributes,
            cache,
            &mut MetadataDiagnostics::default(),
        );
        row
    }

    fn metadata_metrics(
        attributes: &JsonObject,
        sdk_name: &str,
        sdk_version: &str,
    ) -> Vec<(metrics::Key, Arc<metrics::atomics::AtomicU64>)> {
        let recorder = CapturingRecorder::default();
        metrics::with_local_recorder(&recorder, || {
            let mut cache = JsonParseCache::default();
            let mut diagnostics = MetadataDiagnostics::new("project", sdk_name, sdk_version);
            extract_metadata(
                attributes,
                MetadataDomain::Observation,
                &mut cache,
                false,
                &mut diagnostics,
            );
            extract_metadata(
                attributes,
                MetadataDomain::Trace,
                &mut cache,
                false,
                &mut diagnostics,
            );
        });
        recorder.0.into_inner().unwrap()
    }

    #[test]
    fn metadata_version_comes_from_the_exporter_for_custom_scopes() {
        for (scope, scope_version, sdk, header_version, expected) in [
            ("custom", Some("1.0.0"), "python", "5.0.0", true),
            ("custom", None, "javascript", "6.0.0", true),
            ("custom", Some("6.0.0"), "javascript", "5.0.0", false),
            ("langfuse-sdk", Some("4.0.0"), "python", "5.0.0", false),
            ("langfuse-sdk", Some("5.0.0"), "python", "4.0.0", true),
        ] {
            assert_eq!(
                should_decode_structured_metadata(scope, scope_version, sdk, header_version, None),
                expected,
                "{scope}: {scope_version:?} / {sdk} {header_version}",
            );
        }
    }

    #[test]
    fn metadata_drop_metrics_match_ts_tags_and_dedupe_compatibility_values() {
        let attributes = json!({
            "langfuse.metadata": "{invalid",
            "langfuse.trace.metadata": false,
        });
        let calls = metadata_metrics(
            attributes.as_object().unwrap(),
            "\tpy,|bad=:\n",
            "123456789012345678901234567890123456",
        );
        assert_eq!(calls.len(), 2);
        assert!(calls
            .iter()
            .all(|(key, _)| key.name() == "langfuse.ingestion.metadata_dropped"));
        let labels = |index: usize| -> std::collections::BTreeMap<String, String> {
            calls[index]
                .0
                .labels()
                .map(|label| (label.key().to_owned(), label.value().to_owned()))
                .collect::<std::collections::BTreeMap<_, _>>()
        };
        assert!(calls
            .iter()
            .all(|(_, value)| value.load(Ordering::Relaxed) == 1));
        assert_eq!(labels(0)["reason"], "parse_failure");
        assert_eq!(labels(0)["attributeKey"], GENERIC_METADATA);
        assert_eq!(labels(0)["domain"], "observation");
        assert_eq!(labels(0)["projectId"], "project");
        assert_eq!(labels(0)["source"], "otel");
        assert_eq!(labels(0)["sdkName"], "pybad");
        assert_eq!(labels(0)["sdkVersion"], "12345678901234567890123456789012");
        assert_eq!(labels(0)["kind"], "truncated_json");
        assert_eq!(labels(1)["reason"], "primitive");
        assert_eq!(labels(1)["attributeKey"], TRACE_METADATA);
        assert_eq!(labels(1)["domain"], "trace");
        assert!(!labels(1).contains_key("kind"));
    }

    #[test]
    fn metadata_drop_metrics_handle_missing_null_and_falsy_values() {
        for (value, expected, reason) in [
            (None, 0, None),
            (Some(json!(null)), 0, None),
            (Some(json!("")), 2, Some("parse_failure")),
            (Some(json!(false)), 2, Some("primitive")),
            (Some(json!(0)), 2, Some("primitive")),
            (Some(json!("null")), 1, Some("non_object_top_level")),
        ] {
            let mut attributes = JsonObject::new();
            if let Some(value) = value {
                attributes.insert(OBSERVATION_METADATA.into(), value);
                if expected == 2 {
                    attributes.insert(GENERIC_METADATA.into(), "{invalid".into());
                }
            }
            let calls = metadata_metrics(&attributes, "python", "\n");
            assert_eq!(
                calls.len(),
                expected,
                "unexpected drop count for {attributes:?}"
            );
            if let Some((key, value)) = calls.first() {
                let label = |name| {
                    key.labels()
                        .find(|label| label.key() == name)
                        .map(|label| label.value())
                };
                assert_eq!(label("reason"), reason);
                assert_eq!(label("sdkVersion"), Some("unknown"));
                assert_eq!(value.load(Ordering::Relaxed), 1);
            }
        }
    }

    #[test]
    fn prefixed_metadata_overlays_blob_metadata() {
        let attributes = json!({
            "langfuse.trace.metadata": "{\"blob\":1,\"same\":\"blob\",\"__proto__\":\"blob-proto\"}",
            "langfuse.trace.metadata.same": "dotted",
            "langfuse.trace.metadata.__proto__": "dotted-proto",
            "langfuse.trace.metadata.extra": true,
            "ai.telemetry.metadata.userId": "user",
        });
        let metadata = extract_metadata(
            attributes.as_object().unwrap(),
            MetadataDomain::Trace,
            &mut JsonParseCache::default(),
            false,
            &mut MetadataDiagnostics::default(),
        );
        assert_eq!(metadata.get("same"), Some(&json!("dotted")));
        assert_eq!(metadata.get("blob"), Some(&json!(1)));
        assert_eq!(metadata.get("__proto__"), Some(&json!("blob-proto")));
        assert!(!metadata.contains_key("userId"));
    }

    #[test]
    fn metadata_arrays_use_javascript_object_spread_keys() {
        let attributes = json!({
            "langfuse.trace.metadata": ["first", {"nested": true}],
        });
        let metadata = extract_metadata(
            attributes.as_object().unwrap(),
            MetadataDomain::Trace,
            &mut JsonParseCache::default(),
            false,
            &mut MetadataDiagnostics::default(),
        );
        assert_eq!(metadata.get("0"), Some(&json!("first")));
        assert_eq!(metadata.get("1"), Some(&json!({"nested": true})));
    }

    #[test]
    fn metadata_evaluator_test_fills_the_storage_default() {
        let attributes = json!({
            "langfuse.observation.metadata": r#"{"evaluator_test":true}"#,
        });
        let mut fields = context_fields(
            attributes.as_object().unwrap(),
            &mut JsonParseCache::default(),
        );
        let metadata = extract_metadata(
            attributes.as_object().unwrap(),
            MetadataDomain::Observation,
            &mut JsonParseCache::default(),
            false,
            &mut MetadataDiagnostics::default(),
        );
        apply_evaluator_test_metadata_default(
            &mut fields,
            attributes.as_object().unwrap(),
            &metadata,
        );
        assert!(fields.evaluator_execution_is_test);
    }

    #[test]
    fn preserves_wtf8_suffixes_in_dotted_metadata_keys() {
        let mut attributes = json!({}).as_object().unwrap().clone();
        let mut key = TRACE_METADATA.as_bytes().to_vec();
        key.extend_from_slice(b".label-");
        key.extend_from_slice(&[0xed, 0xa0, 0x80]);
        let key = super::super::value::JsString::from_wtf8(key).unwrap();
        attributes.insert(key.clone(), json!("value"));

        let metadata = extract_metadata(
            &attributes,
            MetadataDomain::Trace,
            &mut JsonParseCache::default(),
            false,
            &mut MetadataDiagnostics::default(),
        );
        let suffix = metadata
            .keys()
            .find(|candidate| candidate.as_bytes().ends_with(b"label-\xed\xa0\x80"))
            .expect("WTF-8 metadata suffix should be retained");
        assert_eq!(suffix.as_bytes(), b"label-\xed\xa0\x80");
    }

    #[test]
    fn classifies_undecodable_metadata_without_recording_its_value() {
        assert_eq!(classify_decode_failure("  "), "empty");
        assert_eq!(classify_decode_failure("{'key': 1}"), "python_repr");
        assert_eq!(classify_decode_failure("{not json}"), "loose_json");
        assert_eq!(classify_decode_failure(r#"{"key":"cut"#), "truncated_json");
        assert_eq!(classify_decode_failure("plain text"), "unquoted_string");
    }

    #[test]
    fn decodes_metadata_strings_even_when_their_contents_are_json() {
        let document = r#"{"image":"data:image/png;base64,AAAA"}"#;
        let encoded = serde_json::to_string(document).unwrap();
        let attributes = json!({
            "langfuse.observation.metadata.json": encoded.clone(),
            "langfuse.observation.metadata.label": serde_json::to_string("quoted").unwrap(),
            "langfuse.observation.metadata.numeric": serde_json::to_string("42").unwrap(),
            "langfuse.metadata.generic": r#"{"nested":1}"#,
            "ai.telemetry.metadata.provider": "null",
        });

        let metadata = extract_metadata(
            attributes.as_object().unwrap(),
            MetadataDomain::Observation,
            &mut JsonParseCache::default(),
            true,
            &mut MetadataDiagnostics::default(),
        );

        assert_eq!(metadata.get("json"), Some(&json!(document)));
        assert_eq!(metadata.get("label"), Some(&json!("quoted")));
        assert_eq!(metadata.get("numeric"), Some(&json!("42")));
        assert_eq!(metadata.get("generic"), Some(&json!(r#"{"nested":1}"#)));
        assert_eq!(metadata.get("provider"), Some(&json!("null")));
    }

    #[test]
    fn experiment_metadata_is_flattened() {
        let attributes = json!({
            "langfuse.experiment.metadata.foo": {"bar": 1},
            "langfuse.experiment.item.metadata.dataset": "x",
            "langfuse.experiment.id": "exp",
        });
        let fields = context_fields(
            attributes.as_object().unwrap(),
            &mut JsonParseCache::default(),
        );
        assert_eq!(fields.experiment_id.as_deref(), Some("exp"));
        assert_eq!(fields.experiment_metadata_names, ["foo.bar"]);
        assert_eq!(fields.experiment_metadata_values, ["1"]);
        assert_eq!(fields.experiment_item_metadata_names, ["dataset"]);
    }

    #[test]
    fn experiment_item_version_requires_a_real_date_and_uses_clickhouse_shape() {
        let accepted = [
            ("2026-04-24T15:22:36.622Z", "2026-04-24 15:22:36.622"),
            ("2026-04-24T15:22Z", "2026-04-24 15:22:00.000"),
            ("2026-04-24T15:22+0200", "2026-04-24 13:22:00.000"),
            ("2026-04-24T15:22+02:00", "2026-04-24 13:22:00.000"),
            ("2026-04-24T23:22:36.6229-0200", "2026-04-25 01:22:36.622"),
            ("2026-04-24T15:22:36+0200", "2026-04-24 13:22:36.000"),
            ("2026-04-24T15:22", "2026-04-24 15:22:00.000"),
            ("2026-04-24", "2026-04-24 00:00:00.000"),
        ];
        for (input, expected) in accepted {
            let attributes = json!({"langfuse.experiment.item.version": input});
            assert_eq!(
                context_fields(
                    attributes.as_object().unwrap(),
                    &mut JsonParseCache::default(),
                )
                .experiment_item_version
                .as_deref(),
                Some(expected),
                "{input}"
            );
        }

        for input in [
            "v1",
            "\"2026-04-24T15:22:36Z\"",
            "2026-04-24T15:22:60Z",
            "2026/04/24",
            "2026-04",
            "1",
        ] {
            let attributes = json!({"langfuse.experiment.item.version": input});
            assert_eq!(
                context_fields(
                    attributes.as_object().unwrap(),
                    &mut JsonParseCache::default(),
                )
                .experiment_item_version,
                None,
                "{input}"
            );
        }
    }
}
