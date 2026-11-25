//! Single-pass redaction of matched spans inside request text leaves.
//!
//! Spans are collected as UTF-8 byte ranges, sorted and merged in place when
//! overlapping, then spliced into one preallocated output buffer in a single
//! pass so no intermediate per-match string copies occur.
use std::{
    ops::Range,
    sync::{Arc, LazyLock},
    time::Duration,
};

use quick_cache::{
    Weighter,
    sync::{Cache, GuardResult},
};
use regex_automata::{Input, MatchKind, meta, nfa::thompson::WhichCaptures, util::syntax};

pub(crate) const DEFAULT_REDACTION_LABEL: &str = "[REDACTED]";

/// A matched UTF-8 byte range inside one text leaf and the replacement label
/// that should replace it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct RedactionSpan<'a> {
    pub start: usize,
    pub end: usize,
    /// Guardrail resolution order; earlier guardrails win when overlapping
    /// spans start at the same byte offset.
    pub priority: usize,
    pub label: &'a str,
}

/// A single raw JSON byte range in the request body and its JSON-encoded
/// replacement bytes.
#[derive(Clone, Debug, PartialEq, Eq)]
pub(crate) struct BodyEdit {
    pub range: Range<usize>,
    pub replacement: Vec<u8>,
}

#[derive(Clone)]
struct RedactRegexWeight;

impl Weighter<String, Option<Arc<meta::Regex>>> for RedactRegexWeight {
    fn weight(&self, pattern: &String, compiled: &Option<Arc<meta::Regex>>) -> u64 {
        let regex_bytes = compiled.as_ref().map_or(0, |regex| regex.memory_usage());
        u64::try_from(pattern.len().saturating_add(regex_bytes))
            .unwrap_or(u64::MAX)
            .max(1)
    }
}

/// Bounded cache of capture-capable regexes used only when a `redact` guardrail
/// actually matches a leaf. `block` and `log` rules never populate this cache.
const MAX_REDACT_REGEX_BYTES: u64 = 16 * 1024 * 1024;

static REDACT_REGEXES: LazyLock<Cache<String, Option<Arc<meta::Regex>>, RedactRegexWeight>> =
    LazyLock::new(|| Cache::with_weighter(1024, MAX_REDACT_REGEX_BYTES, RedactRegexWeight));

/// Compiles or fetches a UTF-8 boundary-safe, capture-enabled regex for
/// locating redaction spans.
pub(crate) fn redact_regex(pattern: &str) -> Option<Arc<meta::Regex>> {
    match REDACT_REGEXES.get_value_or_guard(pattern, Some(Duration::ZERO)) {
        GuardResult::Value(compiled) => compiled,
        GuardResult::Guard(guard) => {
            let compiled = compile_redact_regex(pattern);
            let _ = guard.insert(compiled.clone());
            compiled
        }
        GuardResult::Timeout => compile_redact_regex(pattern),
    }
}

fn compile_redact_regex(pattern: &str) -> Option<Arc<meta::Regex>> {
    // Match the fast detection pass (`unicode(false).utf8(false)`) so negated
    // ASCII boundary classes like `[^A-Za-z0-9_]` compile identically; span
    // bounds are aligned to UTF-8 char boundaries before slicing.
    meta::Builder::new()
        .configure(
            meta::Config::new()
                .match_kind(MatchKind::LeftmostFirst)
                .utf8_empty(false)
                .which_captures(WhichCaptures::All),
        )
        .syntax(syntax::Config::new().unicode(false).utf8(false))
        .build(pattern)
        .inspect_err(|error| tracing::warn!(%error, "redact guardrail pattern failed to compile"))
        .ok()
        .map(Arc::new)
}

fn floor_char_boundary(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index > 0 && !text.is_char_boundary(index) {
        index -= 1;
    }
    index
}

fn ceil_char_boundary(text: &str, mut index: usize) -> usize {
    index = index.min(text.len());
    while index < text.len() && !text.is_char_boundary(index) {
        index += 1;
    }
    index
}

/// Appends every non-empty match span of `regex` in `text` to `out`.
///
/// Patterns that use capture group 1 to exclude surrounding boundary characters
/// (such as keyword lists, custom secret prefixes, and compressed IPv6) redact
/// only group 1 and resume right after it so adjacent tokens still match.
pub(crate) fn find_regex_spans<'a>(
    regex: &meta::Regex,
    text: &str,
    priority: usize,
    label: &'a str,
    out: &mut Vec<RedactionSpan<'a>>,
) {
    let mut caps = regex.create_captures();
    let mut pos = 0usize;
    while pos <= text.len() {
        let input = Input::new(text.as_bytes()).range(pos..text.len());
        regex.captures(input, &mut caps);
        let Some(full) = caps.get_match() else {
            break;
        };
        let (raw_start, raw_end) = match caps.get_group(1) {
            Some(group1) => (group1.start, group1.end),
            None => (full.start(), full.end()),
        };
        let start = floor_char_boundary(text, raw_start);
        let end = ceil_char_boundary(text, raw_end);
        if start < end {
            out.push(RedactionSpan {
                start,
                end,
                priority,
                label,
            });
        }
        if raw_end > pos {
            pos = raw_end;
        } else if pos < text.len() {
            pos = ceil_char_boundary(text, pos.saturating_add(1));
        } else {
            break;
        }
    }
}

/// Appends every non-overlapping occurrence of `needle` in `text` as a span.
pub(crate) fn find_literal_spans<'a>(
    text: &str,
    needle: &str,
    priority: usize,
    label: &'a str,
    out: &mut Vec<RedactionSpan<'a>>,
) {
    if needle.is_empty() {
        return;
    }
    for (start, _) in text.match_indices(needle) {
        let end = start.saturating_add(needle.len());
        if end <= text.len() {
            out.push(RedactionSpan {
                start,
                end,
                priority,
                label,
            });
        }
    }
}

/// Sorts and merges overlapping spans in place and returns the exact output
/// byte capacity needed for [`splice_merged_spans`], or `None` when no valid
/// non-empty span applies to `text`.
///
/// Computing capacity before allocating lets callers reserve memory against
/// the shared gateway budget before creating expanded replacement buffers.
pub(crate) fn prepare_redactions(text: &str, spans: &mut Vec<RedactionSpan<'_>>) -> Option<usize> {
    spans.retain(|span| {
        span.start < span.end
            && span.end <= text.len()
            && text.is_char_boundary(span.start)
            && text.is_char_boundary(span.end)
    });
    if spans.is_empty() {
        return None;
    }
    merge_spans(spans);

    let mut removed = 0usize;
    let mut added = 0usize;
    for span in &*spans {
        removed = removed.saturating_add(span.end.saturating_sub(span.start));
        added = added.saturating_add(span.label.len());
    }
    Some(text.len().saturating_sub(removed).saturating_add(added))
}

/// Builds the redacted string from spans already validated and merged by
/// [`prepare_redactions`] in one pass into a single preallocated `String`.
pub(crate) fn splice_merged_spans(
    text: &str,
    spans: &[RedactionSpan<'_>],
    capacity: usize,
) -> String {
    let mut output = String::with_capacity(capacity);
    let mut cursor = 0usize;
    for span in spans {
        if let Some(prefix) = text.get(cursor..span.start) {
            output.push_str(prefix);
        }
        output.push_str(span.label);
        cursor = span.end;
    }
    if let Some(suffix) = text.get(cursor..) {
        output.push_str(suffix);
    }
    output
}

/// Sorts and merges overlapping spans in place, then builds the redacted output
/// in one pass into a single preallocated `String`.
///
/// Returns `None` if no valid non-empty span applies to `text`.
/// Strictly overlapping spans (`cur.start < prev.end`) merge into one span
/// keeping the first-starting (and on tie, lowest-`priority`) label; strictly
/// adjacent spans (`cur.start == prev.end`) remain distinct replacements.
#[cfg(test)]
pub(crate) fn apply_redactions(text: &str, spans: &mut Vec<RedactionSpan<'_>>) -> Option<String> {
    let capacity = prepare_redactions(text, spans)?;
    Some(splice_merged_spans(text, spans, capacity))
}

fn merge_spans(spans: &mut Vec<RedactionSpan<'_>>) {
    if spans.len() <= 1 {
        return;
    }
    spans.sort_unstable_by(|a, b| {
        a.start
            .cmp(&b.start)
            .then_with(|| a.priority.cmp(&b.priority))
            .then_with(|| b.end.cmp(&a.end))
    });
    let mut write = 0usize;
    for read in 1..spans.len() {
        let Some(&cur) = spans.get(read) else {
            break;
        };
        let Some(prev) = spans.get_mut(write) else {
            break;
        };
        if cur.start < prev.end {
            if cur.end > prev.end {
                prev.end = cur.end;
            }
        } else {
            write += 1;
            if write != read
                && let Some(slot) = spans.get_mut(write)
            {
                *slot = cur;
            }
        }
    }
    spans.truncate(write + 1);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(start: usize, end: usize, priority: usize, label: &str) -> RedactionSpan<'_> {
        RedactionSpan {
            start,
            end,
            priority,
            label,
        }
    }

    #[test]
    fn merges_overlapping_spans_and_respects_priority() {
        let text = "abcdefghij";
        let mut spans = vec![
            span(2, 6, 1, "[B]"),
            span(4, 8, 0, "[A]"),
            span(2, 5, 0, "[FIRST]"),
        ];
        // Span at 2..5 has priority 0, beats 2..6 (priority 1), and absorbs 2..6 and 4..8 -> 2..8.
        assert_eq!(
            apply_redactions(text, &mut spans).as_deref(),
            Some("ab[FIRST]ij")
        );
    }

    #[test]
    fn preserves_adjacent_matches_in_order() {
        let text = "a@b.com123-45-6789";
        let mut spans = vec![span(7, 18, 1, "[SSN]"), span(0, 7, 0, "[EMAIL]")];
        assert_eq!(
            apply_redactions(text, &mut spans).as_deref(),
            Some("[EMAIL][SSN]")
        );
    }

    #[test]
    fn handles_multibyte_utf8_boundaries_and_drops_mid_codepoint_spans() {
        // 'é' is 2 bytes (0..2), '🚀' is 4 bytes (2..6), "secret" is 6..12, '日' is 3 bytes (12..15)
        let text = "é🚀secret日";
        let mut spans = vec![
            // Invalid mid-codepoint spans must be safely ignored without panicking.
            span(1, 3, 0, "[BAD]"),
            span(6, 13, 0, "[BAD2]"),
            // Valid span right between multibyte characters.
            span(6, 12, 0, "[SECRET]"),
        ];
        assert_eq!(
            apply_redactions(text, &mut spans).as_deref(),
            Some("é🚀[SECRET]日")
        );
    }

    #[test]
    fn capture_group_1_preserves_surrounding_boundaries_and_catches_adjacent_words() {
        let pattern = r"(?:^|[^A-Za-z0-9_])((?:[Ff][Oo][Oo]|[Bb][Aa][Rr]))(?:$|[^A-Za-z0-9_])";
        let regex = redact_regex(pattern).unwrap();
        let text = "foo bar,foo! café foo日本語bar";
        let mut spans = Vec::new();
        find_regex_spans(&regex, text, 0, "[WORD]", &mut spans);
        assert_eq!(
            apply_redactions(text, &mut spans).as_deref(),
            Some("[WORD] [WORD],[WORD]! café [WORD]日本語[WORD]")
        );
    }

    #[test]
    fn regex_with_multibyte_utf8_never_splits_codepoints() {
        let pattern = r"(?:^|[^A-Za-z0-9_-])(acme_[A-Za-z0-9_-]{16,})(?:$|[^A-Za-z0-9_-])";
        let regex = redact_regex(pattern).unwrap();
        let text = "鍵acme_1234567890abcdef🔑";
        let mut spans = Vec::new();
        find_regex_spans(&regex, text, 0, "[KEY]", &mut spans);
        assert_eq!(
            apply_redactions(text, &mut spans).as_deref(),
            Some("鍵[KEY]🔑")
        );
    }

    #[test]
    fn private_key_pattern_redacts_entire_pem_block() {
        let pattern = r"-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----(?:\s+[A-Za-z0-9+/=:, \t\r\n-]*?-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----)?";
        let regex = redact_regex(pattern).unwrap();
        let text = "before\n-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\nsecretBody==\n-----END RSA PRIVATE KEY-----\nafter";
        let mut spans = Vec::new();
        find_regex_spans(&regex, text, 0, "[KEY]", &mut spans);
        assert_eq!(
            apply_redactions(text, &mut spans).as_deref(),
            Some("before\n[KEY]\nafter")
        );
    }

    #[test]
    fn empty_or_invalid_spans_return_none() {
        let text = "hello";
        let mut spans = vec![
            span(3, 3, 0, "[X]"),
            span(4, 2, 0, "[X]"),
            span(0, 99, 0, "[X]"),
        ];
        assert_eq!(apply_redactions(text, &mut spans), None);
    }
}
