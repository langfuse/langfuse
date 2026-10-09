//! Decide which OTLP fields to inspect and which media types are supported.
//!
//! `MediaScanMode` records where the walk is in the document. An OTLP attribute name
//! must stay intact; the attribute's value can contain media. For example:
//!
//! ```text
//! span                                      Envelope
//!   `-- attributes[]                        Attributes
//!        |-- key: "attachment"              Disabled (attribute name)
//!        `-- value                          AnyValue (OTLP value wrapper)
//!             `-- stringValue: "data:..."    Payload (inspect for media)
//! ```
//!
//! Inside a user payload, every field can contain media, even one named `key`.
//! The marker checks cheaply select text worth scanning; the MIME allowlist limits
//! supported content types. The scanner then validates the actual media encoding.

use std::sync::LazyLock;

use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};

// Leave sub-KiB encoded candidates (including a Data URI header) for the later
// media pass to limit per-occurrence descriptors and hash entries. The 1 KiB
// cutoff favors measured replay gains for small attachments; escaped embedded
// media can still retain more memory than leaving it inline.
pub(super) const MIN_EARLY_MEDIA_BYTES: usize = 1024;

pub(super) const DATA_URI_PREFIX: &str = "data:";
pub(super) const BASE64_MARKER: &str = ";base64,";
pub(super) const MEDIA_REFERENCE_PREFIX: &str = "@@@langfuseMedia:";
pub(super) const MEDIA_REFERENCE_SUFFIX: &str = "@@@";
static MEDIA_CANDIDATE_MARKERS: LazyLock<AhoCorasick> = LazyLock::new(|| {
    // This predicate only asks whether any marker occurs. One matcher avoids
    // rescanning marker-free input once for every literal. In local ARM64
    // release runs (Sep 2026), 2 MiB marker-free text took 604–627 µs with
    // `contains`, 207–223 µs with LeftmostFirst, and 2,394–2,483 µs with
    // Standard (warm matchers, reversed-order rounds).
    AhoCorasickBuilder::new()
        .match_kind(MatchKind::LeftmostFirst)
        .build([
            DATA_URI_PREFIX,
            MEDIA_REFERENCE_PREFIX,
            "\\u",
            "media_type",
            "mime_type",
            "mediaType",
            "mimeType",
            "inline_data",
            "inlineData",
        ])
        .expect("media candidate markers are valid patterns")
});

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum MediaScanMode {
    /// A generic payload; candidates are eligible in every field.
    Payload,
    /// An OTLP KeyValue list; keys are metadata names and values contain data.
    Attributes,
    /// An OTLP AnyValue wrapper; map keys remain structural until a value is data.
    AnyValue,
    /// The OTLP envelope; only known payload-bearing descendants enter `Payload`.
    Envelope,
    /// A field whose strings are not eligible for extraction.
    Disabled,
}

pub(super) fn is_otel_envelope_field(field: &str) -> bool {
    matches!(
        field,
        "resourceSpans"
            | "resourceLogs"
            | "resourceMetrics"
            | "scopeSpans"
            | "scopeLogs"
            | "scopeMetrics"
    )
}

/// Select the scanning mode for one object field. Generic payload fields remain
/// eligible; envelope fields are enabled only at known data-bearing boundaries.
/// Structural fields and unknown envelope fields remain disabled.
pub(super) fn media_scan_mode_for_field(parent: MediaScanMode, field: &str) -> MediaScanMode {
    match parent {
        MediaScanMode::Disabled => MediaScanMode::Disabled,
        MediaScanMode::Payload => MediaScanMode::Payload,
        MediaScanMode::Attributes => match field {
            // OTLP KeyValue keys are metadata names, never media payloads.
            "key" => MediaScanMode::Disabled,
            "value" => MediaScanMode::AnyValue,
            "values" => MediaScanMode::Attributes,
            _ => MediaScanMode::Disabled,
        },
        MediaScanMode::AnyValue => match field {
            "kvlistValue" => MediaScanMode::Attributes,
            "arrayValue" | "values" => MediaScanMode::AnyValue,
            "stringValue" | "bytesValue" => MediaScanMode::Payload,
            _ => MediaScanMode::Disabled,
        },
        MediaScanMode::Envelope => match field {
            // These fields contain envelope objects whose data-bearing children
            // are classified by the branches below.
            "resourceSpans" | "scopeSpans" | "spans" | "resource" | "scope" | "events"
            | "links" | "resourceLogs" | "scopeLogs" | "logRecords" => MediaScanMode::Envelope,
            // Attribute values and bodies contain user data.
            "attributes" => MediaScanMode::Attributes,
            "body" | "value" => MediaScanMode::AnyValue,
            _ => MediaScanMode::Disabled,
        },
    }
}

pub(super) fn is_supported_content_type(value: &str) -> bool {
    matches!(
        value,
        "image/png"
            | "image/jpeg"
            | "image/jpg"
            | "image/webp"
            | "image/gif"
            | "image/svg+xml"
            | "image/tiff"
            | "image/bmp"
            | "image/avif"
            | "image/heic"
            | "audio/mpeg"
            | "audio/mp3"
            | "audio/wav"
            | "audio/ogg"
            | "audio/oga"
            | "audio/aac"
            | "audio/mp4"
            | "audio/flac"
            | "audio/opus"
            | "audio/webm"
            | "video/mp4"
            | "video/webm"
            | "video/ogg"
            | "video/mpeg"
            | "video/quicktime"
            | "video/x-msvideo"
            | "video/x-matroska"
            | "text/plain"
            | "text/html"
            | "text/css"
            | "text/csv"
            | "text/markdown"
            | "text/x-python"
            | "application/javascript"
            | "text/x-typescript"
            | "application/x-yaml"
            | "application/pdf"
            | "application/msword"
            | "application/vnd.ms-excel"
            | "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            | "application/octet-stream"
            | "application/json"
            | "application/xml"
            | "application/zip"
            | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            | "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            | "application/rtf"
            | "application/x-ndjson"
            | "application/vnd.apache.parquet"
            | "application/gzip"
            | "application/x-tar"
            | "application/x-7z-compressed"
    )
}

pub(super) fn is_media_reference(value: &str) -> bool {
    value.starts_with(MEDIA_REFERENCE_PREFIX) && value.ends_with(MEDIA_REFERENCE_SUFFIX)
}

pub(super) fn may_contain_serialized_media(value: &str) -> bool {
    let has_data = value.contains("\"data\"");
    let has_mime_type = value.contains("\"mime_type\"");
    let has_provider_shape = (has_data && (value.contains("\"media_type\"") || has_mime_type))
        || (value.contains("\"content\"") && has_mime_type)
        || ((has_data || value.contains("\"image\"")) && value.contains("\"mediaType\""))
        || (has_data
            && (value.contains("\"inline_data\"") || value.contains("\"inlineData\""))
            && (has_mime_type || value.contains("\"mimeType\"")));
    // In JSON.stringify(JSON.stringify(metadata)), quotes in the metadata
    // document are escaped, so the precise provider-key checks above do not
    // match. The broad marker scan is safe for a quoted root and keeps this
    // path from affecting ordinary object documents.
    let has_quoted_root_candidate =
        value.trim_start().starts_with('"') && may_contain_media_candidate(value);
    has_provider_shape || has_quoted_root_candidate
}

/// Return true when a validated document might contain a media candidate.
/// Unicode escapes are included because they can spell a marker after decoding.
pub(super) fn may_contain_media_candidate(value: &str) -> bool {
    // Broad fragments are intentional: false positives only select the full
    // walk, while escaped nesting remains discoverable.
    MEDIA_CANDIDATE_MARKERS.is_match(value)
}

pub(super) fn may_be_serialized_json(value: &str) -> bool {
    match value.trim_start().as_bytes().first() {
        Some(b'{' | b'[') => true,
        // SDKs can JSON-encode a metadata value that is already JSON text or a
        // string. It then arrives as a JSON string root. Limit this path to
        // strings with media markers so ordinary quoted values do not trigger
        // another validation and structural walk.
        Some(b'"') => may_contain_media_candidate(value),
        _ => false,
    }
}
