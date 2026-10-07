//! Owned raw input and extracted-media handles shared by the TS and Rust paths.

use std::sync::Arc;

use napi::bindgen_prelude::*;
use napi::JsString;
use napi_derive::napi;

use crate::native_memory::NativeMemory;
use crate::native_task::OwnedTask;
use crate::otel_media::{self, EarlyMediaResult, ExtractedMedia, ValidatedPayload};

#[napi]
pub struct ValidatedOtelJson {
    payload: Option<(ValidatedPayload, NativeMemory)>,
}

#[napi]
impl ValidatedOtelJson {
    /// Release a superseded masking input without waiting for the JS handle to be collected.
    #[napi(ts_return_type = "Promise<void>")]
    pub fn dispose(&mut self) -> AsyncTask<OwnedTask<()>> {
        let payload = self.payload.take();
        OwnedTask::run("dispose", move || {
            drop(payload);
            Ok(())
        })
    }

    /// Compact the accepted document; media ranges retain its source until both write paths finish.
    #[napi(ts_return_type = "Promise<EarlyOtelBatch>")]
    pub fn extract(&mut self, enabled: bool) -> AsyncTask<OwnedTask<EarlyOtelBatch>> {
        let payload = self.payload.take();
        OwnedTask::run("extract", move || {
            let (validated, memory) = payload.ok_or_else(|| {
                Error::new(
                    "ERR_OTEL_CLOSED",
                    "OTEL input already extracted or disposed",
                )
            })?;
            let result = if enabled {
                validated
                    .compact()
                    .map_err(|error| Error::new(error.code(), error.to_string()))?
            } else {
                let source = validated.into_source();
                EarlyMediaResult {
                    compact_json: source,
                    media: Vec::new(),
                }
            };
            let mut batch = ExtractedBatch {
                json: String::from_utf8(result.compact_json)
                    .map_err(|_| Error::new("ERR_OTEL_INTERNAL", "compacted JSON is not UTF-8"))?,
                media: result.media,
                _memory: memory,
            };
            batch._memory.resize(batch.retained_bytes());
            Ok(EarlyOtelBatch {
                inner: Some(Arc::new(batch)),
            })
        })
    }
}

pub(crate) struct ExtractedBatch {
    pub(crate) json: String,
    pub(crate) media: Vec<ExtractedMedia>,
    _memory: NativeMemory,
}

impl ExtractedBatch {
    fn retained_bytes(&self) -> usize {
        let mut seen = std::collections::HashSet::new();
        self.json.capacity()
            + self.media.capacity() * std::mem::size_of::<ExtractedMedia>()
            + self.media.iter().map(|media| media.retained_bytes(&mut seen)).sum::<usize>()
            // Source-backed entries all share the batch's one source allocation.
            + self.media.iter().find_map(ExtractedMedia::source_capacity).unwrap_or(0)
    }
}

#[napi]
pub struct EarlyOtelBatch {
    inner: Option<Arc<ExtractedBatch>>,
}

impl EarlyOtelBatch {
    pub(crate) fn data(&self) -> Result<Arc<ExtractedBatch>> {
        self.inner
            .as_ref()
            .map(Arc::clone)
            .ok_or_else(|| Error::from_reason("OTEL input already disposed"))
    }
}

#[napi(object)]
pub struct ExtractedOtelMedia {
    pub index: u32,
    pub reference: String,
    pub content_type: String,
    pub sha256_hash: String,
    pub kind: String,
    pub original_byte_length: f64,
}

#[napi]
impl EarlyOtelBatch {
    /// Release this path's source ownership after all legacy/direct consumers have finished.
    #[napi(ts_return_type = "Promise<void>")]
    pub fn dispose(&mut self) -> AsyncTask<OwnedTask<()>> {
        let inner = self.inner.take();
        OwnedTask::run("dispose", move || {
            drop(inner);
            Ok(())
        })
    }

    /// Only the compact document crosses into JS for legacy or TS direct processing.
    #[napi(ts_return_type = "string")]
    pub fn json<'env>(&self, env: &'env Env) -> Result<JsString<'env>> {
        let data = self.data()?;
        env.create_string(&data.json)
    }

    #[napi(getter)]
    pub fn media(&self) -> Result<Vec<ExtractedOtelMedia>> {
        Ok(self
            .data()?
            .media
            .iter()
            .enumerate()
            .map(|(index, media)| ExtractedOtelMedia {
                index: index as u32,
                reference: media.reference(),
                content_type: media.metadata.content_type.clone(),
                sha256_hash: media.metadata.sha256_hash.clone(),
                kind: media.kind.as_str().to_owned(),
                original_byte_length: media.original_byte_length() as f64,
            })
            .collect())
    }

    /// Decode one upload at a time without keeping every decoded body alive.
    #[napi(ts_return_type = "Promise<Buffer>")]
    pub fn media_body(&self, index: u32) -> AsyncTask<OwnedTask<Buffer>> {
        let inner = self.data();
        OwnedTask::run("decode", move || {
            let inner = inner.map_err(|error| Error::new("ERR_OTEL_CLOSED", error.reason))?;
            let media = inner
                .media
                .get(index as usize)
                .ok_or_else(|| Error::new("ERR_OTEL_MEDIA_INDEX", "unknown media index"))?;
            media
                .decode()
                .map(Buffer::from)
                .map_err(|error| Error::new("ERR_OTEL_MEDIA_DECODE", error.to_string()))
        })
    }

    /// Failed uploads restore only the selected occurrence; successful ones use the service ID.
    #[napi(ts_return_type = "Promise<string>")]
    pub fn original_media(&self, index: u32) -> AsyncTask<OwnedTask<String>> {
        let inner = self.data();
        OwnedTask::run("restore", move || {
            let inner = inner.map_err(|error| Error::new("ERR_OTEL_CLOSED", error.reason))?;
            inner
                .media
                .get(index as usize)
                .ok_or_else(|| Error::new("ERR_OTEL_MEDIA_INDEX", "unknown media index"))?
                .original_value()
                .map_err(|error| Error::new("ERR_OTEL_MEDIA_DECODE", error.to_string()))
        })
    }
}

/// Snapshot bytes once on the JS thread. Only Rust-owned memory reaches the validator task;
/// retaining a mutable Node Buffer across an async read would not enforce that ownership.
#[napi(ts_return_type = "Promise<ValidatedOtelJson>")]
pub fn validate_otel_json(
    env: Env,
    bytes: Buffer,
    discover_media: Option<bool>,
) -> Result<AsyncTask<OwnedTask<ValidatedOtelJson>>> {
    let bytes = bytes.to_vec();
    let mut memory = NativeMemory::new(&env, bytes.capacity())?;
    Ok(OwnedTask::run("validate", move || {
        let payload = otel_media::validate(bytes, discover_media.unwrap_or(true))
            .map_err(|error| Error::new(error.code(), error.to_string()))?;
        memory.resize(payload.retained_bytes());
        Ok(ValidatedOtelJson {
            payload: Some((payload, memory)),
        })
    }))
}
