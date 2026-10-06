//! Early validation and media extraction for OTEL JSON payloads.
//!
//! This module deliberately does not deserialize the complete document into
//! `serde_json::Value`. It validates JSON while walking its byte ranges and
//! emits a compact document plus an owned registry for media values removed
//! from that document. The normalizer can therefore parse the compact result
//! without keeping the original document and all large inline values alive.
//!
//! The registry uses the existing public media-reference syntax and derives
//! its ID from the decoded content using the same truncated URL-safe SHA-256
//! convention as the existing media service. Direct and nested candidates keep
//! ranges into the one owned source allocation when escaping leaves their text
//! unchanged; only escaped candidate text needs one owned fallback copy.

mod encoding;
mod json;
mod payload;
mod rules;
mod scanner;

pub use payload::{EarlyMediaResult, ExtractedMedia, ValidatedPayload};
pub use scanner::validate_and_discover;

#[cfg(test)]
pub fn extract_media(input: &[u8]) -> Result<EarlyMediaResult, payload::EarlyMediaError> {
    validate_and_discover(input.to_vec())?.compact()
}

#[cfg(test)]
mod tests;
