use super::*;

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
        None,
    )
    .unwrap()
    .finalize(guardrails, None)
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

    // 2. An earlier LOG rule on the same preset and a shorter earlier REDACT rule
    //    must not prevent a REDACT email rule from scrubbing the full email span.
    let redact_body = r#"{"messages":[{"role":"user","content":"foo@example.com"}]}"#;
    let outcome = check_request(
        &[
            guardrail("audit-email", GuardrailAction::Log, &[EMAIL]),
            redact_guardrail("short", "[SHORT]", &[r"foo"]),
            redact_guardrail("email", "[EMAIL]", &[EMAIL]),
        ],
        ApiFormat::OpenAiChatCompletions,
        redact_body.as_bytes(),
        &scanned(redact_body, &["messages"]),
    );
    assert!(outcome.blocking().is_none());
    let (findings, edits, _) = outcome.into_parts();
    let ids: Vec<&str> = findings.iter().map(|finding| finding.id.as_str()).collect();
    assert_eq!(ids, ["audit-email", "short", "email"]);
    let rewritten: serde_json::Value =
        serde_json::from_str(&apply_edits(redact_body, &edits)).unwrap();
    assert_eq!(rewritten["messages"][0]["content"], "[SHORT]");
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
    let outcome = eval.finalize(&guardrails, None).unwrap();
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

    // 2. Blocked and Failed outcomes block the request and record action Block.
    for external in [ExternalOutcome::Blocked, ExternalOutcome::Failed] {
        let mut eval = apply_local_guardrails(
            &guardrails,
            body.as_bytes(),
            &members,
            &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
            None,
        )
        .unwrap();
        eval.apply_external(0, &guardrails[0], &external);
        let outcome = eval.finalize(&guardrails, None).unwrap();
        let blocking = outcome.blocking().expect("expected blocking finding");
        assert_eq!(blocking.id, "br");
        assert_eq!(blocking.action, GuardrailAction::Block);
    }
}

#[test]
fn bedrock_enforce_handles_joined_multiline_outputs_and_sequential_chaining() {
    let guardrails = [bedrock_enforce_guardrail("br")];
    let body = r#"{"messages":[{"role":"user","content":[{"type":"text","text":"line 1\ncall 555-0199"},{"type":"text","text":"line 3\nline 4"}]}]}"#;
    let members = scanned(body, &["messages"]);

    // 1. Joined single-block output maps back across multiline fields by line count.
    let mut eval = apply_local_guardrails(
        &guardrails,
        body.as_bytes(),
        &members,
        &last_turn(ApiFormat::OpenAiChatCompletions, body.as_bytes(), &members),
        None,
    )
    .unwrap();
    eval.apply_external(
        0,
        &guardrails[0],
        &ExternalOutcome::Anonymized(vec!["line 1\ncall {PHONE}\nline 3\nline 4".into()]),
    );
    let outcome = eval.finalize(&guardrails, None).unwrap();
    assert!(outcome.blocking().is_none());
    let (_, edits, _) = outcome.into_parts();
    assert_eq!(edits.len(), 1);
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(body, &edits)).unwrap();
    let content = &rewritten["messages"][0]["content"];
    assert_eq!(content[0]["text"], "line 1\ncall {PHONE}");
    assert_eq!(content[1]["text"], "line 3\nline 4");

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
    let outcome = eval.finalize(&pair, None).unwrap();
    assert!(outcome.blocking().is_none());
    let (_, edits, _) = outcome.into_parts();
    let rewritten: serde_json::Value = serde_json::from_str(&apply_edits(single, &edits)).unwrap();
    assert_eq!(
        rewritten["messages"][0]["content"],
        "mail {EMAIL} or call {PHONE}"
    );
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
        Some(&tight_budget),
    );
    assert!(matches!(result, Err(ResolutionError::Busy)));
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
