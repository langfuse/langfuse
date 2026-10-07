//! Early validation and media extraction for OTEL JSON payloads.
//!
//! Validation and discovery are separate passes over owned bytes. Neither builds
//! a complete `serde_json::Value` tree: discovery records source ranges, and
//! compaction replaces those ranges before the smaller document is normalized.
//!
//! Temporary references identify occurrences, while content hashes deduplicate
//! uploads. Discovery may find candidates that the consumer later rejects after
//! normalization; those occurrences are restored before side effects. Unchanged
//! source text stays as a range into the input allocation; escaped text gets one
//! owned copy.

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
