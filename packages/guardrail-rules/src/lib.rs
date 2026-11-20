//! Guardrail regex rules: one validator shared by the gateway (Rust) and the
//! control plane (WebAssembly).
//!
//! Rules are ASCII-only: `\w`, `\d`, `\s`, `\b` and `(?i)` follow ASCII rules,
//! `\p{..}` and the inline `u` flag are rejected. Lookaround and backreferences
//! are rejected by the parser. Each rule and the combined rule set must fit a
//! compiled-size limit, which bounds search time (linear in compiled size times
//! input length).
use regex_automata::{meta, util::syntax};
use regex_syntax::ast::{self, Ast, Flag, FlagsItemKind, Visitor};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
#[serde(default)]
pub struct Limits {
    pub max_rules: usize,
    pub max_pattern_chars: usize,
    pub max_rule_bytes: usize,
    pub max_set_bytes: usize,
    pub nest_limit: u32,
}

impl Default for Limits {
    fn default() -> Self {
        Self {
            max_rules: 64,
            max_pattern_chars: 1_000,
            max_rule_bytes: 1 << 20,
            max_set_bytes: 4 << 20,
            nest_limit: 100,
        }
    }
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct RuleResult {
    pub index: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Report {
    pub ok: bool,
    pub rules: Vec<RuleResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub set_error: Option<String>,
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

fn builder(limits: &Limits, nfa_bytes: usize) -> meta::Builder {
    let mut builder = meta::Builder::new();
    builder
        .syntax(syntax_config(limits))
        .configure(meta::Config::new().nfa_size_limit(Some(nfa_bytes)));
    builder
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

fn check_rule(pattern: &str, limits: &Limits) -> Result<(), String> {
    if pattern.is_empty() {
        return Err("pattern is empty".into());
    }
    if pattern.chars().count() > limits.max_pattern_chars {
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
    builder(limits, limits.max_rule_bytes)
        .build(pattern)
        .map(|_| ())
        .map_err(|error| describe(&error))
}

/// Validates a project's rules: each rule on its own, then all rules combined.
pub fn validate(patterns: &[String], limits: &Limits) -> Report {
    let mut rules: Vec<RuleResult> = patterns
        .iter()
        .enumerate()
        .map(|(index, pattern)| RuleResult {
            index,
            error: check_rule(pattern, limits).err(),
        })
        .collect();
    let mut set_error = None;
    if patterns.len() > limits.max_rules {
        set_error = Some(format!(
            "{} rules exceed the limit of {}",
            patterns.len(),
            limits.max_rules
        ));
    } else if rules.iter().all(|rule| rule.error.is_none()) {
        set_error = compile(patterns, limits).err();
    }
    if patterns.is_empty() {
        rules.clear();
    }
    let ok = set_error.is_none() && rules.iter().all(|rule| rule.error.is_none());
    Report {
        ok,
        rules,
        set_error,
    }
}

/// Compiles all rules into one multi-pattern regex; each match carries its
/// span and the index of the rule that produced it. The gateway calls this when
/// it loads a project's rules, so the control plane and gateway apply identical checks.
pub fn compile(patterns: &[String], limits: &Limits) -> Result<meta::Regex, String> {
    builder(limits, limits.max_set_bytes)
        .build_many(patterns)
        .map_err(|error| describe(&error))
}

#[cfg(feature = "wasm")]
mod wasm {
    use wasm_bindgen::prelude::*;

    /// `input`: `{"patterns": [...], "limits": {...}}` (limits optional).
    /// Returns the [`super::Report`] as JSON.
    #[wasm_bindgen]
    pub fn validate(input: &str) -> String {
        #[derive(serde::Deserialize)]
        struct Input {
            patterns: Vec<String>,
            #[serde(default)]
            limits: super::Limits,
        }
        let report = match serde_json::from_str::<Input>(input) {
            Ok(input) => super::validate(&input.patterns, &input.limits),
            Err(error) => super::Report {
                ok: false,
                rules: vec![],
                set_error: Some(format!("invalid input: {error}")),
            },
        };
        serde_json::to_string(&report).unwrap_or_else(|_| r#"{"ok":false,"rules":[]}"#.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn error(pattern: &str) -> Option<String> {
        check_rule(pattern, &Limits::default()).err()
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
            ..Limits::default()
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
                ..Limits::default()
            },
        );
        assert!(!report.ok);
        assert!(report.set_error.unwrap().contains("exceed"));
    }

    #[test]
    fn compiled_set_reports_rule_index() {
        let patterns = vec![
            r"\b\d{3}-\d{2}-\d{4}\b".to_string(),
            r"[a-z]+@[a-z]+\.com".to_string(),
        ];
        let regex = compile(&patterns, &Limits::default()).unwrap();
        let hits: Vec<usize> = regex
            .find_iter("mail a@b.com ssn 078-05-1120")
            .map(|m| m.pattern().as_usize())
            .collect();
        assert_eq!(hits, vec![1, 0]);
    }
}
