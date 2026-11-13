//! `collect_lookup_requests` lists model, prompt, and skill keys for Node.
//! `enrich_inner` applies Node's returned values and builds `OtelStorageRow`s.
//!
//! `overflow_requests_inner` lists oversized fields for upload.
//! `finalize_inner` applies overflow-upload results and returns `PreparedEvent` handles
//! plus requested evaluation snapshots.

use std::collections::HashSet;
use std::sync::Arc;

use base64::Engine;
use sha2::{Digest, Sha256};

use crate::native_task::NativeResult;
use crate::otel::{value::Value, OwnedEvent};
use crate::otel_enrichment;
use crate::PreparedEvent;

use super::{
    failure, BatchRows, EnrichedStorageRow, FinalizedOtelBatch, FinalizedOtelEvent,
    OtelLookupRequest, OtelOverflowRequest, Pipeline,
};

pub(super) fn collect_lookup_requests(state: &Pipeline) -> Vec<OtelLookupRequest> {
    let BatchRows::Prepared(events) = &state.rows else {
        unreachable!("lookups precede completion")
    };
    events
        .iter()
        .filter(|event| needs_lookup(event))
        .map(|event| OtelLookupRequest {
            span_id: event.span_id.clone(),
            event_type: event.event_type.clone(),
            model_name: event.provided_model_name.clone(),
            prompt_name: event.prompt_name.clone(),
            prompt_version: event.prompt_version_lookup,
            skills_available: event
                .skills_available
                .iter()
                .map(|skill| super::OtelSkillAvailable {
                    name: skill.name.clone(),
                    version: skill.version,
                })
                .collect(),
            skills_resource_loaded: event
                .skills_resource_loaded
                .iter()
                .map(|skill| super::OtelSkillResourceLoaded {
                    skill_name: skill.skill_name.clone(),
                    file_path: skill.file_path.clone(),
                    skill_version: skill.skill_version,
                })
                .collect(),
        })
        .collect()
}

pub(super) fn enrich_inner(
    state: &mut Pipeline,
    lookups: Vec<serde_json::Value>,
) -> NativeResult<()> {
    let BatchRows::Prepared(events) = std::mem::replace(&mut state.rows, BatchRows::Finalized)
    else {
        return Err(failure("OTEL batch already enriched"));
    };
    let mut lookups = lookups.into_iter().map(Value::from);
    let mut rows = Vec::with_capacity(events.len());
    let mut regexes = otel_enrichment::PricingRegexCache::default();
    for event in events {
        let lookup = if needs_lookup(&event) {
            lookups.next().expect("validated lookup count")
        } else {
            Value::Null
        };
        if lookup.get("error").is_some() {
            rows.push(None);
            continue;
        }
        let enrichment = otel_enrichment::enrich(&event, &lookup, &mut regexes);
        let start_time_iso = event.start_time.clone();
        let mut row = event.into_storage(enrichment, &state.context);
        if !state.source.media.is_empty() {
            row.restore_media(&mut |text| {
                super::media::restore_text(text, &state.source.media)
                    .map_err(|error| error.to_string())
            })
            .map_err(failure)?;
        }
        rows.push(Some(EnrichedStorageRow {
            row,
            start_time_iso,
        }));
    }
    state.rows = BatchRows::Ready(rows);
    Ok(())
}

pub(super) fn overflow_requests_inner(
    state: &mut Pipeline,
    limit_bytes: f64,
) -> NativeResult<Vec<OtelOverflowRequest>> {
    let rows = state.rows.ready()?;
    let mut requests = Vec::new();
    for (event_index, row) in rows.iter().enumerate() {
        let Some(row) = row else {
            continue;
        };
        let mut add = |field: &str, metadata_index: Option<u32>, value: Option<&String>| {
            if let Some(text) = value.filter(|text| text.len() as f64 > limit_bytes) {
                requests.push(OtelOverflowRequest {
                    index: requests.len() as u32,
                    event_index: event_index as u32,
                    trace_id: row.row.trace_id.clone(),
                    observation_id: row.row.span_id.clone(),
                    field: field.to_owned(),
                    metadata_index,
                    byte_length: text.len() as f64,
                    sha256_hash: base64::engine::general_purpose::STANDARD
                        .encode(Sha256::digest(text.as_bytes())),
                });
            }
        };
        add("input", None, row.row.input.as_ref());
        add("output", None, row.row.output.as_ref());
        for (index, value) in row.row.metadata_values.iter().enumerate() {
            add("metadata", Some(index as u32), Some(value));
        }
    }
    state.overflow_requests = requests.clone();
    Ok(requests)
}

/// Each request stores the row index used by `overflow_text` while rows remain in Rust.
pub(super) fn overflow_text<'a>(
    request: &OtelOverflowRequest,
    rows: &'a [Option<EnrichedStorageRow>],
) -> &'a String {
    let row = &rows[request.event_index as usize]
        .as_ref()
        .expect("overflow row exists")
        .row;
    match request.metadata_index {
        Some(index) => &row.metadata_values[index as usize],
        None if request.field == "input" => row.input.as_ref().expect("overflow input exists"),
        None => row.output.as_ref().expect("overflow output exists"),
    }
}

pub(super) fn finalize_inner(
    state: &mut Pipeline,
    overflow: Vec<super::OtelMediaResolution>,
    include_evaluation_rows: bool,
    trace_activity_ids: Option<Vec<String>>,
) -> NativeResult<FinalizedOtelBatch> {
    super::validate_results(
        &overflow,
        state.overflow_requests.len(),
        "incomplete overflow results",
    )?;
    let rows = state.rows.ready()?;
    let evaluation_rows = if include_evaluation_rows {
        evaluation_rows(rows)?
    } else {
        Vec::new()
    };
    let BatchRows::Ready(mut rows) = std::mem::replace(&mut state.rows, BatchRows::Finalized)
    else {
        unreachable!("ready rows checked")
    };
    for (result, request) in overflow.into_iter().zip(&state.overflow_requests) {
        let Some(reference) = result.reference else {
            continue;
        };
        let row = &mut rows[request.event_index as usize]
            .as_mut()
            .expect("overflow row exists")
            .row;
        match request.metadata_index {
            Some(index) => row.metadata_values[index as usize] = reference,
            None if request.field == "input" => row.input = Some(reference),
            None => row.output = Some(reference),
        }
    }
    let trace_activity_ids = trace_activity_ids
        .unwrap_or_default()
        .into_iter()
        .collect::<HashSet<_>>();
    let events = rows
        .into_iter()
        .flatten()
        .map(|row| {
            let serialized_event_bytes = trace_activity_ids
                .contains(&row.row.trace_id)
                .then(|| row.row.serialized_byte_length())
                .transpose()
                .map_err(failure)?
                .map(|bytes| bytes as f64);
            let environment = row.row.environment.clone();
            let trace_id = row.row.trace_id.clone();
            let span_id = row.row.span_id.clone();
            let prepared = row.row.into_prepared().map_err(|error| {
                failure(format!("cannot finalize OTEL event {span_id}: {error}"))
            })?;
            Ok(FinalizedOtelEvent {
                event: PreparedEvent {
                    row: Arc::new(prepared),
                },
                trace_id,
                start_time_iso: row.start_time_iso,
                environment,
                serialized_event_bytes,
            })
        })
        .collect::<NativeResult<_>>()?;
    Ok(FinalizedOtelBatch {
        events,
        evaluation_rows,
    })
}

fn evaluation_rows(rows: &[Option<EnrichedStorageRow>]) -> NativeResult<Vec<serde_json::Value>> {
    rows.iter()
        .flatten()
        .map(|row| {
            let mut value = row.row.evaluation_value().map_err(failure)?;
            // Evaluation snapshots carry model parameters as parsed JSON values.
            if let Some(text) = value["model_parameters"].as_str() {
                if let Ok(parsed) = serde_json::from_str(text) {
                    value["model_parameters"] = parsed;
                }
            }
            Ok(value)
        })
        .collect()
}

pub(super) fn needs_lookup(event: &OwnedEvent) -> bool {
    event
        .provided_model_name
        .as_ref()
        .is_some_and(|name| !name.is_empty())
        || (event
            .prompt_name
            .as_ref()
            .is_some_and(|name| !name.is_empty())
            && event
                .prompt_version_lookup
                .is_some_and(|version| version != 0.0 && !version.is_nan()))
        || !event.skills_available.is_empty()
        || !event.skills_resource_loaded.is_empty()
}
