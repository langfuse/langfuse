//! Convert SDK-specific OTLP attributes into event fields.
//!
//! `events::build::build_event` calls these extractors: `fields` selects names,
//! model settings and observation types; `payload` constructs input/output;
//! `usage` reads supplied usage and costs. This module re-exports them and
//! provides their shared attribute-selection helpers.

use super::attributes::{parse_javascript_number, trim_javascript};
use crate::otel::types::JsonObject;
use crate::otel::value::Value;

fn select_first<'a>(
    attributes: &'a JsonObject,
    keys: &[&str],
    predicate: impl Fn(&Value) -> bool,
) -> Option<&'a Value> {
    keys.iter()
        .find_map(|key| attributes.get(*key).filter(|value| predicate(value)))
}
fn is_meaningful(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::String(value) => !value.is_empty(),
        Value::Array(value) => !value.is_empty(),
        Value::Object(value) => !value.is_empty(),
        Value::Bool(_) | Value::Number(_) => true,
    }
}

mod fields;
pub use fields::{
    claude_managed_agent_session_id, extract_completion_start_time, extract_is_app_root,
    extract_model_name, extract_model_parameters, extract_name, extract_prompt_version,
    extract_prompt_version_lookup, extract_public, extract_tags, observation_type,
    should_skip_model_usage_and_cost,
};
