//! Authentic Langfuse guardrail rule sets and request payload builders.
use bytes::Bytes;
use serde::Serialize;

/// Authentic PII preset patterns from `web/src/features/ai-gateway/types/gatewayGuardrail.ts`.
const PII_RULES: [(&str, &str, &[&str]); 5] = [
    (
        "pii-email",
        "[EMAIL]",
        &[r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b"],
    ),
    (
        "pii-ssn",
        "[SSN]",
        &[
            r"\b(?:00[1-9]|0[1-9]\d|[1-578]\d\d|6[0-57-9]\d|66[0-57-9])-(?:0[1-9]|[1-9]\d)-(?:000[1-9]|00[1-9]\d|0[1-9]\d\d|[1-9]\d{3})\b",
        ],
    ),
    (
        "pii-cc",
        "[CREDIT_CARD]",
        &[
            r"\b(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|6(?:011|5\d{2}))(?:[ -]?\d{4}){3}\b",
            r"\b3[47]\d{2}[ -]?\d{6}[ -]?\d{5}\b",
        ],
    ),
    (
        "pii-iban",
        "[IBAN]",
        &[r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,3})?\b"],
    ),
    (
        "pii-ip",
        "[IP]",
        &[
            r"\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b",
            r"\b(?:[0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4}\b",
            r"(?:^|[^0-9A-Za-z_:])(?<__lf_match>(?:[0-9A-Fa-f]{1,4}:){1,6}:[0-9A-Fa-f]{1,4}(?::[0-9A-Fa-f]{1,4}){0,5}|(?:[0-9A-Fa-f]{1,4}:){1,7}:|::(?:[0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})(?:$|[^0-9A-Za-z_:])",
        ],
    ),
];

/// Authentic Secret preset patterns from `web/src/features/ai-gateway/types/gatewayGuardrail.ts`.
const SECRET_RULES: [(&str, &str, &[&str]); 10] = [
    ("sec-aws", "[AWS_KEY]", &[r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"]),
    (
        "sec-lf",
        "[LF_KEY]",
        &[r"\b(?:sk|pk)-lf-[A-Za-z0-9_-]{16,}\b"],
    ),
    (
        "sec-openai",
        "[OPENAI_KEY]",
        &[
            r"\bsk-(?:proj|svcacct)-[A-Za-z0-9_-]{20,}\b",
            r"\bsk-[A-Za-z0-9]{32,}\b",
        ],
    ),
    (
        "sec-anthropic",
        "[ANTHROPIC_KEY]",
        &[r"\bsk-ant-[A-Za-z0-9_-]{20,}\b"],
    ),
    (
        "sec-github",
        "[GH_TOKEN]",
        &[r"\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b"],
    ),
    (
        "sec-stripe",
        "[STRIPE_KEY]",
        &[r"\b(?:sk|rk)_live_[A-Za-z0-9]{16,}\b"],
    ),
    (
        "sec-slack",
        "[SLACK_TOKEN]",
        &[r"\bxox[bpoas]-[A-Za-z0-9-]{10,}\b"],
    ),
    (
        "sec-google",
        "[GOOGLE_KEY]",
        &[r"\bAIza[0-9A-Za-z_-]{35}\b"],
    ),
    (
        "sec-pem",
        "[PRIVATE_KEY]",
        &[
            r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----(?:(?:\s|\\[nr])+(?:[A-Za-z0-9+/=:, \t\r\n\\]|-[A-Za-z0-9])*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)?",
        ],
    ),
    (
        "sec-jwt",
        "[JWT]",
        &[r"\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b"],
    ),
];

/// Realistic benign filler paragraph (~192 bytes) with no PII or secrets.
const FILLER_SENTENCE: &str = "The quarterly engineering review covers service reliability, request routing latency, cache hit ratios, and structured observability pipelines across distributed clusters. ";

/// Sample PII snippet (~96 bytes) matching email, SSN, and IPv4 rules.
const PII_SNIPPET: &str = " Contact dana.smith@example.com regarding account 123-45-6789 from host 10.24.88.14 immediately. ";

#[derive(Clone, Debug, Serialize)]
pub struct ResolveGuardrail {
    pub id: String,
    pub name: String,
    pub action: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub redaction_label: Option<String>,
    #[serde(rename = "type")]
    pub kind: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub patterns: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guardrail_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub guardrail_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub region: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
}

#[derive(Clone, Copy, Debug)]
pub enum RuleSet {
    None,
    Regex5Redact,
    Regex50Redact,
    Regex50Block,
    /// Valid custom regex rules with bounded quantifiers & alternations that stress DFA/PikeVM.
    RegexHeavyCustomRedact,
    BedrockEnforce,
    BedrockBlock,
    Regex50RedactPlusBedrockEnforce,
}

impl RuleSet {
    pub fn build(self) -> Vec<ResolveGuardrail> {
        match self {
            Self::None => Vec::new(),
            Self::Regex5Redact => regex_rules(5, "redact"),
            Self::Regex50Redact => regex_rules(50, "redact"),
            Self::Regex50Block => regex_rules(50, "block"),
            Self::RegexHeavyCustomRedact => heavy_custom_rules("redact"),
            Self::BedrockEnforce => vec![bedrock_rule("bedrock-enforce", "enforce")],
            Self::BedrockBlock => vec![bedrock_rule("bedrock-block", "block")],
            Self::Regex50RedactPlusBedrockEnforce => {
                let mut rules = regex_rules(50, "redact");
                rules.push(bedrock_rule("bedrock-enforce", "enforce"));
                rules
            }
        }
    }
}

fn regex_rules(count: usize, action: &str) -> Vec<ResolveGuardrail> {
    let mut out = Vec::with_capacity(count);
    for (id, label, patterns) in PII_RULES.iter().take(count) {
        out.push(make_regex_rule(id, action, Some(label), patterns));
    }
    if out.len() >= count {
        return out;
    }
    for (id, label, patterns) in SECRET_RULES.iter().take(count - out.len()) {
        out.push(make_regex_rule(id, action, Some(label), patterns));
    }
    let mut custom_idx = 0usize;
    while out.len() < count {
        let id = format!("custom-rule-{custom_idx:02}");
        let label = format!("[CUSTOM_{custom_idx:02}]");
        // Mix of realistic enterprise ID, keyword, and prefix patterns.
        let pattern = match custom_idx % 4 {
            0 => format!(r"\b(?:ORD|INV|TXN)-{custom_idx:02}\d{{6,10}}\b"),
            1 => format!(
                r"(?:^|[^A-Za-z0-9_])(?<__lf_match>project_codename_{custom_idx:02}|secret_initiative_{custom_idx:02})(?:$|[^A-Za-z0-9_])"
            ),
            2 => format!(r"\b(?:CUST|ACCT|USR)_{custom_idx:02}_[A-Za-z0-9]{{8,16}}\b"),
            _ => format!(r"\b(?:TKT|CASE|INC)-{custom_idx:02}-[A-Z]{{2,4}}-\d{{4,8}}\b"),
        };
        out.push(ResolveGuardrail {
            id: id.clone(),
            name: id,
            action: action.to_owned(),
            redaction_label: (action == "redact").then_some(label),
            kind: "regex".to_owned(),
            patterns: vec![pattern],
            guardrail_id: None,
            guardrail_version: None,
            region: None,
            api_key: None,
        });
        custom_idx += 1;
    }
    out
}

/// Valid ASCII custom regexes (each well under the 128 KiB rule limit and 512 KiB org limit)
/// with long bounded quantifiers and alternations that trigger slower NFA/lazy-DFA execution.
fn heavy_custom_rules(action: &str) -> Vec<ResolveGuardrail> {
    let mut out = Vec::new();
    for i in 0..8 {
        let id = format!("heavy-custom-{i:02}");
        let pattern = format!(
            r"\b(?:[A-Za-z0-9_]{{2,18}}[-.:/]){{2,4}}(?:token|secret|key|pass|cred)_{i:02}_[A-Za-z0-9]{{4,16}}\b"
        );
        out.push(ResolveGuardrail {
            id: id.clone(),
            name: id,
            action: action.to_owned(),
            redaction_label: (action == "redact").then(|| format!("[HEAVY_{i:02}]")),
            kind: "regex".to_owned(),
            patterns: vec![pattern],
            guardrail_id: None,
            guardrail_version: None,
            region: None,
            api_key: None,
        });
    }
    // Include standard email rule so matches reliably fire when desired.
    out.push(make_regex_rule(
        PII_RULES[0].0,
        action,
        Some(PII_RULES[0].1),
        PII_RULES[0].2,
    ));
    out
}

fn make_regex_rule(
    id: &str,
    action: &str,
    label: Option<&str>,
    patterns: &[&str],
) -> ResolveGuardrail {
    ResolveGuardrail {
        id: id.to_owned(),
        name: id.to_owned(),
        action: action.to_owned(),
        redaction_label: (action == "redact").then(|| label.unwrap_or("[REDACTED]").to_owned()),
        kind: "regex".to_owned(),
        patterns: patterns.iter().map(|&p| p.to_owned()).collect(),
        guardrail_id: None,
        guardrail_version: None,
        region: None,
        api_key: None,
    }
}

fn bedrock_rule(id: &str, action: &str) -> ResolveGuardrail {
    ResolveGuardrail {
        id: id.to_owned(),
        name: id.to_owned(),
        action: action.to_owned(),
        redaction_label: None,
        kind: "bedrock".to_owned(),
        patterns: Vec::new(),
        guardrail_id: Some("benchguardrail01".to_owned()),
        guardrail_version: Some("1".to_owned()),
        region: Some("us-east-1".to_owned()),
        api_key: Some("bench-bedrock-token".to_owned()),
    }
}

#[derive(Clone, Copy, Debug)]
pub enum PayloadShape {
    /// Single user turn sized to `bytes` with `match_count` PII occurrences embedded.
    SingleTurn { bytes: usize, match_count: usize },
    /// Multi-turn conversation with `history_turns` prior turns totaling ~`total_bytes - last_turn_bytes`,
    /// followed by one final user turn of `last_turn_bytes` with `match_count` PII occurrences.
    MultiTurn {
        total_bytes: usize,
        history_turns: usize,
        last_turn_bytes: usize,
        match_count: usize,
    },
}

pub fn build_chat_payload(shape: PayloadShape, stream: bool) -> Bytes {
    match shape {
        PayloadShape::SingleTurn { bytes, match_count } => {
            let content = build_text(bytes.saturating_sub(80), match_count);
            let body = serde_json::json!({
                "model": "gpt-4o-mini",
                "stream": stream,
                "messages": [
                    { "role": "user", "content": content }
                ]
            });
            Bytes::from(serde_json::to_vec(&body).expect("serialize single-turn payload"))
        }
        PayloadShape::MultiTurn {
            total_bytes,
            history_turns,
            last_turn_bytes,
            match_count,
        } => {
            let turns = history_turns.max(2);
            let history_budget = total_bytes
                .saturating_sub(last_turn_bytes)
                .saturating_sub(128);
            let per_turn = (history_budget / turns).max(32);
            let mut messages = Vec::with_capacity(turns + 1);
            for idx in 0..turns {
                let role = if idx % 2 == 0 { "user" } else { "assistant" };
                messages.push(serde_json::json!({
                    "role": role,
                    "content": build_text(per_turn, 0),
                }));
            }
            // Ensure an assistant turn precedes the final user turn so `LastTurn` splits cleanly.
            if turns % 2 == 1 {
                messages.push(serde_json::json!({
                    "role": "assistant",
                    "content": "Acknowledged.",
                }));
            }
            messages.push(serde_json::json!({
                "role": "user",
                "content": build_text(last_turn_bytes, match_count),
            }));
            let body = serde_json::json!({
                "model": "gpt-4o-mini",
                "stream": stream,
                "messages": messages,
            });
            Bytes::from(serde_json::to_vec(&body).expect("serialize multi-turn payload"))
        }
    }
}

fn build_text(target_bytes: usize, match_count: usize) -> String {
    let mut out = String::with_capacity(target_bytes + 256);
    if match_count == 0 {
        while out.len() < target_bytes {
            out.push_str(FILLER_SENTENCE);
        }
        out.truncate(target_bytes);
        return out;
    }
    let matches_total = match_count * PII_SNIPPET.len();
    let filler_total = target_bytes.saturating_sub(matches_total);
    let gap = filler_total / (match_count + 1);
    for _ in 0..match_count {
        push_filler(&mut out, gap);
        out.push_str(PII_SNIPPET);
    }
    let remaining = target_bytes.saturating_sub(out.len());
    push_filler(&mut out, remaining);
    out
}

fn push_filler(out: &mut String, bytes: usize) {
    let end = out.len() + bytes;
    while out.len() + FILLER_SENTENCE.len() <= end {
        out.push_str(FILLER_SENTENCE);
    }
    let rem = end.saturating_sub(out.len());
    if rem > 0 {
        out.push_str(&FILLER_SENTENCE[..rem.min(FILLER_SENTENCE.len())]);
    }
}
