//! Extract inline media before and after OTLP normalization.
//!
//! Before normalization, `ValidatedPayload::compact` replaces media in JSON text
//! with temporary references. After normalization, `extract_normalized_media`
//! finds additional media in Rust `Value`s, including provider objects assembled
//! from OTLP attributes. Both retain extracted media for upload or inline restoration.
//!
//! Data URIs supply their own MIME type; raw base64 and Python bytes require
//! recognized provider fields to identify the body and MIME type. Both passes
//! also inspect JSON stored inside strings, within their nesting limits.
//!
//! `validate` takes ownership of the input buffer. `compact` returns JSON text
//! with references and media records that keep source bytes through `Arc` or a copy.
//! The pipeline retains those records until uploads finish; failed uploads use
//! them to restore the original text.

use std::collections::HashSet;

mod data_uri;
mod encoding;
mod json;
mod json_cursor;
mod normalized;
mod normalized_shapes;
mod payload;
mod provider_shapes;
mod rules;
mod scanner;
mod source_text;
mod structural_walk;

/// Test-only counters for traversal scaling. Production builds compile the fields out and
/// `add_bytes` becomes a no-op. Tests use them to detect repeated traversal and growing
/// index allocations; timing remains outside this instrumentation.
#[derive(Default)]
pub(super) struct WalkStats {
    // Instrumented cursor advances and marker scans; library-internal reads are uncounted.
    #[cfg(test)]
    pub(super) bytes_walked: usize,
    // Stack and candidate-vector capacities; retained media has separate accounting.
    #[cfg(test)]
    pub(super) peak_index_bytes: usize,
}

impl WalkStats {
    #[inline(always)]
    pub(super) fn add_bytes(&mut self, bytes: usize) {
        #[cfg(test)]
        {
            self.bytes_walked = self.bytes_walked.saturating_add(bytes);
        }
        #[cfg(not(test))]
        {
            let _ = bytes;
        }
    }

    #[cfg(test)]
    pub(super) fn update_peak(&mut self, bytes: usize) {
        self.peak_index_bytes = self.peak_index_bytes.max(bytes);
    }
}

pub use normalized::{extract_normalized_media, MediaReferenceCollector};
pub use payload::EarlyMediaError;
pub use payload::{validate, EarlyMediaResult, ExtractedMedia, ValidatedPayload};
pub(crate) use rules::may_contain_media_candidate;
pub use source_text::rewrite_known_references;

use scanner::MAX_EMBEDDED_JSON_DEPTH;

const MAX_LEGACY_MEDIA_DEPTH: usize = 10;

/// Run extraction for a JSON value nested in a parsed string, carrying its parent
/// document depth into discovery so embedded-document limits remain cumulative.
pub(crate) fn extract_media_at_depth(
    input: &[u8],
    embedded_depth: usize,
    min_candidate_bytes: usize,
) -> Result<EarlyMediaResult, EarlyMediaError> {
    let text = std::str::from_utf8(input).map_err(|error| EarlyMediaError::InvalidJson {
        offset: error.valid_up_to(),
        message: "invalid UTF-8",
    })?;
    json::validate_json(text)?;
    let mut manifest = scanner::discover_at_depth(text, embedded_depth, min_candidate_bytes)?;
    // Discovery receives the parent depth. Compaction removes this document's outer
    // escape layer, so restoration and upload counts refer to its remaining layers.
    for entry in &mut manifest.entries {
        entry.original_json_depth -= embedded_depth as u8;
        entry.json_decode_layers = entry
            .json_decode_layers
            .saturating_sub(embedded_depth as u8);
    }
    payload::compact_manifest(text, manifest)
}

/// Collect temporary-reference markers found in the supplied text.
pub fn collect_media_references(value: &str, references: &mut HashSet<String>) {
    source_text::for_each_media_reference(value, |reference| {
        references.insert(reference.to_owned());
    });
}

/// Check that extracted occurrences have distinct temporary references. Content
/// hashes may repeat; restoration addresses each occurrence by its reference.
pub fn validate_media_registry(
    existing: &[ExtractedMedia],
    additions: &[ExtractedMedia],
) -> Result<(), EarlyMediaError> {
    let mut references = HashSet::new();
    for media in existing.iter().chain(additions) {
        let reference = media.reference();
        if !references.insert(reference.clone()) {
            return Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity { reference });
        }
    }
    Ok(())
}

#[cfg(test)]
pub fn extract_media(input: &[u8]) -> Result<EarlyMediaResult, payload::EarlyMediaError> {
    validate(input.to_vec())?.compact()
}

#[cfg(test)]
mod tests;
