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

fn scanned(body: &str, members: &'static [&'static str]) -> ScannedMembers {
    let parsed: std::collections::BTreeMap<&str, &serde_json::value::RawValue> =
        serde_json::from_str(body).unwrap();
    let mut scanned = ScannedMembers::new(members);
    for name in members {
        let Some(value) = parsed.get(name).map(|value| value.get()) else {
            continue;
        };
        let start = value.as_ptr().addr() - body.as_ptr().addr();
        scanned.push(name, start..start + value.len());
    }
    scanned
}

#[test]
fn every_format_reads_only_the_request_members_it_declares() {
    let find = |_: &str| Some(r#"[{"role":"user","content":"hi"}]"#);
    for api_format in [
        ApiFormat::OpenAiChatCompletions,
        ApiFormat::OpenAiResponses,
        ApiFormat::AnthropicMessages,
        ApiFormat::OpenAiEmbeddings,
        ApiFormat::OpenAiDecisions,
    ] {
        let spec = crate::capture::request_spec(api_format);
        assert!(
            (spec.last_turn)(&Members::new(spec.members, &find)).is_ok(),
            "{api_format:?} reads a member it does not declare"
        );
        assert!(Members::new(spec.members, &find).get("undeclared").is_err());
    }
}

#[test]
fn a_conversation_item_that_is_not_an_object_fails_closed() {
    let rules = [guardrail("ssn", GuardrailAction::Block, &[SSN])];
    for (api_format, body, member) in [
        (
            ApiFormat::OpenAiChatCompletions,
            r#"{"messages":[["user","ssn 123-45-6789"]]}"#,
            "messages",
        ),
        (
            ApiFormat::OpenAiResponses,
            r#"{"input":[["message","user","ssn 123-45-6789"]]}"#,
            "input",
        ),
    ] {
        let members = crate::capture::request_spec(api_format).members;
        assert!(members.contains(&member));
        let outcome = check_request(&rules, api_format, body.as_bytes(), &scanned(body, members));
        assert!(outcome.rejection().is_some(), "{api_format:?}");
    }
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
    let parsed = ParsedResponse::parse(
        api_format,
        format,
        vec![Bytes::copy_from_slice(body.as_bytes())],
        None,
    )
    .ok();
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
fn redacts_json_responses_across_formats() {
    let guardrails = [
        redact_guardrail("email", "[EMAIL]", &[EMAIL]),
        redact_guardrail("ssn", "[SSN]", &[SSN]),
    ];

    // Chat Completions: content, tool_calls (function + custom), legacy function_call.
    let chat = r#"{"choices":[{"index":0,"message":{"role":"assistant","content":"Mail alice@example.com","tool_calls":[{"id":"c1","type":"function","function":{"name":"f","arguments":"{\"ssn\":\"123-45-6789\"}"}},{"id":"c2","type":"custom","custom":{"name":"sql","input":"123-45-6789"}}],"function_call":{"name":"legacy","arguments":"{\"email\":\"bob@example.com\"}"}}}]}"#;
    let chat_out: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(check_response_local(
            &guardrails,
            ApiFormat::OpenAiChatCompletions,
            ResponseFormat::Json,
            chat,
        )))
        .unwrap();
    assert_eq!(chat_out["choices"][0]["message"]["content"], "Mail [EMAIL]");
    assert_eq!(
        chat_out["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"],
        r#"{"ssn":"[SSN]"}"#
    );
    assert_eq!(
        chat_out["choices"][0]["message"]["tool_calls"][1]["custom"]["input"],
        "[SSN]"
    );
    assert_eq!(
        chat_out["choices"][0]["message"]["function_call"]["arguments"],
        r#"{"email":"[EMAIL]"}"#
    );

    // Anthropic Messages: thinking, text, tool_use.input.
    let anthropic = r#"{"content":[{"type":"thinking","thinking":"123-45-6789"},{"type":"text","text":"Mail bob@example.com"},{"type":"tool_use","id":"t1","name":"f","input":{"email":"carol@example.com"}}]}"#;
    let ant_out: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(check_response_local(
            &guardrails,
            ApiFormat::AnthropicMessages,
            ResponseFormat::Json,
            anthropic,
        )))
        .unwrap();
    assert_eq!(ant_out["content"][0]["thinking"], "[SSN]");
    assert_eq!(ant_out["content"][1]["text"], "Mail [EMAIL]");
    assert_eq!(ant_out["content"][2]["input"]["email"], "[EMAIL]");

    // OpenAI Responses: output_text dedupe + function_call + mcp_call + custom_tool_call.
    let responses = r#"{"output":[{"type":"message","role":"assistant","content":[{"type":"output_text","text":"SSN 123-45-6789"}]},{"type":"function_call","arguments":"{\"email\":\"bob@example.com\"}"},{"type":"custom_tool_call","input":"123-45-6789"}],"output_text":"SSN 123-45-6789"}"#;
    let parsed_resp = ParsedResponse::parse(
        ApiFormat::OpenAiResponses,
        ResponseFormat::Json,
        vec![Bytes::from_static(responses.as_bytes())],
        None,
    )
    .unwrap();
    assert_eq!(parsed_resp.blocks().len(), 3);
    let resp_out: serde_json::Value =
        serde_json::from_str(&rewritten_response_str(check_response_local(
            &guardrails,
            ApiFormat::OpenAiResponses,
            ResponseFormat::Json,
            responses,
        )))
        .unwrap();
    assert_eq!(resp_out["output"][0]["content"][0]["text"], "SSN [SSN]");
    assert_eq!(resp_out["output_text"], "SSN [SSN]");
    assert_eq!(resp_out["output"][1]["arguments"], r#"{"email":"[EMAIL]"}"#);
    assert_eq!(resp_out["output"][2]["input"], "[SSN]");
}

#[test]
fn redacts_sse_responses_across_formats_and_span_boundaries() {
    let guardrails = [redact_guardrail("ssn", "[SSN]", &[SSN])];

    // Chat Completions: array delta + tool_calls (function + custom) split across chunks.
    let chat_sse = concat!(
        "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":[{\"type\":\"text\",\"text\":\"SSN 123-\"}],\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"ssn\\\":\\\"123-\"}},{\"index\":1,\"custom\":{\"input\":\"123-\"}}]}}]}\n\n",
        "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":[{\"type\":\"text\",\"text\":\"45-6789\"}],\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"45-6789\\\"}\"}},{\"index\":1,\"custom\":{\"input\":\"45-6789\"}}]}}]}\n\n",
        "data: [DONE]\n\n"
    );
    let chat_out = rewritten_response_str(check_response_local(
        &guardrails,
        ApiFormat::OpenAiChatCompletions,
        ResponseFormat::Sse,
        chat_sse,
    ));
    assert!(!chat_out.contains("123-") && !chat_out.contains("45-6789"));
    assert!(chat_out.contains("SSN [SSN]"));
    assert_eq!(chat_out.matches("[SSN]").count(), 3);

    // Anthropic Messages: split text_delta + split input_json_delta.
    let anthropic_sse = concat!(
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"123-\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"45-6789\"}}\n\n",
        "event: content_block_start\ndata: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"t1\",\"name\":\"f\",\"input\":{}}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"ssn\\\":\\\"123-\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"45-6789\\\"}\"}}\n\n"
    );
    let ant_out = rewritten_response_str(check_response_local(
        &guardrails,
        ApiFormat::AnthropicMessages,
        ResponseFormat::Sse,
        anthropic_sse,
    ));
    assert!(!ant_out.contains("123-") && !ant_out.contains("45-6789"));
    assert_eq!(ant_out.matches("[SSN]").count(), 2);

    // OpenAI Responses: output_text + function_call_arguments deltas deduplicated across summaries.
    let responses_sse = concat!(
        "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"SSN 123-\"}\n\n",
        "event: response.output_text.delta\ndata: {\"type\":\"response.output_text.delta\",\"output_index\":0,\"content_index\":0,\"delta\":\"45-6789\"}\n\n",
        "event: response.output_text.done\ndata: {\"type\":\"response.output_text.done\",\"output_index\":0,\"content_index\":0,\"text\":\"SSN 123-45-6789\"}\n\n",
        "event: response.function_call_arguments.delta\ndata: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":1,\"delta\":\"{\\\"ssn\\\":\\\"123-\"}\n\n",
        "event: response.function_call_arguments.delta\ndata: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":1,\"delta\":\"45-6789\\\"}\"}\n\n",
        "event: response.output_item.done\ndata: {\"type\":\"response.output_item.done\",\"output_index\":1,\"item\":{\"type\":\"function_call\",\"arguments\":\"{\\\"ssn\\\":\\\"123-45-6789\\\"}\"}}\n\n",
        "event: response.completed\ndata: {\"type\":\"response.completed\",\"response\":{\"id\":\"r1\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"SSN 123-45-6789\"}]},{\"type\":\"function_call\",\"arguments\":\"{\\\"ssn\\\":\\\"123-45-6789\\\"}\"}]}}\n\n"
    );
    let resp_out = rewritten_response_str(check_response_local(
        &guardrails,
        ApiFormat::OpenAiResponses,
        ResponseFormat::Sse,
        responses_sse,
    ));
    assert!(!resp_out.contains("123-") && !resp_out.contains("45-6789"));
    assert_eq!(resp_out.matches("SSN [SSN]").count(), 3);
    assert_eq!(resp_out.matches(r#"{\"ssn\":\"[SSN]\"}"#).count(), 3);
}

#[test]
fn sse_responses_read_the_same_however_the_stream_is_chunked() {
    let chat = concat!(
        "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"SSN 123-\"}}]}\n\n",
        ": ping\n\n",
        "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"45-6789 \\u00e9🔑\"}}]}\n\n",
        "data: [DONE]\n\n"
    );
    let anthropic = concat!(
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"SSN 123-\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\n",
        "data: \"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"45-6789 é\"}}\n\n"
    );
    let cases = [
        (ApiFormat::OpenAiChatCompletions, chat.to_owned()),
        (ApiFormat::OpenAiChatCompletions, chat.replace('\n', "\r\n")),
        (ApiFormat::OpenAiChatCompletions, chat.replace('\n', "\r")),
        (
            ApiFormat::AnthropicMessages,
            anthropic.replace('\n', "\r\n"),
        ),
    ];
    for (api_format, sse) in cases {
        let read = |chunks: Vec<Bytes>| {
            let parsed =
                ParsedResponse::parse(api_format, ResponseFormat::Sse, chunks, None).unwrap();
            let blocks = format!("{:?}", parsed.blocks());
            let edits: Vec<_> = (0..parsed.blocks().len())
                .map(|i| (i, "[SSN]".to_owned()))
                .collect();
            let RedactionApply::Rewritten(rewritten) =
                parsed.apply_redactions(&edits, None).unwrap()
            else {
                panic!("every block is rewritten");
            };
            (blocks, rewritten)
        };
        let whole = read(vec![Bytes::copy_from_slice(sse.as_bytes())]);
        assert!(whole.0.contains("SSN 123-45-6789"));
        for first in 0..=sse.len() {
            for second in [first, first + 1, first + 7].map(|at| at.min(sse.len())) {
                let chunks = [0..first, first..second, second..sse.len()]
                    .map(|range| Bytes::copy_from_slice(&sse.as_bytes()[range]))
                    .to_vec();
                assert_eq!(
                    read(chunks),
                    whole,
                    "{api_format:?} split at {first} and {second}"
                );
            }
        }
    }
}

#[test]
fn response_fail_closed_cases_signed_thinking_and_memory_budget() {
    let block_rules = [guardrail("block", GuardrailAction::Block, &[SSN])];

    // Truncated SSE, duplicate JSON keys, and Decisions SSE all fail closed with 502.
    for (format, wire, payload) in [
        (
            ApiFormat::OpenAiChatCompletions,
            ResponseFormat::Sse,
            "data: {\"choices\":[{\"index\":0,\"delta\":{\"content\":\"hi\"}}]}",
        ),
        (
            ApiFormat::OpenAiChatCompletions,
            ResponseFormat::Json,
            r#"{"choices":[{"index":0,"message":{"role":"assistant","content":"123-45-6789","content":"safe"}}]}"#,
        ),
        (
            ApiFormat::OpenAiDecisions,
            ResponseFormat::Sse,
            "data: {\"answers\":[\"123-45-6789\"]}\n\ndata: [DONE]\n\n",
        ),
    ] {
        let outcome = check_response_local(&block_rules, format, wire, payload);
        let rejection = outcome.rejection().unwrap();
        assert_eq!(rejection.http_status(), axum::http::StatusCode::BAD_GATEWAY);
        assert_eq!(rejection.error_code(), "guardrail_evaluation_failed");
        assert!(rejection.disable_retry());
        assert_eq!(
            outcome.into_findings()[0].location,
            GuardrailLocation::Response
        );
    }

    let too_large = fail_closed_response_outcome(&block_rules, BlockReason::InputTooLarge)
        .rejection()
        .unwrap();
    assert_eq!(too_large.http_status(), axum::http::StatusCode::BAD_GATEWAY);
    assert_eq!(too_large.error_code(), "guardrail_response_too_large");
    assert!(too_large.disable_retry());

    // Signed Anthropic thinking fails closed with non-retryable 400 on REDACT (JSON + SSE),
    // allows LOG unchanged.
    let signed_json =
        r#"{"content":[{"type":"thinking","thinking":"123-45-6789","signature":"sig_1"}]}"#;
    let signed_sse = concat!(
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"123-45-6789\"}}\n\n",
        "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"sig_1\"}}\n\n"
    );
    let redact_rules = [redact_guardrail("ssn", "[SSN]", &[SSN])];
    let log_rules = [guardrail("log", GuardrailAction::Log, &[SSN])];
    for (wire, payload) in [
        (ResponseFormat::Json, signed_json),
        (ResponseFormat::Sse, signed_sse),
    ] {
        let rejection =
            check_response_local(&redact_rules, ApiFormat::AnthropicMessages, wire, payload)
                .rejection()
                .unwrap();
        assert_eq!(rejection.http_status(), axum::http::StatusCode::BAD_REQUEST);
        assert_eq!(rejection.error_code(), "guardrail_blocked");
        assert!(
            check_response_local(&log_rules, ApiFormat::AnthropicMessages, wire, payload)
                .blocking()
                .is_none()
        );
    }

    // Wide JSON (`[{"":0},...]`) is bounded by dynamic memory_budget charging of its keys.
    let mut entries = String::from(r#"{"choices":["#);
    for idx in 0..2000 {
        if idx > 0 {
            entries.push(',');
        }
        entries.push_str(r#"{"":0}"#);
    }
    entries.push_str("]}");
    let tight_budget = Arc::new(Semaphore::new(24 * 1024));
    assert!(matches!(
        ParsedResponse::parse(
            ApiFormat::OpenAiChatCompletions,
            ResponseFormat::Json,
            vec![Bytes::from(entries)],
            Some(&tight_budget),
        ),
        Err(ResponseParseError::Busy)
    ));
}

#[test]
fn tool_argument_json_corruption_fails_closed_and_compaction_skips_response_guardrails() {
    let greedy_redact = [
        guardrail(
            "unrelated-block",
            GuardrailAction::Block,
            &["never_matches"],
        ),
        redact_guardrail("greedy-email", "[EMAIL]", &[r"\S+@\S+"]),
    ];
    for (format, wire, payload) in [
        (
            ApiFormat::OpenAiChatCompletions,
            ResponseFormat::Json,
            r#"{"choices":[{"index":0,"message":{"role":"assistant","tool_calls":[{"id":"c1","type":"function","function":{"name":"f","arguments":"{\"email\":\"alice@example.com\"}"}}]}}]}"#,
        ),
        (
            ApiFormat::AnthropicMessages,
            ResponseFormat::Sse,
            "event: content_block_delta\ndata: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"email\\\":\\\"alice@example.com\\\"}\"}}\n\n",
        ),
        (
            ApiFormat::OpenAiResponses,
            ResponseFormat::Json,
            r#"{"output":[{"type":"function_call","arguments":"{\"email\":\"alice@example.com\"}"}]}"#,
        ),
    ] {
        let outcome = check_response_local(&greedy_redact, format, wire, payload);
        let rejection = outcome.rejection().unwrap();
        assert_eq!(rejection.http_status(), axum::http::StatusCode::BAD_REQUEST);
        assert_eq!(rejection.error_code(), "guardrail_blocked");
        assert!(rejection.message().contains("greedy-email"));
    }

    assert!(!crate::providers::Route::OpenAiResponsesCompact.evaluates_response_guardrails());
}
