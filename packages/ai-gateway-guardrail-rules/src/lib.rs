//! Guardrail regex rules: one ASCII-only regex engine shared by the control
//! plane (WebAssembly) and the gateway (Rust).
//!
//! `\w`, `\d`, `\s`, `\b` and `(?i)` use ASCII semantics; `\p{..}` and the
//! inline `u` flag are rejected. `.`, `\S`, `\W`, `\D` and negated classes like
//! `[^,]` match full UTF-8 characters so match spans always land on char
//! boundaries. Lookaround and backreferences are rejected by the parser.
//!
//! All numeric limits are supplied by the caller to [`validate`] and
//! [`preview`] (control plane); no limits are hardcoded in the WebAssembly
//! module or enforced in [`compile_set`] / [`compile_captures`] (gateway).
use regex_automata::{
    Input,
    nfa::thompson::{self, pikevm::PikeVM},
};
#[cfg(feature = "gateway")]
use regex_automata::{MatchKind, meta, nfa::thompson::WhichCaptures};
use regex_syntax::{
    ast::{
        self, Ast, ClassAscii, ClassAsciiKind, ClassPerlKind, ClassSet, ClassSetItem, Flag,
        FlagsItemKind,
    },
    hir::{self, Hir},
};

/// Caller-supplied compiled-size limits for control-plane validation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "wasm", derive(serde::Deserialize, tsify::Tsify))]
pub struct Limits {
    /// Maximum compiled NFA size of one rule, in bytes.
    pub max_rule_bytes: u32,
    /// Maximum compiled NFA size of all of an organization's rules together, in bytes.
    pub max_set_bytes: u32,
}

#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "wasm", derive(serde::Serialize, tsify::Tsify))]
pub struct RuleResult {
    pub index: usize,
    #[cfg_attr(
        feature = "wasm",
        serde(skip_serializing_if = "Option::is_none"),
        tsify(optional)
    )]
    pub error: Option<String>,
    #[cfg_attr(
        feature = "wasm",
        serde(skip_serializing_if = "Option::is_none"),
        tsify(optional)
    )]
    pub compiled_bytes: Option<u32>,
}

#[derive(Debug)]
#[cfg_attr(feature = "wasm", derive(serde::Serialize, tsify::Tsify))]
pub struct Report {
    pub ok: bool,
    pub rules: Vec<RuleResult>,
    #[cfg_attr(
        feature = "wasm",
        serde(skip_serializing_if = "Option::is_none"),
        tsify(optional)
    )]
    pub set_error: Option<String>,
    #[cfg_attr(
        feature = "wasm",
        serde(skip_serializing_if = "Option::is_none"),
        tsify(optional)
    )]
    pub set_bytes: Option<u32>,
}

/// A matched span in UTF-16 code-unit offsets (JavaScript string indices).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "wasm", derive(serde::Serialize, tsify::Tsify))]
pub struct MatchSpan {
    pub start: usize,
    pub end: usize,
}

/// Result of validating a pattern and matching it against sample text.
#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "wasm", derive(serde::Serialize, tsify::Tsify))]
pub struct PreviewResult {
    pub valid: bool,
    #[cfg_attr(
        feature = "wasm",
        serde(skip_serializing_if = "Option::is_none"),
        tsify(optional)
    )]
    pub error: Option<String>,
    pub matches: Vec<MatchSpan>,
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
                    *ast = Ast::ClassBracketed(Box::new(ast::ClassBracketed {
                        span,
                        negated: false,
                        kind: ClassSet::union(fold_ascii_literal(lit)),
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
                    *item = ClassSetItem::Union(fold_ascii_literal(lit));
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

fn fold_ascii_literal(lit: &ast::Literal) -> ast::ClassSetUnion {
    let span = lit.span;
    ast::ClassSetUnion {
        span,
        items: vec![
            ClassSetItem::Literal(verbatim_literal(span, lit.c.to_ascii_lowercase())),
            ClassSetItem::Literal(verbatim_literal(span, lit.c.to_ascii_uppercase())),
        ],
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

fn compile_bounded_nfa(
    hirs: &[&Hir],
    limit: u32,
    what: &str,
) -> Result<(thompson::NFA, u32), String> {
    let nfa = thompson::Compiler::new()
        .configure(thompson::Config::new().nfa_size_limit(Some(limit as usize)))
        .build_many_from_hir(hirs)
        .map_err(|error| describe(&error))?;
    let bytes = u32::try_from(nfa.memory_usage()).unwrap_or(u32::MAX);
    if bytes > limit {
        return Err(format!(
            "{what} compiles to {bytes} bytes, over the limit of {limit}"
        ));
    }
    Ok((nfa, bytes))
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

fn check_rule(pattern: &str, max_rule_bytes: u32) -> Result<(Hir, thompson::NFA, u32), String> {
    if pattern.is_empty() {
        return Err("pattern is empty".into());
    }
    let hir = parse_to_hir(pattern)?;
    if hir.properties().minimum_len() == Some(0) {
        return Err("pattern matches the empty string".into());
    }
    let (nfa, bytes) = compile_bounded_nfa(&[&hir], max_rule_bytes, "rule")?;
    Ok((hir, nfa, bytes))
}

/// Validates an organization's rules in the control plane against `limits`:
/// each rule on its own, then all rules combined.
pub fn validate(patterns: &[String], limits: &Limits) -> Report {
    let (rules, hirs, all_valid) = check_rules(patterns, limits.max_rule_bytes);
    let (set_bytes, set_error) = if all_valid {
        check_set(&hirs, limits.max_set_bytes)
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

fn check_rules(patterns: &[String], max_rule_bytes: u32) -> (Vec<RuleResult>, Vec<Hir>, bool) {
    let mut rules = Vec::with_capacity(patterns.len());
    let mut hirs = Vec::with_capacity(patterns.len());
    let mut all_valid = true;

    for (index, pattern) in patterns.iter().enumerate() {
        match check_rule(pattern, max_rule_bytes) {
            Ok((hir, _, bytes)) => {
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

    (rules, hirs, all_valid)
}

fn check_set(hirs: &[Hir], max_set_bytes: u32) -> (Option<u32>, Option<String>) {
    if hirs.is_empty() {
        return (None, None);
    }
    let refs: Vec<&Hir> = hirs.iter().collect();
    match compile_bounded_nfa(&refs, max_set_bytes, "rule set") {
        Ok((_, bytes)) => (Some(bytes), None),
        Err(error) => (None, Some(error)),
    }
}

/// Validates `pattern` against `max_rule_bytes` and returns all non-empty
/// matches in `text` as UTF-16 code-unit offsets using linear-time PikeVM.
pub fn preview(pattern: &str, text: &str, max_rule_bytes: u32) -> PreviewResult {
    let nfa = match check_rule(pattern, max_rule_bytes) {
        Ok((_, nfa, _)) => nfa,
        Err(error) => {
            return PreviewResult {
                valid: false,
                error: Some(error),
                matches: Vec::new(),
            };
        }
    };
    if text.is_empty() {
        return PreviewResult {
            valid: true,
            error: None,
            matches: Vec::new(),
        };
    }
    let vm = match PikeVM::new_from_nfa(nfa) {
        Ok(vm) => vm,
        Err(error) => {
            return PreviewResult {
                valid: false,
                error: Some(describe(&error)),
                matches: Vec::new(),
            };
        }
    };
    let mut cache = vm.create_cache();
    let byte_spans: Vec<(usize, usize)> = vm
        .find_iter(&mut cache, Input::new(text.as_bytes()))
        .filter(|m| m.start() < m.end())
        .map(|m| (m.start(), m.end()))
        .collect();
    PreviewResult {
        valid: true,
        error: None,
        matches: byte_spans_to_utf16(text, &byte_spans),
    }
}

fn byte_spans_to_utf16(text: &str, byte_spans: &[(usize, usize)]) -> Vec<MatchSpan> {
    if byte_spans.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(byte_spans.len());
    let mut cursor_byte = 0usize;
    let mut cursor_utf16 = 0usize;
    for &(start_byte, end_byte) in byte_spans {
        if start_byte > cursor_byte {
            cursor_utf16 += text[cursor_byte..start_byte].encode_utf16().count();
            cursor_byte = start_byte;
        }
        let start = cursor_utf16;
        if end_byte > cursor_byte {
            cursor_utf16 += text[cursor_byte..end_byte].encode_utf16().count();
            cursor_byte = end_byte;
        }
        out.push(MatchSpan {
            start,
            end: cursor_utf16,
        });
    }
    out
}

/// Compiles rules into one multi-pattern regex configured for overlapping
/// detection (`MatchKind::All`, no captures) using the same ASCII-only
/// translation as [`validate`]. Size limits are enforced in the control plane
/// via [`validate`], not here.
#[cfg(feature = "gateway")]
pub fn compile_set<S: AsRef<str>>(patterns: &[S]) -> Result<meta::Regex, String> {
    let hirs: Vec<Hir> = patterns
        .iter()
        .map(|pattern| parse_to_hir(pattern.as_ref()))
        .collect::<Result<_, _>>()?;
    meta::Builder::new()
        .configure(
            meta::Config::new()
                .match_kind(MatchKind::All)
                .utf8_empty(false)
                .which_captures(WhichCaptures::None)
                .nfa_size_limit(None),
        )
        .build_many_from_hir(&hirs)
        .map_err(|error| describe(&error))
}

/// Compiles one rule with leftmost-first capture support for redaction span
/// extraction, using the same ASCII-only translation as [`validate`].
#[cfg(feature = "gateway")]
pub fn compile_captures(pattern: &str) -> Result<meta::Regex, String> {
    let hir = parse_to_hir(pattern)?;
    meta::Builder::new()
        .configure(
            meta::Config::new()
                .match_kind(MatchKind::LeftmostFirst)
                .utf8_empty(false)
                .which_captures(WhichCaptures::All)
                .nfa_size_limit(None),
        )
        .build_from_hir(&hir)
        .map_err(|error| describe(&error))
}

#[cfg(feature = "wasm")]
mod wasm {
    use tsify::{Ts, Tsify};
    use wasm_bindgen::prelude::*;

    /// Validates an organization's guardrail patterns against caller-supplied limits.
    #[wasm_bindgen]
    pub fn validate(
        patterns: Vec<String>,
        limits: Ts<super::Limits>,
    ) -> Result<Ts<super::Report>, JsError> {
        let limits = limits.to_rust()?;
        Ok(super::validate(&patterns, &limits).into_ts()?)
    }

    /// Validates a single pattern and returns UTF-16 match spans against `text`.
    #[wasm_bindgen]
    pub fn preview(
        pattern: String,
        text: String,
        max_rule_bytes: u32,
    ) -> Result<Ts<super::PreviewResult>, JsError> {
        Ok(super::preview(&pattern, &text, max_rule_bytes).into_ts()?)
    }
}

#[cfg(test)]
mod tests {
    use regex_automata::PatternSet;

    use super::*;

    const RFC_LIMITS: Limits = Limits {
        max_rule_bytes: 128 * 1024,
        max_set_bytes: 512 * 1024,
    };

    fn error(pattern: &str) -> Option<String> {
        check_rule(pattern, RFC_LIMITS.max_rule_bytes).err()
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
            r"\Bfoo",
            r"\d\B\d",
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
        let utf8 = compile_captures(r"token=\S").unwrap();
        let text = "token=é";
        let m = utf8.find(text).unwrap();
        assert_eq!(&text[m.start()..m.end()], "token=é");

        let dot = compile_captures(r"a.b").unwrap();
        assert!(dot.is_match("aéb"));

        // `\w`, `\d`, `\s`, `\b`, and `(?i)` remain ASCII-only.
        let ascii_classes = compile_set(&[r"\w+", r"\d+", r"\s+", r"(?i)k"]).unwrap();
        assert!(!ascii_classes.is_match("é"));
        assert!(!ascii_classes.is_match("\u{0660}")); // Arabic-Indic digit 0
        assert!(!ascii_classes.is_match("\u{00A0}")); // NBSP
        assert!(!ascii_classes.is_match("\u{212A}")); // Kelvin sign

        // `(?i)` folds ASCII case even inside negated classes and ranges.
        let case_negated = compile_captures(r"(?i)[^a]+").unwrap();
        let m = case_negated.find("xyAz").unwrap();
        assert_eq!(&"xyAz"[m.start()..m.end()], "xy");

        let case_alt = compile_captures(r"a(?i)b|c").unwrap();
        assert!(case_alt.is_match("aB"));
        assert!(case_alt.is_match("C"));

        // `\B` uses ASCII word-boundary semantics without breaking UTF-8 matching.
        let not_word_boundary = compile_captures(r"\Bfoo").unwrap();
        assert!(not_word_boundary.is_match("afoo"));
        assert!(!not_word_boundary.is_match("éfoo"));
    }

    #[test]
    fn enforces_caller_supplied_limits() {
        // Single rule > 128 KiB compiled.
        let oversized_rule = r"\w{1,500}".repeat(5);
        let report = validate(std::slice::from_ref(&oversized_rule), &RFC_LIMITS);
        assert!(!report.ok);
        assert!(report.rules[0].error.is_some());

        // Org total > 512 KiB compiled (each rule fits under 128 KiB).
        let medium_rule = r"\w{1,250}".to_string();
        let (_, _, medium_bytes) = check_rule(&medium_rule, RFC_LIMITS.max_rule_bytes).unwrap();
        let count = (RFC_LIMITS.max_set_bytes / medium_bytes) as usize + 2;
        let oversized_set = vec![medium_rule; count];
        let set_report = validate(&oversized_set, &RFC_LIMITS);
        assert!(!set_report.ok);
        assert!(set_report.rules.iter().all(|r| r.error.is_none()));
        assert!(set_report.set_error.is_some());

        // Tighter caller-supplied limits reject rules that pass under RFC_LIMITS.
        let ssn = vec![r"\b\d{3}-\d{2}-\d{4}\b".to_string()];
        let ok_report = validate(&ssn, &RFC_LIMITS);
        assert!(ok_report.ok);
        let ssn_bytes = ok_report.rules[0].compiled_bytes.unwrap();
        let tighter_rule = Limits {
            max_rule_bytes: ssn_bytes - 1,
            ..RFC_LIMITS
        };
        assert!(!validate(&ssn, &tighter_rule).ok);
        let tighter_set = Limits {
            max_set_bytes: ssn_bytes - 1,
            ..RFC_LIMITS
        };
        assert!(!validate(&ssn, &tighter_set).ok);
    }

    #[test]
    fn gateway_compile_skips_control_plane_limits_but_rejects_unicode() {
        // Limits are enforced in the control plane only, not in the gateway.
        let oversized_rule = r"\w{1,500}".repeat(5);
        assert!(!validate(std::slice::from_ref(&oversized_rule), &RFC_LIMITS).ok);
        assert!(compile_set(std::slice::from_ref(&oversized_rule)).is_ok());
        assert!(compile_captures(&oversized_rule).is_ok());

        // Gateway still rejects Unicode patterns and bad syntax.
        assert!(compile_set(&[r"(?u:\w)+"]).is_err());
        assert!(compile_set(&[r"\p{L}+"]).is_err());
        assert!(compile_set(&[r"foo(?=bar)"]).is_err());
        assert!(compile_captures(r"(?u:\w)+").is_err());
    }

    #[test]
    fn preview_returns_utf16_match_spans_and_validation_errors() {
        // "😀" is 4 UTF-8 bytes and 2 UTF-16 code units, so "ORD-123456" starts at UTF-16 index 3.
        let res = preview(
            r"ORD-\d{6}",
            "😀 ORD-123456 and ORD-999999",
            RFC_LIMITS.max_rule_bytes,
        );
        assert_eq!(
            res,
            PreviewResult {
                valid: true,
                error: None,
                matches: vec![
                    MatchSpan { start: 3, end: 13 },
                    MatchSpan { start: 18, end: 28 },
                ],
            }
        );

        let invalid = preview(r"(?u:\w)+", "abc", RFC_LIMITS.max_rule_bytes);
        assert!(!invalid.valid);
        assert!(invalid.error.is_some());
        assert!(invalid.matches.is_empty());
    }

    #[test]
    fn compiled_set_reports_overlapping_matches() {
        let regex = compile_set(&[r"\b\d{3}-\d{2}-\d{4}\b", r"[a-z]+@[a-z]+\.com"]).unwrap();
        let mut found = PatternSet::new(regex.pattern_len());
        regex.which_overlapping_matches(&Input::new(b"mail a@b.com ssn 078-05-1120"), &mut found);
        let hits: Vec<usize> = found.iter().map(|id| id.as_usize()).collect();
        assert_eq!(hits, vec![0, 1]);
    }
}
