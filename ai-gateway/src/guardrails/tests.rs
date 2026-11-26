use super::*;

const TEST_MAX_SCAN_BYTES: usize = crate::config::DEFAULT_GUARDRAIL_MAX_SCAN_BYTES;

fn check_request(
    guardrails: &[Guardrail],
    api_format: ApiFormat,
    body: &[u8],
    scanned: &ScannedMembers,
) -> Outcome {
    apply_local_guardrails(
        guardrails,
        body,
        scanned,
        &last_turn(api_format, body, scanned),
        TEST_MAX_SCAN_BYTES,
        None,
    )
    .unwrap()
    .finalize(guardrails, GuardrailLocation::Request, None)
    .unwrap()
}

fn apply_edits(body: &str, edits: &[BodyEdit]) -> String {
    let mut sorted: Vec<&BodyEdit> = edits.iter().collect();
    sorted.sort_by_key(|edit| edit.range.start);
    let mut out = Vec::new();
    let mut cursor = 0;
    for edit in sorted {
        out.extend_from_slice(&body.as_bytes()[cursor..edit.range.start]);
        out.extend_from_slice(&edit.replacement);
        cursor = edit.range.end;
    }
    out.extend_from_slice(&body.as_bytes()[cursor..]);
    String::from_utf8(out).unwrap()
}

const SSN: &str = r"\b\d{3}-\d{2}-\d{4}\b";
const EMAIL: &str = r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b";
const PHONE: &str = r"\b\d{3}-\d{4}\b";

fn guardrail(id: &str, action: GuardrailAction, patterns: &[&str]) -> Guardrail {
    Guardrail {
        id: id.into(),
        name: format!("{id} name"),
        action,
        scope: GuardrailScope::LastTurn,
        redaction_label: None,
        kind: GuardrailKind::Regex {
            patterns: patterns
                .iter()
                .map(|pattern| (*pattern).to_owned())
                .collect(),
        },
    }
}

fn redact_guardrail(id: &str, label: &str, patterns: &[&str]) -> Guardrail {
    let mut rule = guardrail(id, GuardrailAction::Redact, patterns);
    rule.redaction_label = Some(label.to_owned());
    rule
}

fn bedrock_enforce_guardrail(id: &str) -> Guardrail {
    Guardrail {
        id: id.into(),
        name: format!("{id} name"),
        action: GuardrailAction::Enforce,
        scope: GuardrailScope::LastTurn,
        redaction_label: None,
        kind: GuardrailKind::Bedrock(BedrockGuardrail {
            guardrail_id: "abc123def".into(),
            guardrail_version: "1".into(),
            region: "us-east-1".into(),
            api_key: SecretString::from("token"),
        }),
    }
}

fn scanned(body: &str, members: &[&'static str]) -> ScannedMembers {
    let parsed: std::collections::BTreeMap<&str, &serde_json::value::RawValue> =
        serde_json::from_str(body).unwrap();
    let mut scanned = ScannedMembers::default();
    for name in members {
        let value = parsed[name].get();
        let start = value.as_ptr().addr() - body.as_ptr().addr();
        scanned.push(name, start..start + value.len());
    }
    scanned
}

#[test]
fn only_guardrails_whose_patterns_match_the_last_turn_fire() {
    let body = r#"{"messages":[{"role":"user","content":"ssn 123-45-6789"},{"role":"assistant","content":"ok"},{"role":"user","content":"mail me at a@example.com"}]}"#;
    let outcome = check_request(
        &[
            guardrail("ssn", GuardrailAction::Block, &[SSN]),
            guardrail("email", GuardrailAction::Log, &[EMAIL]),
            guardrail("invalid", GuardrailAction::Block, &[r"(unclosed"]),
        ],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &scanned(body, &["messages"]),
    );
    assert!(outcome.blocking().is_none());
    assert_eq!(
        outcome.into_findings(),
        [Finding {
            id: "email".into(),
            name: "email name".into(),
            action: GuardrailAction::Log,
            location: GuardrailLocation::Request,
        }]
    );
}

#[test]
fn one_combined_scan_reports_each_matching_guardrail() {
    let body = r#"{"messages":[{"role":"user","content":"ssn 123-45-6789"}]}"#;
    let outcome = check_request(
        &[
            guardrail("email", GuardrailAction::Log, &[EMAIL]),
            guardrail("ssn", GuardrailAction::Block, &[EMAIL, SSN]),
        ],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &scanned(body, &["messages"]),
    );
    let ids: Vec<String> = outcome
        .into_findings()
        .into_iter()
        .map(|finding| finding.id)
        .collect();
    assert_eq!(ids, ["ssn"]);
}

#[test]
fn a_message_with_a_duplicated_field_matches_every_guardrail() {
    let body = r#"{"messages":[{"role":"user","role":"user","content":"123-45-6789"}]}"#;
    let outcome = check_request(
        &[guardrail("email", GuardrailAction::Block, &[EMAIL])],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &scanned(body, &["messages"]),
    );
    assert_eq!(
        outcome.blocking().map(|finding| finding.id.as_str()),
        Some("email")
    );
}

#[test]
fn decisions_input_is_scanned() {
    let body =
        r#"{"input":[{"role":"user","content":[{"type":"input_text","text":"ssn 123-45-6789"}]}]}"#;
    let outcome = check_request(
        &[guardrail("ssn", GuardrailAction::Block, &[SSN])],
        ApiFormat::OpenAiDecisions,
        body.as_bytes(),
        &scanned(body, &["input"]),
    );
    assert_eq!(
        outcome.blocking().map(|finding| finding.id.as_str()),
        Some("ssn")
    );
}

#[test]
fn a_duplicated_conversation_member_matches_every_guardrail() {
    let body = r#"{"messages":[{"role":"user","content":"hello"}]}"#;
    let mut members = scanned(body, &["messages"]);
    members.mark_duplicated();
    let outcome = check_request(
        &[guardrail("ssn", GuardrailAction::Block, &[SSN])],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &members,
    );
    assert_eq!(
        outcome.blocking().map(|finding| finding.id.as_str()),
        Some("ssn")
    );
}

#[test]
fn redacts_nested_message_content_and_multibyte_utf8() {
    let body = r#"{"messages":[{"role":"user","content":"old a@example.com"},{"role":"assistant","content":"ok"},{"role":"user","content":[{"type":"text","text":"café a@example.com 🚀"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}},{"type":"tool_result","tool_use_id":"t1","content":[{"type":"text","text":"call 555-1234 and ssn 123-45-6789"}]}]}]}"#;
    let outcome = check_request(
        &[
            redact_guardrail("email", "[EMAIL]", &[EMAIL]),
            redact_guardrail("phone", "[PHONE]", &[PHONE]),
            redact_guardrail("ssn", "[SSN]", &[SSN]),
        ],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &scanned(body, &["messages"]),
    );
    assert!(outcome.blocking().is_none());
    let (findings, edits, _) = outcome.into_parts();
    let ids: Vec<&str> = findings.iter().map(|f| f.id.as_str()).collect();
    assert_eq!(ids, ["email", "phone", "ssn"]);
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(body, &edits)).unwrap();
    assert_eq!(rewritten["messages"][0]["content"], "old a@example.com");
    assert_eq!(
        rewritten["messages"][2]["content"][0]["text"],
        "café [EMAIL] 🚀"
    );
    assert_eq!(
        rewritten["messages"][2]["content"][1]["image_url"]["url"],
        "data:image/png;base64,AAAA"
    );
    assert_eq!(
        rewritten["messages"][2]["content"][2]["content"][0]["text"],
        "call [PHONE] and ssn [SSN]"
    );
}

#[test]
fn redacts_leftmost_first_and_adjacent_matches_across_guardrails() {
    let body =
        r#"{"messages":[{"role":"user","content":"123-45-6789a@example.com secret-token"}]}"#;
    let outcome = check_request(
        &[
            redact_guardrail("first", "[FIRST]", &[r"123-45-6789", r"secret-token"]),
            redact_guardrail("overlap", "[OVERLAP]", &[r"123-45", r"45-6789"]),
            redact_guardrail("email", "[EMAIL]", &[r"a@example\.com"]),
        ],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &scanned(body, &["messages"]),
    );
    assert!(outcome.blocking().is_none());
    let (_, edits, _) = outcome.into_parts();
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(body, &edits)).unwrap();
    assert_eq!(
        rewritten["messages"][0]["content"],
        "[FIRST][EMAIL] [FIRST]"
    );
}

#[test]
fn overlapping_guardrails_never_shadow_block_or_redact_rules() {
    // 1. An earlier LOG match (email at byte 0) must not shadow an overlapping BLOCK keyword.
    let blocked_body = r#"{"messages":[{"role":"user","content":"my.secret@corp.com"}]}"#;
    let secret_kw = r"(?:^|[^A-Za-z0-9_])(?<__lf_match>secret)(?:$|[^A-Za-z0-9_])";
    let outcome = check_request(
        &[
            guardrail("audit-email", GuardrailAction::Log, &[EMAIL]),
            guardrail("block-secret", GuardrailAction::Block, &[secret_kw]),
        ],
        ApiFormat::OpenAiChatCompletions,
        blocked_body.as_bytes(),
        &scanned(blocked_body, &["messages"]),
    );
    assert_eq!(
        outcome.blocking().map(|finding| finding.id.as_str()),
        Some("block-secret")
    );

    // 2. An earlier LOG rule on the same preset must not shadow a REDACT rule.
    let redact_body = r#"{"messages":[{"role":"user","content":"foo@example.com"}]}"#;
    let outcome = check_request(
        &[
            guardrail("audit-email", GuardrailAction::Log, &[EMAIL]),
            redact_guardrail("email", "[EMAIL]", &[EMAIL]),
        ],
        ApiFormat::OpenAiChatCompletions,
        redact_body.as_bytes(),
        &scanned(redact_body, &["messages"]),
    );
    assert!(outcome.blocking().is_none());
    let (findings, edits, _) = outcome.into_parts();
    let ids: Vec<&str> = findings.iter().map(|finding| finding.id.as_str()).collect();
    assert_eq!(ids, ["audit-email", "email"]);
    let rewritten: serde_json::Value =
        serde_json::from_str(&apply_edits(redact_body, &edits)).unwrap();
    assert_eq!(rewritten["messages"][0]["content"], "[EMAIL]");
}

#[test]
fn unreadable_body_fails_closed_for_redact_guardrail() {
    let body = r#"{"messages":[{"role":"user","role":"user","content":"a@example.com"}]}"#;
    let outcome = check_request(
        &[redact_guardrail("email", "[EMAIL]", &[EMAIL])],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &scanned(body, &["messages"]),
    );
    assert_eq!(
        outcome.blocking().map(|finding| finding.id.as_str()),
        Some("email")
    );
}

#[test]
fn bedrock_enforce_applies_anonymized_outputs_and_blocks_on_block_or_failure() {
    let body = r#"{"messages":[{"role":"user","content":[{"type":"text","text":"Hi Alice, call 555-0199"},{"type":"text","text":"mail bob@example.com"}]}]}"#;
    let members = scanned(body, &["messages"]);
    let guardrails = [
        bedrock_enforce_guardrail("br"),
        redact_guardrail("email", "[EMAIL]", &[EMAIL]),
    ];

    // 1. Local regex redaction runs before Bedrock, so Bedrock receives the
    //    already-redacted block and its anonymized output composes cleanly.
    let mut eval = apply_local_guardrails(
        &guardrails,
        body.as_bytes(),
        &members,
        &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
        TEST_MAX_SCAN_BYTES,
        None,
    )
    .unwrap();
    assert_eq!(
        eval.blocks.texts(),
        ["Hi Alice, call 555-0199", "mail [EMAIL]"]
    );
    eval.apply_external(
        0,
        &guardrails[0],
        &ExternalOutcome::Anonymized(vec![
            "Hi {NAME}, call {PHONE}".into(),
            "mail [EMAIL]".into(),
        ]),
    );
    let outcome = eval
        .finalize(&guardrails, GuardrailLocation::Request, None)
        .unwrap();
    assert!(outcome.blocking().is_none());
    let (findings, edits, _) = outcome.into_parts();
    assert_eq!(findings.len(), 2);
    assert_eq!(
        findings.first().map(|finding| finding.action),
        Some(GuardrailAction::Redact)
    );
    assert_eq!(edits.len(), 2);
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(body, &edits)).unwrap();
    let content = &rewritten["messages"][0]["content"];
    assert_eq!(content[0]["text"], "Hi {NAME}, call {PHONE}");
    assert_eq!(content[1]["text"], "mail [EMAIL]");

    // 2. Blocked and Failed outcomes block the request and record action Block with typed reasons.
    for (external, expected_code) in [
        (ExternalOutcome::Blocked, "guardrail_blocked"),
        (
            ExternalOutcome::Failed(ExternalFailureKind::RateLimited),
            "guardrail_rate_limited",
        ),
        (
            ExternalOutcome::Failed(ExternalFailureKind::Timeout),
            "guardrail_unavailable",
        ),
        (
            ExternalOutcome::Failed(ExternalFailureKind::Unavailable),
            "guardrail_unavailable",
        ),
    ] {
        let mut eval = apply_local_guardrails(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            TEST_MAX_SCAN_BYTES,
            None,
        )
        .unwrap();
        eval.apply_external(0, &guardrails[0], &external);
        let outcome = eval
            .finalize(&guardrails, GuardrailLocation::Request, None)
            .unwrap();
        let blocking = outcome.blocking().expect("expected blocking finding");
        assert_eq!(blocking.id, "br");
        assert_eq!(blocking.action, GuardrailAction::Block);
        assert_eq!(
            outcome.rejection().map(|r| r.error_code()),
            Some(expected_code)
        );
    }
}

#[test]
fn bedrock_enforce_maps_blocks_one_to_one_and_chains_sequentially() {
    let mut entire_bedrock = bedrock_enforce_guardrail("br-all");
    entire_bedrock.scope = GuardrailScope::EntireInput;
    let guardrails = [entire_bedrock];
    let body = r#"{"messages":[{"role":"user","content":"call 555-0199"},{"role":"assistant","content":"ok"},{"role":"user","content":"thanks"}]}"#;
    let members = scanned(body, &["messages"]);

    // 1. EntireInput Bedrock guardrail receives all conversation blocks 1:1.
    let mut eval = apply_local_guardrails(
        &guardrails,
        body.as_bytes(),
        &members,
        &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
        TEST_MAX_SCAN_BYTES,
        None,
    )
    .unwrap();
    assert_eq!(eval.blocks.texts(), ["call 555-0199", "ok", "thanks"]);
    eval.apply_external(
        0,
        &guardrails[0],
        &ExternalOutcome::Anonymized(vec!["call {PHONE}".into(), "ok".into(), "thanks".into()]),
    );
    let outcome = eval
        .finalize(&guardrails, GuardrailLocation::Request, None)
        .unwrap();
    assert!(outcome.blocking().is_none());
    let (_, edits, _) = outcome.into_parts();
    assert_eq!(edits.len(), 1);
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(body, &edits)).unwrap();
    assert_eq!(rewritten["messages"][0]["content"], "call {PHONE}");
    assert_eq!(rewritten["messages"][2]["content"], "thanks");

    // 2. Two enforcing Bedrock guardrails chain sequentially, composing both masks.
    let single =
        r#"{"messages":[{"role":"user","content":"mail alice@example.com or call 555-0199"}]}"#;
    let single_members = scanned(single, &["messages"]);
    let pair = [
        bedrock_enforce_guardrail("br-email"),
        bedrock_enforce_guardrail("br-phone"),
    ];
    let mut eval = apply_local_guardrails(
        &pair,
        single.as_bytes(),
        &single_members,
        &last_turn(
            ApiFormat::OpenAiChatCompletions,
            single.as_bytes(),
            &single_members,
        ),
        TEST_MAX_SCAN_BYTES,
        None,
    )
    .unwrap();
    eval.apply_external(
        0,
        &pair[0],
        &ExternalOutcome::Anonymized(vec!["mail {EMAIL} or call 555-0199".into()]),
    );
    eval.apply_external(
        1,
        &pair[1],
        &ExternalOutcome::Anonymized(vec!["mail {EMAIL} or call {PHONE}".into()]),
    );
    let outcome = eval
        .finalize(&pair, GuardrailLocation::Request, None)
        .unwrap();
    assert!(outcome.blocking().is_none());
    let (_, edits, _) = outcome.into_parts();
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(single, &edits)).unwrap();
    assert_eq!(
        rewritten["messages"][0]["content"],
        "mail {EMAIL} or call {PHONE}"
    );
}

#[test]
fn entire_input_scope_scans_earlier_turns_and_max_scan_bytes_fails_closed() {
    let body = r#"{"messages":[{"role":"system","content":"sys ssn 123-45-6789"},{"role":"user","content":"old a@example.com"},{"role":"assistant","content":"ok"},{"role":"user","content":"hi"}]}"#;
    let members = scanned(body, &["messages"]);

    // EntireInput REDACT scrubs earlier turns while LastTurn BLOCK ignores them.
    let mut entire_redact = redact_guardrail("redact-all", "[EMAIL]", &[EMAIL]);
    entire_redact.scope = GuardrailScope::EntireInput;
    let last_turn_block = guardrail("block-last", GuardrailAction::Block, &[SSN]);
    let outcome = check_request(
        &[entire_redact.clone(), last_turn_block],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &members,
    );
    assert!(outcome.blocking().is_none());
    let (_, edits, _) = outcome.into_parts();
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(body, &edits)).unwrap();
    assert_eq!(rewritten["messages"][1]["content"], "old [EMAIL]");
    assert_eq!(rewritten["messages"][0]["content"], "sys ssn 123-45-6789");

    // Exceeding max_scan_bytes fails closed (413 guardrail_input_too_large) for local regex guardrails.
    let cap_outcome = apply_local_guardrails(
        &[entire_redact],
        body.as_bytes(),
        &members,
        &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
        10,
        None,
    )
    .unwrap()
    .finalize(
        &[redact_guardrail("redact-all", "[EMAIL]", &[EMAIL])],
        GuardrailLocation::Request,
        None,
    )
    .unwrap();
    assert_eq!(
        cap_outcome.blocking().map(|finding| finding.id.as_str()),
        Some("redact-all")
    );
    let cap_rejection = cap_outcome.rejection().unwrap();
    assert_eq!(
        cap_rejection.http_status(),
        axum::http::StatusCode::PAYLOAD_TOO_LARGE
    );
    assert_eq!(cap_rejection.error_code(), "guardrail_input_too_large");
    assert_eq!(
        cap_rejection.message(),
        r#"Input too large for guardrail "redact-all name""#
    );

    // External guardrails are not capped by max_scan_bytes; they forward all
    // scoped blocks and rely on the external provider + fail-closed handling.
    let mut entire_bedrock = bedrock_enforce_guardrail("br-all");
    entire_bedrock.scope = GuardrailScope::EntireInput;
    let br_eval = apply_local_guardrails(
        &[entire_bedrock],
        body.as_bytes(),
        &members,
        &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
        10,
        None,
    )
    .unwrap();
    assert!(!br_eval.is_blocking());
    assert_eq!(br_eval.blocks.texts().len(), 4);

    // Unknown scope values deserialize safely and skip the guardrail.
    let unknown_scope: Guardrail = serde_json::from_value(serde_json::json!({
        "id": "future-scope",
        "name": "Future",
        "action": "block",
        "scope": "output_only",
        "type": "regex",
        "patterns": [EMAIL],
    }))
    .unwrap();
    assert_eq!(unknown_scope.scope, GuardrailScope::Unknown);
    assert!(!unknown_scope.is_active());
}

#[test]
fn boundary_wrapped_contains_and_prefix_patterns_redact_cleanly() {
    let contains =
        r"(?:^|[^A-Za-z0-9_])(?<__lf_match>(?:[Ff][Aa][Ll][Cc][Oo][Nn]))(?:$|[^A-Za-z0-9_])";
    let prefix = r"(?:^|[^A-Za-z0-9_-])(?<__lf_match>acme_[A-Za-z0-9_-]{16,})(?:$|[^A-Za-z0-9_-])";
    let custom_with_group = r"order-(123|456)";
    let body = r#"{"messages":[{"role":"user","content":"café Falcon鍵acme_1234567890abcdef🔑 order-123"}]}"#;
    let outcome = check_request(
        &[
            redact_guardrail("kw", "[CODENAME]", &[contains]),
            redact_guardrail("sec", "[SECRET]", &[prefix]),
            redact_guardrail("ord", "[ORDER]", &[custom_with_group]),
        ],
        ApiFormat::OpenAiChatCompletions,
        body.as_bytes(),
        &scanned(body, &["messages"]),
    );
    assert!(outcome.blocking().is_none());
    let (_, edits, _) = outcome.into_parts();
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(body, &edits)).unwrap();
    assert_eq!(
        rewritten["messages"][0]["content"],
        "café [CODENAME]鍵[SECRET]🔑 [ORDER]"
    );
}

#[test]
fn redaction_respects_memory_budget_and_returns_busy() {
    let body = r#"{"messages":[{"role":"user","content":"a@b.co a@b.co a@b.co a@b.co"}]}"#;
    let members = scanned(body, &["messages"]);
    let long_label = "[REDACTED_EMAIL_ADDRESS_LONGER_THAN_MATCH_1234567890]";
    let guardrails = [redact_guardrail("email", long_label, &[EMAIL])];
    let tight_budget = Arc::new(Semaphore::new(64));
    let result = apply_local_guardrails(
        &guardrails,
        body.as_bytes(),
        &members,
        &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
        TEST_MAX_SCAN_BYTES,
        Some(&tight_budget),
    );
    assert!(matches!(result, Err(ResolutionError::Busy)));

    // Many tiny leaves for an external guardrail must charge per-block overhead against budget.
    let many_parts: Vec<serde_json::Value> = (0..64)
        .map(|_| serde_json::json!({"type": "text", "text": "a"}))
        .collect();
    let tiny_body =
        serde_json::json!({"messages": [{"role": "user", "content": many_parts}]}).to_string();
    let tiny_members = scanned(&tiny_body, &["messages"]);
    let bedrock = [bedrock_enforce_guardrail("br")];
    let tiny_budget = Arc::new(Semaphore::new(512));
    let tiny_result = apply_local_guardrails(
        &bedrock,
        tiny_body.as_bytes(),
        &tiny_members,
        &last_turn(
            ApiFormat::OpenAiChatCompletions,
            tiny_body.as_bytes(),
            &tiny_members,
        ),
        TEST_MAX_SCAN_BYTES,
        Some(&tiny_budget),
    );
    assert!(matches!(tiny_result, Err(ResolutionError::Busy)));
}

fn collect_pattern_spans<'a>(pattern: &str, text: &str, label: &'a str) -> Vec<RedactionSpan<'a>> {
    let pattern = pattern.to_owned();
    let compiled = regex::matcher(&[(0, &pattern)]).unwrap();
    let mut caps = compiled.regex.create_captures();
    let mut spans = Vec::new();
    regex::for_each_match(&compiled.regex, &mut caps, text, |_, start, end| {
        if start < end {
            spans.push(RedactionSpan {
                start,
                end,
                priority: 0,
                label,
            });
        }
    });
    spans
}

#[test]
fn named_match_group_preserves_surrounding_boundaries_and_catches_adjacent_words() {
    let pattern =
        r"(?:^|[^A-Za-z0-9_])(?<__lf_match>(?:[Ff][Oo][Oo]|[Bb][Aa][Rr]))(?:$|[^A-Za-z0-9_])";
    let text = "foo bar,foo! café foo日本語bar";
    let mut spans = collect_pattern_spans(pattern, text, "[WORD]");
    assert_eq!(
        redact::apply_redactions(text, &mut spans).as_deref(),
        Some("[WORD] [WORD],[WORD]! café [WORD]日本語[WORD]")
    );
}

#[test]
fn regex_with_multibyte_utf8_never_splits_codepoints() {
    let pattern = r"(?:^|[^A-Za-z0-9_-])(?<__lf_match>acme_[A-Za-z0-9_-]{16,})(?:$|[^A-Za-z0-9_-])";
    let text = "鍵acme_1234567890abcdef🔑";
    let mut spans = collect_pattern_spans(pattern, text, "[KEY]");
    assert_eq!(
        redact::apply_redactions(text, &mut spans).as_deref(),
        Some("鍵[KEY]🔑")
    );
}

#[test]
fn private_key_pattern_redacts_multiline_and_json_escaped_pem_blocks_linearly() {
    let pattern = r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----(?:(?:\s|\\[nr])+(?:[A-Za-z0-9+/=:, \t\r\n\\]|-[A-Za-z0-9])*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)?";

    // Real newlines with encrypted PEM headers.
    let text = "before\n-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,AABB\n\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----\nafter";
    let mut spans = collect_pattern_spans(pattern, text, "[KEY]");
    assert_eq!(
        redact::apply_redactions(text, &mut spans).as_deref(),
        Some("before\n[KEY]\nafter")
    );

    // Literal `\n` escapes as pasted from service-account JSON or `.env`.
    let escaped = r#"{"private_key":"-----BEGIN PRIVATE KEY-----\nMIIEvAIBADAN\n-----END PRIVATE KEY-----\n"}"#;
    let mut spans = collect_pattern_spans(pattern, escaped, "[KEY]");
    assert_eq!(
        redact::apply_redactions(escaped, &mut spans).as_deref(),
        Some(r#"{"private_key":"[KEY]\n"}"#)
    );

    // Repeated BEGIN headers without END stay linear time and match each header.
    let repeated = "-----BEGIN PRIVATE KEY-----\n".repeat(200);
    let spans = collect_pattern_spans(pattern, &repeated, "[KEY]");
    assert_eq!(spans.len(), 200);
}

fn check_response_local(
    guardrails: &[Guardrail],
    api_format: ApiFormat,
    format: ResponseFormat,
    body: &str,
) -> Outcome {
    let parsed = ParsedResponse::parse(api_format, format, body.as_bytes()).ok();
    apply_local_response_guardrails(
        guardrails,
        parsed.as_ref(),
        crate::config::DEFAULT_GUARDRAIL_MAX_SCAN_BYTES,
        None,
    )
    .unwrap()
    .finalize_response(guardrails, parsed, None)
    .unwrap()
}

fn rewritten_response_str(outcome: Outcome) -> String {
    String::from_utf8(outcome.into_response_parts().1.unwrap().to_vec()).unwrap()
}

#[test]
fn response_findings_report_response_location_and_preserve_order() {
    let guardrails = [
        guardrail("out", GuardrailAction::Block, &[SSN]),
        guardrail("both", GuardrailAction::Log, &[SSN]),
    ];
    let resp_body =
        r#"{"choices":[{"index":0,"message":{"role":"assistant","content":"123-45-6789"}}]}"#;
    let resp_outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Json,
        resp_body,
    );
    assert_eq!(
        resp_outcome.into_findings(),
        [
            Finding {
                id: "out".into(),
                name: "out name".into(),
                action: GuardrailAction::Block,
                location: GuardrailLocation::Response,
            },
            Finding {
                id: "both".into(),
                name: "both name".into(),
                action: GuardrailAction::Log,
                location: GuardrailLocation::Response,
            },
        ]
    );
}

#[test]
fn redacts_non_streaming_json_responses_across_all_api_formats() {
    let guardrails = [
        redact_guardrail("email", "[EMAIL]", &[EMAIL]),
        redact_guardrail("ssn", "[SSN]", &[SSN]),
    ];

    // 1. OpenAI Chat Completions (content + tool_calls arguments).
    let chat = r#"{"id":"chatcmpl-1","choices":[{"index":0,"message":{"role":"assistant","content":"Email alice@example.com","tool_calls":[{"id":"c1","type":"function","function":{"name":"lookup","arguments":"{\"ssn\":\"123-45-6789\"}"}}]}}]}"#;
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Json,
        chat,
    );
    let rewritten: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(outcome)).unwrap();
    assert_eq!(
        rewritten["choices"][0]["message"]["content"],
        "Email [EMAIL]"
    );
    assert_eq!(
        rewritten["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"],
        r#"{"ssn":"[SSN]"}"#
    );

    // 2. Anthropic Messages (text + thinking + tool_use.input).
    let anthropic = r#"{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"Checking 123-45-6789"},{"type":"text","text":"Mail bob@example.com"},{"type":"tool_use","id":"tu_1","name":"lookup","input":{"email":"carol@example.com","count":1}}]}"#;
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Json,
        anthropic,
    );
    let rewritten: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(outcome)).unwrap();
    assert_eq!(rewritten["content"][0]["thinking"], "Checking [SSN]");
    assert_eq!(rewritten["content"][1]["text"], "Mail [EMAIL]");
    assert_eq!(rewritten["content"][2]["input"]["email"], "[EMAIL]");
    assert_eq!(rewritten["content"][2]["input"]["count"], 1);

    // 3. OpenAI Responses (output_text + refusal + function_call arguments).
    let responses = r#"{"id":"resp_1","status":"completed","output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"Contact dave@example.com"},{"type":"refusal","refusal":"Cannot share 123-45-6789"}]},{"type":"function_call","name":"f","arguments":"{\"e\":\"eve@example.com\"}"}]}"#;
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiResponses,
        ResponseFormat::Json,
        responses,
    );
    let rewritten: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(outcome)).unwrap();
    assert_eq!(
        rewritten["output"][0]["content"][0]["text"],
        "Contact [EMAIL]"
    );
    assert_eq!(
        rewritten["output"][0]["content"][1]["refusal"],
        "Cannot share [SSN]"
    );
    assert_eq!(rewritten["output"][1]["arguments"], r#"{"e":"[EMAIL]"}"#);

    // 4. OpenAI Decisions (answers).
    let decisions = r#"{"answers":[{"type":"text","name":"summary","text":"Found 123-45-6789"}]}"#;
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiDecisions,
        ResponseFormat::Json,
        decisions,
    );
    let rewritten: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(outcome)).unwrap();
    assert_eq!(rewritten["answers"][0]["text"], "Found [SSN]");
    assert_eq!(rewritten["answers"][0]["name"], "summary");
}

#[test]
fn redacts_span_crossing_sse_chunks_and_deduplicates_responses_summaries() {
    let guardrails = [redact_guardrail("ssn", "[SSN]", &[SSN])];

    // 1. OpenAI Chat Completions SSE with SSN split across three deltas.
    let chat_sse = concat!(
        "data: {\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\",\"content\":\"\"}}]}\n\n",
        "data: {\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"SSN: 123-\"}}]}\n\n",
        "data: {\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"45-\"}}]}\n\n",
        "data: {\"id\":\"c1\",\"choices\":[{\"index\":0,\"delta\":{\"content\":\"6789 done\"}}]}\n\n",
        "data: [DONE]\n\n"
    );
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Sse,
        chat_sse,
    );
    let rewritten = rewritten_response_str(outcome);
    assert!(!rewritten.contains("123-"));
    assert!(!rewritten.contains("6789"));
    assert!(rewritten.contains("\"content\":\"SSN: [SSN] done\""));
    assert!(rewritten.contains("data: [DONE]\n\n"));

    // 2. Anthropic Messages SSE with SSN split across text_delta chunks.
    let anthropic_sse = concat!(
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"id 123-45\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"-6789!\"}}\n\n",
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
    );
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Sse,
        anthropic_sse,
    );
    let rewritten = rewritten_response_str(outcome);
    assert!(!rewritten.contains("123-45"));
    assert!(!rewritten.contains("-6789"));
    assert!(rewritten.contains("\"text\":\"id [SSN]!\""));

    // 3. OpenAI Responses SSE: deltas + output_text.done + content_part.done +
    //    output_item.done + response.completed all collapse into ONE logical block
    //    and every occurrence is rewritten consistently.
    let responses_sse = concat!(
        "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"SSN 123-\"}\n\n",
        "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"45-6789\"}\n\n",
        "event: response.output_text.done\ndata: {\"type\":\"response.output_text.done\",\"output_index\":0,\"content_index\":0,\"text\":\"SSN 123-45-6789\"}\n\n",
        "event: response.content_part.done\ndata: {\"type\":\"response.content_part.done\",\"output_index\":0,\"content_index\":0,\"part\":{\"type\":\"output_text\",\"text\":\"SSN 123-45-6789\"}}\n\n",
        "event: response.output_item.done\ndata: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"SSN 123-45-6789\"}]}}\n\n",
        "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_1\",\"status\":\"completed\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"SSN 123-45-6789\"}]}]}}\n\n"
    );
    let parsed = ParsedResponse::parse(
        ApiFormat::OpenAiResponses,
        ResponseFormat::Sse,
        responses_sse.as_bytes(),
    )
    .unwrap();
    assert_eq!(parsed.blocks().len(), 1);
    assert_eq!(parsed.blocks()[0].text, "SSN 123-45-6789");

    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiResponses,
        ResponseFormat::Sse,
        responses_sse,
    );
    let rewritten = rewritten_response_str(outcome);
    assert!(!rewritten.contains("123-"));
    assert!(!rewritten.contains("45-6789"));
    assert_eq!(rewritten.matches("SSN [SSN]").count(), 5);
}

#[test]
fn truncated_or_malformed_sse_fails_closed_for_output_guardrails() {
    let guardrails = [guardrail("block", GuardrailAction::Block, &[SSN])];
    let truncated = "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi\"}}]}";
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Sse,
        truncated,
    );
    assert_eq!(
        outcome.blocking().map(|finding| finding.id.as_str()),
        Some("block")
    );
    let rejection = outcome.rejection().unwrap();
    assert_eq!(rejection.http_status(), axum::http::StatusCode::BAD_GATEWAY);
    assert_eq!(rejection.error_code(), "guardrail_evaluation_failed");
    assert_eq!(
        rejection.message(),
        r#"Guardrail "block name" could not read the response"#
    );

    let too_large = fail_closed_response_outcome(&guardrails, BlockReason::InputTooLarge)
        .rejection()
        .unwrap();
    assert_eq!(too_large.http_status(), axum::http::StatusCode::BAD_GATEWAY);
    assert_eq!(too_large.error_code(), "guardrail_response_too_large");
    assert_eq!(
        too_large.message(),
        r#"Response too large for guardrail "block name""#
    );
}

#[test]
fn redacting_response_scrubs_logprobs_token_copies_in_json_and_sse() {
    let guardrails = [redact_guardrail("ssn", "[SSN]", &[SSN])];

    // 1. Chat Completions JSON: logprobs scrubbed to null when redacted, kept when untouched.
    let chat_with_secret = r#"{"choices":[{"index":0,"message":{"role":"assistant","content":"123-45-6789"},"logprobs":{"content":[{"token":"123-45-6789","logprob":-0.1,"bytes":[49,50,51]}]}}]}"#;
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Json,
        chat_with_secret,
    );
    let rewritten: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(outcome)).unwrap();
    assert_eq!(rewritten["choices"][0]["message"]["content"], "[SSN]");
    assert_eq!(rewritten["choices"][0]["logprobs"], serde_json::Value::Null);

    let chat_clean = r#"{"choices":[{"index":0,"message":{"role":"assistant","content":"hello"},"logprobs":{"content":[{"token":"hello","logprob":-0.1,"bytes":[104]}]}}]}"#;
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Json,
        chat_clean,
    );
    assert!(outcome.into_response_parts().1.is_none());

    // 2. Chat Completions SSE: logprobs scrubbed to null across chunks when redacted.
    let chat_sse = concat!(
        "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"123-\"},\"logprobs\":{\"content\":[{\"token\":\"123-\",\"bytes\":[49,50,51,45]}]}}]}\n\n",
        "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"45-6789\"},\"logprobs\":{\"content\":[{\"token\":\"45-6789\",\"bytes\":[52,53]}]}}]}\n\n",
        "data: [DONE]\n\n"
    );
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Sse,
        chat_sse,
    );
    let rewritten = rewritten_response_str(outcome);
    assert!(!rewritten.contains("123-"));
    assert!(!rewritten.contains("45-6789"));
    assert!(!rewritten.contains("[49,50,51,45]"));
    assert_eq!(rewritten.matches("\"logprobs\":null").count(), 2);

    // 3. OpenAI Responses JSON: array-shaped logprobs scrubbed to [] when redacted.
    let responses_json = r#"{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"123-45-6789","logprobs":[{"token":"123-45-6789","bytes":[49]}]}]}]}"#;
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiResponses,
        ResponseFormat::Json,
        responses_json,
    );
    let rewritten: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(outcome)).unwrap();
    assert_eq!(rewritten["output"][0]["content"][0]["text"], "[SSN]");
    assert_eq!(
        rewritten["output"][0]["content"][0]["logprobs"],
        serde_json::json!([])
    );
}

#[test]
fn signed_anthropic_thinking_blocks_fail_closed_on_redact_or_enforce_but_allow_log() {
    let redact = [redact_guardrail("ssn", "[SSN]", &[SSN])];
    let log = [guardrail("ssn-log", GuardrailAction::Log, &[SSN])];
    let bedrock_rules = [bedrock_enforce_guardrail("br-out")];

    // 1. Non-streaming signed thinking block fails closed on REDACT and Bedrock anonymize.
    let signed_json = r#"{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"thinking","thinking":"Check 123-45-6789","signature":"EqQBCgIYAhIMsigned"},{"type":"text","text":"safe"}]}"#;
    let outcome = check_response_local(
        &redact,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Json,
        signed_json,
    );
    assert_eq!(
        outcome.blocking().map(|finding| finding.id.as_str()),
        Some("ssn")
    );
    let log_outcome = check_response_local(
        &log,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Json,
        signed_json,
    );
    assert!(log_outcome.blocking().is_none());
    assert_eq!(log_outcome.into_findings().len(), 1);

    let parsed = ParsedResponse::parse(
        ApiFormat::AnthropicMessages,
        ResponseFormat::Json,
        signed_json.as_bytes(),
    )
    .ok();
    let mut eval = apply_local_response_guardrails(
        &bedrock_rules,
        parsed.as_ref(),
        crate::config::DEFAULT_GUARDRAIL_MAX_SCAN_BYTES,
        None,
    )
    .unwrap();
    assert!(eval.apply_external(
        0,
        &bedrock_rules[0],
        &ExternalOutcome::Anonymized(vec!["Check {SSN}".into(), "safe".into()]),
    ));
    let br_outcome = eval
        .finalize_response(&bedrock_rules, parsed, None)
        .unwrap();
    assert_eq!(
        br_outcome.blocking().map(|finding| finding.id.as_str()),
        Some("br-out")
    );

    // 2. Streaming SSE signed thinking block (signature_delta arrives after thinking_delta)
    //    also fails closed on REDACT.
    let signed_sse = concat!(
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\",\"signature\":\"\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"Check 123-\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"45-6789\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"EqQBCgIYAhIMsigned\"}}\n\n",
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
    );
    let sse_outcome = check_response_local(
        &redact,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Sse,
        signed_sse,
    );
    assert_eq!(
        sse_outcome.blocking().map(|finding| finding.id.as_str()),
        Some("ssn")
    );
}

#[test]
fn redacts_anthropic_citations_and_responses_shell_call_command_done() {
    let guardrails = [redact_guardrail("ssn", "[SSN]", &[SSN])];

    // 1. Anthropic JSON citations (cited_text, document_title, title, url, source).
    let anthropic_json = r#"{"id":"msg_1","type":"message","role":"assistant","content":[{"type":"text","text":"See docs","citations":[{"type":"char_location","cited_text":"SSN 123-45-6789","document_title":"HR 123-45-6789"},{"type":"web_search_result_location","title":"Record 123-45-6789","url":"https://example.com/123-45-6789","source":"src-123-45-6789"}]}]}"#;
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Json,
        anthropic_json,
    );
    let rewritten: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(outcome)).unwrap();
    assert_eq!(
        rewritten["content"][0]["citations"][0]["cited_text"],
        "SSN [SSN]"
    );
    assert_eq!(
        rewritten["content"][0]["citations"][0]["document_title"],
        "HR [SSN]"
    );
    assert_eq!(
        rewritten["content"][0]["citations"][1]["title"],
        "Record [SSN]"
    );
    assert_eq!(
        rewritten["content"][0]["citations"][1]["url"],
        "https://example.com/[SSN]"
    );
    assert_eq!(
        rewritten["content"][0]["citations"][1]["source"],
        "src-[SSN]"
    );

    // 2. Anthropic SSE citations_delta.
    let anthropic_sse = concat!(
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"citations_delta\",\"citation\":{\"type\":\"char_location\",\"cited_text\":\"Quote 123-45-6789\"}}}\n\n",
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
    );
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Sse,
        anthropic_sse,
    );
    let rewritten = rewritten_response_str(outcome);
    assert!(!rewritten.contains("123-45-6789"));
    assert!(rewritten.contains("Quote [SSN]"));

    // 3. OpenAI Responses SSE shell_call_command.delta + shell_call_command.done + output_item.done.
    let shell_sse = concat!(
        "event: response.shell_call_command.delta\ndata: {\"type\":\"response.shell_call_command.delta\",\"output_index\":0,\"delta\":\"echo 123-\"}\n\n",
        "event: response.shell_call_command.delta\ndata: {\"type\":\"response.shell_call_command.delta\",\"output_index\":0,\"delta\":\"45-6789\"}\n\n",
        "event: response.shell_call_command.done\ndata: {\"type\":\"response.shell_call_command.done\",\"output_index\":0,\"command\":\"echo 123-45-6789\"}\n\n",
        "event: response.output_item.done\ndata: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"type\":\"shell_call\",\"command\":\"echo 123-45-6789\"}}\n\n"
    );
    let parsed = ParsedResponse::parse(
        ApiFormat::OpenAiResponses,
        ResponseFormat::Sse,
        shell_sse.as_bytes(),
    )
    .unwrap();
    assert_eq!(parsed.blocks().len(), 1);
    let outcome = check_response_local(
        &guardrails,
        ApiFormat::OpenAiResponses,
        ResponseFormat::Sse,
        shell_sse,
    );
    let rewritten = rewritten_response_str(outcome);
    assert!(!rewritten.contains("123-"));
    assert!(!rewritten.contains("45-6789"));
    assert_eq!(rewritten.matches("echo [SSN]").count(), 3);
}

#[test]
fn redacts_anthropic_sse_start_tool_content_chat_array_delta_and_dedupes_output_text() {
    let guardrails = [redact_guardrail("ssn", "[SSN]", &[SSN])];
    let start_tool_sse = concat!(
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"web_search_tool_result\",\"content\":[{\"type\":\"text\",\"text\":\"Result 123-45-6789\"}],\"citations\":[{\"url\":\"https://example.com/123-45-6789\"}],\"input\":{\"q\":\"123-45-6789\"}}}\n\n",
        "event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n"
    );
    let rewritten = rewritten_response_str(check_response_local(
        &guardrails,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Sse,
        start_tool_sse,
    ));
    assert!(!rewritten.contains("123-45-6789"));
    assert_eq!(rewritten.matches("[SSN]").count(), 3);

    let chat_array_sse = "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":[{\"type\":\"text\",\"text\":\"SSN 123-45-6789\"}]}}]}\n\ndata: [DONE]\n\n";
    let rewritten = rewritten_response_str(check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Sse,
        chat_array_sse,
    ));
    assert!(!rewritten.contains("123-45-6789"));
    assert!(rewritten.contains("SSN [SSN]"));

    let resp_with_output_text = r#"{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SSN 123-45-6789"}]}],"output_text":"SSN 123-45-6789"}"#;
    let parsed = ParsedResponse::parse(
        ApiFormat::OpenAiResponses,
        ResponseFormat::Json,
        resp_with_output_text.as_bytes(),
    )
    .unwrap();
    assert_eq!(parsed.blocks().len(), 1);
    let rewritten: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(check_response_local(
            &guardrails,
            ApiFormat::OpenAiResponses,
            ResponseFormat::Json,
            resp_with_output_text,
        )))
        .unwrap();
    assert_eq!(rewritten["output"][0]["content"][0]["text"], "SSN [SSN]");
    assert_eq!(rewritten["output_text"], "SSN [SSN]");
}
