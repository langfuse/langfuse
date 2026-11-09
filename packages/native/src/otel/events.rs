//! `process_to_events` decodes one OTLP resource at a time.
//!
//! `process_resource_span` converts resource and scope attributes, then calls
//! `build::build_event` for each span. The resource is dropped after its
//! spans are processed. The returned `Vec<OwnedEvent>` stays in Rust for media
//! handling and enrichment.

mod build;

use build::build_event;

use super::value::{Object, Value};
use serde::de::{Error as DeError, SeqAccess, Visitor};
use serde::Deserializer;

use super::attributes::{attributes_to_map, value_as_string};
use super::input::ResourceSpan;
use super::types::OwnedEvent;

#[derive(Clone, Debug)]
pub struct EventBuildConfig {
    pub project_id: String,
    pub ingestion_api_key: String,
    pub ingestion_sdk_name: String,
    pub ingestion_sdk_version: String,
    pub source: String,
    pub fallback_time: String,
    pub is_langfuse_internal: bool,
}

impl Default for EventBuildConfig {
    fn default() -> Self {
        Self {
            project_id: String::new(),
            ingestion_api_key: String::new(),
            ingestion_sdk_name: String::new(),
            ingestion_sdk_version: String::new(),
            source: "otel".to_owned(),
            fallback_time: "1970-01-01T00:00:00.000Z".to_owned(),
            is_langfuse_internal: false,
        }
    }
}

/// Stream a compact OTLP array while retaining only the resulting owned events.
///
/// Each resource is decoded into typed envelope fields, converted into owned events, and then
/// released before the next resource is read. The decoder reads known fields and advances over
/// unknown fields. The pipeline retains normalized events for media resolution and enrichment.
pub fn process_to_events(
    bytes: &[u8],
    config: &EventBuildConfig,
) -> Result<Vec<OwnedEvent>, String> {
    let mut deserializer = serde_json::Deserializer::from_slice(bytes);
    let mut events = Vec::new();
    match deserializer.deserialize_seq(ResourceSpansVisitor {
        config,
        events: &mut events,
    }) {
        Ok(()) => deserializer.end().map_err(|error| error.to_string())?,
        Err(error) => {
            let message = error.to_string();
            if ![
                "lone leading surrogate",
                "unexpected end of hex escape",
                "number out of range",
                "recursion limit exceeded",
            ]
            .iter()
            .any(|prefix| message.starts_with(prefix))
            {
                return Err(message);
            }
            // JsonField recovers dynamic fields locally. An exceptional value outside
            // those fields (e.g. "\ud800" where a container was expected) needs this
            // envelope retry. Clear partial events before re-reading the original bytes.
            events.clear();
            super::input::CompatibleContainerDeserializer::from_bytes(bytes)
                .map_err(|error| error.to_string())?
                .deserialize_seq(ResourceSpansVisitor {
                    config,
                    events: &mut events,
                })
                .map_err(|error| error.to_string())?;
        }
    }
    Ok(events)
}

struct ResourceSpansVisitor<'a> {
    config: &'a EventBuildConfig,
    events: &'a mut Vec<OwnedEvent>,
}

impl<'de> Visitor<'de> for ResourceSpansVisitor<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("an array of OTLP resource spans")
    }

    fn visit_seq<A>(self, mut sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        while let Some(resource_span) = sequence.next_element::<ResourceSpan>()? {
            process_resource_span(resource_span, self.config, self.events)
                .map_err(A::Error::custom)?;
        }
        Ok(())
    }
}

fn process_resource_span(
    resource_span: ResourceSpan,
    config: &EventBuildConfig,
    events: &mut Vec<OwnedEvent>,
) -> Result<(), String> {
    let resource_attributes = resource_span
        .resource
        .and_then(|resource| resource.attributes)
        .map(|attributes| attributes_to_map(attributes.into_value()))
        .unwrap_or_default();
    let scopes = resource_span
        .scope_spans
        .map(|value| value.0)
        .unwrap_or_default();
    for scope_span in scopes {
        let mut scope = match scope_span.scope.map(|scope| scope.into_value()) {
            Some(Value::Object(scope)) => scope,
            _ => Object::new(),
        };
        // Normalize once before copying the scope into each event's metadata.
        // Replacing in place preserves the original field order.
        let scope_attributes = scope.entry("attributes".into()).or_default();
        *scope_attributes = Value::Object(attributes_to_map(std::mem::take(scope_attributes)));
        let scope_name = scope
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let scope_version = scope.get("version").and_then(value_as_string);

        for span in scope_span.spans.map(|value| value.0).unwrap_or_default() {
            if let Some(event) = build_event(
                span,
                &resource_attributes,
                &scope,
                scope_name,
                scope_version.as_deref(),
                config,
            )? {
                events.push(event);
            }
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests;
