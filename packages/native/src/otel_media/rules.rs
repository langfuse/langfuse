//! Declarative media markers, MIME policy, and OTLP field classifications.

use std::sync::LazyLock;

use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};

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
    (has_data && (value.contains("\"media_type\"") || has_mime_type))
        || (value.contains("\"content\"") && has_mime_type)
        || ((has_data || value.contains("\"image\"")) && value.contains("\"mediaType\""))
        || (has_data
            && (value.contains("\"inline_data\"") || value.contains("\"inlineData\""))
            && (has_mime_type || value.contains("\"mimeType\"")))
}

/// Return true when a validated document might contain a media candidate.
/// Unicode escapes are included because they can spell a marker after decoding.
pub(super) fn may_contain_media_candidate(value: &str) -> bool {
    // Broad fragments are intentional: false positives only select the full
    // walk, while escaped nesting remains discoverable.
    MEDIA_CANDIDATE_MARKERS.is_match(value)
}

pub(super) fn may_be_serialized_json(value: &str) -> bool {
    matches!(value.trim_start().as_bytes().first(), Some(b'{' | b'['))
}
