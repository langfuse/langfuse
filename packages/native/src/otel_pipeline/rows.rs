//! `collect_lookup_requests` lists each distinct model, prompt, and skill key once for Node.
//! `enrich_inner` applies Node's returned values and builds `OtelStorageRow`s.
//!
//! `overflow_requests_inner` lists oversized fields for upload.
//! `finalize_inner` applies overflow-upload results and returns `PreparedEvent` handles
//! plus requested evaluation snapshots.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use base64::Engine;
use sha2::{Digest, Sha256};

use crate::native_memory::retained_size;
use crate::native_task::NativeResult;
use crate::otel::types::{SkillAvailableInput, SkillResourceInput};
use crate::otel::{value::Value, OwnedEvent};
use crate::otel_enrichment;
use crate::PreparedEvent;

use super::{
    failure, BatchRows, EnrichedStorageRow, EvaluationRequest, EvaluationRows, FinalizedOtelBatch,
    FinalizedOtelEvent, OtelCompletion, OtelLookupRequest, OtelOverflowRequest, Pipeline,
};

/// Everything the worker reads from a lookup request to resolve it. Events whose keys are
/// equal get the same result, so they share one request.
#[derive(PartialEq, Eq, Hash)]
struct LookupKey<'a> {
    event_type: &'a str,
    model_name: Option<&'a str>,
    prompt_name: Option<&'a str>,
    prompt_version: Option<u64>,
    skills_available: &'a [SkillAvailableInput],
    skills_resource_loaded: &'a [SkillResourceInput],
}

/// Which lookup request each event shares.
#[derive(Default)]
pub(super) struct LookupPlan {
    /// Number of distinct requests handed to Node.
    pub(super) requests: usize,
    /// For every event that needs a lookup, in event order, the position of its request.
    pub(super) request_of: Vec<u32>,
}

/// List each distinct lookup request once, naming the first span that makes it.
pub(super) fn collect_lookup_requests(state: &Pipeline) -> (Vec<OtelLookupRequest>, LookupPlan) {
    let BatchRows::Prepared(events) = &state.rows else {
        unreachable!("lookups precede completion")
    };
    let mut positions = HashMap::new();
    let mut requests = Vec::new();
    let mut request_of = Vec::new();
    for event in events.iter().filter(|event| needs_lookup(event)) {
        let key = LookupKey {
            event_type: &event.event_type,
            model_name: event.provided_model_name.as_deref(),
            prompt_name: event.prompt_name.as_deref(),
            prompt_version: event.prompt_version_lookup.map(f64::to_bits),
            skills_available: &event.skills_available,
            skills_resource_loaded: &event.skills_resource_loaded,
        };
        let position = *positions.entry(key).or_insert_with(|| {
            requests.push(lookup_request(event));
            requests.len() as u32 - 1
        });
        request_of.push(position);
    }
    let plan = LookupPlan {
        requests: requests.len(),
        request_of,
    };
    (requests, plan)
}

fn lookup_request(event: &OwnedEvent) -> OtelLookupRequest {
    OtelLookupRequest {
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
    }
}

/// Apply one lookup result per distinct request to every event that shares the request.
pub(super) fn enrich_inner(state: &mut Pipeline, lookups: &[Value]) -> NativeResult<()> {
    let BatchRows::Prepared(events) = std::mem::replace(&mut state.rows, BatchRows::Finalized)
    else {
        return Err(failure("OTEL batch already enriched"));
    };
    let mut requests = state.lookups.request_of.iter();
    let mut rows = Vec::with_capacity(events.len());
    let mut regexes = otel_enrichment::PricingRegexCache::default();
    for mut event in events {
        let lookup = if needs_lookup(&event) {
            &lookups[*requests.next().expect("validated lookup count") as usize]
        } else {
            &Value::Null
        };
        if lookup.get("error").is_some() {
            rows.push(None);
            continue;
        }
        let enrichment = otel_enrichment::enrich(&event, lookup, &mut regexes);
        let start_time_iso = event.start_time.clone();
        let evaluation_fields = event.evaluation_fields.take();
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
            evaluation_fields,
        }));
    }
    state.rows = BatchRows::Ready(rows);
    Ok(())
}

pub(super) fn finalize_or_request_overflow(
    state: &mut Pipeline,
    overflow_limit_bytes: Option<f64>,
    evaluation: Option<EvaluationRequest>,
    trace_activity_ids: Option<Vec<String>>,
) -> NativeResult<OtelCompletion> {
    let overflow_requests = overflow_limit_bytes
        .map(|limit| overflow_requests_inner(state, limit))
        .transpose()?
        .unwrap_or_default();
    let finalized = if overflow_requests.is_empty() {
        Some(finalize_inner(
            state,
            Vec::new(),
            evaluation,
            trace_activity_ids,
        )?)
    } else {
        state.refresh_memory();
        None
    };
    Ok(OtelCompletion {
        finalized,
        overflow_requests,
    })
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
    evaluation: Option<EvaluationRequest>,
    trace_activity_ids: Option<Vec<String>>,
) -> NativeResult<FinalizedOtelBatch> {
    super::validate_results(
        &overflow,
        state.overflow_requests.len(),
        "incomplete overflow results",
    )?;
    let rows = state.rows.ready()?;
    let evaluation = match evaluation {
        Some((store, filter_columns)) => Some((store, filter_columns, evaluation_rows(rows)?)),
        None => None,
    };
    let evaluation_filter_rows = evaluation
        .as_ref()
        .map(|(_, filter_columns, rows)| {
            evaluation_filter_rows(rows, filter_columns, EVALUATION_FILTER_TEXT_BYTES)
        })
        .transpose()?;
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
    let events: Vec<FinalizedOtelEvent> = rows
        .into_iter()
        .flatten()
        .map(|row| {
            let serialized_event_bytes = trace_activity_ids
                .contains(&row.row.trace_id)
                .then(|| row.row.estimated_dispatch_bytes() as f64);
            let environment = row.row.environment.clone();
            let trace_id = row.row.trace_id.clone();
            let span_id = row.row.span_id.clone();
            let prepared = row.row.into_prepared().map_err(|error| {
                failure(format!("cannot finalize OTEL event {span_id}: {error}"))
            })?;
            Ok(FinalizedOtelEvent {
                event: PreparedEvent {
                    row: Arc::new(prepared),
                    memory: state.memory.clone(),
                },
                trace_id,
                start_time_iso: row.start_time_iso,
                environment,
                serialized_event_bytes,
            })
        })
        .collect::<NativeResult<Vec<_>>>()?;
    let retained = evaluation
        .iter()
        .flat_map(|(_, _, rows)| rows)
        .map(retained_size)
        .sum::<usize>();
    state.memory.resize(
        events
            .iter()
            .map(|event| event.event.row.retained_bytes())
            .sum::<usize>()
            + retained,
    );
    if let Some((store, filter_columns, rows)) = evaluation {
        *store
            .lock()
            .map_err(|_| failure("OTEL processing lock poisoned"))? = EvaluationRows {
            rows,
            filter_columns,
            retained,
            memory: Some(state.memory.clone()),
        };
    }
    Ok(FinalizedOtelBatch {
        events,
        evaluation_filter_rows,
    })
}

/// The filter columns of one evaluation row.
struct EvaluationFilterRow<'a> {
    row: &'a serde_json::Value,
    columns: &'a [String],
}

impl serde::Serialize for EvaluationFilterRow<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.collect_map(
            self.columns
                .iter()
                .filter_map(|column| Some((column, self.row.get(column)?))),
        )
    }
}

/// Longest filter-row text handed to Node. JavaScript cannot hold a string much longer than
/// 512 MiB, and the filter columns of a large batch can add up to more than that.
const EVALUATION_FILTER_TEXT_BYTES: usize = 64 * 1024 * 1024;

/// Serialize `columns` of each row as JSON arrays of consecutive rows. A new array starts when
/// the next row would take the current one past `text_bytes`.
fn evaluation_filter_rows(
    rows: &[serde_json::Value],
    columns: &[String],
    text_bytes: usize,
) -> NativeResult<Vec<String>> {
    let mut texts: Vec<String> = Vec::new();
    for row in rows {
        let row = serde_json::to_string(&EvaluationFilterRow { row, columns }).map_err(failure)?;
        match texts.last_mut() {
            // Count the separating comma and the closing bracket.
            Some(text) if text.len() + row.len() + 2 <= text_bytes => {
                text.push(',');
                text.push_str(&row);
            }
            _ => texts.push(format!("[{row}")),
        }
    }
    for text in &mut texts {
        text.push(']');
    }
    Ok(texts)
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
            if let Some(fields) = &row.evaluation_fields {
                for (column, original) in fields.iter() {
                    value[column.as_str()] = original.clone().into_serde_lossy();
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

#[cfg(test)]
mod tests {
    use serde_json::{json, Value};

    use super::evaluation_filter_rows;

    #[test]
    fn filter_rows_span_several_texts_within_the_size_limit() {
        let rows: Vec<Value> = (0..5)
            .map(|index| json!({ "span_id": format!("span-{index}"), "input": "payload" }))
            .collect();
        let expected: Vec<Value> = (0..5)
            .map(|index| json!({ "span_id": format!("span-{index}") }))
            .collect();

        let columns = ["span_id".to_owned()];
        let one = evaluation_filter_rows(&rows, &columns, usize::MAX).unwrap();
        assert_eq!(one.len(), 1);

        // One row takes 20 bytes, so 45 bytes hold two rows with brackets and a comma.
        let texts = evaluation_filter_rows(&rows, &columns, 45).unwrap();
        assert_eq!(texts.len(), 3);
        assert!(texts.iter().all(|text| text.len() <= 45));
        for texts in [one, texts] {
            let parsed: Vec<Value> = texts
                .iter()
                .flat_map(|text| serde_json::from_str::<Vec<Value>>(text).unwrap())
                .collect();
            assert_eq!(parsed, expected);
        }
    }
}
