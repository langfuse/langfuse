//! Guardrail regex rules: one ASCII-only regex engine shared by the control
//! plane (WebAssembly) and the gateway (Rust).
//!
//! `\w`, `\d`, `\s`, `\b` and `(?i)` use ASCII semantics; `\p{..}` and the
//! inline `u` flag are rejected. `.`, `\S`, `\W`, `\D` and negated classes like
//! `[^,]` match full UTF-8 characters so match spans always land on char
//! boundaries. Lookaround and backreferences are rejected by the parser.
//!
//! All numeric limits are supplied by the caller to [`validate`] (control
//! plane); no limits are hardcoded in the WebAssembly module or enforced in
//! [`compile`] (gateway).
use regex_automata::{
    meta,
    nfa::thompson::{self, State},
};
use regex_syntax::{
    ast::{
        self, Ast, ClassAscii, ClassAsciiKind, ClassPerlKind, ClassSet, ClassSetItem, Flag,
        FlagsItemKind,
    },
    hir::{self, Hir},
};
use serde::{Deserialize, Serialize};

/// Caller-supplied limits for control-plane validation. Fixed-width so the
/// WebAssembly build (32-bit `usize`) and native builds measure identical sizes.
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub struct Limits {
    pub max_pattern_chars: u32,
    /// Compiled size of one rule, as measured by `compiled_size`.
    pub max_rule_bytes: u32,
    /// Compiled size of all of an organization's rules together.
    pub max_set_bytes: u32,
}

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

/// Rewrites an AST so `regex-syntax` translates it with `unicode(true)` and
/// `utf8(true)` (keeping `.`, `\S`, `\W`, `\D` and `[^...]` on valid UTF-8
/// boundaries) while enforcing ASCII semantics for `\d`, `\w`, `\s`, `\b` and
/// `(?i)` and rejecting `\p{..}` and the inline `u` flag.
struct AsciiNormalizer {
    case_insensitive: bool,
}

impl AsciiNormalizer {
    fn rewrite_ast(&mut self, ast: &mut Ast) -> Result<(), String> {
        match ast {
            Ast::Empty(_) | Ast::Dot(_) => Ok(()),
            Ast::Flags(set) => filter_flags(&mut set.flags, &mut self.case_insensitive),
            Ast::Literal(lit) => {
                if self.case_insensitive && lit.c.is_ascii_alphabetic() {
                    let span = lit.span;
                    let c = lit.c;
                    *ast = Ast::ClassBracketed(Box::new(ast::ClassBracketed {
                        span,
                        negated: false,
                        kind: ClassSet::union(ast::ClassSetUnion {
                            span,
                            items: vec![
                                ClassSetItem::Literal(verbatim_literal(
                                    span,
                                    c.to_ascii_lowercase(),
                                )),
                                ClassSetItem::Literal(verbatim_literal(
                                    span,
                                    c.to_ascii_uppercase(),
                                )),
                            ],
                        }),
                    }));
                }
                Ok(())
            }
            Ast::Assertion(asst) => {
                if is_word_boundary(&asst.kind) {
                    let span = asst.span;
                    let inner = std::mem::replace(ast, Ast::empty(span));
                    *ast = Ast::Group(Box::new(ast::Group {
                        span,
                        kind: ast::GroupKind::NonCapturing(ast::Flags {
                            span,
                            items: vec![
                                ast::FlagsItem {
                                    span,
                                    kind: FlagsItemKind::Negation,
                                },
                                ast::FlagsItem {
                                    span,
                                    kind: FlagsItemKind::Flag(Flag::Unicode),
                                },
                            ],
                        }),
                        ast: Box::new(inner),
                    }));
                }
                Ok(())
            }
            Ast::ClassUnicode(_) => Err(
                r"Unicode character classes (\p{..}) are not allowed: rules are ASCII-only".into(),
            ),
            Ast::ClassPerl(perl) => {
                let span = perl.span;
                let ascii = perl_to_ascii(perl);
                *ast = Ast::ClassBracketed(Box::new(ast::ClassBracketed {
                    span,
                    negated: false,
                    kind: ClassSet::Item(ClassSetItem::Ascii(ascii)),
                }));
                Ok(())
            }
            Ast::ClassBracketed(cb) => self.rewrite_class_set(&mut cb.kind),
            Ast::Repetition(rep) => self.rewrite_ast(&mut rep.ast),
            Ast::Group(group) => {
                let saved = self.case_insensitive;
                if let ast::GroupKind::NonCapturing(ref mut flags) = group.kind {
                    filter_flags(flags, &mut self.case_insensitive)?;
                }
                let result = self.rewrite_ast(&mut group.ast);
                self.case_insensitive = saved;
                result
            }
            Ast::Alternation(alt) => {
                for branch in &mut alt.asts {
                    self.rewrite_ast(branch)?;
                }
                Ok(())
            }
            Ast::Concat(concat) => {
                for item in &mut concat.asts {
                    self.rewrite_ast(item)?;
                }
                Ok(())
            }
        }
    }

    fn rewrite_class_set(&self, set: &mut ClassSet) -> Result<(), String> {
        match set {
            ClassSet::Item(item) => self.rewrite_class_item(item),
            ClassSet::BinaryOp(op) => {
                self.rewrite_class_set(&mut op.lhs)?;
                self.rewrite_class_set(&mut op.rhs)
            }
        }
    }

    fn rewrite_class_item(&self, item: &mut ClassSetItem) -> Result<(), String> {
        match item {
            ClassSetItem::Empty(_) => Ok(()),
            ClassSetItem::Literal(lit) => {
                if self.case_insensitive && lit.c.is_ascii_alphabetic() {
                    let span = lit.span;
                    let c = lit.c;
                    *item = ClassSetItem::Union(ast::ClassSetUnion {
                        span,
                        items: vec![
                            ClassSetItem::Literal(verbatim_literal(span, c.to_ascii_lowercase())),
                            ClassSetItem::Literal(verbatim_literal(span, c.to_ascii_uppercase())),
                        ],
                    });
                }
                Ok(())
            }
            ClassSetItem::Range(range) => {
                if self.case_insensitive
                    && let Some(union) = fold_ascii_range(range)
                {
                    *item = union;
                }
                Ok(())
            }
            ClassSetItem::Ascii(ascii) => {
                if self.case_insensitive
                    && matches!(ascii.kind, ClassAsciiKind::Lower | ClassAsciiKind::Upper)
                {
                    ascii.kind = ClassAsciiKind::Alpha;
                }
                Ok(())
            }
            ClassSetItem::Unicode(_) => Err(
                r"Unicode character classes (\p{..}) are not allowed: rules are ASCII-only".into(),
            ),
            ClassSetItem::Perl(perl) => {
                *item = ClassSetItem::Ascii(perl_to_ascii(perl));
                Ok(())
            }
            ClassSetItem::Bracketed(cb) => self.rewrite_class_set(&mut cb.kind),
            ClassSetItem::Union(union) => {
                for child in &mut union.items {
                    self.rewrite_class_item(child)?;
                }
                Ok(())
            }
        }
    }
}

fn filter_flags(flags: &mut ast::Flags, case_insensitive: &mut bool) -> Result<(), String> {
    let mut positive = Vec::new();
    let mut negative = Vec::new();
    let mut negated = false;
    for item in flags.items.drain(..) {
        match item.kind {
            FlagsItemKind::Negation => negated = true,
            FlagsItemKind::Flag(Flag::Unicode) if !negated => {
                return Err("the `u` flag is not allowed: rules are ASCII-only".into());
            }
            FlagsItemKind::Flag(Flag::Unicode) => {}
            FlagsItemKind::Flag(Flag::CaseInsensitive) => {
                *case_insensitive = !negated;
            }
            FlagsItemKind::Flag(_) => {
                if negated {
                    negative.push(item);
                } else {
                    positive.push(item);
                }
            }
        }
    }
    flags.items = positive;
    if !negative.is_empty() {
        flags.items.push(ast::FlagsItem {
            span: flags.span,
            kind: FlagsItemKind::Negation,
        });
        flags.items.extend(negative);
    }
    Ok(())
}

fn perl_to_ascii(perl: &ast::ClassPerl) -> ClassAscii {
    let kind = match perl.kind {
        ClassPerlKind::Digit => ClassAsciiKind::Digit,
        ClassPerlKind::Space => ClassAsciiKind::Space,
        ClassPerlKind::Word => ClassAsciiKind::Word,
    };
    ClassAscii {
        span: perl.span,
        kind,
        negated: perl.negated,
    }
}

fn is_word_boundary(kind: &ast::AssertionKind) -> bool {
    matches!(
        kind,
        ast::AssertionKind::WordBoundary
            | ast::AssertionKind::NotWordBoundary
            | ast::AssertionKind::WordBoundaryStart
            | ast::AssertionKind::WordBoundaryEnd
            | ast::AssertionKind::WordBoundaryStartAngle
            | ast::AssertionKind::WordBoundaryEndAngle
            | ast::AssertionKind::WordBoundaryStartHalf
            | ast::AssertionKind::WordBoundaryEndHalf
    )
}

fn verbatim_literal(span: ast::Span, c: char) -> ast::Literal {
    ast::Literal {
        span,
        kind: ast::LiteralKind::Verbatim,
        c,
    }
}

fn fold_ascii_range(range: &ast::ClassSetRange) -> Option<ClassSetItem> {
    if range.start.c > range.end.c {
        return None;
    }
    let span = range.span;
    let start = u32::from(range.start.c);
    let end = u32::from(range.end.c);
    let mut folded = Vec::new();
    for (lo, hi, to_other) in [
        (b'a', b'z', u8::to_ascii_uppercase as fn(&u8) -> u8),
        (b'A', b'Z', u8::to_ascii_lowercase as fn(&u8) -> u8),
    ] {
        let s = start.max(u32::from(lo));
        let e = end.min(u32::from(hi));
        if s <= e
            && let (Ok(sb), Ok(eb)) = (u8::try_from(s), u8::try_from(e))
        {
            folded.push(ClassSetItem::Range(ast::ClassSetRange {
                span,
                start: verbatim_literal(span, char::from(to_other(&sb))),
                end: verbatim_literal(span, char::from(to_other(&eb))),
            }));
        }
    }
    if folded.is_empty() {
        return None;
    }
    let mut items = Vec::with_capacity(1 + folded.len());
    items.push(ClassSetItem::Range(range.clone()));
    items.extend(folded);
    Some(ClassSetItem::Union(ast::ClassSetUnion { span, items }))
}

fn parse_to_hir(pattern: &str) -> Result<Hir, String> {
    let mut ast = ast::parse::ParserBuilder::new()
        .build()
        .parse(pattern)
        .map_err(|error| describe(&error))?;
    let mut normalizer = AsciiNormalizer {
        case_insensitive: false,
    };
    normalizer.rewrite_ast(&mut ast)?;
    hir::translate::TranslatorBuilder::new()
        .unicode(true)
        .utf8(true)
        .build()
        .translate(pattern, &ast)
        .map_err(|error| describe(&error))
}

/// The compiled size of `hirs` together: 8 bytes per NFA state and 8 per
/// transition. regex-automata's own size counts allocations, which grow with
/// pointer width, so the same rule could measure differently on wasm32 and x86_64.
fn compiled_size(hirs: &[&Hir], limit: u32) -> Result<u32, String> {
    // OOM ceiling while compiling so a short pattern like `a{99999999}` fails
    // before allocating unbounded memory; kept far above `limit` so wasm32 and
    // x86_64 never disagree near the caller's limit.
    let guard = (limit as usize).saturating_mul(64).max(4 << 20);
    let nfa = thompson::Compiler::new()
        .configure(thompson::Config::new().nfa_size_limit(Some(guard)))
        .build_many_from_hir(hirs)
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

fn check_rule(pattern: &str, limits: &Limits) -> Result<(Hir, u32), String> {
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
    let hir = parse_to_hir(pattern)?;
    if hir.properties().minimum_len() == Some(0) {
        return Err("pattern matches the empty string".into());
    }
    let bytes = within(
        compiled_size(&[&hir], limits.max_rule_bytes)?,
        limits.max_rule_bytes,
        "rule",
    )?;
    Ok((hir, bytes))
}

fn within(bytes: u32, limit: u32, what: &str) -> Result<u32, String> {
    if bytes > limit {
        return Err(format!(
            "{what} compiles to {bytes} bytes, over the limit of {limit}"
        ));
    }
    Ok(bytes)
}

/// Validates an organization's rules in the control plane against `limits`:
/// each rule on its own, then all rules combined.
pub fn validate(patterns: &[String], limits: &Limits) -> Report {
    let mut rules = Vec::with_capacity(patterns.len());
    let mut hirs = Vec::with_capacity(patterns.len());
    let mut all_valid = true;

    for (index, pattern) in patterns.iter().enumerate() {
        match check_rule(pattern, limits) {
            Ok((hir, bytes)) => {
                hirs.push(hir);
                rules.push(RuleResult {
                    index,
                    compiled_bytes: Some(bytes),
                    error: None,
                });
            }
            Err(error) => {
                all_valid = false;
                rules.push(RuleResult {
                    index,
                    compiled_bytes: None,
                    error: Some(error),
                });
            }
        }
    }

    let (set_bytes, set_error) = if all_valid && !hirs.is_empty() {
        let refs: Vec<&Hir> = hirs.iter().collect();
        match compiled_size(&refs, limits.max_set_bytes)
            .and_then(|bytes| within(bytes, limits.max_set_bytes, "rule set"))
        {
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

/// Compiles rules into one multi-pattern regex using the same ASCII-only
/// translation as [`validate`]; each match carries its span and the index of
/// the rule that produced it. Size and length limits are enforced in the
/// control plane via [`validate`], not here.
pub fn compile(patterns: &[String]) -> Result<meta::Regex, String> {
    let hirs: Vec<Hir> = patterns
        .iter()
        .map(|pattern| parse_to_hir(pattern))
        .collect::<Result<_, _>>()?;
    meta::Builder::new()
        .configure(meta::Config::new().nfa_size_limit(None))
        .build_many_from_hir(&hirs)
        .map_err(|error| describe(&error))
}

#[cfg(feature = "wasm")]
mod wasm {
    use wasm_bindgen::prelude::*;

    /// `input`: `{"patterns": [...], "limits": {"max_pattern_chars": ..., "max_rule_bytes": ..., "max_set_bytes": ...}}`.
    /// Returns the [`super::Report`] as JSON.
    #[wasm_bindgen]
    pub fn validate(input: &str) -> String {
        #[derive(serde::Deserialize)]
        struct Input {
            patterns: Vec<String>,
            limits: super::Limits,
        }
        let report = match serde_json::from_str::<Input>(input) {
            Ok(input) => super::validate(&input.patterns, &input.limits),
            Err(error) => super::Report {
                ok: false,
                rules: vec![],
                set_error: Some(format!("invalid input: {error}")),
                set_bytes: None,
            },
        };
        serde_json::to_string(&report).unwrap_or_else(|_| r#"{"ok":false,"rules":[]}"#.into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RFC_LIMITS: Limits = Limits {
        max_pattern_chars: 500,
        max_rule_bytes: 128 * 1024,
        max_set_bytes: 512 * 1024,
    };

    fn error(pattern: &str) -> Option<String> {
        check_rule(pattern, &RFC_LIMITS).err()
    }

    #[test]
    fn accepts_ascii_and_utf8_safe_rules() {
        for pattern in [
            r"\b\d{3}-\d{2}-\d{4}\b",
            r"(?i)\bbearer\s+[A-Za-z0-9._~+/-]{20,}",
            r"(?i-u)abc",
            r"\w{1,500}",
            "(?i)stra\u{df}e",
            r"token=\S+",
            r"password=.+",
            r#""[^"]+""#,
            r"[^\s,]+",
            r"a\Db\Wc",
            r"(?i)[^a]+",
            r"(?i)[a-z]+",
            r"(?i)[[:lower:]]+",
            r"(?i)[[:^lower:]]+",
            r"foo(?i)bar|baz",
        ] {
            assert_eq!(error(pattern), None, "{pattern}");
        }
    }

    #[test]
    fn rejects_unicode_lookaround_backreferences_and_empty_matches() {
        for pattern in [
            r"\p{L}+",
            r"[\p{L}]+",
            r"(?u:\w)+",
            r"(?iu)abc",
            r"foo(?=bar)",
            r"(?<=x)y",
            r"(a)\1",
            "",
            "(?i)",
            "()",
            "(?:)",
            "x?",
            r"\d*",
            r"\b",
            "^$",
            "a|",
        ] {
            assert!(error(pattern).is_some(), "{pattern}");
        }
    }

    #[test]
    fn enforces_ascii_semantics_and_utf8_char_boundaries() {
        // `\S`, `.`, and `[^,]` match full multi-byte UTF-8 characters so match
        // spans stay on char boundaries for slicing/redaction.
        let utf8 = compile(&[
            r"token=\S".to_string(),
            r"a.b".to_string(),
            r"[^,]+".to_string(),
        ])
        .unwrap();
        let text = "token=é";
        let m = utf8.find(text).unwrap();
        assert_eq!(&text[m.start()..m.end()], "token=é");

        let dot = compile(&[r"a.b".to_string()]).unwrap();
        assert!(dot.is_match("aéb"));

        // `\w`, `\d`, `\s`, `\b`, and `(?i)` remain ASCII-only.
        let ascii_classes = compile(&[
            r"\w+".to_string(),
            r"\d+".to_string(),
            r"\s+".to_string(),
            r"(?i)k".to_string(),
        ])
        .unwrap();
        assert!(!ascii_classes.is_match("é"));
        assert!(!ascii_classes.is_match("\u{0660}")); // Arabic-Indic digit 0
        assert!(!ascii_classes.is_match("\u{00A0}")); // NBSP
        assert!(!ascii_classes.is_match("\u{212A}")); // Kelvin sign

        // `(?i)` folds ASCII case even inside negated classes and ranges.
        let case_negated = compile(&[r"(?i)[^a]+".to_string()]).unwrap();
        let m = case_negated.find("xyAz").unwrap();
        assert_eq!(&"xyAz"[m.start()..m.end()], "xy");

        let case_alt = compile(&[r"a(?i)b|c".to_string()]).unwrap();
        assert!(case_alt.is_match("aB"));
        assert!(case_alt.is_match("C"));
    }

    #[test]
    fn enforces_caller_supplied_limits() {
        // Pattern length > 500 chars.
        let too_long = "a".repeat(RFC_LIMITS.max_pattern_chars as usize + 1);
        assert!(validate(&[too_long], &RFC_LIMITS).rules[0].error.is_some());

        // Single rule > 128 KiB compiled.
        let oversized_rule = r"\w{1,500}".repeat(5);
        let report = validate(std::slice::from_ref(&oversized_rule), &RFC_LIMITS);
        assert!(!report.ok);
        assert!(
            report.rules[0]
                .error
                .as_deref()
                .unwrap()
                .contains("over the limit")
        );

        // Org total > 512 KiB compiled (each rule fits under 128 KiB).
        let near_cap_rule = r"\w{1,500}".repeat(4);
        assert!(check_rule(&near_cap_rule, &RFC_LIMITS).is_ok());
        let oversized_set = vec![near_cap_rule; 5];
        let set_report = validate(&oversized_set, &RFC_LIMITS);
        assert!(!set_report.ok);
        assert!(set_report.rules.iter().all(|r| r.error.is_none()));
        assert!(
            set_report
                .set_error
                .as_deref()
                .unwrap()
                .contains("over the limit")
        );

        // Tighter caller-supplied limits reject rules that pass under RFC_LIMITS.
        let tighter = Limits {
            max_pattern_chars: 10,
            max_rule_bytes: 200,
            max_set_bytes: 400,
        };
        assert!(validate(&[r"\b\d{3}-\d{2}-\d{4}\b".to_string()], &RFC_LIMITS).ok);
        assert!(!validate(&[r"\b\d{3}-\d{2}-\d{4}\b".to_string()], &tighter).ok);
    }

    #[test]
    fn gateway_compile_skips_control_plane_limits_but_rejects_unicode() {
        // Limits are enforced in the control plane only, not in the gateway.
        let oversized_rule = r"\w{1,500}".repeat(5);
        assert!(!validate(std::slice::from_ref(&oversized_rule), &RFC_LIMITS).ok);
        assert!(compile(std::slice::from_ref(&oversized_rule)).is_ok());

        // Gateway still rejects Unicode patterns and bad syntax.
        assert!(compile(&[r"(?u:\w)+".to_string()]).is_err());
        assert!(compile(&[r"\p{L}+".to_string()]).is_err());
        assert!(compile(&[r"foo(?=bar)".to_string()]).is_err());
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
            let report = validate(std::slice::from_ref(&case.pattern), &RFC_LIMITS);
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
        assert_eq!(
            validate(&valid, &RFC_LIMITS).set_bytes,
            Some(fixture.set_bytes)
        );
    }

    #[test]
    fn compiled_set_reports_rule_index() {
        let patterns = vec![
            r"\b\d{3}-\d{2}-\d{4}\b".to_string(),
            r"[a-z]+@[a-z]+\.com".to_string(),
        ];
        let regex = compile(&patterns).unwrap();
        let hits: Vec<usize> = regex
            .find_iter("mail a@b.com ssn 078-05-1120")
            .map(|m| m.pattern().as_usize())
            .collect();
        assert_eq!(hits, vec![1, 0]);
    }
}
