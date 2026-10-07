//! Owned raw input and extracted-media handles shared by the TS and Rust paths.

use std::sync::{Arc, Mutex};

use napi::bindgen_prelude::*;
use napi::{JsError, JsString};
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
    /// Return sanitized bytes only when malformed UTF-8 required replacement.
    /// Masking must see the same source as validation and media discovery.
    #[napi]
    pub fn normalized_bytes(&self, env: Env) -> Result<Option<Buffer>> {
        let (payload, _) = self.payload.as_ref().ok_or_else(|| {
            Error::from(
                napi::JsError::from(Error::new(
                    "ERR_OTEL_CLOSED",
                    "OTEL input already extracted or disposed",
                ))
                .into_unknown(env),
            )
        })?;
        Ok(payload
            .normalized_bytes()
            .map(|bytes| Buffer::from(bytes.to_vec())))
    }

    /// Release a superseded masking input without waiting for the JS handle to be collected.
    #[napi(ts_return_type = "Promise<void>")]
    pub fn dispose(&mut self) -> AsyncTask<OwnedTask<()>> {
        let payload = self.payload.take();
        OwnedTask::run("dispose", move || {
            drop(payload);
            Ok(())
        })
    }

    /// Consume the validated input, optionally extracting media into a new batch.
    #[napi(ts_return_type = "Promise<EarlyOtelBatch>")]
    pub fn extract(&mut self, enabled: bool) -> AsyncTask<OwnedTask<EarlyOtelBatch>> {
        // Claim ownership before scheduling, so a later dispose cannot invalidate this task.
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
            let batch = ExtractedBatch {
                json: Mutex::new(Some(String::from_utf8(result.compact_json).map_err(
                    |_| Error::new("ERR_OTEL_INTERNAL", "compacted JSON is not UTF-8"),
                )?)),
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
    pub(crate) json: Mutex<Option<String>>,
    pub(crate) media: Vec<ExtractedMedia>,
    _memory: NativeMemory,
}

impl ExtractedBatch {
    fn retained_bytes(&self) -> usize {
        let mut seen = std::collections::HashSet::new();
        self.json
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .as_ref()
            .map_or(0, String::capacity)
            + self.media.capacity() * std::mem::size_of::<ExtractedMedia>()
            + self.media.iter().map(|media| media.retained_bytes(&mut seen)).sum::<usize>()
            // Source-backed entries all share the batch's one source allocation.
            + self.media.iter().find_map(ExtractedMedia::source_capacity).unwrap_or(0)
    }

    fn take_json(&self) -> std::result::Result<String, Error<&'static str>> {
        self.json
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .take()
            .ok_or_else(|| Error::new("ERR_OTEL_JSON_CONSUMED", "OTEL JSON already consumed"))
    }
}

#[napi]
pub struct EarlyOtelBatch {
    inner: Option<Arc<ExtractedBatch>>,
}

impl EarlyOtelBatch {
    pub(crate) fn data(&self) -> std::result::Result<Arc<ExtractedBatch>, Error<&'static str>> {
        self.inner
            .as_ref()
            .map(Arc::clone)
            .ok_or_else(|| Error::new("ERR_OTEL_CLOSED", "OTEL input already disposed"))
    }
}

fn to_js_error(env: Env, error: Error<&'static str>) -> Error {
    Error::from(JsError::from(error).into_unknown(env))
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
    /// Release this handle; pending reads retain ownership until they complete.
    #[napi(ts_return_type = "Promise<void>")]
    pub fn dispose(&mut self) -> AsyncTask<OwnedTask<()>> {
        let inner = self.inner.take();
        OwnedTask::run("dispose", move || {
            drop(inner);
            Ok(())
        })
    }

    /// Copy the compact document into a JS string without consuming it.
    #[napi(ts_return_type = "string")]
    pub fn json<'env>(&self, env: &'env Env) -> Result<JsString<'env>> {
        let data = self.data().map_err(|error| to_js_error(*env, error))?;
        let json = data
            .json
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        let json = json.as_ref().ok_or_else(|| {
            to_js_error(
                *env,
                Error::new("ERR_OTEL_JSON_CONSUMED", "OTEL JSON already consumed"),
            )
        })?;
        env.create_string(json)
    }

    /// Copy the compact document into a JS string and release its Rust allocation.
    /// Media metadata and source ranges remain owned by this batch for later reads.
    #[napi(js_name = "takeJson", ts_return_type = "string")]
    pub fn take_json<'env>(&self, env: &'env Env) -> Result<JsString<'env>> {
        let data = self.data().map_err(|error| to_js_error(*env, error))?;
        let json = data.take_json().map_err(|error| to_js_error(*env, error))?;
        let retained = json.capacity();
        let result = env.create_string(&json);
        drop(json);
        data._memory.release(retained);
        result
    }

    #[napi(getter)]
    pub fn media(&self, env: Env) -> Result<Vec<ExtractedOtelMedia>> {
        Ok(self
            .data()
            .map_err(|error| to_js_error(env, error))?
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

    /// Decode one media body. Callers control concurrency and the returned Buffer's lifetime.
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

    /// Read the original encoded text for restoring the selected media occurrence.
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
) -> Result<AsyncTask<OwnedTask<ValidatedOtelJson>>> {
    let bytes = bytes.to_vec();
    let memory = NativeMemory::new(&env, bytes.capacity())?;
    Ok(OwnedTask::run("validate", move || {
        let payload = otel_media::validate(bytes)
            .map_err(|error| Error::new(error.code(), error.to_string()))?;
        memory.resize(payload.retained_bytes());
        Ok(ValidatedOtelJson {
            payload: Some((payload, memory)),
        })
    }))
}
