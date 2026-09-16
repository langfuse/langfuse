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
        "café / 雪 + value"
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
    let context = GenerationContext::from_headers(&headers);
    assert_eq!(context.attributes["user.id"], "user+name value");
    assert_eq!(context.attributes["session.id"], "custom-session");
    assert_eq!(context.attributes["langfuse.trace.name"], "custom-name");
    assert_eq!(
        context.attributes["langfuse.trace.tags"],
        json!(["a", "comma,tag", "plus+tag"])
    );
    assert_eq!(
        context.metadata,
        json!({"team_name": "new", "keep": "value", "key:name": "value,with:colon"})
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
    let context = GenerationContext::from_headers(&headers);
    assert!(!context.attributes.contains_key("user.id"));
    assert_eq!(context.metadata.len(), MAX_ENTRIES);
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
