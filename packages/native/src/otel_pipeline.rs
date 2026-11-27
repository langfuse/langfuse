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
//! fields. `lookups` reads the lookup results Node hands back. This file defines
//! the N-API methods and batch states.

use std::collections::HashSet;
use std::sync::{Arc, Mutex};

use napi::bindgen_prelude::*;
use napi_derive::napi;

use crate::native_memory::{retained_size, NativeMemory, RetainedSize};
use crate::native_schema::OtelStorageRow;
use crate::native_task::{to_js_error, NativeResult, OwnedTask};
use crate::otel::{process_to_events, EventBuildConfig, OwnedEvent, StorageContext};
use crate::otel_input::{EarlyOtelBatch, ExtractedBatch};
use crate::otel_media::ExtractedMedia;
use crate::PreparedEvent;

mod lookups;
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
impl OtelProcessingContext {
    fn into_configs(self) -> (EventBuildConfig, StorageContext) {
        let build = EventBuildConfig {
            project_id: self.project_id,
            ingestion_api_key: self.ingestion_api_key,
            ingestion_sdk_name: self.ingestion_sdk_name,
            ingestion_sdk_version: self.ingestion_sdk_version,
            fallback_time: self.now.clone(),
            is_langfuse_internal: self.is_langfuse_internal,
            ..EventBuildConfig::default()
        };
        // Every row stores these three timestamps, so convert the shared value once.
        let stored_at = crate::otel::types::to_clickhouse_datetime(&self.now);
        let storage = StorageContext {
            blob_storage_file_path: self.file_key,
            created_at: stored_at.clone(),
            updated_at: stored_at.clone(),
            event_ts: stored_at,
        };
        (build, storage)
    }
}

struct Pipeline {
    source: Arc<ExtractedBatch>,
    memory: Arc<NativeMemory>,
    rows: BatchRows,
    lookups: rows::LookupPlan,
    context: StorageContext,
    media_requests: Vec<u32>,
    late_media: Vec<ExtractedMedia>,
    overflow_requests: Vec<OtelOverflowRequest>,
}

impl Pipeline {
    fn new(
        source: Arc<ExtractedBatch>,
        events: Vec<OwnedEvent>,
        context: StorageContext,
        memory: Arc<NativeMemory>,
    ) -> Self {
        Self {
            source,
            memory,
            rows: BatchRows::Prepared(events),
            lookups: rows::LookupPlan::default(),
            context,
            media_requests: Vec::new(),
            late_media: Vec::new(),
            overflow_requests: Vec::new(),
        }
    }
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
    evaluation_fields: Option<Box<crate::otel::types::JsonObject>>,
}

impl RetainedSize for EnrichedStorageRow {
    fn retained_bytes(&self) -> usize {
        let Self {
            row,
            start_time_iso,
            evaluation_fields,
        } = self;
        retained_size(row) + retained_size(start_time_iso) + retained_size(evaluation_fields)
    }
}

impl Pipeline {
    fn refresh_memory(&self) {
        self.memory.resize(self.retained_bytes());
    }

    fn retained_bytes(&self) -> usize {
        let Self {
            source: _, // The source batch has its own tracker.
            memory: _,
            rows,
            lookups,
            context,
            media_requests,
            late_media,
            overflow_requests,
        } = self;
        let row_bytes = match rows {
            BatchRows::Prepared(rows) => retained_size(rows),
            BatchRows::Ready(rows) => retained_size(rows),
            // Finalized rows carry the shared tracker through PreparedEvent handles.
            BatchRows::Finalized => return 0,
        };
        let mut media_seen = std::collections::HashSet::new();
        let mut late_sources = HashSet::new();
        let late_source_bytes = late_media
            .iter()
            .filter_map(ExtractedMedia::source_allocation)
            .filter(|(source, _)| late_sources.insert(*source))
            .map(|(_, bytes)| bytes)
            .sum::<usize>();
        let late_media_bytes = late_media.capacity() * std::mem::size_of::<ExtractedMedia>()
            + late_media
                .iter()
                .map(|media| media.retained_bytes(&mut media_seen))
                .sum::<usize>()
            + late_source_bytes;
        std::mem::size_of::<Self>()
            + row_bytes
            + retained_size(&lookups.request_of)
            + retained_size(media_requests)
            + late_media_bytes
            + retained_size(overflow_requests)
            + retained_size(context)
    }
}

#[napi]
pub struct RustOtelBatch {
    state: Arc<Mutex<Option<Pipeline>>>,
    evaluation_rows: Arc<Mutex<EvaluationRows>>,
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

/// Lookup results in the flat form written by the worker's `encodeOtelLookups`.
///
/// `lengths` and `numbers` are typed arrays because a typed array is handed to Rust as a
/// whole, while a plain array is read one element at a time on Node's main thread.
#[napi(object, object_to_js = false)]
pub struct EncodedOtelLookups {
    /// Every text field in a fixed order, each followed by a line feed.
    pub text: String,
    /// The length of each text field in UTF-16 code units.
    pub lengths: Uint32Array,
    /// Counts, flags and numeric fields in the order they are read.
    pub numbers: Float64Array,
}

/// One lookup the worker resolves. Events that would make the same request share it;
/// `span_id` names the first of them.
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
    /// Estimated dispatch weight after field overflow, present only for sampled traces.
    pub serialized_event_bytes: Option<f64>,
}

#[napi(object, object_from_js = false)]
pub struct FinalizedOtelBatch {
    pub events: Vec<FinalizedOtelEvent>,
    /// The columns named by `evaluationFilterColumns`, as JSON arrays that together hold one
    /// object per event, in event order. A large batch spans several texts because a single one
    /// could exceed the longest string JavaScript can hold. The full rows stay in the batch for
    /// `takeEvaluationRow`.
    pub evaluation_filter_rows: Option<Vec<String>>,
}

/// Evaluation snapshots outlive the pipeline so Node copies only the rows a rule selects.
/// They preserve full fields before oversized-field replacements.
#[derive(Default)]
struct EvaluationRows {
    rows: Vec<serde_json::Value>,
    /// Columns Node already received in the filter rows; a taken row leaves them out.
    filter_columns: Vec<String>,
    /// Bytes reported for `rows` at finalization. They are released together when the rows are
    /// dropped, so taking a row needs no accounting on Node's main thread.
    retained: usize,
    memory: Option<Arc<NativeMemory>>,
}

/// Where finalization keeps the evaluation snapshots, and the columns Node asked for as
/// filter rows.
type EvaluationRequest = (Arc<Mutex<EvaluationRows>>, Vec<String>);

impl Drop for EvaluationRows {
    fn drop(&mut self) {
        if let Some(memory) = &self.memory {
            memory.release(self.retained);
        }
    }
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
        let pipeline_memory = Arc::new(NativeMemory::new(&env, 0)?);
        let source = self.take_data().map_err(|error| to_js_error(env, error))?;
        Ok(AsyncTask::new(OwnedTask::new(move || {
            let (build_config, storage_context) = context.into_configs();
            let mut events = parse_events(&source, &build_config)?;
            media::restore_lookup_fields(&mut events, &source.media)?;
            let trace_ids = unique_trace_ids(&events);
            let mut pipeline = Pipeline::new(source, events, storage_context, pipeline_memory);
            let media_requests = media::collect_media_requests(&mut pipeline)?;
            let (lookup_requests, lookups) = rows::collect_lookup_requests(&pipeline);
            pipeline.lookups = lookups;
            pipeline.refresh_memory();
            let batch = RustOtelBatch {
                state: Arc::new(Mutex::new(Some(pipeline))),
                evaluation_rows: Arc::default(),
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
    fn evaluation_request(&self, filter_columns: Option<Vec<String>>) -> Option<EvaluationRequest> {
        filter_columns.map(|filter_columns| (Arc::clone(&self.evaluation_rows), filter_columns))
    }

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
        if self.state.try_lock().is_ok_and(|state| state.is_none())
            && self
                .evaluation_rows
                .try_lock()
                .is_ok_and(|evaluation| evaluation.rows.is_empty())
        {
            return PromiseRaw::resolve(env, ()).map(Either::B);
        }
        let state = Arc::clone(&self.state);
        let evaluation_rows = Arc::clone(&self.evaluation_rows);
        Ok(Either::A(AsyncTask::new(OwnedTask::new(move || {
            state
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .take();
            drop(std::mem::take(
                &mut *evaluation_rows
                    .lock()
                    .unwrap_or_else(std::sync::PoisonError::into_inner),
            ));
            Ok(())
        }))))
    }

    /// Move one evaluation snapshot to JavaScript, without the columns its filter row already
    /// carries. Each row can be taken once, before disposal.
    #[napi(ts_return_type = "object")]
    pub fn take_evaluation_row(&self, env: Env, index: u32) -> napi::Result<serde_json::Value> {
        let mut evaluation = self
            .evaluation_rows
            .lock()
            .map_err(|_| to_js_error(env, failure("OTEL processing lock poisoned")))?;
        let mut row = evaluation
            .rows
            .get_mut(index as usize)
            .map(std::mem::take)
            .filter(|row| !row.is_null())
            .ok_or_else(|| to_js_error(env, failure("evaluation row is unavailable")))?;
        if let serde_json::Value::Object(columns) = &mut row {
            for column in &evaluation.filter_columns {
                columns.swap_remove(column);
            }
        }
        Ok(row)
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

    /// Apply media results and one lookup result per lookup request; return final handles or
    /// oversized-field upload requests. With `evaluationFilterColumns`, the batch keeps an
    /// evaluation snapshot of every row and returns those columns of each as filter rows.
    #[napi(
        ts_args_type = "mediaResults: OtelMediaResolution[], lookups: EncodedOtelLookups, overflowLimitBytes: number | undefined, evaluationFilterColumns: string[] | undefined, traceActivityIds?: string[]",
        ts_return_type = "Promise<OtelCompletion>"
    )]
    pub fn complete(
        &self,
        media_results: Vec<OtelMediaResolution>,
        lookups: EncodedOtelLookups,
        overflow_limit_bytes: Option<f64>,
        evaluation_filter_columns: Option<Vec<String>>,
        trace_activity_ids: Option<Vec<String>>,
    ) -> AsyncTask<OwnedTask<OtelCompletion>> {
        // The typed arrays in `lookups` remain JavaScript's memory, which it can write to while
        // the task runs off the main thread. The task therefore gets its own copy of them.
        let lookups = lookups::EncodedLookups {
            text: lookups.text,
            lengths: lookups.lengths.to_vec(),
            numbers: lookups.numbers.to_vec(),
        };
        let evaluation = self.evaluation_request(evaluation_filter_columns);
        self.run(move |state| {
            let lookups = lookups::decode(&lookups)?;
            validate_completion(state, &media_results, lookups.len(), overflow_limit_bytes)?;
            media::resolve_media_inner(state, media_results)?;
            rows::enrich_inner(state, &lookups)?;
            rows::finalize_or_request_overflow(
                state,
                overflow_limit_bytes,
                evaluation,
                trace_activity_ids,
            )
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
        evaluation_filter_columns: Option<Vec<String>>,
        trace_activity_ids: Option<Vec<String>>,
    ) -> AsyncTask<OwnedTask<FinalizedOtelBatch>> {
        let evaluation = self.evaluation_request(evaluation_filter_columns);
        self.run(move |state| rows::finalize_inner(state, overflow, evaluation, trace_activity_ids))
    }
}

fn parse_events(
    source: &ExtractedBatch,
    config: &EventBuildConfig,
) -> NativeResult<Vec<OwnedEvent>> {
    // Decode and normalize one resource at a time so temporary objects do not grow
    // with the full batch. The compact JSON can be released once its events are owned.
    source.consume_json(|json| process_to_events(json.as_bytes(), config).map_err(failure))
}

fn unique_trace_ids(events: &[OwnedEvent]) -> Vec<String> {
    events
        .iter()
        .map(|event| event.trace_id.clone())
        .collect::<HashSet<_>>()
        .into_iter()
        .collect()
}

fn validate_completion(
    state: &Pipeline,
    media_results: &[OtelMediaResolution],
    lookup_count: usize,
    overflow_limit_bytes: Option<f64>,
) -> NativeResult<()> {
    let BatchRows::Prepared(events) = &state.rows else {
        return Err(failure("OTEL batch already enriched"));
    };
    validate_results(
        media_results,
        state.media_requests.len(),
        "incomplete OTEL media results",
    )?;
    if lookup_count != state.lookups.requests {
        return Err(failure("incomplete OTEL lookup results"));
    }
    if state.lookups.request_of.len()
        != events
            .iter()
            .filter(|event| rows::needs_lookup(event))
            .count()
    {
        return Err(failure("OTEL lookup requests changed after processing"));
    }
    if overflow_limit_bytes
        .is_some_and(|limit| !limit.is_finite() || limit <= 0.0 || limit.fract() != 0.0)
    {
        return Err(failure("overflow limit must be a positive integer"));
    }
    Ok(())
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
