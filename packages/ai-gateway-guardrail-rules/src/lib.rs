//! Guardrail regex rules: one validator shared by the gateway (Rust) and the
//! control plane (WebAssembly).
//!
//! Rules are ASCII-only: `\w`, `\d`, `\s`, `\b` and `(?i)` follow ASCII rules,
//! `\p{..}` and the inline `u` flag are rejected. Lookaround and backreferences
//! are rejected by the parser. Each rule and the combined rule set must fit a
//! compiled-size limit, which bounds search time (linear in compiled size times
//! input length).
use regex_automata::{
    meta,
    nfa::thompson::{self, State},
    util::syntax,
};
use regex_syntax::ast::{self, Ast, Flag, FlagsItemKind, Visitor};
use serde::Serialize;

/// Limits on an organization's rules. Fixed-width, so the WebAssembly build
/// (32-bit `usize`) and the gateway (64-bit) apply identical limits.
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub struct Limits {
    pub max_rules: u32,
    pub max_pattern_chars: u32,
    /// Compiled size of one rule, as measured by [`compiled_size`].
    pub max_rule_bytes: u32,
    /// Compiled size of all of an organization's rules together.
    pub max_set_bytes: u32,
    pub nest_limit: u32,
}

/// The limits of the Guardrails RFC: 500 characters per pattern (Bedrock's
/// cap), 128 KiB compiled per rule and 512 KiB per organization (about 50
/// rules). The only definition; the gateway and the WebAssembly module both
/// read it.
pub const LIMITS: Limits = Limits {
    max_rules: 50,
    max_pattern_chars: 500,
    max_rule_bytes: 128 * 1024,
    max_set_bytes: 512 * 1024,
    nest_limit: 100,
};

/// Bounds memory while compiling a pattern before its size is measured. Far
/// above any limit, so it only stops patterns rejected on every architecture.
const COMPILE_GUARD_BYTES: usize = 32 << 20;
const STATE_BYTES: u32 = 8;
const TRANSITION_BYTES: u32 = 8;

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct RuleResult {
    pub index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compiled_bytes: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct Report {
    pub ok: bool,
    pub rules: Vec<RuleResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_bytes: Option<u32>,
}

/// Rejects any flag group that turns Unicode mode on, e.g. `(?u)` or `(?iu:..)`.
struct NoUnicodeFlag;

impl Visitor for NoUnicodeFlag {
    type Output = ();
    type Err = String;

    fn finish(self) -> Result<(), String> {
        Ok(())
    }

    fn visit_pre(&mut self, ast: &Ast) -> Result<(), String> {
        let flags = match ast {
            Ast::Flags(set) => &set.flags,
            Ast::Group(group) => match &group.kind {
                ast::GroupKind::NonCapturing(flags) => flags,
                _ => return Ok(()),
            },
            _ => return Ok(()),
        };
        let mut negated = false;
        for item in &flags.items {
            match item.kind {
                FlagsItemKind::Negation => negated = true,
                FlagsItemKind::Flag(Flag::Unicode) if !negated => {
                    return Err("the `u` flag is not allowed: rules are ASCII-only".into());
                }
                _ => {}
            }
        }
        Ok(())
    }
}

fn syntax_config(limits: &Limits) -> syntax::Config {
    syntax::Config::new()
        .unicode(false)
        .nest_limit(limits.nest_limit)
}

/// The compiled size of `patterns` together: 8 bytes per NFA state and 8 per
/// transition. regex-automata's own size counts allocations, which grow with
/// pointer width, so the same rule could pass on wasm32 and fail on x86_64.
pub fn compiled_size(patterns: &[&str], limits: &Limits) -> Result<u32, String> {
    let nfa = thompson::Compiler::new()
        .syntax(syntax_config(limits))
        .configure(thompson::Config::new().nfa_size_limit(Some(COMPILE_GUARD_BYTES)))
        .build_many(patterns)
        .map_err(|error| describe(&error))?;
    nfa.states()
        .iter()
        .try_fold(0u32, |total, state| total.checked_add(state_size(state)?))
        .ok_or_else(|| "rules are too large to compile".into())
}

fn state_size(state: &State) -> Option<u32> {
    let transitions = match state {
        State::ByteRange { .. } | State::Look { .. } | State::Capture { .. } => 1,
        State::BinaryUnion { .. } => 2,
        State::Sparse(sparse) => sparse.transitions.len(),
        State::Dense(dense) => dense.transitions.len(),
        State::Union { alternates } => alternates.len(),
        State::Fail | State::Match { .. } => 0,
    };
    u32::try_from(transitions)
        .ok()?
        .checked_mul(TRANSITION_BYTES)?
        .checked_add(STATE_BYTES)
}

/// The most specific message in an error's source chain, on one line.
fn describe(error: &dyn std::error::Error) -> String {
    let mut innermost = error;
    while let Some(source) = innermost.source() {
        innermost = source;
    }
    let text = innermost.to_string();
    text.lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(&text)
        .trim()
        .to_owned()
}

fn check_rule(pattern: &str, limits: &Limits) -> Result<u32, String> {
    if pattern.is_empty() {
        return Err("pattern is empty".into());
    }
    if u32::try_from(pattern.chars().count()).map_or(true, |chars| chars > limits.max_pattern_chars)
    {
        return Err(format!(
            "pattern is longer than {} characters",
            limits.max_pattern_chars
        ));
    }
    let parsed = ast::parse::ParserBuilder::new()
        .nest_limit(limits.nest_limit)
        .build()
        .parse(pattern)
        .map_err(|error| describe(&error))?;
    ast::visit(&parsed, NoUnicodeFlag)?;
    within(
        compiled_size(&[pattern], limits)?,
        limits.max_rule_bytes,
        "rule",
    )
}

fn within(bytes: u32, limit: u32, what: &str) -> Result<u32, String> {
    if bytes > limit {
        return Err(format!(
            "{what} compiles to {bytes} bytes, over the limit of {limit}"
        ));
    }
    Ok(bytes)
}

/// Validates an organization's rules: each rule on its own, then all rules combined.
pub fn validate(patterns: &[String], limits: &Limits) -> Report {
    let checked: Vec<Result<u32, String>> = patterns
        .iter()
        .map(|pattern| check_rule(pattern, limits))
        .collect();
    let all_valid = checked.iter().all(Result::is_ok);
    let rules: Vec<RuleResult> = checked
        .into_iter()
        .enumerate()
        .map(|(index, checked)| RuleResult {
            index,
            compiled_bytes: checked.as_ref().ok().copied(),
            error: checked.err(),
        })
        .collect();
    let (set_bytes, set_error) =
        if u32::try_from(patterns.len()).map_or(true, |count| count > limits.max_rules) {
            (
                None,
                Some(format!(
                    "{} rules exceed the limit of {}",
                    patterns.len(),
                    limits.max_rules
                )),
            )
        } else if all_valid && !patterns.is_empty() {
            match set_size(patterns, limits) {
                Ok(bytes) => (Some(bytes), None),
                Err(error) => (None, Some(error)),
            }
        } else {
            (None, None)
        };
    Report {
        ok: set_error.is_none() && all_valid,
        rules,
        set_error,
        set_bytes,
    }
}

fn set_size(patterns: &[String], limits: &Limits) -> Result<u32, String> {
    let patterns: Vec<&str> = patterns.iter().map(String::as_str).collect();
    within(
        compiled_size(&patterns, limits)?,
        limits.max_set_bytes,
        "rule set",
    )
}

/// Compiles all rules into one multi-pattern regex; each match carries its
/// span and the index of the rule that produced it. The gateway calls this
/// when it loads an organization's rules, after the same size check the
/// control plane ran, so both accept the same rule sets.
pub fn compile(patterns: &[String], limits: &Limits) -> Result<meta::Regex, String> {
    set_size(patterns, limits)?;
    // The size check above bounds the regex; regex-automata's own limit would
    // measure allocations and could disagree across architectures.
    meta::Builder::new()
        .syntax(syntax_config(limits))
        .configure(meta::Config::new().nfa_size_limit(None))
        .build_many(patterns)
        .map_err(|error| describe(&error))
}

#[cfg(feature = "wasm")]
mod wasm {
    use wasm_bindgen::prelude::*;

    /// `input`: `{"patterns": [...]}`, checked against [`super::LIMITS`].
    /// Returns the [`super::Report`] as JSON.
    #[wasm_bindgen]
    pub fn validate(input: &str) -> String {
        #[derive(serde::Deserialize)]
        struct Input {
            patterns: Vec<String>,
        }
        let report = match serde_json::from_str::<Input>(input) {
            Ok(input) => super::validate(&input.patterns, &super::LIMITS),
            Err(error) => super::Report {
                ok: false,
                rules: vec![],
                set_error: Some(format!("invalid input: {error}")),
                set_bytes: None,
            },
        };
        serde_json::to_string(&report).unwrap_or_else(|_| r#"{"ok":false,"rules":[]}"#.into())
    }

    /// [`super::LIMITS`] as JSON, for the control plane to show.
    #[wasm_bindgen]
    pub fn limits() -> String {
        serde_json::to_string(&super::LIMITS).unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn error(pattern: &str) -> Option<String> {
        check_rule(pattern, &LIMITS).err()
    }

    #[test]
    fn accepts_ascii_rules() {
        for pattern in [
            r"\b\d{3}-\d{2}-\d{4}\b",
            r"(?i)\bbearer\s+[A-Za-z0-9._~+/-]{20,}",
            r"(?i-u)abc",
            r"\w{1,500}",
            "(?i)stra\u{df}e",
        ] {
            assert_eq!(error(pattern), None, "{pattern}");
        }
    }

    #[test]
    fn rejects_unicode_lookaround_and_backreferences() {
        for pattern in [
            r"\p{L}+",
            r"(?u:\w)+",
            r"(?iu)abc",
            r"foo(?=bar)",
            r"(?<=x)y",
            r"(a)\1",
        ] {
            assert!(error(pattern).is_some(), "{pattern}");
        }
    }

    #[test]
    fn rejects_rules_over_the_size_limit() {
        let small = Limits {
            max_rule_bytes: 16 << 10,
            ..LIMITS
        };
        assert!(check_rule(r"[a-z]{1,1000}x", &small).is_err());
    }

    #[test]
    fn reports_set_limit_and_rule_count() {
        let patterns: Vec<String> = (0..3).map(|i| format!("word{i}")).collect();
        let report = validate(
            &patterns,
            &Limits {
                max_rules: 2,
                ..LIMITS
            },
        );
        assert!(!report.ok);
        assert!(report.set_error.unwrap().contains("exceed"));
    }

    /// The sizes the WebAssembly build must report too (`js/parity.test.mjs`):
    /// limits are enforced on the same numbers on wasm32 and x86_64.
    #[test]
    fn compiled_sizes_match_the_shared_fixture() {
        #[derive(serde::Deserialize)]
        struct Fixture {
            rules: Vec<Case>,
            set_bytes: u32,
        }
        #[derive(serde::Deserialize)]
        struct Case {
            pattern: String,
            compiled_bytes: Option<u32>,
        }
        let fixture: Fixture =
            serde_json::from_str(include_str!("../tests/compiled-sizes.json")).unwrap();
        for case in &fixture.rules {
            let report = validate(std::slice::from_ref(&case.pattern), &LIMITS);
            assert_eq!(
                report.rules[0].compiled_bytes, case.compiled_bytes,
                "{}",
                case.pattern
            );
        }
        let valid: Vec<String> = fixture
            .rules
            .into_iter()
            .filter(|case| case.compiled_bytes.is_some())
            .map(|case| case.pattern)
            .collect();
        assert_eq!(validate(&valid, &LIMITS).set_bytes, Some(fixture.set_bytes));
    }

    #[test]
    fn compiled_set_reports_rule_index() {
        let patterns = vec![
            r"\b\d{3}-\d{2}-\d{4}\b".to_string(),
            r"[a-z]+@[a-z]+\.com".to_string(),
        ];
        let regex = compile(&patterns, &LIMITS).unwrap();
        let hits: Vec<usize> = regex
            .find_iter("mail a@b.com ssn 078-05-1120")
            .map(|m| m.pattern().as_usize())
            .collect();
        assert_eq!(hits, vec![1, 0]);
    }
}
