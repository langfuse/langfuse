//! Source positions and serialization depth for known temporary references.

use crate::otel::value::{JsString, Value};
use jiter::Peek;
use std::collections::{HashMap, VecDeque};

use super::json::validate_json;
use super::json_cursor::{ContainerState, ContainerStep, JsonCursor};
use super::payload::EarlyMediaError;
use super::rules::{MEDIA_REFERENCE_PREFIX, MEDIA_REFERENCE_SUFFIX};
use super::WalkStats;

const MAX_SERIALIZED_REFERENCE_LAYERS: u32 = 16;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ReferenceSpan {
    /// Byte range in the held source string.
    pub(crate) start: usize,
    pub(crate) end: usize,
    /// Number of serialized JSON strings surrounding this reference.
    pub(crate) json_layers: u32,
}

/// Find verbatim temporary references in source order and record their JSON depth.
///
/// Native-generated references use ASCII markers that survive JSON string serialization.
/// The parser maps each source position to its containing string depth; callers splice
/// original text at the returned ranges.
#[cfg(test)]
pub(crate) fn reference_spans(text: &str, reference: &str) -> Vec<ReferenceSpan> {
    known_reference_spans(text, |candidate| candidate == reference, |_| true)
}

/// Find all known references in one scan and associate each with its JSON string depth.
///
/// Restoration uses this depth; replacements preserve the surrounding string spelling.
pub(crate) fn known_reference_spans(
    text: &str,
    mut is_known: impl FnMut(&str) -> bool,
    mut needs_depth: impl FnMut(&str) -> bool,
) -> Vec<ReferenceSpan> {
    let mut spans = Vec::new();
    scan_reference_ranges(text, |start, end, reference| {
        if is_known(reference) {
            spans.push(ReferenceSpan {
                start,
                end,
                json_layers: 0,
            });
        }
    });
    if spans
        .iter()
        .any(|span| needs_depth(&text[span.start..span.end]))
        && validate_json(text).is_ok()
    {
        let mut layers = HashMap::new();
        if collect_layers(text, 1, &mut layers, &mut is_known, &mut needs_depth).is_err() {
            return spans;
        }
        for span in &mut spans {
            let reference = &text[span.start..span.end];
            if needs_depth(reference) {
                span.json_layers = layers
                    .get_mut(reference)
                    .and_then(VecDeque::pop_front)
                    .unwrap_or(1);
            }
        }
    }
    spans
}

/// Replace all known references in one string, in source order.
pub fn rewrite_known_references<E>(
    text: &mut JsString,
    is_known: impl FnMut(&str) -> bool,
    needs_depth: impl FnMut(&str) -> bool,
    mut replacement_for: impl FnMut(&str, u32) -> Result<String, E>,
) -> Result<bool, E> {
    let spans = known_reference_spans(text.as_str(), is_known, needs_depth);
    if spans.is_empty() {
        return Ok(false);
    }
    if let [span] = spans.as_slice() {
        let reference = &text.as_str()[span.start..span.end];
        let replacement = replacement_for(reference, span.json_layers)?;
        text.replace_range(span.start..span.end, &replacement);
        return Ok(true);
    }

    let mut output = JsString::with_capacity(text.len());
    let mut end = 0;
    for span in spans {
        output.push_slice(text, end..span.start);
        let reference = &text.as_str()[span.start..span.end];
        output.push_str(&replacement_for(reference, span.json_layers)?);
        end = span.end;
    }
    output.push_slice(text, end..text.len());
    *text = output;
    Ok(true)
}

fn collect_layers(
    source: &str,
    depth: u32,
    layers: &mut HashMap<String, VecDeque<u32>>,
    is_known: &mut impl FnMut(&str) -> bool,
    needs_depth: &mut impl FnMut(&str) -> bool,
) -> Result<(), EarlyMediaError> {
    // Visit source tokens, including values shadowed by duplicate keys. Token traversal
    // preserves each occurrence's source range and string depth.
    let mut cursor = JsonCursor::new(source.as_bytes());
    let mut stats = WalkStats::default();
    let mut stack = Vec::new();
    loop {
        let peek = cursor.peek(&mut stats)?;
        if matches!(peek, Peek::Object | Peek::Array) {
            stack.push(ContainerState::new(peek));
        } else {
            let token = cursor.consume_scalar(peek, &mut stats)?;
            if peek == Peek::String && source[token.clone()].contains(MEDIA_REFERENCE_PREFIX) {
                if let Ok(Value::String(text)) = Value::parse(&source[token]) {
                    if depth < MAX_SERIALIZED_REFERENCE_LAYERS
                        && validate_json(text.as_str()).is_ok()
                    {
                        collect_layers(text.as_str(), depth + 1, layers, is_known, needs_depth)?;
                    } else {
                        scan_reference_ranges(text.as_str(), |_, _, reference| {
                            if is_known(reference) && needs_depth(reference) {
                                layers
                                    .entry(reference.to_owned())
                                    .or_default()
                                    .push_back(depth);
                            }
                        });
                    }
                }
            }
        }
        loop {
            let Some(state) = stack.last_mut() else {
                return Ok(());
            };
            match cursor.advance(state, &mut stats)? {
                ContainerStep::Child(_) => break,
                ContainerStep::Closed => {
                    stack.pop();
                }
            }
        }
    }
}

/// Visit complete temporary-reference markers while borrowing each marker from `text`.
/// When a suffix begins another marker, resume at that nested prefix so later valid
/// occurrences remain visible.
pub(crate) fn for_each_media_reference(text: &str, mut visit: impl FnMut(&str)) {
    scan_reference_ranges(text, |_, _, reference| visit(reference));
}

fn scan_reference_ranges<'a>(text: &'a str, mut visit: impl FnMut(usize, usize, &'a str)) {
    let mut cursor = 0;
    while let Some(relative) = text
        .get(cursor..)
        .and_then(|text| text.find(MEDIA_REFERENCE_PREFIX))
    {
        let start = cursor + relative;
        let suffix_start = start + MEDIA_REFERENCE_PREFIX.len();
        let Some(relative_end) = text[suffix_start..].find(MEDIA_REFERENCE_SUFFIX) else {
            break;
        };
        let suffix = suffix_start + relative_end;
        if text[suffix..].starts_with(MEDIA_REFERENCE_PREFIX) {
            cursor = suffix;
            continue;
        }
        let end = suffix + MEDIA_REFERENCE_SUFFIX.len();
        visit(start, end, &text[start..end]);
        cursor = end;
    }
}

#[cfg(test)]
mod tests {
    use super::{reference_spans, rewrite_known_references};
    use crate::otel::value::Value;

    #[test]
    fn finds_plain_and_json_encoded_scalar_references_at_their_source_depth() {
        let reference = "@@@langfuseMedia:type=image/png|id=one|source=bytes@@@";
        let plain = format!("prefix {reference} suffix");
        let spans = reference_spans(&plain, reference);
        assert_eq!(spans.len(), 1);
        assert_eq!(spans[0].json_layers, 0);
        assert_eq!(&plain[spans[0].start..spans[0].end], reference);

        for encoded in [
            format!(r#""{reference}""#),
            format!(r#"{{"number":1e309,"image":"{reference}"}}"#),
            format!(r#"{{"text":"\ud800","image":"{reference}"}}"#),
        ] {
            let spans = reference_spans(&encoded, reference);
            assert_eq!(spans.len(), 1);
            assert_eq!(spans[0].json_layers, 1);
            assert_eq!(&encoded[spans[0].start..spans[0].end], reference);
        }
    }

    #[test]
    fn follows_a_nested_json_string_to_its_source_depth() {
        let reference = "@@@langfuseMedia:type=image/png|id=one|source=bytes@@@";
        let mut text = format!(r#"{{"value":"{reference}"}}"#);
        for depth in 1..=16 {
            let spans = reference_spans(&text, reference);
            assert_eq!(spans.len(), 1);
            assert_eq!(spans[0].json_layers, depth);
            assert_eq!(&text[spans[0].start..spans[0].end], reference);
            text = format!(r#"{{"child":{}}}"#, serde_json::to_string(&text).unwrap());
        }
        let structurally_deep = "[".repeat(512) + &format!(r#""{reference}""#) + &"]".repeat(512);
        assert_eq!(
            reference_spans(&structurally_deep, reference)[0].json_layers,
            1
        );
    }

    #[test]
    fn rewrites_duplicate_references_with_mixed_outcomes_and_surrogates() {
        let reference = "@@@langfuseMedia:type=image/png|id=one|source=bytes@@@";
        let nested = serde_json::to_string(&format!(
            r#"{{"number":9007199254740993.25,"ratio":1.2300,"inner":"{reference}"}}"#
        ))
        .unwrap();
        let source = format!(r#"{{"direct":"\ud800 {reference} \udfff","serialized":{nested}}}"#);
        let mut value = Value::parse(&source).unwrap();
        let object = value.as_object_mut().unwrap();
        let mut outcomes = ["uploaded-reference", "restored-original"].into_iter();
        let mut depths = Vec::new();
        for value in object.values_mut() {
            let Value::String(text) = value else {
                unreachable!("test payload contains only string values");
            };
            rewrite_known_references(
                text,
                |candidate| candidate == reference,
                |_| true,
                |_, depth| {
                    depths.push(depth);
                    Ok::<_, ()>(outcomes.next().unwrap().to_owned())
                },
            )
            .unwrap();
        }

        assert_eq!(depths, vec![0, 1]);
        assert_eq!(
            crate::otel::attributes::javascript_json_stringify(&value),
            source
                .replacen(reference, "uploaded-reference", 1)
                .replacen(reference, "restored-original", 1),
        );
    }

    #[test]
    fn keeps_depth_fallback_per_reference() {
        let first = "@@@langfuseMedia:type=image/png|id=one|source=bytes@@@";
        let malformed = format!(r#"{{"first":"{first}""#);
        assert_eq!(reference_spans(&malformed, first)[0].json_layers, 0);

        let duplicate = format!(r#"{{"first":"{first}","first":"{first}"}}"#);
        assert_eq!(
            reference_spans(&duplicate, first)
                .into_iter()
                .map(|span| span.json_layers)
                .collect::<Vec<_>>(),
            vec![1, 1]
        );

        let nested = serde_json::to_string(&format!(r#"{{"image":"{first}"}}"#)).unwrap();
        let shadowed = format!(r#"{{"first":{nested},"first":"{first}"}}"#);
        assert_eq!(
            reference_spans(&shadowed, first)
                .into_iter()
                .map(|span| span.json_layers)
                .collect::<Vec<_>>(),
            vec![2, 1]
        );
    }
}
