//! Early validation and media extraction for OTEL JSON payloads.
//!
//! Syntax validation and media discovery are separate passes over owned bytes.
//! Neither constructs a complete `serde_json::Value` tree. Discovery records
//! source ranges; compaction replaces those ranges before normalization parses
//! the smaller document.
//!
//! Temporary references identify occurrences, so moving a value during normalization
//! preserves its exact restoration target. Content hashes deduplicate uploads instead.
//! Discovery intentionally supersets the legacy detector; the consumer resolves
//! eligibility after normalization and restores ineligible occurrences before side effects.
//! Direct and nested candidates retain ranges into one source allocation when
//! escaping leaves their text unchanged; escaped candidate text needs an owned copy.

mod encoding;
mod json;
mod payload;
mod rules;
mod scanner;

pub use payload::{validate, EarlyMediaResult, ExtractedMedia, ValidatedPayload};

#[cfg(test)]
pub fn extract_media(input: &[u8]) -> Result<EarlyMediaResult, payload::EarlyMediaError> {
    validate(input.to_vec())?.compact()
}

#[cfg(test)]
mod tests;
