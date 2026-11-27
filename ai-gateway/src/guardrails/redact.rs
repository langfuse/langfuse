//! Single-pass redaction of matched spans inside request text leaves.
//!
//! Spans are collected as UTF-8 byte ranges, sorted and merged in place when
//! overlapping, then spliced into one preallocated output buffer in a single
//! pass so no intermediate per-match string copies occur.
use std::ops::Range;

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

/// Splices disjoint byte edits into `source` in one preallocated pass.
/// Returns `None` if any edit range is inverted, out of bounds, or overlapping.
pub(crate) fn splice_bytes(source: &[u8], edits: &mut [(Range<usize>, &[u8])]) -> Option<Vec<u8>> {
    edits.sort_by_key(|(range, _)| range.start);
    // Preallocate the exact output size so all replacements splice in a single pass.
    let original_bytes: usize = edits.iter().map(|(range, _)| range.len()).sum();
    let replacement_bytes: usize = edits.iter().map(|(_, bytes)| bytes.len()).sum();
    let capacity = source
        .len()
        .saturating_sub(original_bytes)
        .saturating_add(replacement_bytes);
    let mut rewritten = Vec::with_capacity(capacity);
    let mut copied = 0;
    for (range, replacement) in &*edits {
        if range.start > range.end || range.end > source.len() {
            return None;
        }
        let prefix = source.get(copied..range.start)?;
        rewritten.extend_from_slice(prefix);
        rewritten.extend_from_slice(replacement);
        copied = range.end;
    }
    let suffix = source.get(copied..)?;
    rewritten.extend_from_slice(suffix);
    Some(rewritten)
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

    // Compute exact post-replacement length so callers can reserve memory before allocating.
    let mut original_bytes = 0usize;
    let mut replacement_bytes = 0usize;
    for span in &*spans {
        original_bytes = original_bytes.saturating_add(span.end.saturating_sub(span.start));
        replacement_bytes = replacement_bytes.saturating_add(span.label.len());
    }
    let capacity = text
        .len()
        .saturating_sub(original_bytes)
        .saturating_add(replacement_bytes);
    Some(capacity)
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
