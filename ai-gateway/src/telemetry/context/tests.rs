use axum::http::HeaderValue;
use opentelemetry::trace::{SpanContext, SpanId, TraceFlags, TraceId, TraceState};
use serde_json::json;

use super::*;

const TRACEPARENT: &str = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-00";

#[test]
fn remote_context_is_generation_parent_even_when_unsampled() {
    let mut headers = HeaderMap::new();
    headers.insert("traceparent", TRACEPARENT.parse().unwrap());
    headers.insert("tracestate", "vendor=opaque-state".parse().unwrap());
    headers.append("tracestate", "second=other-state".parse().unwrap());
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(context.trace_id, "0123456789abcdef0123456789abcdef");
    assert_eq!(context.parent_span_id.as_deref(), Some("0123456789abcdef"));
    assert_ne!(context.observation_id, "0123456789abcdef");
    assert_eq!(
        context.trace_state,
        "vendor=opaque-state,second=other-state"
    );
}

#[test]
fn missing_invalid_and_duplicate_parent_ignore_ambient_context() {
    let ambient = Context::new().with_remote_span_context(SpanContext::new(
        TraceId::from_hex("abcdef0123456789abcdef0123456789").unwrap(),
        SpanId::from_hex("abcdef0123456789").unwrap(),
        TraceFlags::SAMPLED,
        true,
        TraceState::default(),
    ));
    let _guard = ambient.attach();
    for parent in [
        None,
        Some("invalid"),
        Some("00-00000000000000000000000000000000-0123456789abcdef-01"),
    ] {
        let mut headers = HeaderMap::new();
        if let Some(parent) = parent {
            headers.insert("traceparent", parent.parse().unwrap());
        }
        headers.insert(
            "baggage",
            "langfuse_trace_id=abcdef0123456789abcdef0123456789"
                .parse()
                .unwrap(),
        );
        assert_fresh(&GenerationContext::from_headers(&headers));
    }
    let mut headers = HeaderMap::new();
    headers.append("traceparent", TRACEPARENT.parse().unwrap());
    headers.append("traceparent", TRACEPARENT.parse().unwrap());
    assert_fresh(&GenerationContext::from_headers(&headers));
}

fn assert_fresh(context: &GenerationContext) {
    assert!(context.parent_span_id.is_none());
    assert!(context.trace_state.is_empty());
    assert_ne!(context.trace_id, "abcdef0123456789abcdef0123456789");
    assert!(TraceId::from_hex(&context.trace_id).unwrap() != TraceId::INVALID);
    assert!(SpanId::from_hex(&context.observation_id).unwrap() != SpanId::INVALID);
}

#[test]
fn python_sdk_carrier_preserves_quotes_commas_unicode_and_metadata_suffixes() {
    let fixture: Value =
        serde_json::from_str(include_str!("../../../tests/fixtures/python-baggage.json")).unwrap();
    let mut headers = HeaderMap::new();
    for (name, value) in fixture["carrier"].as_object().unwrap() {
        headers.insert(
            name.parse::<axum::http::HeaderName>().unwrap(),
            value.as_str().unwrap().parse().unwrap(),
        );
    }
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(context.attributes["user.id"], fixture["inputs"]["user_id"]);
    assert_eq!(
        context.attributes["session.id"],
        fixture["inputs"]["session_id"]
    );
    assert_eq!(
        context.attributes["langfuse.trace.name"],
        fixture["inputs"]["trace_name"]
    );
    assert_eq!(
        context.attributes["langfuse.trace.tags"],
        fixture["inputs"]["tags"]
    );
    assert_eq!(context.metadata["team_name"], "search+ranking");
    assert_eq!(
        context.metadata["request_note_with_underscores"],
        "snow雪 / 雪 + value"
    );
    assert_eq!(context.metadata["numeric_value"], "42");
    assert_eq!(context.metadata["boolean_value"], "True");
}

#[test]
fn explicit_headers_override_baggage_after_delimiter_splitting() {
    let mut headers = HeaderMap::new();
    headers.insert("baggage", "langfuse_user_id=baggage,langfuse_session_id=session,langfuse_trace_name=workflow,langfuse_tags=%5B%22baggage%22%5D,langfuse_metadata_team_name=old,langfuse_metadata_keep=value,other=ignored".parse().unwrap());
    headers.insert("langfuse-user-id", "user+name%20value".parse().unwrap());
    headers.insert("langfuse-session-id", "custom-session".parse().unwrap());
    headers.insert("langfuse-trace-name", "custom-name".parse().unwrap());
    headers.insert(
        "langfuse-tags",
        " a ,comma%2Ctag,a,plus+tag".parse().unwrap(),
    );
    headers.insert(
        "langfuse-metadata",
        "team_name:new,key%3Aname:value%2Cwith%3Acolon,broken,empty:,bad:%XX"
            .parse()
            .unwrap(),
    );
    headers.append("langfuse-tags", "second,a".parse().unwrap());
    headers.append(
        "langfuse-metadata",
        "team_name:latest,second:value".parse().unwrap(),
    );
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(context.attributes["user.id"], "user+name value");
    assert_eq!(context.attributes["session.id"], "custom-session");
    assert_eq!(context.attributes["langfuse.trace.name"], "custom-name");
    assert_eq!(
        context.attributes["langfuse.trace.tags"],
        json!(["a", "comma,tag", "plus+tag", "second"])
    );
    assert_eq!(
        context.metadata,
        json!({"team_name": "latest", "keep": "value", "key:name": "value,with:colon", "second": "value"})
            .as_object()
            .unwrap()
            .clone()
    );
}

#[test]
fn malformed_fields_and_duplicate_custom_headers_keep_valid_baggage() {
    let mut headers = HeaderMap::new();
    headers.append("baggage", "bad,langfuse_user_id=caller,langfuse_metadata_good=yes;property=value,langfuse_metadata_bad=%0A,langfuse_session_id=%FF".parse().unwrap());
    headers.append(
        "baggage",
        "langfuse_trace_name=workflow,langfuse_metadata_percent=%xy"
            .parse()
            .unwrap(),
    );
    headers.append("langfuse-user-id", "first".parse().unwrap());
    headers.append("langfuse-user-id", "second".parse().unwrap());
    headers.insert("langfuse-trace-name", "bad%0Avalue".parse().unwrap());
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(context.attributes["user.id"], "caller");
    assert_eq!(context.attributes["langfuse.trace.name"], "workflow");
    assert!(!context.attributes.contains_key("session.id"));
    assert_eq!(
        context.metadata,
        json!({"good": "yes"}).as_object().unwrap().clone()
    );
}

#[test]
fn coding_agent_headers_group_sessions_and_turns() {
    let cases = [
        (
            "claude-code",
            vec![
                ("x-claude-code-session-id", "claude-session"),
                ("x-claude-code-agent-id", "subagent"),
                ("x-claude-code-parent-agent-id", "parent"),
            ],
            "claude-session",
            None,
        ),
        (
            "codex",
            vec![(
                "x-codex-turn-metadata",
                r#"{"session_id":"routing-session","thread_id":"codex-thread","turn_id":"codex-turn"}"#,
            )],
            "codex-thread",
            Some("codex-turn"),
        ),
        (
            "opencode",
            vec![
                ("user-agent", "opencode/1.0"),
                ("x-opencode-project", "opencode-project"),
                ("x-opencode-session", "opencode-session"),
                ("x-opencode-request", "opencode-turn"),
            ],
            "opencode-session",
            Some("opencode-turn"),
        ),
        (
            "pi",
            vec![
                ("user-agent", "pi/0.80.3 (linux; node/v22; x64)"),
                ("session_id", "pi-session"),
                ("x-client-request-id", "pi-session"),
            ],
            "pi-session",
            None,
        ),
    ];

    for (agent, values, session, turn) in cases {
        let mut headers = HeaderMap::new();
        for (name, value) in values {
            headers.insert(
                name.parse::<axum::http::HeaderName>().unwrap(),
                value.parse().unwrap(),
            );
        }
        let first = GenerationContext::from_headers(&headers);
        let second = GenerationContext::from_headers(&headers);
        assert_eq!(first.attributes["session.id"], format!("{agent}:{session}"));
        assert_eq!(first.attributes["langfuse.trace.name"], agent);
        assert_eq!(first.metadata["agent.name"], agent);
        if let Some(turn) = turn {
            assert_eq!(first.metadata["agent.turn_id"], turn);
            assert_eq!(first.trace_id, second.trace_id);
        } else {
            assert_ne!(first.trace_id, second.trace_id);
        }
        assert!(!first.attributes.contains_key("user.id"));
    }
}

#[test]
fn agent_metadata_preserves_original_identifiers() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "x-codex-turn-metadata",
        r#"{"session_id":"routing-session","thread_id":"thread","turn_id":"turn"}"#
            .parse()
            .unwrap(),
    );
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(
        context.metadata,
        json!({
            "agent.name": "codex",
            "agent.session_id": "routing-session",
            "agent.thread_id": "thread",
            "agent.turn_id": "turn",
        })
        .as_object()
        .unwrap()
        .clone()
    );
}

/// The Codex turn snapshot shape, including nested inventories that must not be copied.
fn codex_turn_metadata() -> Value {
    json!({
        "installation_id": "install-1",
        "session_id": "routing-session",
        "thread_id": "thread-1",
        "agent_name": "/root/explorer",
        "turn_id": "turn-1",
        "window_id": "thread-1:1",
        "window_number": 1,
        "context_window_id": "context-1",
        "request_kind": "compaction",
        "compaction": {
            "trigger": "auto", "reason": "context_limit", "implementation": "remote",
            "phase": "pre_turn", "strategy": "memento", "nested": {"skip": true}
        },
        "root_turn_id": "root-turn",
        "parent_turn_id": "parent-turn",
        "parent_thread_id": "parent-thread",
        "subagent_kind": "collab_spawn",
        "thread_source": "user",
        "turn_trigger": "composer",
        "sandbox": "seatbelt",
        "sandbox_mode": "workspace-write",
        "auto_review_enabled": true,
        "node_repl_auto_review_required": true,
        "node_repl_disabled": false,
        "turn_started_at_unix_ms": 1_789_726_284_881_i64,
        "workspace_kind": "projectless",
        "workspaces": {"/Users/dev/project": {"has_changes": true}},
        "tool_namespaces_info": {"functions": {"name": "functions", "functions": {"exec": {"name": "exec"}}}},
        "custom_extra": "from-config",
        "name": "spoofed-agent-name"
    })
}

fn codex_client_metadata(turn_metadata: Option<&Value>) -> Map<String, Value> {
    let mut metadata = json!({
        "root_turn_id": "root-turn",
        "session_id": "routing-session",
        "thread_id": "thread-1",
        "turn_id": "turn-1",
        "x-codex-installation-id": "install-1",
        "x-codex-window-id": "thread-1:1",
    });
    if let Some(turn_metadata) = turn_metadata {
        metadata["x-codex-turn-metadata"] = turn_metadata.to_string().into();
    }
    metadata.as_object().unwrap().clone()
}

#[test]
fn codex_client_metadata_supplies_agent_fields_without_headers() {
    let client_metadata = codex_client_metadata(Some(&codex_turn_metadata()));
    let context = GenerationContext::from_request(&HeaderMap::new(), Some(&client_metadata));
    assert_eq!(context.attributes["session.id"], "codex:thread-1");
    assert_eq!(context.attributes["langfuse.trace.name"], "codex");
    assert!(!context.attributes.contains_key("user.id"));
    assert_eq!(
        context.metadata,
        json!({
            "agent.name": "codex",
            "agent.id": "/root/explorer",
            "agent.installation_id": "install-1",
            "agent.session_id": "routing-session",
            "agent.thread_id": "thread-1",
            "agent.turn_id": "turn-1",
            "agent.root_turn_id": "root-turn",
            "agent.parent_turn_id": "parent-turn",
            "agent.parent_thread_id": "parent-thread",
            "agent.window_id": "thread-1:1",
            "agent.window_number": 1,
            "agent.context_window_id": "context-1",
            "agent.request_kind": "compaction",
            "agent.compaction.trigger": "auto",
            "agent.compaction.reason": "context_limit",
            "agent.compaction.implementation": "remote",
            "agent.compaction.phase": "pre_turn",
            "agent.compaction.strategy": "memento",
            "agent.subagent_kind": "collab_spawn",
            "agent.thread_source": "user",
            "agent.turn_trigger": "composer",
            "agent.sandbox": "seatbelt",
            "agent.sandbox_mode": "workspace-write",
            "agent.auto_review_enabled": true,
            "agent.turn_started_at_unix_ms": 1_789_726_284_881_i64,
            "agent.workspace_kind": "projectless",
        })
        .as_object()
        .unwrap()
        .clone()
    );
    // The body snapshot and the compatibility header identify the same turn.
    let mut headers = HeaderMap::new();
    headers.insert(
        "x-codex-turn-metadata",
        r#"{"session_id":"routing-session","thread_id":"thread-1","turn_id":"turn-1"}"#
            .parse()
            .unwrap(),
    );
    assert_eq!(
        GenerationContext::from_headers(&headers).trace_id,
        context.trace_id
    );
}

#[test]
fn codex_body_snapshot_is_preferred_and_flat_keys_fill_missing_snapshots() {
    let mut headers = HeaderMap::new();
    headers.insert(
        "x-codex-turn-metadata",
        r#"{"thread_id":"thread-1","turn_id":"header-turn"}"#
            .parse()
            .unwrap(),
    );
    let mut turn_metadata = codex_turn_metadata();
    turn_metadata["turn_id"] = "body-turn".into();
    let client_metadata = codex_client_metadata(Some(&turn_metadata));
    let context = GenerationContext::from_request(&headers, Some(&client_metadata));
    assert_eq!(context.metadata["agent.turn_id"], "body-turn");
    assert_eq!(context.metadata["agent.id"], "/root/explorer");

    let context =
        GenerationContext::from_request(&HeaderMap::new(), Some(&codex_client_metadata(None)));
    assert_eq!(context.attributes["session.id"], "codex:thread-1");
    assert_eq!(
        context.metadata,
        json!({
            "agent.name": "codex",
            "agent.installation_id": "install-1",
            "agent.session_id": "routing-session",
            "agent.thread_id": "thread-1",
            "agent.turn_id": "turn-1",
            "agent.root_turn_id": "root-turn",
            "agent.window_id": "thread-1:1",
        })
        .as_object()
        .unwrap()
        .clone()
    );

    for snapshot in [
        "{malformed".to_owned(),
        json!({"thread_id": "thread-1", "turn_id": "a".repeat(MAX_CLIENT_METADATA_BYTES)})
            .to_string(),
        "[]".to_owned(),
    ] {
        let mut client_metadata = codex_client_metadata(None);
        client_metadata.insert("x-codex-turn-metadata".into(), snapshot.into());
        let context = GenerationContext::from_request(&headers, Some(&client_metadata));
        assert_eq!(context.metadata["agent.turn_id"], "header-turn");
        assert_eq!(context.metadata["agent.root_turn_id"], "root-turn");
    }

    let unknown: Map<String, Value> = json!({"team": "search", "turn_id": "turn-1"})
        .as_object()
        .unwrap()
        .clone();
    let context = GenerationContext::from_request(&HeaderMap::new(), Some(&unknown));
    assert!(context.metadata.is_empty());
    assert!(!context.attributes.contains_key("session.id"));
}

#[test]
fn agent_client_metadata_is_taken_only_when_recognized_and_bounded() {
    let mut request: Map<String, Value> = json!({
        "input": "hello",
        "client_metadata": codex_client_metadata(Some(&codex_turn_metadata())),
    })
    .as_object()
    .unwrap()
    .clone();
    let taken = take_agent_client_metadata(&mut request).unwrap();
    assert_eq!(taken["x-codex-installation-id"], "install-1");
    assert_eq!(
        request,
        json!({"input": "hello"}).as_object().unwrap().clone()
    );

    for client_metadata in [
        json!({"team": "search"}),
        json!("x-codex-turn-metadata"),
        json!({"x-codex-turn-metadata": "a".repeat(MAX_CLIENT_METADATA_BYTES)}),
    ] {
        let mut request: Map<String, Value> =
            json!({"input": "hello", "client_metadata": client_metadata})
                .as_object()
                .unwrap()
                .clone();
        let before = request.clone();
        assert!(take_agent_client_metadata(&mut request).is_none());
        assert_eq!(request, before);
    }
}

#[test]
fn explicit_context_overrides_inferred_agent_context() {
    let mut headers = HeaderMap::new();
    headers.insert("traceparent", TRACEPARENT.parse().unwrap());
    headers.insert("langfuse-session-id", "explicit-session".parse().unwrap());
    headers.insert("langfuse-trace-name", "explicit-name".parse().unwrap());
    headers.insert("langfuse-metadata", "agent.name:custom".parse().unwrap());
    headers.insert("user-agent", "opencode/1.0".parse().unwrap());
    headers.insert("x-opencode-session", "agent-session".parse().unwrap());
    headers.insert("x-opencode-request", "agent-turn".parse().unwrap());
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(context.trace_id, "0123456789abcdef0123456789abcdef");
    assert_eq!(context.attributes["session.id"], "explicit-session");
    assert_eq!(context.attributes["langfuse.trace.name"], "explicit-name");
    assert_eq!(context.metadata["agent.name"], "opencode");
    assert_eq!(context.metadata["agent.session_id"], "agent-session");
    assert_eq!(context.metadata["agent.turn_id"], "agent-turn");
}

#[test]
fn ambiguous_malformed_and_oversized_agent_headers_are_ignored() {
    let mut headers = HeaderMap::new();
    headers.insert("x-session-id", "ambiguous".parse().unwrap());
    let context = GenerationContext::from_headers(&headers);
    assert!(!context.attributes.contains_key("session.id"));
    assert!(context.metadata.is_empty());

    headers.insert("x-codex-turn-metadata", "{malformed".parse().unwrap());
    let context = GenerationContext::from_headers(&headers);
    assert!(!context.attributes.contains_key("session.id"));
    assert!(context.metadata.is_empty());

    headers.insert(
        "x-codex-turn-metadata",
        HeaderValue::from_str(&format!(
            r#"{{"thread_id":"{}","turn_id":"turn"}}"#,
            "a".repeat(MAX_AGENT_METADATA_BYTES)
        ))
        .unwrap(),
    );
    headers.insert("langfuse-session-id", "explicit".parse().unwrap());
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(context.attributes["session.id"], "explicit");
    assert!(context.metadata.is_empty());

    let mut headers = HeaderMap::new();
    headers.insert("user-agent", "opencode/1.0".parse().unwrap());
    headers.insert("x-session-id", "fallback-session".parse().unwrap());
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(
        context.attributes["session.id"],
        "opencode:fallback-session"
    );
}

#[test]
fn oversized_headers_fields_and_entry_counts_are_bounded() {
    let mut headers = HeaderMap::new();
    headers.insert("traceparent", TRACEPARENT.parse().unwrap());
    headers.insert(
        "baggage",
        HeaderValue::from_str(&"a".repeat(MAX_HEADER_BYTES + 1)).unwrap(),
    );
    assert_fresh(&GenerationContext::from_headers(&headers));
    headers.remove("baggage");
    headers.insert(
        "langfuse-user-id",
        HeaderValue::from_str(&"a".repeat(MAX_FIELD_BYTES + 1)).unwrap(),
    );
    headers.insert(
        "langfuse-metadata",
        (0..MAX_ENTRIES + 3)
            .map(|i| format!("key{i}:value"))
            .collect::<Vec<_>>()
            .join(",")
            .parse()
            .unwrap(),
    );
    headers.append("langfuse-metadata", "overflow:value".parse().unwrap());
    let context = GenerationContext::from_headers(&headers);
    assert!(!context.attributes.contains_key("user.id"));
    assert_eq!(context.metadata.len(), MAX_ENTRIES);
    assert!(!context.metadata.contains_key("overflow"));
    assert_eq!(context.parent_span_id.as_deref(), Some("0123456789abcdef"));
}

#[test]
fn python_string_parser_accepts_escapes_but_no_expressions() {
    assert_eq!(
        parse_tags(r"['\x41', '\u00e9', '\U0001f600']"),
        Some(vec!["A".into(), "é".into(), "😀".into()])
    );
    for invalid in [
        "[1]",
        "['a' + 'b']",
        "[__import__('os')]",
        "['unterminated]",
        r"['\uD800']",
        r"['\Uffffffff']",
        "['a'] trailing",
    ] {
        assert!(parse_tags(invalid).is_none(), "{invalid}");
    }
}
