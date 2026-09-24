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
use sha2::{Digest, Sha256};

const MAX_HEADER_BYTES: usize = 8 * 1024;
const MAX_FIELD_BYTES: usize = 1024;
const MAX_ENTRIES: usize = 64;
const MAX_AGENT_HEADER_BYTES: usize = 8 * 1024;
const MAX_AGENT_METADATA_BYTES: usize = 4 * 1024;
/// Codex's body blob additionally carries its tool inventory, so it is bounded separately.
const MAX_CLIENT_METADATA_BYTES: usize = 64 * 1024;
const CODEX_TURN_METADATA_KEY: &str = "x-codex-turn-metadata";
/// Codex turn metadata retained as `agent.*`. Nested objects such as the tool inventory
/// and workspaces are not copied; the tool inventory already lives in the captured input.
const CODEX_STRING_FIELDS: [(&str, &str); 18] = [
    ("session_id", "agent.session_id"),
    ("thread_id", "agent.thread_id"),
    ("turn_id", "agent.turn_id"),
    ("agent_name", "agent.id"),
    ("installation_id", "agent.installation_id"),
    ("root_turn_id", "agent.root_turn_id"),
    ("parent_turn_id", "agent.parent_turn_id"),
    ("parent_thread_id", "agent.parent_thread_id"),
    ("forked_from_thread_id", "agent.forked_from_thread_id"),
    ("window_id", "agent.window_id"),
    ("context_window_id", "agent.context_window_id"),
    ("request_kind", "agent.request_kind"),
    ("subagent_kind", "agent.subagent_kind"),
    ("thread_source", "agent.thread_source"),
    ("turn_trigger", "agent.turn_trigger"),
    ("sandbox", "agent.sandbox"),
    ("sandbox_mode", "agent.sandbox_mode"),
    ("workspace_kind", "agent.workspace_kind"),
];
const CODEX_SCALAR_FIELDS: [(&str, &str); 4] = [
    ("window_number", "agent.window_number"),
    (
        "forked_from_ordinal_exclusive",
        "agent.forked_from_ordinal_exclusive",
    ),
    ("turn_started_at_unix_ms", "agent.turn_started_at_unix_ms"),
    ("auto_review_enabled", "agent.auto_review_enabled"),
];
const CODEX_COMPACTION_FIELDS: [&str; 5] =
    ["trigger", "reason", "implementation", "phase", "strategy"];
/// Flat `client_metadata` keys Codex projects from the same snapshot, used when the blob is absent.
const CODEX_FLAT_FIELDS: [(&str, &str); 8] = [
    ("session_id", "session_id"),
    ("thread_id", "thread_id"),
    ("turn_id", "turn_id"),
    ("root_turn_id", "root_turn_id"),
    ("parent_turn_id", "parent_turn_id"),
    ("x-codex-installation-id", "installation_id"),
    ("x-codex-window-id", "window_id"),
    ("x-codex-parent-thread-id", "parent_thread_id"),
];
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
const AGENT_HEADERS: [&str; 13] = [
    "user-agent",
    "x-claude-code-session-id",
    "x-claude-code-agent-id",
    "x-claude-code-parent-agent-id",
    "x-codex-turn-metadata",
    "x-opencode-project",
    "x-opencode-session",
    "x-opencode-request",
    "x-session-id",
    "x-session-affinity",
    "session_id",
    "x-client-request-id",
    "x-parent-session-id",
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
    #[cfg(test)]
    pub fn from_headers(headers: &HeaderMap) -> Self {
        Self::from_request(headers, None)
    }

    /// `client_metadata` is the request body's agent metadata object, already
    /// removed from the captured input by [`take_agent_client_metadata`].
    pub fn from_request(headers: &HeaderMap, client_metadata: Option<&Map<String, Value>>) -> Self {
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
        result.apply_baggage(headers);
        for (header, _, attribute) in SCALARS {
            if let Some(value) = single_header(headers, header).and_then(|v| decode(v, false)) {
                result.attributes.insert(attribute.into(), value.into());
            }
        }
        result.apply_tags(
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
        result.apply_agent(headers, client_metadata);
        result
    }

    fn apply_baggage(&mut self, headers: &HeaderMap) {
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
                    self.apply_tags(tags);
                }
            } else if let Some(key) = key.strip_prefix("langfuse_metadata_")
                && valid(key)
            {
                self.metadata.insert(key.into(), value.into());
            }
        }
    }

    fn apply_tags(&mut self, tags: Vec<String>) {
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

    fn apply_agent(&mut self, headers: &HeaderMap, client_metadata: Option<&Map<String, Value>>) {
        let Some(agent) = AgentContext::from_request(headers, client_metadata) else {
            return;
        };
        for (key, value) in agent.metadata {
            self.metadata.insert(key, value);
        }
        self.metadata.insert("agent.name".into(), agent.name.into());
        if let Some(session_id) = &agent.session_id
            && !self.attributes.contains_key("session.id")
        {
            self.attributes.insert(
                "session.id".into(),
                format!("{}:{session_id}", agent.name).into(),
            );
        }
        if !self.attributes.contains_key("langfuse.trace.name") {
            self.attributes
                .insert("langfuse.trace.name".into(), agent.name.into());
        }
        if self.parent_span_id.is_none()
            && let Some(turn_id) = &agent.turn_id
        {
            self.trace_id = agent_trace_id(agent.name, agent.session_id.as_deref(), turn_id);
        }
    }
}

struct AgentContext {
    name: &'static str,
    session_id: Option<String>,
    turn_id: Option<String>,
    metadata: Vec<(String, Value)>,
}

impl AgentContext {
    fn from_request(
        headers: &HeaderMap,
        client_metadata: Option<&Map<String, Value>>,
    ) -> Option<Self> {
        let bytes = AGENT_HEADERS
            .iter()
            .flat_map(|name| headers.get_all(*name))
            .map(|value| value.as_bytes().len())
            .sum::<usize>();
        if bytes > MAX_AGENT_HEADER_BYTES {
            return None;
        }
        Self::parse_claude_code(headers)
            .or_else(|| Self::parse_codex(headers, client_metadata))
            .or_else(|| Self::parse_opencode(headers))
            .or_else(|| Self::parse_pi(headers))
    }

    fn parse_claude_code(headers: &HeaderMap) -> Option<Self> {
        let session_id = agent_header(headers, "x-claude-code-session-id");
        let agent_id = agent_header(headers, "x-claude-code-agent-id");
        let parent_agent_id = agent_header(headers, "x-claude-code-parent-agent-id");
        if session_id.is_none() && agent_id.is_none() && parent_agent_id.is_none() {
            return None;
        }
        let mut metadata = Vec::new();
        push_metadata(&mut metadata, "agent.session_id", session_id.as_ref());
        push_metadata(&mut metadata, "agent.id", agent_id.as_ref());
        push_metadata(&mut metadata, "agent.parent_id", parent_agent_id.as_ref());
        Some(Self {
            name: "claude-code",
            session_id,
            turn_id: None,
            metadata,
        })
    }

    /// Codex sends its turn snapshot canonically as `client_metadata["x-codex-turn-metadata"]`
    /// in the request body; the same-named header and the flat `client_metadata` keys are
    /// compatibility projections of that snapshot.
    fn parse_codex(
        headers: &HeaderMap,
        client_metadata: Option<&Map<String, Value>>,
    ) -> Option<Self> {
        let header = single_header(headers, CODEX_TURN_METADATA_KEY);
        let client_metadata = client_metadata.filter(|metadata| is_codex_client_metadata(metadata));
        if header.is_none() && client_metadata.is_none() {
            return None;
        }
        let mut fields = client_metadata
            .and_then(|metadata| metadata.get(CODEX_TURN_METADATA_KEY)?.as_str())
            .and_then(|blob| parse_turn_metadata(blob, MAX_CLIENT_METADATA_BYTES))
            .or_else(|| header.and_then(|blob| parse_turn_metadata(blob, MAX_AGENT_METADATA_BYTES)))
            .unwrap_or_default();
        for (source, target) in CODEX_FLAT_FIELDS {
            if let Some(value) = client_metadata.and_then(|metadata| metadata.get(source))
                && value.is_string()
                && !fields.contains_key(target)
            {
                fields.insert(target.to_owned(), value.clone());
            }
        }
        let session_id = agent_json_field(&fields, "session_id");
        let thread_id = agent_json_field(&fields, "thread_id");
        let turn_id = agent_json_field(&fields, "turn_id");
        if session_id.is_none() && thread_id.is_none() && turn_id.is_none() {
            return None;
        }
        let mut metadata = Vec::new();
        for (source, target) in CODEX_STRING_FIELDS {
            if let Some(value) = agent_json_field(&fields, source) {
                metadata.push((target.to_owned(), Value::String(value)));
            }
        }
        for (source, target) in CODEX_SCALAR_FIELDS {
            if let Some(value) = fields
                .get(source)
                .filter(|value| value.is_number() || value.is_boolean())
            {
                metadata.push((target.to_owned(), value.clone()));
            }
        }
        if let Some(compaction) = fields.get("compaction").and_then(Value::as_object) {
            for key in CODEX_COMPACTION_FIELDS {
                if let Some(value) = agent_json_field(compaction, key) {
                    metadata.push((format!("agent.compaction.{key}"), Value::String(value)));
                }
            }
        }
        Some(Self {
            name: "codex",
            session_id: thread_id,
            turn_id,
            metadata,
        })
    }

    fn parse_opencode(headers: &HeaderMap) -> Option<Self> {
        let project_id = agent_header(headers, "x-opencode-project");
        let direct_session_id = agent_header(headers, "x-opencode-session");
        let turn_id = agent_header(headers, "x-opencode-request");
        let parent_session_id = agent_header(headers, "x-parent-session-id");
        let identified = project_id.is_some()
            || direct_session_id.is_some()
            || turn_id.is_some()
            || user_agent(headers).is_some_and(|value| value.starts_with("opencode/"));
        if !identified {
            return None;
        }
        let session_id = direct_session_id
            .or_else(|| agent_header(headers, "x-session-id"))
            .or_else(|| agent_header(headers, "x-session-affinity"));
        let mut metadata = Vec::new();
        push_metadata(&mut metadata, "agent.project_id", project_id.as_ref());
        push_metadata(&mut metadata, "agent.session_id", session_id.as_ref());
        push_metadata(&mut metadata, "agent.turn_id", turn_id.as_ref());
        push_metadata(
            &mut metadata,
            "agent.parent_session_id",
            parent_session_id.as_ref(),
        );
        Some(Self {
            name: "opencode",
            session_id,
            turn_id,
            metadata,
        })
    }

    fn parse_pi(headers: &HeaderMap) -> Option<Self> {
        let identified = user_agent(headers)
            .is_some_and(|value| value.starts_with("pi/") || value.starts_with("pi ("));
        if !identified {
            return None;
        }
        let session_id = agent_header(headers, "x-session-id")
            .or_else(|| agent_header(headers, "session_id"))
            .or_else(|| agent_header(headers, "x-session-affinity"))
            .or_else(|| agent_header(headers, "x-client-request-id"));
        let mut metadata = Vec::new();
        push_metadata(&mut metadata, "agent.session_id", session_id.as_ref());
        Some(Self {
            name: "pi",
            session_id,
            turn_id: None,
            metadata,
        })
    }
}

/// Remove a coding agent's `client_metadata` object from a captured request so its
/// identifiers are recorded as `agent.*` metadata rather than as prompt input.
/// Unrecognized or oversized objects stay in the request untouched.
pub(crate) fn take_agent_client_metadata(
    request: &mut Map<String, Value>,
) -> Option<Map<String, Value>> {
    let recognized = request
        .get("client_metadata")
        .and_then(Value::as_object)
        .is_some_and(|metadata| {
            is_codex_client_metadata(metadata)
                && serde_json::to_vec(metadata)
                    .is_ok_and(|bytes| bytes.len() <= MAX_CLIENT_METADATA_BYTES)
        });
    if !recognized {
        return None;
    }
    match request.remove("client_metadata") {
        Some(Value::Object(metadata)) => Some(metadata),
        _ => None,
    }
}

fn is_codex_client_metadata(metadata: &Map<String, Value>) -> bool {
    metadata.keys().any(|key| key.starts_with("x-codex-"))
}

fn parse_turn_metadata(blob: &str, limit: usize) -> Option<Map<String, Value>> {
    if blob.len() > limit {
        return None;
    }
    match serde_json::from_str::<Value>(blob).ok()? {
        Value::Object(fields) => Some(fields),
        _ => None,
    }
}

fn push_metadata(metadata: &mut Vec<(String, Value)>, key: &str, value: Option<&String>) {
    if let Some(value) = value {
        metadata.push((key.to_owned(), Value::String(value.clone())));
    }
}

fn agent_json_field(value: &Map<String, Value>, key: &str) -> Option<String> {
    clean_agent_field(value.get(key)?.as_str()?)
}

fn agent_header(headers: &HeaderMap, name: &str) -> Option<String> {
    clean_agent_field(single_header(headers, name)?)
}

fn clean_agent_field(value: &str) -> Option<String> {
    let value = value.trim();
    valid(value).then(|| value.to_owned())
}

fn user_agent(headers: &HeaderMap) -> Option<String> {
    agent_header(headers, "user-agent").map(|value| value.to_ascii_lowercase())
}

fn agent_trace_id(name: &str, session_id: Option<&str>, turn_id: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"langfuse-agent-turn-v1\0");
    hasher.update(name.as_bytes());
    hasher.update(b"\0");
    if let Some(session_id) = session_id {
        hasher.update(session_id.as_bytes());
    }
    hasher.update(b"\0");
    hasher.update(turn_id.as_bytes());
    let digest = hasher.finalize();
    let mut trace_id = [0; 16];
    trace_id.copy_from_slice(&digest[..16]);
    if trace_id.iter().all(|byte| *byte == 0) {
        trace_id[15] = 1;
    }
    opentelemetry::trace::TraceId::from_bytes(trace_id).to_string()
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
