//! `RustOtelBatch` stores events and media between calls from Node.
//!
//! `EarlyOtelBatch::process` returns the batch plus upload and lookup requests.
//! Node performs that I/O and passes results to `RustOtelBatch::complete`.
//! `complete` returns finalized event handles and optional evaluation data, or
//! requests uploads for oversized fields. Node uploads those fields and calls
//! `finalize` to get the handles.
//!
//! `media` collects media requests and applies upload results. `rows` collects
//! lookup requests, builds storage rows, and requests uploads for oversized
//! fields. This file defines the N-API methods and batch states.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::native_schema::OtelStorageRow;
use crate::native_task::{to_js_error, NativeResult, OwnedTask};
use crate::otel::{process_to_events, EventBuildConfig, OwnedEvent, StorageContext};
use crate::otel_input::{EarlyOtelBatch, ExtractedBatch};
use crate::otel_media::ExtractedMedia;
use crate::PreparedEvent;

mod media;
mod rows;

#[napi(object)]
pub struct OtelProcessingContext {
    pub project_id: String,
    pub ingestion_api_key: String,
    pub ingestion_sdk_name: String,
    pub ingestion_sdk_version: String,
    pub file_key: String,
    pub now: String,
    pub is_langfuse_internal: bool,
}
struct Pipeline {
    source: Arc<ExtractedBatch>,
    rows: BatchRows,
    context: StorageContext,
    media_requests: Vec<u32>,
    late_media: Vec<ExtractedMedia>,
    overflow_requests: Vec<OtelOverflowRequest>,
}

enum BatchRows {
    Prepared(Vec<OwnedEvent>),
    Ready(Vec<Option<EnrichedStorageRow>>),
    Finalized,
}

impl BatchRows {
    fn ready(&self) -> NativeResult<&[Option<EnrichedStorageRow>]> {
        match self {
            Self::Ready(rows) => Ok(rows),
            _ => Err(failure("enrich before finalization")),
        }
    }
}

struct EnrichedStorageRow {
    row: OtelStorageRow,
    start_time_iso: String,
}

#[napi]
pub struct RustOtelBatch {
    state: Arc<Mutex<Option<Pipeline>>>,
}

#[napi(object)]
pub struct OtelMediaRequest {
    pub index: u32,
    pub media_index: u32,
    pub trace_id: String,
    pub observation_id: String,
    pub field: String,
    pub reference: String,
    pub content_type: String,
    pub sha256_hash: String,
    pub kind: String,
    pub original_byte_length: f64,
}

#[napi(object)]
pub struct OtelMediaResolution {
    pub index: u32,
    /// Omit `reference` to restore the original inline value after an upload/link failure.
    pub reference: Option<String>,
}

#[napi(object)]
pub struct OtelSkillAvailable {
    pub name: String,
    pub version: Option<u32>,
}

#[napi(object)]
pub struct OtelSkillResourceLoaded {
    pub skill_name: String,
    pub file_path: String,
    pub skill_version: Option<u32>,
}

#[napi(object)]
pub struct OtelLookupRequest {
    pub span_id: String,
    pub event_type: String,
    pub model_name: Option<String>,
    pub prompt_name: Option<String>,
    pub prompt_version: Option<f64>,
    pub skills_available: Vec<OtelSkillAvailable>,
    pub skills_resource_loaded: Vec<OtelSkillResourceLoaded>,
}

#[napi(object)]
#[derive(Clone)]
pub struct OtelOverflowRequest {
    pub index: u32,
    pub event_index: u32,
    pub trace_id: String,
    pub observation_id: String,
    pub field: String,
    pub metadata_index: Option<u32>,
    pub byte_length: f64,
    pub sha256_hash: String,
}

#[napi(object, object_from_js = false)]
pub struct FinalizedOtelEvent {
    pub event: PreparedEvent,
    pub trace_id: String,
    pub start_time_iso: String,
    pub environment: String,
    /// JSON byte size after applying oversized-field upload results, for selected traces.
    pub serialized_event_bytes: Option<f64>,
}

#[napi(object, object_from_js = false)]
pub struct FinalizedOtelBatch {
    pub events: Vec<FinalizedOtelEvent>,
    /// Evaluation snapshots preserve full fields before oversized-field replacements.
    #[napi(ts_type = "object[]")]
    pub evaluation_rows: Vec<serde_json::Value>,
}

#[napi(object, object_from_js = false)]
pub struct PreparedOtelBatch {
    pub batch: RustOtelBatch,
    pub media_requests: Vec<OtelMediaRequest>,
    pub lookup_requests: Vec<OtelLookupRequest>,
    pub trace_ids: Vec<String>,
}

#[napi(object, object_from_js = false)]
pub struct OtelCompletion {
    pub finalized: Option<FinalizedOtelBatch>,
    pub overflow_requests: Vec<OtelOverflowRequest>,
}

#[napi]
impl EarlyOtelBatch {
    /// Parse the compact document and return media and lookup requests for Node.
    #[napi(ts_return_type = "Promise<PreparedOtelBatch>")]
    pub fn process(
        &mut self,
        env: Env,
        context: OtelProcessingContext,
    ) -> napi::Result<AsyncTask<OwnedTask<PreparedOtelBatch>>> {
        let source = self.take_data().map_err(|error| to_js_error(env, error))?;
        Ok(AsyncTask::new(OwnedTask::new(move || {
            // Decode one resource at a time, limiting temporary materialization to the current
            // resource-span object. Normalize each resource with JavaScript number semantics
            // before appending its events to the batch.
            let mut events = source.consume_json(|json| {
                process_to_events(
                    json.as_bytes(),
                    &EventBuildConfig {
                        project_id: context.project_id,
                        ingestion_api_key: context.ingestion_api_key,
                        ingestion_sdk_name: context.ingestion_sdk_name,
                        ingestion_sdk_version: context.ingestion_sdk_version,
                        fallback_time: context.now.clone(),
                        is_langfuse_internal: context.is_langfuse_internal,
                        ..EventBuildConfig::default()
                    },
                )
                .map_err(failure)
            })?;
            // Restore media in identifiers, model names, prompt names, parent IDs, and model
            // parameters. Input, output, and metadata retain temporary references for completion.
            if !source.media.is_empty() {
                for event in &mut events {
                    for text in [&mut event.row.trace_id, &mut event.row.span_id] {
                        media::restore_text(text, &source.media)?;
                    }
                    for text in [
                        &mut event.row.provided_model_name,
                        &mut event.row.prompt_name,
                        &mut event.row.parent_span_id,
                    ]
                    .into_iter()
                    .flatten()
                    {
                        media::restore_text(text, &source.media)?;
                    }
                    if let Some(value) = &mut event.model_parameters {
                        media::restore_value(value, &source.media)?;
                    }
                }
            }
            let trace_ids = events
                .iter()
                .map(|event| event.trace_id.clone())
                .collect::<HashSet<_>>()
                .into_iter()
                .collect();
            let mut pipeline = Pipeline {
                source,
                rows: BatchRows::Prepared(events),
                context: StorageContext {
                    blob_storage_file_path: context.file_key,
                    created_at: context.now.clone(),
                    updated_at: context.now.clone(),
                    event_ts: context.now,
                },
                media_requests: Vec::new(),
                late_media: Vec::new(),
                overflow_requests: Vec::new(),
            };
            let media_requests = media::collect_media_requests(&mut pipeline)?;
            let lookup_requests = rows::collect_lookup_requests(&pipeline);
            let batch = RustOtelBatch {
                state: Arc::new(Mutex::new(Some(pipeline))),
            };
            Ok(PreparedOtelBatch {
                batch,
                media_requests,
                lookup_requests,
                trace_ids,
            })
        })))
    }
}

impl RustOtelBatch {
    fn run<T: Send + ToNapiValue + TypeName + 'static>(
        &self,
        work: impl FnOnce(&mut Pipeline) -> NativeResult<T> + Send + 'static,
    ) -> AsyncTask<OwnedTask<T>> {
        let state = Arc::clone(&self.state);
        AsyncTask::new(OwnedTask::new(move || {
            let mut guard = state
                .lock()
                .map_err(|_| failure("OTEL processing lock poisoned"))?;
            let result = {
                let pipeline = guard
                    .as_mut()
                    .ok_or_else(|| failure("OTEL batch already disposed"))?;
                work(pipeline)
            };
            if guard
                .as_ref()
                .is_some_and(|pipeline| matches!(pipeline.rows, BatchRows::Finalized))
            {
                guard.take();
            }
            result
        }))
    }
}

#[napi]
impl RustOtelBatch {
    /// Release the native batch and its retained event and media allocations.
    #[napi(ts_return_type = "Promise<void>")]
    pub fn dispose<'env>(
        &self,
        env: &'env Env,
    ) -> napi::Result<Either<AsyncTask<OwnedTask<()>>, PromiseRaw<'env, ()>>> {
        if self.state.try_lock().is_ok_and(|state| state.is_none()) {
            return PromiseRaw::resolve(env, ()).map(Either::B);
        }
        let state = Arc::clone(&self.state);
        Ok(Either::A(AsyncTask::new(OwnedTask::new(move || {
            state
                .lock()
                .map_err(|_| failure("OTEL processing lock poisoned"))?
                .take();
            Ok(())
        }))))
    }

    #[napi(ts_return_type = "Promise<Buffer>")]
    pub fn media_body(&self, index: u32) -> AsyncTask<OwnedTask<Buffer>> {
        self.run(move |state| {
            media::media_entry(state, index)?
                .decode()
                .map(Buffer::from)
                .map_err(failure)
        })
    }

    /// Apply media and lookup results; return final handles or oversized-field upload requests.
    #[napi(
        ts_args_type = "mediaResults: OtelMediaResolution[], lookups: object[], overflowLimitBytes: number | undefined, includeEvaluationRows: boolean, traceActivityIds?: string[]",
        ts_return_type = "Promise<OtelCompletion>"
    )]
    pub fn complete(
        &self,
        media_results: Vec<OtelMediaResolution>,
        lookups: Vec<serde_json::Value>,
        overflow_limit_bytes: Option<f64>,
        include_evaluation_rows: bool,
        trace_activity_ids: Option<Vec<String>>,
    ) -> AsyncTask<OwnedTask<OtelCompletion>> {
        self.run(move |state| {
            let BatchRows::Prepared(events) = &state.rows else {
                return Err(failure("OTEL batch already enriched"));
            };
            validate_results(
                &media_results,
                state.media_requests.len(),
                "incomplete OTEL media results",
            )?;
            if lookups.len()
                != events
                    .iter()
                    .filter(|event| rows::needs_lookup(event))
                    .count()
            {
                return Err(failure("incomplete OTEL lookup results"));
            }
            if overflow_limit_bytes
                .is_some_and(|limit| !limit.is_finite() || limit <= 0.0 || limit.fract() != 0.0)
            {
                return Err(failure("overflow limit must be a positive integer"));
            }
            media::resolve_media_inner(state, media_results)?;
            rows::enrich_inner(state, lookups)?;
            let overflow_requests = overflow_limit_bytes
                .map(|limit| rows::overflow_requests_inner(state, limit))
                .transpose()?
                .unwrap_or_default();
            if overflow_requests.is_empty() {
                let finalized = rows::finalize_inner(
                    state,
                    Vec::new(),
                    include_evaluation_rows,
                    trace_activity_ids,
                )?;
                Ok(OtelCompletion {
                    finalized: Some(finalized),
                    overflow_requests,
                })
            } else {
                Ok(OtelCompletion {
                    finalized: None,
                    overflow_requests,
                })
            }
        })
    }

    #[napi(ts_return_type = "Promise<Buffer>")]
    pub fn overflow_body(&self, index: u32) -> AsyncTask<OwnedTask<Buffer>> {
        self.run(move |state| {
            let request = state
                .overflow_requests
                .get(index as usize)
                .ok_or_else(|| failure("unknown overflow request"))?;
            let rows = state.rows.ready()?;
            let value = rows::overflow_text(request, rows);
            Ok(Buffer::from(value.as_bytes().to_vec()))
        })
    }

    /// Apply oversized-field upload results and return immutable handles to the ClickHouse writer.
    #[napi(ts_return_type = "Promise<FinalizedOtelBatch>")]
    pub fn finalize(
        &self,
        overflow: Vec<OtelMediaResolution>,
        include_evaluation_rows: bool,
        trace_activity_ids: Option<Vec<String>>,
    ) -> AsyncTask<OwnedTask<FinalizedOtelBatch>> {
        self.run(move |state| {
            rows::finalize_inner(state, overflow, include_evaluation_rows, trace_activity_ids)
        })
    }
}

fn validate_results(
    results: &[OtelMediaResolution],
    count: usize,
    error: &'static str,
) -> NativeResult<()> {
    if results.len() != count
        || results
            .iter()
            .enumerate()
            .any(|(index, result)| result.index as usize != index)
    {
        return Err(failure(error));
    }
    Ok(())
}

fn failure(error: impl std::fmt::Display) -> Error<&'static str> {
    Error::new("ERR_OTEL_PROCESSING", error.to_string())
}
