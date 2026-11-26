//! Guardrail regex rules: one ASCII-only regex engine shared by the control
//! plane (WebAssembly) and the gateway (Rust).
//!
//! `\w`, `\d`, `\s`, `\b` and `(?i)` use ASCII semantics; `\p{..}` and the
//! inline `u` flag are rejected. `.`, `\S`, `\W`, `\D` and negated classes like
//! `[^,]` match full UTF-8 characters so match spans always land on char
//! boundaries. Lookaround and backreferences are rejected by the parser.
//!
//! All size limits are supplied by the caller to [`validate`] and [`preview`]
//! (control plane); no limits are hardcoded in the WebAssembly module or
//! enforced in [`compile_set`] / [`compile_captures`] (gateway).
use regex_automata::{
    Input, MatchKind,
    hybrid::{dfa as hybrid_dfa, regex as hybrid_regex},
    nfa::thompson::{self, pikevm::PikeVM},
};
#[cfg(feature = "gateway")]
use regex_automata::{meta, nfa::thompson::WhichCaptures};
use regex_syntax::{
    ast::{
        self, Ast, ClassAscii, ClassAsciiKind, ClassPerlKind, ClassSet, ClassSetItem, Flag,
        FlagsItemKind,
    },
    hir::{self, Hir},
};

/// Machine-readable reason a guardrail pattern or rule set failed validation.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(feature = "wasm", derive(serde::Serialize, tsify::Tsify))]
#[cfg_attr(feature = "wasm", serde(rename_all = "snake_case"))]
pub enum ValidationErrorCode {
    EmptyPattern,
    MatchesEmptyString,
    UnicodeNotAllowed,
    UnsupportedLookaround,
    UnsupportedBackreference,
    SyntaxError,
    SizeLimitExceeded,
}

#[derive(Debug, PartialEq, Eq)]
#[cfg_attr(feature = "wasm", derive(serde::Serialize, tsify::Tsify))]
pub struct ValidationError {
    pub code: ValidationErrorCode,
    pub message: String,
}

impl ValidationError {
    fn new(code: ValidationErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
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
    pub error: Option<ValidationError>,
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
    pub set_error: Option<ValidationError>,
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
    pub error: Option<ValidationError>,
    pub matches: Vec<MatchSpan>,
    /// True when preview stopped early to stay within the per-call scan budget.
    pub truncated: bool,
}

/// Rewrites an AST so `regex-syntax` translates it with `unicode(true)` and
/// `utf8(true)` (keeping `.`, `\S`, `\W`, `\D` and `[^...]` on valid UTF-8
/// boundaries) while enforcing ASCII semantics for `\d`, `\w`, `\s`, `\b` and
/// `(?i)` and rejecting `\p{..}` and the inline `u` flag.
struct AsciiNormalizer {
    case_insensitive: bool,
}

impl AsciiNormalizer {
    fn rewrite_ast(&mut self, ast: &mut Ast) -> Result<(), ValidationError> {
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
            Ast::ClassUnicode(_) => Err(ValidationError::new(
                ValidationErrorCode::UnicodeNotAllowed,
                r"Unicode character classes (\p{..}) are not supported; rules use ASCII mode.",
            )),
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

    fn rewrite_class_set(&self, set: &mut ClassSet) -> Result<(), ValidationError> {
        match set {
            ClassSet::Item(item) => self.rewrite_class_item(item),
            ClassSet::BinaryOp(op) => {
                self.rewrite_class_set(&mut op.lhs)?;
                self.rewrite_class_set(&mut op.rhs)
            }
        }
    }

    fn rewrite_class_item(&self, item: &mut ClassSetItem) -> Result<(), ValidationError> {
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
            ClassSetItem::Unicode(_) => Err(ValidationError::new(
                ValidationErrorCode::UnicodeNotAllowed,
                r"Unicode character classes (\p{..}) are not supported; rules use ASCII mode.",
            )),
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

fn filter_flags(
    flags: &mut ast::Flags,
    case_insensitive: &mut bool,
) -> Result<(), ValidationError> {
    let mut positive = Vec::new();
    let mut negative = Vec::new();
    let mut negated = false;
    for item in flags.items.drain(..) {
        match item.kind {
            FlagsItemKind::Negation => negated = true,
            FlagsItemKind::Flag(Flag::Unicode) if !negated => {
                return Err(ValidationError::new(
                    ValidationErrorCode::UnicodeNotAllowed,
                    "The `u` flag is not supported; rules use ASCII mode.",
                ));
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

fn parse_to_hir(pattern: &str) -> Result<Hir, ValidationError> {
    let mut ast = ast::parse::ParserBuilder::new()
        .build()
        .parse(pattern)
        .map_err(|error| match error.kind() {
            ast::ErrorKind::UnsupportedLookAround => ValidationError::new(
                ValidationErrorCode::UnsupportedLookaround,
                "Look-ahead and look-behind are not supported.",
            ),
            ast::ErrorKind::UnsupportedBackreference => ValidationError::new(
                ValidationErrorCode::UnsupportedBackreference,
                "Backreferences are not supported.",
            ),
            kind => ValidationError::new(
                ValidationErrorCode::SyntaxError,
                sentence_case(&kind.to_string()),
            ),
        })?;
    let mut normalizer = AsciiNormalizer {
        case_insensitive: false,
    };
    normalizer.rewrite_ast(&mut ast)?;
    hir::translate::TranslatorBuilder::new()
        .unicode(true)
        .utf8(true)
        .build()
        .translate(pattern, &ast)
        .map_err(|error| {
            ValidationError::new(
                ValidationErrorCode::SyntaxError,
                sentence_case(&error.kind().to_string()),
            )
        })
}

fn compile_bounded_nfa(
    hirs: &[&Hir],
    max_bytes: u32,
) -> Result<(thompson::NFA, u32), ValidationError> {
    let nfa = thompson::Compiler::new()
        .configure(thompson::Config::new().nfa_size_limit(Some(max_bytes as usize)))
        .build_many_from_hir(hirs)
        .map_err(|error| {
            let code = if error.size_limit().is_some() {
                ValidationErrorCode::SizeLimitExceeded
            } else {
                ValidationErrorCode::SyntaxError
            };
            ValidationError::new(code, describe(&error))
        })?;
    let bytes = u32::try_from(nfa.memory_usage()).unwrap_or(u32::MAX);
    if bytes > max_bytes {
        return Err(ValidationError::new(
            ValidationErrorCode::SizeLimitExceeded,
            format!("Compiled size {bytes} bytes exceeds limit of {max_bytes}."),
        ));
    }
    Ok((nfa, bytes))
}

/// The most specific message in an error's source chain, formatted as one sentence.
fn describe(error: &dyn std::error::Error) -> String {
    let mut innermost = error;
    while let Some(source) = innermost.source() {
        innermost = source;
    }
    let text = innermost.to_string();
    let line = text
        .lines()
        .rev()
        .find(|line| !line.trim().is_empty())
        .unwrap_or(&text)
        .trim();
    let stripped = line.strip_prefix("error:").unwrap_or(line);
    sentence_case(stripped)
}

fn sentence_case(text: &str) -> String {
    let trimmed = text.trim();
    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else {
        return String::new();
    };
    let mut out = String::with_capacity(trimmed.len() + 1);
    for ch in first.to_uppercase() {
        out.push(ch);
    }
    out.push_str(chars.as_str());
    if !out.ends_with('.') {
        out.push('.');
    }
    out
}

fn check_pattern(pattern: &str) -> Result<Hir, ValidationError> {
    if pattern.is_empty() {
        return Err(ValidationError::new(
            ValidationErrorCode::EmptyPattern,
            "Pattern is empty.",
        ));
    }
    let hir = parse_to_hir(pattern)?;
    if hir.properties().minimum_len() == Some(0) {
        return Err(ValidationError::new(
            ValidationErrorCode::MatchesEmptyString,
            "Pattern matches the empty string.",
        ));
    }
    Ok(hir)
}

/// Validates patterns in the control plane: parses and checks each pattern
/// (ASCII-only, no lookaround/backreferences, non-empty), then verifies the
/// combined Thompson NFA fits within `max_bytes`.
pub fn validate(patterns: &[String], max_bytes: u32) -> Report {
    let (rules, hirs, all_valid) = check_rules(patterns);
    let (set_bytes, set_error) = if all_valid {
        check_set(&hirs, max_bytes)
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

fn check_rules(patterns: &[String]) -> (Vec<RuleResult>, Vec<Hir>, bool) {
    let mut rules = Vec::with_capacity(patterns.len());
    let mut hirs = Vec::with_capacity(patterns.len());
    let mut all_valid = true;

    for (index, pattern) in patterns.iter().enumerate() {
        match check_pattern(pattern) {
            Ok(hir) => {
                hirs.push(hir);
                rules.push(RuleResult { index, error: None });
            }
            Err(error) => {
                all_valid = false;
                rules.push(RuleResult {
                    index,
                    error: Some(error),
                });
            }
        }
    }

    (rules, hirs, all_valid)
}

fn check_set(hirs: &[Hir], max_bytes: u32) -> (Option<u32>, Option<ValidationError>) {
    if hirs.is_empty() {
        return (None, None);
    }
    let refs: Vec<&Hir> = hirs.iter().collect();
    match compile_bounded_nfa(&refs, max_bytes) {
        Ok((_, bytes)) => (Some(bytes), None),
        Err(error) => (None, Some(error)),
    }
}

const MAX_PREVIEW_MATCHES: usize = 200;
const MAX_PREVIEW_SCAN_BYTES: usize = 512 * 1024;
const PREVIEW_DFA_CACHE_CAPACITY: usize = 1024 * 1024;
const MAX_PREVIEW_PIKEVM_STEPS: usize = 1_000_000;

/// Validates `pattern` against `max_bytes` and returns non-empty matches in
/// `text` as UTF-16 code-unit offsets.
///
/// Uses a lazy DFA with a bounded per-call scan budget (and a bounded PikeVM
/// fallback if the DFA cache thrashes) so pathological alternation patterns
/// cannot turn multi-match iteration into quadratic work on the caller's thread.
pub fn preview(pattern: &str, text: &str, max_bytes: u32) -> PreviewResult {
    let (hir, fwd_nfa) = match check_pattern(pattern).and_then(|hir| {
        let (nfa, _) = compile_bounded_nfa(&[&hir], max_bytes)?;
        Ok((hir, nfa))
    }) {
        Ok(compiled) => compiled,
        Err(error) => {
            return PreviewResult {
                valid: false,
                error: Some(error),
                matches: Vec::new(),
                truncated: false,
            };
        }
    };
    if text.is_empty() {
        return PreviewResult {
            valid: true,
            error: None,
            matches: Vec::new(),
            truncated: false,
        };
    }

    let (byte_spans, truncated) = collect_bounded_matches(&hir, fwd_nfa, text, max_bytes);
    PreviewResult {
        valid: true,
        error: None,
        matches: byte_spans_to_utf16(text, &byte_spans),
        truncated,
    }
}

fn build_preview_hybrid(hir: &Hir, max_bytes: u32) -> Option<hybrid_regex::Regex> {
    let limit = Some(max_bytes as usize);
    let fwd_nfa = thompson::Compiler::new()
        .configure(
            thompson::Config::new()
                .which_captures(thompson::WhichCaptures::None)
                .nfa_size_limit(limit),
        )
        .build_from_hir(hir)
        .ok()?;
    let rev_nfa = thompson::Compiler::new()
        .configure(
            thompson::Config::new()
                .reverse(true)
                .which_captures(thompson::WhichCaptures::None)
                .nfa_size_limit(limit),
        )
        .build_from_hir(hir)
        .ok()?;
    let fwd_dfa_config = hybrid_dfa::Config::new()
        .cache_capacity(PREVIEW_DFA_CACHE_CAPACITY)
        .skip_cache_capacity_check(true)
        .minimum_cache_clear_count(Some(2))
        .minimum_bytes_per_state(Some(10));
    let rev_dfa_config = fwd_dfa_config
        .clone()
        .match_kind(MatchKind::All)
        .prefilter(None)
        .specialize_start_states(false);
    let fwd_dfa = hybrid_dfa::Builder::new()
        .configure(fwd_dfa_config)
        .build_from_nfa(fwd_nfa)
        .ok()?;
    let rev_dfa = hybrid_dfa::Builder::new()
        .configure(rev_dfa_config)
        .build_from_nfa(rev_nfa)
        .ok()?;
    Some(hybrid_regex::Builder::new().build_from_dfas(fwd_dfa, rev_dfa))
}

fn collect_bounded_matches(
    hir: &Hir,
    fwd_nfa: thompson::NFA,
    text: &str,
    max_bytes: u32,
) -> (Vec<(usize, usize)>, bool) {
    let bytes = text.as_bytes();
    let nfa_states = fwd_nfa.states().len().max(1);
    let hybrid = build_preview_hybrid(hir, max_bytes);
    let mut hybrid_cache = hybrid.as_ref().map(hybrid_regex::Regex::create_cache);
    let mut pikevm: Option<(PikeVM, regex_automata::nfa::thompson::pikevm::Cache)> = None;

    let mut spans = Vec::new();
    let mut cursor = 0usize;
    let mut scanned_bytes = 0usize;
    let mut pikevm_steps = 0usize;
    let mut use_hybrid = hybrid.is_some();

    while cursor < bytes.len() {
        let remaining = bytes.len() - cursor;
        if spans.len() >= MAX_PREVIEW_MATCHES {
            return (spans, true);
        }
        if !spans.is_empty() && scanned_bytes.saturating_add(remaining) > MAX_PREVIEW_SCAN_BYTES {
            return (spans, true);
        }

        let input = Input::new(bytes).range(cursor..);
        let found = if use_hybrid {
            let re = hybrid.as_ref().expect("hybrid present when use_hybrid");
            let cache = hybrid_cache
                .as_mut()
                .expect("cache present when use_hybrid");
            match re.try_search(cache, &input) {
                Ok(found) => {
                    scanned_bytes = scanned_bytes.saturating_add(remaining);
                    found
                }
                Err(_) => {
                    use_hybrid = false;
                    continue;
                }
            }
        } else {
            let next_steps = pikevm_steps.saturating_add(nfa_states.saturating_mul(remaining));
            if next_steps > MAX_PREVIEW_PIKEVM_STEPS {
                return (spans, true);
            }
            pikevm_steps = next_steps;
            let (vm, cache) = match pikevm.as_mut() {
                Some(pair) => pair,
                None => match PikeVM::new_from_nfa(fwd_nfa.clone()) {
                    Ok(vm) => {
                        let cache = vm.create_cache();
                        pikevm.insert((vm, cache))
                    }
                    Err(_) => return (spans, true),
                },
            };
            vm.find(cache, input)
        };

        let Some(matched) = found else {
            break;
        };
        if matched.start() < matched.end() {
            spans.push((matched.start(), matched.end()));
            cursor = matched.end();
        } else {
            // Defense-in-depth: empty matches are rejected at validation time,
            // but advance by one UTF-8 character so the loop always makes progress.
            let next_char = text[cursor..].chars().next().map_or(1, char::len_utf8);
            cursor = cursor.saturating_add(next_char);
        }
    }

    (spans, false)
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
        .map(|pattern| check_pattern(pattern.as_ref()).map_err(|error| error.message))
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

/// Compiles one rule with leftmost-first capture support for span extraction,
/// using the same ASCII-only translation as [`validate`].
#[cfg(feature = "gateway")]
pub fn compile_captures(pattern: &str) -> Result<meta::Regex, String> {
    let hir = check_pattern(pattern).map_err(|error| error.message)?;
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

/// Compiles rules into one multi-pattern regex with leftmost-first capture
/// support for single-pass detection and redaction span extraction, using the
/// same ASCII-only translation as [`validate`]. Size limits are enforced in
/// the control plane via [`validate`], not here.
#[cfg(feature = "gateway")]
pub fn compile_captures_set<S: AsRef<str>>(patterns: &[S]) -> Result<meta::Regex, String> {
    let hirs: Vec<Hir> = patterns
        .iter()
        .map(|pattern| check_pattern(pattern.as_ref()).map_err(|error| error.message))
        .collect::<Result<_, _>>()?;
    meta::Builder::new()
        .configure(
            meta::Config::new()
                .match_kind(MatchKind::LeftmostFirst)
                .utf8_empty(false)
                .which_captures(WhichCaptures::All)
                .nfa_size_limit(None),
        )
        .build_many_from_hir(&hirs)
        .map_err(|error| describe(&error))
}

#[cfg(feature = "wasm")]
mod wasm {
    use tsify::{Ts, Tsify};
    use wasm_bindgen::prelude::*;

    /// Validates guardrail patterns against a combined compiled NFA limit `max_bytes`.
    #[wasm_bindgen]
    pub fn validate(patterns: Vec<String>, max_bytes: u32) -> Result<Ts<super::Report>, JsError> {
        Ok(super::validate(&patterns, max_bytes).into_ts()?)
    }

    /// Validates a single pattern and returns UTF-16 match spans against `text`.
    #[wasm_bindgen]
    pub fn preview(
        pattern: String,
        text: String,
        max_bytes: u32,
    ) -> Result<Ts<super::PreviewResult>, JsError> {
        Ok(super::preview(&pattern, &text, max_bytes).into_ts()?)
    }
}

#[cfg(test)]
mod tests {
    use regex_automata::PatternSet;

    use super::*;

    const RULE_LIMIT_BYTES: u32 = 128 * 1024;
    const ORG_LIMIT_BYTES: u32 = 512 * 1024;

    fn error(pattern: &str) -> Option<ValidationError> {
        let report = validate(&[pattern.to_string()], RULE_LIMIT_BYTES);
        report
            .rules
            .into_iter()
            .find_map(|rule| rule.error)
            .or(report.set_error)
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
    fn rejects_unicode_lookaround_backreferences_and_empty_matches_with_typed_codes() {
        for (pattern, expected_code) in [
            (r"\p{L}+", ValidationErrorCode::UnicodeNotAllowed),
            (r"[\p{L}]+", ValidationErrorCode::UnicodeNotAllowed),
            (r"(?u:\w)+", ValidationErrorCode::UnicodeNotAllowed),
            (r"(?iu)abc", ValidationErrorCode::UnicodeNotAllowed),
            (r"foo(?=bar)", ValidationErrorCode::UnsupportedLookaround),
            (r"(?<=x)y", ValidationErrorCode::UnsupportedLookaround),
            (r"(a)\1", ValidationErrorCode::UnsupportedBackreference),
            ("(unclosed", ValidationErrorCode::SyntaxError),
            ("", ValidationErrorCode::EmptyPattern),
            ("(?i)", ValidationErrorCode::MatchesEmptyString),
            ("()", ValidationErrorCode::MatchesEmptyString),
            ("(?:)", ValidationErrorCode::MatchesEmptyString),
            ("x?", ValidationErrorCode::MatchesEmptyString),
            (r"\d*", ValidationErrorCode::MatchesEmptyString),
            (r"\b", ValidationErrorCode::MatchesEmptyString),
            ("^$", ValidationErrorCode::MatchesEmptyString),
            ("a|", ValidationErrorCode::MatchesEmptyString),
        ] {
            let err = error(pattern).unwrap_or_else(|| panic!("expected error for {pattern}"));
            assert_eq!(err.code, expected_code, "{pattern}");
        }
    }

    #[test]
    fn enforces_ascii_semantics_and_utf8_char_boundaries() {
        // `\S`, `.`, and `[^,]` match full multi-byte UTF-8 characters so match
        // spans stay on char boundaries for slicing.
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
    fn enforces_caller_supplied_max_bytes() {
        // Single rule > 128 KiB compiled.
        let oversized_rule = r"\w{1,500}".repeat(5);
        let report = validate(std::slice::from_ref(&oversized_rule), RULE_LIMIT_BYTES);
        assert!(!report.ok);
        assert_eq!(
            report.set_error.as_ref().map(|err| err.code),
            Some(ValidationErrorCode::SizeLimitExceeded)
        );

        // Combined set > 512 KiB compiled (each rule fits under 128 KiB).
        let medium_rule = r"\w{1,250}".to_string();
        let medium_bytes = validate(std::slice::from_ref(&medium_rule), RULE_LIMIT_BYTES)
            .set_bytes
            .unwrap();
        let count = (ORG_LIMIT_BYTES / medium_bytes) as usize + 2;
        let oversized_set = vec![medium_rule; count];
        let set_report = validate(&oversized_set, ORG_LIMIT_BYTES);
        assert!(!set_report.ok);
        assert!(set_report.rules.iter().all(|r| r.error.is_none()));
        assert_eq!(
            set_report.set_error.as_ref().map(|err| err.code),
            Some(ValidationErrorCode::SizeLimitExceeded)
        );

        // Tighter caller-supplied limit rejects a rule that passes under RULE_LIMIT_BYTES.
        let ssn = vec![r"\b\d{3}-\d{2}-\d{4}\b".to_string()];
        let ok_report = validate(&ssn, RULE_LIMIT_BYTES);
        assert!(ok_report.ok);
        let ssn_bytes = ok_report.set_bytes.unwrap();
        assert_eq!(
            validate(&ssn, ssn_bytes - 1)
                .set_error
                .as_ref()
                .map(|err| err.code),
            Some(ValidationErrorCode::SizeLimitExceeded)
        );
    }

    #[test]
    fn gateway_compile_skips_control_plane_limits_but_rejects_unicode() {
        // Limits are enforced in the control plane only, not in the gateway.
        let oversized_rule = r"\w{1,500}".repeat(5);
        assert!(!validate(std::slice::from_ref(&oversized_rule), RULE_LIMIT_BYTES).ok);
        assert!(compile_set(std::slice::from_ref(&oversized_rule)).is_ok());
        assert!(compile_captures(&oversized_rule).is_ok());

        // Gateway still rejects Unicode patterns, bad syntax, and empty-matching rules.
        assert!(compile_set(&[r"(?u:\w)+"]).is_err());
        assert!(compile_set(&[r"\p{L}+"]).is_err());
        assert!(compile_set(&[r"foo(?=bar)"]).is_err());
        assert!(compile_set(&[""]).is_err());
        assert!(compile_set(&["x?"]).is_err());
        assert!(compile_set(&[".*"]).is_err());
        assert!(compile_captures(r"(?u:\w)+").is_err());
        assert!(compile_captures("a|").is_err());
    }

    #[test]
    fn preview_returns_utf16_match_spans_and_validation_errors() {
        // "😀" is 4 UTF-8 bytes and 2 UTF-16 code units, so "ORD-123456" starts at UTF-16 index 3.
        let res = preview(
            r"ORD-\d{6}",
            "😀 ORD-123456 and ORD-999999",
            RULE_LIMIT_BYTES,
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
                truncated: false,
            }
        );

        let invalid = preview(r"(?u:\w)+", "abc", RULE_LIMIT_BYTES);
        assert!(!invalid.valid);
        assert!(!invalid.truncated);
        assert_eq!(
            invalid.error.as_ref().map(|err| err.code),
            Some(ValidationErrorCode::UnicodeNotAllowed)
        );
        assert!(invalid.matches.is_empty());

        // Prefix-sharing alternations and lazy quantifiers require MatchKind::All
        // on the reverse lazy DFA so match starts are not truncated.
        let alt = preview(r"key|api_key", "prefix api_key suffix", RULE_LIMIT_BYTES);
        assert!(alt.valid && !alt.truncated);
        assert_eq!(alt.matches, vec![MatchSpan { start: 7, end: 14 }]);

        let lazy = preview(r"x+?y", "xxxy", RULE_LIMIT_BYTES);
        assert!(lazy.valid && !lazy.truncated);
        assert_eq!(lazy.matches, vec![MatchSpan { start: 0, end: 4 }]);

        // Pathological leftmost-first alternation stops once the scan budget is exhausted.
        let mut alts = Vec::new();
        for i in 0..80 {
            alts.push(format!(".+X{i}"));
        }
        alts.push(".".to_owned());
        let adversarial = alts.join("|");
        let text = "é".repeat(4_000);
        let bounded = preview(&adversarial, &text, RULE_LIMIT_BYTES);
        assert!(bounded.valid);
        assert!(bounded.truncated);
        assert!(!bounded.matches.is_empty());
        assert!(bounded.matches.len() <= MAX_PREVIEW_MATCHES);
    }

    #[test]
    fn compiled_set_reports_overlapping_matches() {
        let regex = compile_set(&[r"\b\d{3}-\d{2}-\d{4}\b", r"[a-z]+@[a-z]+\.com"]).unwrap();
        let mut found = PatternSet::new(regex.pattern_len());
        regex.which_overlapping_matches(&Input::new(b"mail a@b.com ssn 078-05-1120"), &mut found);
        let hits: Vec<usize> = found.iter().map(|id| id.as_usize()).collect();
        assert_eq!(hits, vec![0, 1]);

        let large_patterns: Vec<String> = (0..400)
            .map(|i| format!(r"\bword_{i:04}_token\b"))
            .collect();
        let report = validate(&large_patterns, 512 * 1024);
        assert!(report.ok);
        let large_set = compile_set(&large_patterns).unwrap();
        assert!(large_set.is_match("contains word_0399_token here"));
    }
}
