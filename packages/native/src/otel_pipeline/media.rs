//! `collect_media_requests` scans normalized `OwnedEvent`s and returns upload
//! requests for media found before and after normalization.
//!
//! `resolve_media_inner` applies Node's results: a successful result supplies a media reference;
//! a failed result restores the occurrence's original text.

use std::collections::{HashMap, HashSet};

use crate::native_task::NativeResult;
use crate::otel::value::{JsString, Value};
use crate::otel_input::ExtractedBatch;
use crate::otel_media::{
    collect_media_references, extract_normalized_media, rewrite_known_references,
    validate_media_registry, EarlyMediaError, ExtractedMedia, MediaReferenceCollector,
};

use super::{failure, BatchRows, OtelMediaRequest, OtelMediaResolution, Pipeline};

/// Return upload requests for media found before and after normalization.
/// `EarlyOtelBatch::process` calls this alongside lookup collection in one native task.
pub(super) fn collect_media_requests(state: &mut Pipeline) -> NativeResult<Vec<OtelMediaRequest>> {
    let BatchRows::Prepared(events) = &mut state.rows else {
        unreachable!("media discovery precedes completion")
    };
    // Save references already present in the normalized events. Reject newly generated
    // temporary references that collide with them before returning upload requests.
    let existing_references = events
        .iter()
        .flat_map(|event| {
            event
                .input
                .iter()
                .chain(event.output.iter())
                .chain(event.metadata.values())
        })
        .fold(HashSet::new(), |mut references, value| {
            collect_value_media_references(value, &mut references);
            references
        });
    for event in events.iter_mut() {
        if let Some(value) = &mut event.input {
            extract_remaining_media(value, &mut state.late_media)?;
        }
        if let Some(value) = &mut event.output {
            extract_remaining_media(value, &mut state.late_media)?;
        }
        let mut metadata = Value::Object(std::mem::take(&mut event.metadata));
        extract_remaining_media(&mut metadata, &mut state.late_media)?;
        event.metadata = metadata
            .as_object_mut()
            .map(std::mem::take)
            .expect("metadata stays an object");
    }
    validate_media_registry(&state.source.media, &state.late_media).map_err(failure)?;
    if let Some(media) = state
        .late_media
        .iter()
        .find(|media| existing_references.contains(&media.reference()))
    {
        return Err(failure(
            EarlyMediaError::UnsupportedMediaReferenceAmbiguity {
                reference: media.reference(),
            },
        ));
    }
    let registry = state
        .source
        .media
        .iter()
        .chain(&state.late_media)
        .collect::<Vec<_>>();
    if registry.is_empty() {
        return Ok(Vec::new());
    }
    let mut collector = MediaReferenceCollector::new(registry.iter().copied());
    let mut requests = Vec::new();
    for event in events.iter() {
        for field in ["input", "output", "metadata"] {
            let media_indices = match field {
                "input" => collector.collect(event.input.iter()),
                "output" => collector.collect(event.output.iter()),
                _ => collector.collect(event.metadata.values()),
            };
            for &media_index in media_indices {
                let media = registry[media_index];
                state.media_requests.push(media_index as u32);
                requests.push(OtelMediaRequest {
                    index: requests.len() as u32,
                    media_index: media_index as u32,
                    trace_id: event.trace_id.clone(),
                    observation_id: event.span_id.clone(),
                    field: field.to_owned(),
                    reference: media.reference(),
                    content_type: media.metadata.content_type.clone(),
                    sha256_hash: media.metadata.sha256_hash.clone(),
                    kind: media.kind.as_str().to_owned(),
                    original_byte_length: media.original_byte_length() as f64,
                });
            }
        }
    }
    Ok(requests)
}

pub(super) fn resolve_media_inner(
    state: &mut Pipeline,
    results: Vec<OtelMediaResolution>,
) -> NativeResult<()> {
    if state.media_requests.is_empty() {
        return Ok(());
    }
    let registry = state
        .source
        .media
        .iter()
        .chain(&state.late_media)
        .enumerate()
        .map(|(index, media)| (media.reference(), (index as u32, media)))
        .collect::<HashMap<_, _>>();
    let depth_references = results
        .iter()
        .filter(|result| result.reference.is_none())
        .map(|result| {
            media_entry(state, state.media_requests[result.index as usize])
                .map(ExtractedMedia::reference)
        })
        .collect::<NativeResult<HashSet<_>>>()?;
    // Use input, output, metadata order for collection and replacement. Consume each result once,
    // including duplicate references introduced during normalization.
    let mut pending = results.into_iter().zip(&state.media_requests);
    let mut resolve_text = |text: &mut JsString| {
        rewrite_known_references(
            text,
            |reference| registry.contains_key(reference),
            |reference| depth_references.contains(reference),
            |reference, json_layers| {
                let (outcome, expected_index) = pending
                    .next()
                    .ok_or_else(|| failure("incomplete OTEL media traversal"))?;
                let (index, media) = registry[reference];
                if index != *expected_index {
                    return Err(failure("OTEL media traversal order changed"));
                }
                match outcome.reference {
                    Some(replacement) => Ok(replacement),
                    None => media
                        .original_value_for_layers(Some(json_layers))
                        .map_err(failure),
                }
            },
        )
        .map(|_| ())
    };
    let BatchRows::Prepared(events) = &mut state.rows else {
        unreachable!("media resolution precedes enrichment")
    };
    for event in events {
        for value in event
            .input
            .iter_mut()
            .chain(event.output.iter_mut())
            .chain(event.metadata.values_mut())
        {
            visit_strings_mut(value, &mut resolve_text)?;
        }
    }
    if pending.next().is_some() {
        return Err(failure("incomplete OTEL media traversal"));
    }
    Ok(())
}

pub(super) fn media_entry(state: &Pipeline, index: u32) -> NativeResult<&ExtractedMedia> {
    media_entry_parts(&state.source, &state.late_media, index)
}

fn media_entry_parts<'a>(
    source: &'a ExtractedBatch,
    late_media: &'a [ExtractedMedia],
    index: u32,
) -> NativeResult<&'a ExtractedMedia> {
    let index = index as usize;
    source
        .media
        .get(index)
        .or_else(|| late_media.get(index.saturating_sub(source.media.len())))
        .ok_or_else(|| failure("unknown media index"))
}

fn collect_value_media_references(value: &Value, references: &mut HashSet<String>) {
    match value {
        Value::String(text) => collect_media_references(text.as_str(), references),
        Value::Array(values) => {
            for value in values {
                collect_value_media_references(value, references);
            }
        }
        Value::Object(values) => {
            // Traverse object values and preserve their keys.
            for value in values.values() {
                collect_value_media_references(value, references);
            }
        }
        _ => {}
    }
}

// Normalization can assemble provider media objects from OTLP key/value arrays.
// The normalized pass recognizes these objects after the arrays become `Value`s.
fn extract_remaining_media(
    value: &mut Value,
    registry: &mut Vec<ExtractedMedia>,
) -> NativeResult<()> {
    extract_normalized_media(value, registry).map_err(failure)
}

pub(super) fn restore_value(value: &mut Value, registry: &[ExtractedMedia]) -> NativeResult<()> {
    visit_strings_mut(value, &mut |text| restore_js_text(text, registry))
}

pub(super) fn restore_text(text: &mut String, registry: &[ExtractedMedia]) -> NativeResult<()> {
    if !text.contains("@@@langfuseMedia:") {
        return Ok(());
    }
    let mut owned = JsString::from(std::mem::take(text));
    let result = restore_js_text(&mut owned, registry);
    *text = owned.into_utf8_lossy();
    result
}

fn restore_js_text(text: &mut JsString, registry: &[ExtractedMedia]) -> NativeResult<()> {
    if !text.as_str().contains("@@@langfuseMedia:") {
        return Ok(());
    }
    rewrite_known_references(
        text,
        |reference| registry.iter().any(|media| media.reference() == reference),
        |_| true,
        |reference, json_layers| {
            registry
                .iter()
                .find(|media| media.reference() == reference)
                .ok_or_else(|| failure("unknown media reference"))?
                .original_value_for_layers(Some(json_layers))
                .map_err(failure)
        },
    )
    .map(|_| ())
}

/// Visit string values in source order, preserving object keys.
fn visit_strings_mut(
    value: &mut Value,
    visit: &mut impl FnMut(&mut JsString) -> NativeResult<()>,
) -> NativeResult<()> {
    match value {
        Value::String(text) => visit(text),
        Value::Array(values) => {
            for value in values {
                visit_strings_mut(value, visit)?;
            }
            Ok(())
        }
        Value::Object(values) => {
            for value in values.values_mut() {
                visit_strings_mut(value, visit)?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}
