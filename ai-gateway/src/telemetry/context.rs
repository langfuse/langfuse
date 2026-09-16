//! Caller tracing context belongs only to the recorded generation.
use std::collections::HashSet;

use axum::http::HeaderMap;
use opentelemetry::{Context, propagation::TextMapPropagator, trace::TraceContextExt};
use opentelemetry_http::HeaderExtractor;
use opentelemetry_sdk::{
    propagation::TraceContextPropagator,
    trace::{IdGenerator, RandomIdGenerator},
};
use serde::Serialize;
use serde_json::{Map, Value};

const MAX_HEADER_BYTES: usize = 8 * 1024;
const MAX_FIELD_BYTES: usize = 1024;
const MAX_ENTRIES: usize = 64;
const HEADERS: [&str; 8] = [
    "traceparent",
    "tracestate",
    "baggage",
    "langfuse-user-id",
    "langfuse-session-id",
    "langfuse-trace-name",
    "langfuse-tags",
    "langfuse-metadata",
];
const SCALARS: [(&str, &str, &str); 3] = [
    ("langfuse-user-id", "langfuse_user_id", "user.id"),
    ("langfuse-session-id", "langfuse_session_id", "session.id"),
    (
        "langfuse-trace-name",
        "langfuse_trace_name",
        "langfuse.trace.name",
    ),
];

#[derive(Serialize)]
pub(super) struct GenerationContext {
    pub trace_id: String,
    pub observation_id: String,
    pub parent_span_id: Option<String>,
    pub trace_state: String,
    pub attributes: Map<String, Value>,
    pub metadata: Map<String, Value>,
}

impl GenerationContext {
    pub fn from_headers(headers: &HeaderMap) -> Self {
        let ids = RandomIdGenerator::default();
        let mut result = Self {
            trace_id: ids.new_trace_id().to_string(),
            observation_id: ids.new_span_id().to_string(),
            parent_span_id: None,
            trace_state: String::new(),
            attributes: Map::new(),
            metadata: Map::new(),
        };
        let bytes = HEADERS
            .iter()
            .flat_map(|name| headers.get_all(*name))
            .map(|value| value.as_bytes().len())
            .sum::<usize>();
        if bytes > MAX_HEADER_BYTES {
            return result;
        }
        let mut trace_headers = HeaderMap::new();
        if let Some(value) = single_header(headers, "traceparent") {
            trace_headers.insert("traceparent", value.parse().expect("existing header value"));
        }
        // W3C tracestate is a list and may span multiple HTTP header fields.
        let trace_state = headers
            .get_all("tracestate")
            .iter()
            .filter_map(|value| value.to_str().ok())
            .collect::<Vec<_>>()
            .join(",");
        trace_headers.insert(
            "tracestate",
            trace_state.parse().expect("existing header values"),
        );
        let context = TraceContextPropagator::new()
            .extract_with_context(&Context::new(), &HeaderExtractor(&trace_headers));
        let parent = context.span();
        let parent = parent.span_context();
        if parent.is_valid() && parent.is_remote() {
            result.trace_id = parent.trace_id().to_string();
            result.parent_span_id = Some(parent.span_id().to_string());
            result.trace_state = parent.trace_state().header();
        }
        result.baggage(headers);
        for (header, _, attribute) in SCALARS {
            if let Some(value) = single_header(headers, header).and_then(|v| decode(v, false)) {
                result.attributes.insert(attribute.into(), value.into());
            }
        }
        result.tags(
            list_entries(headers, "langfuse-tags")
                .filter_map(|tag| decode(tag.trim(), false))
                .collect(),
        );
        for entry in list_entries(headers, "langfuse-metadata") {
            if let Some((key, value)) = entry.split_once(':')
                && let (Some(key), Some(value)) =
                    (decode(key.trim(), false), decode(value.trim(), false))
            {
                result.metadata.insert(key, value.into());
            }
        }
        result
    }

    fn baggage(&mut self, headers: &HeaderMap) {
        // Do not use the generic baggage propagator: malformed input must never
        // be logged, and Python's exporter encodes spaces with quote_plus.
        for entry in list_entries(headers, "baggage") {
            let entry = entry.split(';').next().unwrap_or_default().trim();
            let Some((key, value)) = entry.split_once('=') else {
                continue;
            };
            let Some(key) = decode(key.trim(), true) else {
                continue;
            };
            let Some(value) = decode(value.trim(), true) else {
                continue;
            };
            if let Some((_, _, attribute)) = SCALARS.iter().find(|(_, name, _)| *name == key) {
                self.attributes.insert((*attribute).into(), value.into());
            } else if key == "langfuse_tags" {
                if let Some(tags) = parse_tags(&value) {
                    self.tags(tags);
                }
            } else if let Some(key) = key.strip_prefix("langfuse_metadata_")
                && valid(key)
            {
                self.metadata.insert(key.into(), value.into());
            }
        }
    }

    fn tags(&mut self, tags: Vec<String>) {
        let mut seen = HashSet::new();
        let tags: Vec<Value> = tags
            .into_iter()
            .take(MAX_ENTRIES)
            .filter(|tag| valid(tag) && seen.insert(tag.clone()))
            .map(Value::String)
            .collect();
        if !tags.is_empty() {
            self.attributes
                .insert("langfuse.trace.tags".into(), Value::Array(tags));
        }
    }
}

fn list_entries<'a>(headers: &'a HeaderMap, name: &str) -> impl Iterator<Item = &'a str> {
    headers
        .get_all(name)
        .into_iter()
        .filter_map(|value| value.to_str().ok())
        .flat_map(|value| value.split(','))
        .take(MAX_ENTRIES)
}

fn single_header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a str> {
    let mut values = headers.get_all(name).iter();
    let value = values.next()?;
    if values.next().is_some() {
        return None;
    }
    value.to_str().ok()
}

fn valid(value: &str) -> bool {
    !value.trim().is_empty()
        && value.len() <= MAX_FIELD_BYTES
        && !value.chars().any(char::is_control)
}

fn decode(value: &str, plus_as_space: bool) -> Option<String> {
    let mut decoded = Vec::with_capacity(value.len().min(MAX_FIELD_BYTES));
    let mut bytes = value.bytes();
    while let Some(byte) = bytes.next() {
        let byte = match byte {
            b'%' => {
                let high = char::from(bytes.next()?).to_digit(16)?;
                let low = char::from(bytes.next()?).to_digit(16)?;
                u8::try_from(high * 16 + low).ok()?
            }
            b'+' if plus_as_space => b' ',
            _ => byte,
        };
        decoded.push(byte);
        if decoded.len() > MAX_FIELD_BYTES {
            return None;
        }
    }
    let value = String::from_utf8(decoded).ok()?;
    valid(&value).then_some(value)
}

/// Python's `OTel` exporter calls `str(list)`, producing quoted Python strings.
/// Accept only a list of string literals; never evaluate expressions.
fn parse_tags(value: &str) -> Option<Vec<String>> {
    if let Ok(tags) = serde_json::from_str::<Vec<String>>(value) {
        return (tags.len() <= MAX_ENTRIES).then_some(tags);
    }
    let mut chars = value.trim().chars().peekable();
    if chars.next()? != '[' {
        return None;
    }
    let mut tags = Vec::new();
    loop {
        while chars.peek().is_some_and(|c| c.is_whitespace()) {
            chars.next();
        }
        if chars.peek() == Some(&']') {
            chars.next();
            return chars.next().is_none().then_some(tags);
        }
        if tags.len() == MAX_ENTRIES {
            return None;
        }
        let quote = chars.next()?;
        if quote != '\'' && quote != '"' {
            return None;
        }
        let mut tag = String::new();
        loop {
            let character = chars.next()?;
            if character == quote {
                break;
            }
            if character != '\\' {
                tag.push(character);
                continue;
            }
            let escape = chars.next()?;
            tag.push(match escape {
                '\\' | '\'' | '"' => escape,
                'a' => '\u{7}',
                'b' => '\u{8}',
                'f' => '\u{c}',
                'n' => '\n',
                'r' => '\r',
                't' => '\t',
                'v' => '\u{b}',
                'x' | 'u' | 'U' => {
                    let digits = match escape {
                        'x' => 2,
                        'u' => 4,
                        _ => 8,
                    };
                    let mut code = 0;
                    for _ in 0..digits {
                        code = code * 16 + chars.next()?.to_digit(16)?;
                    }
                    char::from_u32(code)?
                }
                _ => return None,
            });
        }
        tags.push(tag);
        while chars.peek().is_some_and(|c| c.is_whitespace()) {
            chars.next();
        }
        match chars.peek()? {
            ',' => {
                chars.next();
            }
            ']' => {}
            _ => return None,
        }
    }
}

#[cfg(test)]
mod tests;
