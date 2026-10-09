//! Remove large inline media before ingestion parses and normalizes the JSON.
//!
//! Each extracted attachment becomes a temporary reference in the JSON. Its removed
//! source text is retained for upload or restoration later.
//! For example (reference abbreviated):
//!
//! ```text
//! {"image":"data:image/png;base64,..."} -> {"image":"<media-ref>"} + retained media
//! ```
//!
//! The two entry points separate validation from extraction so masking can run in
//! between. Changed masking output must be validated again before extraction.
//!
//! ```text
//! validate(bytes)
//!   `-- json::validate_json          check syntax with jiter; retain owned bytes
//!        -> ValidatedPayload        checked JSON, not a parsed object tree
//!
//! ValidatedPayload::compact()
//!   |-- scanner::discover
//!   |    |-- structural_walk::scan   find strings that could contain media
//!   |    |    -> Candidate           byte range of one quoted JSON string
//!   |    `-- inspect those strings  decode with jiter; recognize and hash media
//!   |         -> MediaManifest      edit plan: ranges to replace + media metadata
//!   `-- payload::apply_edit_plan     replace those ranges with temporary references
//!        -> EarlyMediaResult        smaller JSON + extracted media records
//! ```
//!
//! Validation and discovery each use a fresh jiter cursor; neither builds a JSON
//! tree. Discovery keeps the field context needed to select media while jiter
//! advances through tokens. Borrowed serde spans handle tokens jiter cannot read.
//! `otel_input` exposes the result through N-API; consumers perform uploads later.

mod data_uri;
mod encoding;
mod json;
mod json_cursor;
mod payload;
mod provider_shapes;
mod rules;
mod scanner;
mod structural_walk;

#[derive(Default)]
pub(super) struct WalkStats {
    #[cfg(test)]
    pub(super) bytes_walked: usize,
    // Capacities for the walk and candidate index. Owned strings and media are
    // measured separately because they have different retention behavior.
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

pub use payload::{validate, EarlyMediaResult, ExtractedMedia, ValidatedPayload};

#[cfg(test)]
pub fn extract_media(input: &[u8]) -> Result<EarlyMediaResult, payload::EarlyMediaError> {
    validate(input.to_vec())?.compact()
}

#[cfg(test)]
mod tests;
