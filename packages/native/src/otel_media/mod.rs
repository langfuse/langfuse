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

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::fmt;
use std::ops::Range;
use std::sync::{Arc, LazyLock};

use aho_corasick::{AhoCorasick, AhoCorasickBuilder, MatchKind};
use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::{DecodePaddingMode, Engine};
use jiter::{Jiter, JiterError, JiterErrorType, JsonErrorType, Peek};
use serde::Deserialize;
use serde_json::value::RawValue;
use sha2::{Digest, Sha256};

// Node's Buffer.from(value, "base64") accepts canonical padding, omitted
// padding, and non-zero trailing bits. The TypeScript detector validates the
// character grammar separately, so use the same forgiving decode behavior
// after that grammar check has passed.
const BASE64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

// OTLP envelopes commonly contain more than ten structural levels before their
// attribute values. Validation must accept those ordinary documents; the
// smaller limit applies only to recursively parsing JSON embedded in a string.
const MAX_JSON_DEPTH: usize = 128;
const MAX_EMBEDDED_JSON_DEPTH: usize = 10;
const SOURCE_DETACH_MIN_BYTES: usize = 8 * 1024 * 1024;
const SCAN_CACHE_MIN_BYTES: usize = 1024;
const BASE64_HASH_CHUNK_SIZE: usize = 16 * 1024;
const BASE64_HASH_DECODED_CHUNK_SIZE: usize = BASE64_HASH_CHUNK_SIZE / 4 * 3;
const DATA_URI_PREFIX: &str = "data:";
const BASE64_MARKER: &str = ";base64,";
const MEDIA_REFERENCE_PREFIX: &str = "@@@langfuseMedia:";
const MEDIA_REFERENCE_SUFFIX: &str = "@@@";
static MEDIA_CANDIDATE_MARKERS: LazyLock<AhoCorasick> = LazyLock::new(|| {
    // Without a marker, independent `contains` calls repeatedly scan the body.
    // In local ARM64 release runs (Sep 2026), 2 MiB marker-free text took
    // 604–627 µs with `contains`, 207–223 µs with LeftmostFirst, and
    // 2,394–2,483 µs with Standard (warm matchers, reversed-order rounds).
    // This predicate only asks whether any marker occurs, so LeftmostFirst
    // preserves the result and allows the packed literal prefilter.
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

/// Media shape that was found in the source payload.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MediaPayloadKind {
    DataUri,
    Anthropic,
    Vertex,
    Gemini,
    AiSdkV6,
    AiSdkV7,
}

impl MediaPayloadKind {
    /// Stable labels used by the existing media counters and logs.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::DataUri => "data_uri",
            Self::Anthropic => "anthropic",
            Self::Vertex => "vertex",
            Self::Gemini => "gemini",
            Self::AiSdkV6 => "ai_sdk_v6",
            Self::AiSdkV7 => "ai_sdk_v7",
        }
    }
}

/// Whether the extracted body came from a Data URI or a raw provider value.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MediaSource {
    Base64DataUri,
    Bytes,
}

impl MediaSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Base64DataUri => "base64_data_uri",
            Self::Bytes => "bytes",
        }
    }
}

/// Encoding used by the extracted text. Decoding is intentionally deferred to
/// the upload adapter so extraction does not create a second large allocation.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MediaEncoding {
    /// A complete `data:<type>;base64,<payload>` value.
    Base64DataUri,
    /// A raw base64 provider value without a Data URI header.
    Base64,
    PythonBytesLiteral,
}

/// One media occurrence removed from the compact document.
///
/// The registry is occurrence-based even though `reference` is content-derived
/// and therefore may repeat. Consumers may deduplicate uploads by reference,
/// but must retain the media index (or source range) for failure restoration;
/// two syntactically different values can intentionally share one reference.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExtractedMedia {
    /// Public content-derived reference inserted into `compact_json`.
    pub reference: String,
    pub content_type: String,
    pub kind: MediaPayloadKind,
    pub source: MediaSource,
    pub encoding: MediaEncoding,
    /// Exact source text for the candidate. When the candidate was ASCII-safe
    /// in the original document this is a range into the one source allocation
    /// retained by the registry. A decoded nested JSON value can use the same
    /// range when its encoded media text survived JSON escaping unchanged;
    /// otherwise it falls back to one owned candidate allocation.
    storage: MediaStorage,
    /// Full base64 digest used to derive `reference` and to let the TS upload
    /// adapter skip hashing the decoded body a second time.
    pub sha256_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum MediaStorage {
    Owned(Vec<u8>),
    Source {
        bytes: Arc<Vec<u8>>,
        range: Range<usize>,
    },
}

impl ExtractedMedia {
    /// Decode an extracted candidate only when the storage adapter is ready to
    /// upload it. The encoded text remains owned by the registry for retry and
    /// restoration until that work is complete.
    pub fn decode(&self) -> Result<Vec<u8>, MediaDecodeError> {
        let encoded_data = self.encoded_data();
        match self.encoding {
            MediaEncoding::Base64DataUri => {
                let marker = encoded_data
                    .windows(BASE64_MARKER.len())
                    .position(|window| window == BASE64_MARKER.as_bytes())
                    .ok_or(MediaDecodeError::InvalidDataUri)?;
                BASE64
                    .decode(&encoded_data[marker + BASE64_MARKER.len()..])
                    .map_err(MediaDecodeError::Base64)
            }
            MediaEncoding::Base64 => BASE64
                .decode(encoded_data)
                .map_err(MediaDecodeError::Base64),
            MediaEncoding::PythonBytesLiteral => decode_python_bytes_literal(encoded_data),
        }
    }

    /// Return the exact source representation for restoring one failed
    /// occurrence after normalization.
    pub fn original_value(&self) -> Result<String, MediaDecodeError> {
        String::from_utf8(self.encoded_data().to_vec())
            .map_err(|_| MediaDecodeError::InvalidSourceText)
    }

    /// Number of UTF-8 bytes in the source representation restored when an
    /// upload fails. This is the same unit as the TypeScript media counters.
    pub fn original_byte_length(&self) -> usize {
        self.encoded_data().len()
    }

    fn encoded_data(&self) -> &[u8] {
        match &self.storage {
            MediaStorage::Owned(bytes) => bytes,
            MediaStorage::Source { bytes, range } => &bytes[range.clone()],
        }
    }
}

/// Result of validating and extracting one JSON document.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EarlyMediaResult {
    /// Valid JSON with extracted values replaced by content-derived media references.
    pub compact_json: Vec<u8>,
    /// Media removed from `compact_json`, in source traversal order.
    pub media: Vec<ExtractedMedia>,
    /// Number of source UTF-8 bytes inspected by candidate detection.
    pub checked_bytes: usize,
}

/// An owned source snapshot and the media edit plan found during validation.
/// Keeping this object across masking lets fail-open reuse the original bytes
/// without retaining a compact copy prematurely. Escaped media candidates may
/// carry one owned candidate fallback so restoration preserves their decoded
/// source text.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ValidatedPayload {
    source: Arc<Vec<u8>>,
    pub manifest: MediaManifest,
}

impl ValidatedPayload {
    /// Apply the discovered edits and materialize the media registry once.
    /// Source-backed candidates keep ranges into the owned source allocation.
    pub fn compact(self) -> Result<EarlyMediaResult, EarlyMediaError> {
        let ValidatedPayload { source, manifest } = self;
        if manifest.entries.is_empty() {
            // Validation already proved that no value needs rewriting. Transfer
            // the one owned Vec instead of parsing and copying a large no-media
            // document into an identical compact buffer.
            let compact_json =
                Arc::try_unwrap(source).unwrap_or_else(|source| source.as_ref().clone());
            return Ok(EarlyMediaResult {
                compact_json,
                media: Vec::new(),
                checked_bytes: manifest.checked_bytes,
            });
        }
        apply_edit_plan(source.as_slice(), manifest, Some(Arc::clone(&source)))
    }

    #[cfg(test)]
    pub fn source(&self) -> &[u8] {
        &self.source
    }

    /// Consume the validation handle and transfer its original allocation to a
    /// caller that intentionally keeps the document un-compacted. This is the
    /// no-early-media path; cloning the complete input here would defeat the
    /// ownership boundary even though discovery found no media to rewrite.
    pub fn into_source(self) -> Vec<u8> {
        Arc::try_unwrap(self.source).unwrap_or_else(|source| source.as_ref().clone())
    }
}

/// Discovery output suitable for masking coordination and later compaction.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MediaManifest {
    pub entries: Vec<MediaManifestEntry>,
    pub checked_bytes: usize,
    existing_references: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MediaManifestEntry {
    pub content_type: String,
    pub kind: MediaPayloadKind,
    pub source: MediaSource,
    pub encoding: MediaEncoding,
    /// Exact raw source span replaced during compaction.
    edit_range: Range<usize>,
    /// Source-backed candidate bytes when the raw representation is identical,
    /// or one owned decoded candidate when JSON escaping changed its bytes.
    storage: ManifestMediaStorage,
    reference: String,
    /// Full decoded-content digest computed during discovery. Reusing it during
    /// compaction avoids decoding and hashing the same large media twice.
    sha256_hash: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
enum ManifestMediaStorage {
    SourceRange(Range<usize>),
    Owned(Vec<u8>),
}

/// Validation failures are intentionally structural. The masking adapter can
/// use them to preserve the existing fail-open/fail-closed policy without
/// depending on a `serde_json::Value` error shape.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EarlyMediaError {
    InvalidJson {
        offset: usize,
        message: &'static str,
    },
    /// Node's JSON parser preserves lone UTF-16 surrogates as strings, while
    /// Rust `String` cannot represent them. The caller should use its existing
    /// TypeScript path for this valid-but-unsupported input rather than treat it
    /// as malformed JSON.
    UnsupportedUnicodeSurrogate {
        offset: usize,
    },
    /// The public content-derived reference is ambiguous: either two newly
    /// extracted values have different source representations, or an extracted
    /// value collides with a reference already present in the payload. The TS
    /// path must retain the original payload for these cases so failed uploads
    /// can restore each occurrence exactly.
    UnsupportedMediaReferenceAmbiguity {
        reference: String,
    },
    TrailingBytes {
        offset: usize,
    },
    NestingLimit {
        offset: usize,
    },
    InvalidEditPlan {
        entry: usize,
    },
}

impl fmt::Display for EarlyMediaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidJson { offset, message } => {
                write!(f, "invalid JSON at byte {offset}: {message}")
            }
            Self::UnsupportedUnicodeSurrogate { offset } => write!(
                f,
                "JSON contains a UTF-16 surrogate unsupported by the Rust path at byte {offset}"
            ),
            Self::UnsupportedMediaReferenceAmbiguity { reference } => write!(
                f,
                "media reference is ambiguous for the Rust path: {reference}"
            ),
            Self::TrailingBytes { offset } => write!(f, "trailing JSON bytes at byte {offset}"),
            Self::NestingLimit { offset } => {
                write!(f, "JSON nesting limit exceeded at byte {offset}")
            }
            Self::InvalidEditPlan { entry } => {
                write!(
                    f,
                    "media edit plan has an invalid source span at entry {entry}"
                )
            }
        }
    }
}

impl std::error::Error for EarlyMediaError {}

#[derive(Debug)]
pub enum MediaDecodeError {
    Base64(base64::DecodeError),
    Base64Slice(base64::DecodeSliceError),
    InvalidPythonBytes,
    InvalidDataUri,
    InvalidSourceText,
}

impl fmt::Display for MediaDecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Base64(error) => write!(f, "invalid base64 media: {error}"),
            Self::Base64Slice(error) => write!(f, "invalid base64 media: {error}"),
            Self::InvalidPythonBytes => f.write_str("invalid Python bytes literal"),
            Self::InvalidDataUri => f.write_str("invalid Data URI media"),
            Self::InvalidSourceText => f.write_str("media source is not UTF-8 text"),
        }
    }
}

impl std::error::Error for MediaDecodeError {}

/// Validate a JSON document, remove recognized media values, and return the
/// compact document plus an owned media registry.
#[cfg(test)]
pub fn extract_media(input: &[u8]) -> Result<EarlyMediaResult, EarlyMediaError> {
    validate_and_discover(input.to_vec())?.compact()
}

/// Validate and discover edits while retaining the original source for masking.
/// Candidates use source ranges unless their text requires JSON unescaping;
/// those retain one decoded candidate copy. No compact document or upload body
/// is retained by this pass.
pub fn validate_and_discover(input: Vec<u8>) -> Result<ValidatedPayload, EarlyMediaError> {
    let input_text = validate_utf8(&input)?;
    let discover_media = may_contain_media_candidate(input_text);
    // Keep the Vec allocation inside the Arc. Converting Vec<u8> directly to
    // Arc<[u8]> may allocate a second buffer, which is unacceptable for a
    // large OTEL body containing large inline media values.
    let source = Arc::new(input);
    // A media-free document still needs full structural validation, but does
    // not need the envelope classification and discovery walk. The hint is
    // deliberately conservative: escaped marker text falls back to the full
    // detector, while false positives only cost the normal discovery pass.
    let (manifest, end) = if discover_media {
        Extractor::new_discovery(&source).discover()?
    } else {
        Extractor::new_discovery(&source).validate_only()?
    };
    if end != source.len() {
        return Err(EarlyMediaError::TrailingBytes { offset: end });
    }
    Ok(ValidatedPayload { source, manifest })
}

fn apply_edit_plan(
    input: &[u8],
    manifest: MediaManifest,
    source: Option<Arc<Vec<u8>>>,
) -> Result<EarlyMediaResult, EarlyMediaError> {
    validate_edit_plan(input, &manifest.entries)?;
    let replacement_bytes = manifest
        .entries
        .iter()
        .map(|entry| entry.reference.len())
        .sum::<usize>();
    let removed_bytes = manifest
        .entries
        .iter()
        .map(|entry| entry.edit_range.len())
        .sum::<usize>();
    let output_capacity = input
        .len()
        .saturating_sub(removed_bytes)
        .saturating_add(replacement_bytes);
    let mut compact_json = Vec::with_capacity(output_capacity);
    let mut cursor = 0;
    for entry in &manifest.entries {
        compact_json.extend_from_slice(&input[cursor..entry.edit_range.start]);
        compact_json.extend_from_slice(entry.reference.as_bytes());
        cursor = entry.edit_range.end;
    }
    compact_json.extend_from_slice(&input[cursor..]);

    let mut media = Vec::with_capacity(manifest.entries.len());
    for entry in manifest.entries {
        let storage = match entry.storage {
            ManifestMediaStorage::Owned(bytes) => MediaStorage::Owned(bytes),
            ManifestMediaStorage::SourceRange(range) => source
                .as_ref()
                .map(|source| MediaStorage::Source {
                    bytes: Arc::clone(source),
                    range: range.clone(),
                })
                .unwrap_or_else(|| {
                    MediaStorage::Owned(
                        input
                            .get(range)
                            .expect("validated media source range")
                            .to_vec(),
                    )
                }),
        };
        media.push(ExtractedMedia {
            reference: entry.reference,
            content_type: entry.content_type,
            kind: entry.kind,
            source: entry.source,
            encoding: entry.encoding,
            storage,
            sha256_hash: entry.sha256_hash,
        });
    }

    if let Some(source) = source.as_ref() {
        detach_small_source_ranges(source, &mut media);
    }
    Ok(EarlyMediaResult {
        compact_json,
        media,
        checked_bytes: manifest.checked_bytes,
    })
}

fn validate_edit_plan(input: &[u8], entries: &[MediaManifestEntry]) -> Result<(), EarlyMediaError> {
    let mut previous_end = 0;
    for (index, entry) in entries.iter().enumerate() {
        if entry.edit_range.start < previous_end
            || entry.edit_range.start > entry.edit_range.end
            || entry.edit_range.end > input.len()
        {
            return Err(EarlyMediaError::InvalidEditPlan { entry: index });
        }
        previous_end = entry.edit_range.end;
    }
    Ok(())
}

fn validate_utf8(input: &[u8]) -> Result<&str, EarlyMediaError> {
    std::str::from_utf8(input).map_err(|error| EarlyMediaError::InvalidJson {
        offset: error.valid_up_to(),
        message: "invalid UTF-8",
    })
}

struct Extractor<'a> {
    input: &'a [u8],
    embedded_depth: usize,
    /// Cache validated value boundaries while the extractor walks a document.
    ///
    /// The containing object scan and the discovery walk both need child
    /// boundaries. Caching large values prevents rescanning media-sized strings.
    scan_cache: Option<HashMap<usize, usize>>,
    checked_bytes: usize,
    manifest: Vec<MediaManifestEntry>,
    existing_references: HashSet<String>,
    pending_ambiguity: Option<EarlyMediaError>,
}

impl<'a> Extractor<'a> {
    fn new(input: &'a [u8]) -> Self {
        Self::new_with_embedded_depth(input, 0)
    }

    fn new_discovery(input: &'a [u8]) -> Self {
        Self::new(input)
    }

    fn new_with_embedded_depth(input: &'a [u8], embedded_depth: usize) -> Self {
        Self {
            input,
            embedded_depth,
            scan_cache: Some(HashMap::new()),
            checked_bytes: 0,
            manifest: Vec::new(),
            existing_references: HashSet::new(),
            pending_ambiguity: None,
        }
    }

    fn discover(self) -> Result<(MediaManifest, usize), EarlyMediaError> {
        self.discover_at_depth(0)
    }

    /// Validate a document without classifying or inspecting payload strings.
    /// The caller has already established that no supported media marker can
    /// occur in the byte representation, so discovery would only repeat the
    /// structural walk performed here.
    fn validate_only(mut self) -> Result<(MediaManifest, usize), EarlyMediaError> {
        // Validation visits each value once, so retaining its boundary cannot save work.
        self.scan_cache = None;
        let start = skip_whitespace(self.input, 0);
        let end = self.scan_value(start, 0)?;
        let end = skip_whitespace(self.input, end);
        if end != self.input.len() {
            return Err(EarlyMediaError::TrailingBytes { offset: end });
        }
        Ok((
            MediaManifest {
                entries: Vec::new(),
                checked_bytes: 0,
                existing_references: Vec::new(),
            },
            end,
        ))
    }

    fn discover_at_depth(
        mut self,
        depth: usize,
    ) -> Result<(MediaManifest, usize), EarlyMediaError> {
        let start = skip_whitespace(self.input, 0);
        let scan_mode = self.root_media_scan_mode(start, depth)?;
        let end = self.discover_value(start, depth, scan_mode)?;
        let end = skip_whitespace(self.input, end);
        if let Some(error) = self.pending_ambiguity {
            return Err(error);
        }
        if end != self.input.len() {
            return Err(EarlyMediaError::TrailingBytes { offset: end });
        }
        self.manifest.sort_by_key(|entry| entry.edit_range.start);
        let existing_references = self.existing_references.into_iter().collect::<Vec<_>>();
        let manifest = MediaManifest {
            entries: self.manifest,
            checked_bytes: self.checked_bytes,
            existing_references,
        };
        validate_manifest(self.input, &manifest)?;
        validate_edit_plan(self.input, &manifest.entries)?;
        Ok((manifest, end))
    }

    fn root_media_scan_mode(
        &mut self,
        start: usize,
        depth: usize,
    ) -> Result<MediaScanMode, EarlyMediaError> {
        let is_envelope = match self.input.get(start) {
            Some(b'{') => self.object_has_envelope_field(start, depth)?,
            Some(b'[') => {
                let first = skip_whitespace(self.input, start + 1);
                self.input.get(first) == Some(&b'{')
                    && self.object_has_envelope_field(first, depth + 1)?
            }
            _ => false,
        };
        Ok(if is_envelope {
            MediaScanMode::Envelope
        } else {
            MediaScanMode::Payload
        })
    }

    /// Inspect root-level object keys until the OTLP envelope marker is found.
    /// Values before the marker are still validated so malformed input keeps
    /// the same error precedence; the marker value and remaining document are
    /// validated by the fused discovery walk.
    fn object_has_envelope_field(
        &mut self,
        start: usize,
        depth: usize,
    ) -> Result<bool, EarlyMediaError> {
        let input = self.input;
        let mut cursor = Jiter::new(&input[start..]);
        let mut base = start;
        let Some(first_key) = cursor
            .next_object()
            .map_err(|error| map_jiter_error(input, start, error))?
        else {
            return Ok(false);
        };
        let mut key = first_key.to_owned();
        loop {
            if is_otel_envelope_field(&key) {
                return Ok(true);
            }
            let value_start = skip_whitespace(input, base + cursor.current_index());
            let value_end = self.scan_value(value_start, depth + 1)?;
            cursor = Jiter::new(&input[value_end..]);
            base = value_end;
            match cursor
                .next_key()
                .map_err(|error| map_jiter_error(input, base, error))?
            {
                Some(next_key) => key = next_key.to_owned(),
                None => return Ok(false),
            }
        }
    }

    fn discover_value(
        &mut self,
        start: usize,
        depth: usize,
        scan_mode: MediaScanMode,
    ) -> Result<usize, EarlyMediaError> {
        let start = skip_whitespace(self.input, start);
        if depth > MAX_JSON_DEPTH {
            return Err(EarlyMediaError::NestingLimit { offset: start });
        }
        // Continue validating the enclosing document before returning a
        // nested ambiguity, so syntax errors take precedence.
        if self.pending_ambiguity.is_some() {
            return self.scan_value(start, depth);
        }
        if self.input.get(start) == Some(&b'[') {
            return self.discover_array(start, depth, scan_mode);
        }
        if self.input.get(start) == Some(&b'{') && scan_mode != MediaScanMode::Payload {
            return self.discover_object(start, depth, scan_mode);
        }
        let end = self.scan_value(start, depth)?;
        match self.input.get(start).copied() {
            Some(b'"') => self.discover_string_range(start, end, scan_mode)?,
            Some(b'{') => {
                let fields = self.object_fields(start, end, depth)?;
                if scan_mode == MediaScanMode::Payload {
                    if let Some(shape) = self.structured_shape(&fields, depth)? {
                        self.collect_structured_sibling_references(&fields, &shape, depth)?;
                        if self.pending_ambiguity.is_some() {
                            return Ok(end);
                        }
                        self.discover_structured(&fields, &shape)?;
                        return Ok(end);
                    }
                }
                // Object keys are structural names, not OTEL payload values.
                for field in fields {
                    let child_mode = media_scan_mode_for_field(scan_mode, &field.key);
                    self.discover_value(field.value_start, depth + 1, child_mode)?;
                }
            }
            Some(b'[') => unreachable!("arrays are discovered by discover_array"),
            _ => {}
        }
        Ok(end)
    }

    fn discover_array(
        &mut self,
        start: usize,
        depth: usize,
        scan_mode: MediaScanMode,
    ) -> Result<usize, EarlyMediaError> {
        let input = self.input;
        let mut cursor = Jiter::new(&input[start..]);
        let Some(_first_value) = cursor
            .next_array()
            .map_err(|error| map_jiter_error(input, start, error))?
        else {
            return Ok(start + cursor.current_index());
        };
        let mut base = start;
        loop {
            let value_start = skip_whitespace(input, base + cursor.current_index());
            let value_end = self.discover_value(value_start, depth + 1, scan_mode)?;
            cursor = Jiter::new(&input[value_end..]);
            base = value_end;
            match cursor
                .array_step()
                .map_err(|error| map_jiter_error(input, base, error))?
            {
                Some(_) => {}
                None => return Ok(base + cursor.current_index()),
            }
        }
    }

    fn discover_object(
        &mut self,
        start: usize,
        depth: usize,
        scan_mode: MediaScanMode,
    ) -> Result<usize, EarlyMediaError> {
        let input = self.input;
        let mut cursor = Jiter::new(&input[start..]);
        let Some(first_key) = cursor
            .next_object()
            .map_err(|error| map_jiter_error(input, start, error))?
        else {
            return Ok(start + cursor.current_index());
        };
        let mut base = start;
        let mut key = first_key.to_owned();
        loop {
            let child_mode = media_scan_mode_for_field(scan_mode, &key);
            let value_start = skip_whitespace(input, base + cursor.current_index());
            let value_end = self.discover_value(value_start, depth + 1, child_mode)?;
            cursor = Jiter::new(&input[value_end..]);
            base = value_end;
            match cursor
                .next_key()
                .map_err(|error| map_jiter_error(input, base, error))?
            {
                Some(next_key) => key = next_key.to_owned(),
                None => return Ok(base + cursor.current_index()),
            }
        }
    }

    fn collect_structured_sibling_references(
        &mut self,
        fields: &[ObjectField],
        shape: &StructuredShape,
        depth: usize,
    ) -> Result<(), EarlyMediaError> {
        let (outer_key, inner_key) = shape
            .property
            .split_once('.')
            .map_or((shape.property.as_str(), None), |(outer, inner)| {
                (outer, Some(inner))
            });
        let selected_outer = fields.iter().find(|field| field.key == outer_key);

        for field in fields {
            if selected_outer.is_some_and(|selected| {
                selected.value_start == field.value_start && selected.value_end == field.value_end
            }) {
                continue;
            }
            self.discover_value(field.value_start, depth + 1, MediaScanMode::Disabled)?;
        }

        if let (Some(inner_key), Some(selected_outer)) = (inner_key, selected_outer) {
            let inline_fields = self.object_fields(
                selected_outer.value_start,
                selected_outer.value_end,
                depth + 1,
            )?;
            let selected_inner = inline_fields.iter().find(|field| field.key == inner_key);
            for field in &inline_fields {
                if selected_inner.is_some_and(|selected| {
                    selected.value_start == field.value_start
                        && selected.value_end == field.value_end
                }) {
                    continue;
                }
                self.discover_value(field.value_start, depth + 2, MediaScanMode::Disabled)?;
            }
        }
        Ok(())
    }

    fn discover_string_range(
        &mut self,
        start: usize,
        end: usize,
        scan_mode: MediaScanMode,
    ) -> Result<(), EarlyMediaError> {
        let Some(raw) = self.input.get(start + 1..end.saturating_sub(1)) else {
            return Ok(());
        };
        let token_range = start..end;
        if let Ok(raw) = std::str::from_utf8(raw) {
            // Keep ordinary media text borrowed from the source. Escaped strings
            // are decoded only when inspection of their logical value requires it.
            if !raw.contains('\\') {
                self.checked_bytes = self.checked_bytes.saturating_add(raw.len());
                self.discover_string(raw, token_range, scan_mode)?;
                return Ok(());
            }
        }
        let input = self.input;
        let Some(token) = input.get(token_range.clone()) else {
            return Ok(());
        };
        let mut jiter = Jiter::new(token);
        if let Ok(value) = jiter.next_str() {
            self.checked_bytes = self.checked_bytes.saturating_add(value.len());
            self.discover_string(value, token_range, scan_mode)?;
        }
        Ok(())
    }

    fn discover_string(
        &mut self,
        value: &str,
        token_range: Range<usize>,
        scan_mode: MediaScanMode,
    ) -> Result<(), EarlyMediaError> {
        collect_media_references(value, &mut self.existing_references);
        if scan_mode != MediaScanMode::Payload || is_media_reference(value) {
            return Ok(());
        }

        if may_be_serialized_json(value)
            && self.embedded_depth < MAX_EMBEDDED_JSON_DEPTH
            // Unicode escapes can spell provider keys and public references after the
            // embedded document is decoded, so they must take the nested JSON path too.
            && (value.contains(DATA_URI_PREFIX)
                || value.contains("\\u")
                || may_contain_serialized_media(value))
        {
            match Extractor::new_with_embedded_depth(
                value.as_bytes(),
                self.embedded_depth.saturating_add(1),
            )
            .discover()
            {
                Ok((mut nested_manifest, _)) => {
                    self.checked_bytes = self
                        .checked_bytes
                        .saturating_add(nested_manifest.checked_bytes);
                    self.translate_nested_entries(
                        value,
                        &token_range,
                        &mut nested_manifest.entries,
                    )?;
                    self.manifest.extend(nested_manifest.entries);
                    self.existing_references
                        .extend(nested_manifest.existing_references);
                    return Ok(());
                }
                Err(error @ EarlyMediaError::UnsupportedMediaReferenceAmbiguity { .. }) => {
                    if self.pending_ambiguity.is_none() {
                        self.pending_ambiguity = Some(error);
                    }
                    return Ok(());
                }
                Err(_) => {}
            }
        }

        let candidates = find_data_uri_candidates(value);

        if !candidates.is_empty() {
            let boundaries = candidates
                .iter()
                .flat_map(|(range, _)| [range.start, range.end])
                .collect::<Vec<_>>();
            let mapped = self.map_string_boundaries(&token_range, &boundaries)?;
            for (index, (range, content_type)) in candidates.into_iter().enumerate() {
                self.register_candidate(
                    value[range.clone()].as_bytes(),
                    content_type,
                    MediaPayloadKind::DataUri,
                    MediaSource::Base64DataUri,
                    MediaEncoding::Base64DataUri,
                    mapped[index * 2]..mapped[index * 2 + 1],
                )?;
            }
        }
        Ok(())
    }

    fn translate_nested_entries(
        &self,
        decoded_document: &str,
        containing_string: &Range<usize>,
        entries: &mut [MediaManifestEntry],
    ) -> Result<(), EarlyMediaError> {
        let mut boundaries = Vec::with_capacity(entries.len().saturating_mul(4));
        for entry in entries.iter() {
            boundaries.extend([entry.edit_range.start, entry.edit_range.end]);
            if let ManifestMediaStorage::SourceRange(range) = &entry.storage {
                boundaries.extend([range.start, range.end]);
            }
        }
        boundaries.sort_unstable();
        boundaries.dedup();
        let mapped = self.map_string_boundaries(containing_string, &boundaries)?;
        let mapped_boundary = |offset: usize| {
            let index = boundaries
                .binary_search(&offset)
                .expect("all edit and storage boundaries were mapped");
            mapped[index]
        };
        for (index, entry) in entries.iter_mut().enumerate() {
            entry.edit_range =
                mapped_boundary(entry.edit_range.start)..mapped_boundary(entry.edit_range.end);
            if let ManifestMediaStorage::SourceRange(range) = &entry.storage {
                let child_range = range.clone();
                let parent_range =
                    mapped_boundary(child_range.start)..mapped_boundary(child_range.end);
                let child_bytes = decoded_document.as_bytes().get(child_range);
                let parent_bytes = self.input.get(parent_range.clone());
                entry.storage = if child_bytes == parent_bytes {
                    ManifestMediaStorage::SourceRange(parent_range)
                } else if let Some(bytes) = child_bytes {
                    ManifestMediaStorage::Owned(bytes.to_vec())
                } else {
                    return Err(EarlyMediaError::InvalidEditPlan { entry: index });
                };
            }
        }
        Ok(())
    }

    fn discover_structured(
        &mut self,
        fields: &[ObjectField],
        shape: &StructuredShape,
    ) -> Result<(), EarlyMediaError> {
        let token_range = if let Some((outer, inner)) = shape.property.split_once('.') {
            let Some(field) = fields.iter().find(|field| field.key == outer) else {
                return Ok(());
            };
            let Ok(inline_fields) = self.object_fields(field.value_start, field.value_end, 0)
            else {
                return Ok(());
            };
            let Some(inline_field) = inline_fields.iter().find(|field| field.key == inner) else {
                return Ok(());
            };
            inline_field.value_start..inline_field.value_end
        } else {
            let Some(field) = fields.iter().find(|field| field.key == shape.property) else {
                return Ok(());
            };
            field.value_start..field.value_end
        };
        let input = self.input;
        let Some(encoded_token) = input.get(token_range.clone()) else {
            return Ok(());
        };
        let mut jiter = Jiter::new(encoded_token);
        let Ok(content) = jiter.next_str() else {
            return Ok(());
        };

        collect_media_references(content, &mut self.existing_references);
        if !is_supported_content_type(&shape.content_type) {
            return Ok(());
        }
        let (encoding, valid) = if content.starts_with(DATA_URI_PREFIX) {
            (
                MediaEncoding::Base64DataUri,
                parse_data_uri(content, 0).and_then(|candidate| {
                    (candidate.start == 0 && candidate.end == content.len())
                        .then_some(())
                        .and_then(|_| candidate.valid.map(|_| ()))
                }),
            )
        } else if is_python_bytes_literal(content) {
            // `register_candidate` hashes and validates the literal with a bounded buffer.
            // Do not decode the full body here only to discard it before hashing.
            (MediaEncoding::PythonBytesLiteral, Some(()))
        } else {
            (
                MediaEncoding::Base64,
                is_valid_base64_syntax(content.as_bytes()).then_some(()),
            )
        };
        if valid.is_none() {
            return Ok(());
        }
        let raw_range = self.map_string_boundaries(&token_range, &[0, content.len()])?;
        self.register_candidate(
            content.as_bytes(),
            &shape.content_type,
            shape.kind,
            MediaSource::Bytes,
            encoding,
            raw_range[0]..raw_range[1],
        )?;
        Ok(())
    }

    fn register_candidate(
        &mut self,
        encoded_data: &[u8],
        content_type: &str,
        kind: MediaPayloadKind,
        source: MediaSource,
        encoding: MediaEncoding,
        source_range: Range<usize>,
    ) -> Result<(), EarlyMediaError> {
        // Hashing also validates the complete encoded body with a bounded decode buffer.
        // Candidate syntax checks therefore do not need a separate full-body decode.
        let Some((reference, sha256_hash)) =
            media_identity_from_encoded(encoded_data, content_type, source, encoding)
        else {
            return Ok(());
        };
        let storage = if self
            .input
            .get(source_range.clone())
            .is_some_and(|bytes| bytes == encoded_data)
        {
            ManifestMediaStorage::SourceRange(source_range.clone())
        } else {
            ManifestMediaStorage::Owned(encoded_data.to_vec())
        };
        self.manifest.push(MediaManifestEntry {
            content_type: content_type.to_owned(),
            kind,
            source,
            encoding,
            edit_range: source_range,
            storage,
            reference,
            sha256_hash,
        });
        Ok(())
    }

    fn map_string_boundaries(
        &self,
        token_range: &Range<usize>,
        decoded_offsets: &[usize],
    ) -> Result<Vec<usize>, EarlyMediaError> {
        let invalid = |offset, message| EarlyMediaError::InvalidJson { offset, message };
        let Some(&b'"') = self.input.get(token_range.start) else {
            return Err(invalid(token_range.start, "expected JSON string"));
        };
        if self.input.get(token_range.end.saturating_sub(1)) != Some(&b'"') {
            return Err(invalid(token_range.end, "invalid JSON string range"));
        }
        let content_start = token_range.start + 1;
        let content_end = token_range.end - 1;
        let Some(raw_content) = self.input.get(content_start..content_end) else {
            return Err(invalid(token_range.start, "invalid JSON string range"));
        };

        let mut boundaries = Vec::with_capacity(decoded_offsets.len());
        if !raw_content.contains(&b'\\') {
            let raw_text = std::str::from_utf8(raw_content).map_err(|error| {
                self.invalid(
                    content_start + error.valid_up_to(),
                    "invalid UTF-8 in string",
                )
            })?;
            for &offset in decoded_offsets {
                if !raw_text.is_char_boundary(offset) {
                    return Err(invalid(content_start + offset, "invalid string boundary"));
                }
                boundaries.push(content_start + offset);
            }
            return Ok(boundaries);
        }

        let mut raw_cursor = content_start;
        let mut decoded_cursor = 0usize;
        let mut previous_target = 0usize;
        let mut plain_run_end = None;
        for &target in decoded_offsets {
            if target < previous_target {
                return Err(invalid(content_start, "string boundaries are not ordered"));
            }
            previous_target = target;
            while decoded_cursor < target {
                if raw_cursor >= content_end {
                    return Err(invalid(raw_cursor, "invalid string boundary"));
                }
                match self.input[raw_cursor] {
                    b'\\' => {
                        let escaped_offset = raw_cursor + 1;
                        let escaped = self
                            .input
                            .get(escaped_offset)
                            .copied()
                            .ok_or_else(|| invalid(escaped_offset, "unterminated escape"))?;
                        match escaped {
                            b'"' | b'\\' | b'/' => {
                                raw_cursor += 2;
                                decoded_cursor += 1;
                            }
                            b'b' | b'f' | b'n' | b'r' | b't' => {
                                raw_cursor += 2;
                                decoded_cursor += 1;
                            }
                            b'u' => {
                                let (next, character) =
                                    parse_unicode_escape(self.input, raw_cursor)
                                        .map_err(|error| self.unicode_error(raw_cursor, error))?;
                                raw_cursor = next;
                                decoded_cursor += character.len_utf8();
                            }
                            _ => return Err(invalid(escaped_offset, "invalid string escape")),
                        }
                    }
                    _ => {
                        let run_end = *plain_run_end.get_or_insert_with(|| {
                            self.input[raw_cursor..content_end]
                                .iter()
                                .position(|byte| matches!(*byte, b'"' | b'\\') || *byte < 0x20)
                                .map_or(content_end, |length| raw_cursor + length)
                        });
                        if raw_cursor == run_end {
                            return Err(invalid(raw_cursor, "invalid JSON string boundary"));
                        }
                        let amount = (target - decoded_cursor).min(run_end - raw_cursor);
                        raw_cursor += amount;
                        decoded_cursor += amount;
                        if raw_cursor == run_end {
                            plain_run_end = None;
                        }
                    }
                }
            }
            if decoded_cursor != target
                || (raw_cursor < content_end && self.input[raw_cursor] & 0b1100_0000 == 0b1000_0000)
            {
                return Err(invalid(
                    raw_cursor,
                    "string boundary splits a Unicode character",
                ));
            }
            boundaries.push(raw_cursor);
        }
        Ok(boundaries)
    }

    fn scan_value(&mut self, start: usize, depth: usize) -> Result<usize, EarlyMediaError> {
        let start = skip_whitespace(self.input, start);
        if depth > MAX_JSON_DEPTH {
            return Err(EarlyMediaError::NestingLimit { offset: start });
        }
        if let Some(&end) = self.scan_cache.as_ref().and_then(|cache| cache.get(&start)) {
            return Ok(end);
        }
        let input = self.input;
        let mut cursor = Jiter::new(&input[start..]);
        let mut base = start;
        scan_jiter_value(
            input,
            &mut self.scan_cache,
            &mut cursor,
            &mut base,
            depth,
            None,
        )
    }

    fn scan_string(&self, start: usize) -> Result<usize, EarlyMediaError> {
        let input = self.input;
        let suffix = input
            .get(start..)
            .ok_or_else(|| self.invalid(start, "expected JSON string"))?;
        let mut jiter = Jiter::new(suffix);
        jiter
            .next_bytes()
            .map_err(|error| map_jiter_error(input, start, error))?;
        Ok(start + jiter.current_index())
    }

    fn object_fields(
        &mut self,
        start: usize,
        end: usize,
        depth: usize,
    ) -> Result<Vec<ObjectField>, EarlyMediaError> {
        let mut fields = Vec::new();
        let input = self.input;
        let bytes = input
            .get(start..end)
            .ok_or_else(|| self.invalid(start, "invalid JSON object range"))?;
        let mut cursor = Jiter::new(bytes);
        let mut base = start;
        let Some(first_key) = cursor
            .next_object()
            .map_err(|error| map_jiter_error(input, start, error))?
        else {
            return Ok(fields);
        };
        let mut key = first_key.to_owned();
        loop {
            let value_start = skip_whitespace(input, base + cursor.current_index());
            let value_end = self.scan_value(value_start, depth + 1)?;
            fields.push(ObjectField {
                key,
                value_start,
                value_end,
            });
            let Some(suffix) = input.get(value_end..end) else {
                return Err(self.invalid(value_end, "invalid JSON object range"));
            };
            cursor = Jiter::new(suffix);
            base = value_end;
            match cursor
                .next_key()
                .map_err(|error| map_jiter_error(input, base, error))?
            {
                Some(next_key) => key = next_key.to_owned(),
                None => return Ok(fields),
            }
        }
    }

    fn structured_shape(
        &mut self,
        fields: &[ObjectField],
        depth: usize,
    ) -> Result<Option<StructuredShape>, EarlyMediaError> {
        let field = |name: &str| fields.iter().find(|field| field.key == name);
        let string = |name: &str| -> Result<Option<String>, EarlyMediaError> {
            field(name)
                .map(|field| self.string_value(field.value_start).map(Cow::into_owned))
                .transpose()
        };
        let object = |name: &str| -> Option<(usize, usize)> {
            field(name).and_then(|field| {
                (self.input.get(field.value_start) == Some(&b'{'))
                    .then_some((field.value_start, field.value_end))
            })
        };

        let type_name = string("type")?;
        let shape = match type_name.as_deref() {
            Some("base64") => match (string("media_type")?, field("data")) {
                (Some(content_type), Some(data)) if self.is_string(data) => Some(StructuredShape {
                    property: "data".to_owned(),
                    content_type,
                    kind: MediaPayloadKind::Anthropic,
                }),
                _ => None,
            },
            Some("media") => match (string("mime_type")?, field("data")) {
                (Some(content_type), Some(data)) if self.is_string(data) => Some(StructuredShape {
                    property: "data".to_owned(),
                    content_type,
                    kind: MediaPayloadKind::Vertex,
                }),
                _ => None,
            },
            Some("blob") => match (string("mime_type")?, field("content")) {
                (Some(content_type), Some(content)) if self.is_string(content) => {
                    Some(StructuredShape {
                        property: "content".to_owned(),
                        content_type,
                        kind: MediaPayloadKind::AiSdkV7,
                    })
                }
                _ => None,
            },
            Some("file") => {
                let content_type = string("mediaType")?;
                let property = field("data")
                    .filter(|field| self.is_string(field))
                    .map(|_| "data")
                    .or_else(|| {
                        field("image")
                            .filter(|field| self.is_string(field))
                            .map(|_| "image")
                    });
                content_type
                    .zip(property)
                    .map(|(content_type, property)| StructuredShape {
                        property: property.to_owned(),
                        content_type,
                        kind: MediaPayloadKind::AiSdkV6,
                    })
            }
            _ => None,
        };
        if shape.is_some() {
            return Ok(shape);
        }

        for key in ["inline_data", "inlineData"] {
            let Some((inline_start, inline_end)) = object(key) else {
                continue;
            };
            let inline_fields = self.object_fields(inline_start, inline_end, depth + 1)?;
            let Some(data) = inline_fields.iter().find(|field| field.key == "data") else {
                continue;
            };
            let Some(content_type) = inline_fields
                .iter()
                .find(|field| field.key == "mime_type" || field.key == "mimeType")
                .map(|field| self.string_value(field.value_start).map(Cow::into_owned))
                .transpose()?
            else {
                continue;
            };
            if self.is_string(data) {
                return Ok(Some(StructuredShape {
                    property: format!("{key}.data"),
                    content_type,
                    kind: MediaPayloadKind::Gemini,
                }));
            }
        }
        Ok(None)
    }

    fn is_string(&mut self, field: &ObjectField) -> bool {
        self.input.get(field.value_start) == Some(&b'"')
    }

    fn string_value(&self, start: usize) -> Result<Cow<'a, str>, EarlyMediaError> {
        let end = self.scan_string(start)?;
        let raw = self
            .input
            .get(start + 1..end - 1)
            .ok_or_else(|| self.invalid(start, "invalid JSON string range"))?;
        if !raw.contains(&b'\\') {
            if let Ok(value) = std::str::from_utf8(raw) {
                return Ok(Cow::Borrowed(value));
            }
        }
        self.parse_string(start).map(|(_, value)| Cow::Owned(value))
    }

    fn parse_string(&self, start: usize) -> Result<(usize, String), EarlyMediaError> {
        let input = self.input;
        let suffix = input
            .get(start..)
            .ok_or_else(|| self.invalid(start, "expected JSON string"))?;
        let mut jiter = Jiter::new(suffix);
        let value = jiter
            .next_str()
            .map_err(|error| map_jiter_error(input, start, error))?
            .to_owned();
        Ok((start + jiter.current_index(), value))
    }

    fn invalid(&self, offset: usize, message: &'static str) -> EarlyMediaError {
        EarlyMediaError::InvalidJson { offset, message }
    }

    fn unicode_error(&self, offset: usize, error: UnicodeEscapeError) -> EarlyMediaError {
        match error {
            UnicodeEscapeError::Invalid(message) => self.invalid(offset, message),
            UnicodeEscapeError::UnsupportedSurrogate => {
                EarlyMediaError::UnsupportedUnicodeSurrogate { offset }
            }
        }
    }
}

/// Validate one value through Jiter while retaining the byte boundaries needed
/// by media discovery. The walk mirrors the extractor's 128-level policy and
/// records large nested values so later discovery stages can reuse their ends.
fn scan_jiter_value<'j>(
    input: &'j [u8],
    scan_cache: &mut Option<HashMap<usize, usize>>,
    cursor: &mut Jiter<'j>,
    base: &mut usize,
    depth: usize,
    known_peek: Option<Peek>,
) -> Result<usize, EarlyMediaError> {
    let value_start = skip_whitespace(input, (*base).saturating_add(cursor.current_index()));
    if depth > MAX_JSON_DEPTH {
        return Err(EarlyMediaError::NestingLimit {
            offset: value_start,
        });
    }
    let peek = match known_peek {
        Some(peek) => peek,
        None => cursor
            .peek()
            .map_err(|error| map_jiter_error(input, *base, error))?,
    };
    let value_start = skip_whitespace(input, (*base).saturating_add(cursor.current_index()));

    match peek {
        Peek::Null => cursor
            .known_null()
            .map_err(|error| map_jiter_error(input, *base, error))?,
        Peek::True | Peek::False => cursor
            .known_bool(peek)
            .map(drop)
            .map_err(|error| map_jiter_error(input, *base, error))?,
        Peek::String => cursor
            .known_bytes()
            .map(drop)
            .map_err(|error| map_jiter_error(input, *base, error))?,
        Peek::Array => {
            if let Some(first) = cursor
                .known_array()
                .map_err(|error| map_jiter_error(input, *base, error))?
            {
                scan_jiter_value(input, scan_cache, cursor, base, depth + 1, Some(first))?;
                while let Some(next) = cursor
                    .array_step()
                    .map_err(|error| map_jiter_error(input, *base, error))?
                {
                    scan_jiter_value(input, scan_cache, cursor, base, depth + 1, Some(next))?;
                }
            }
        }
        Peek::Object => {
            if cursor
                .next_object_bytes()
                .map_err(|error| map_jiter_error(input, *base, error))?
                .is_some()
            {
                scan_jiter_value(input, scan_cache, cursor, base, depth + 1, None)?;
                while cursor
                    .next_key_bytes()
                    .map_err(|error| map_jiter_error(input, *base, error))?
                    .is_some()
                {
                    scan_jiter_value(input, scan_cache, cursor, base, depth + 1, None)?;
                }
            }
        }
        number if number.is_num() => {
            if let Err(error) = cursor.known_number_bytes(peek) {
                if matches!(
                    error.error_type,
                    JiterErrorType::JsonError(JsonErrorType::NumberOutOfRange)
                ) {
                    let end = raw_number_end(input, value_start)?;
                    *base = end;
                    *cursor = Jiter::new(&input[end..]);
                } else {
                    return Err(map_jiter_error(input, *base, error));
                }
            }
        }
        _ => {
            return Err(EarlyMediaError::InvalidJson {
                offset: value_start,
                message: "invalid JSON",
            });
        }
    }

    let end = (*base).saturating_add(cursor.current_index());
    if end.saturating_sub(value_start) >= SCAN_CACHE_MIN_BYTES {
        if let Some(cache) = scan_cache {
            cache.insert(value_start, end);
        }
    }
    Ok(end)
}

/// Jiter's lexical number-range decoder caps very long integers. RawValue uses
/// serde_json's lexical skip path and borrows the token, preserving the input's
/// accepted number grammar without allocating a number representation.
fn raw_number_end(input: &[u8], start: usize) -> Result<usize, EarlyMediaError> {
    let suffix = input.get(start..).ok_or(EarlyMediaError::InvalidJson {
        offset: start,
        message: "invalid JSON number",
    })?;
    let mut deserializer = serde_json::Deserializer::from_slice(suffix);
    let raw =
        <&RawValue>::deserialize(&mut deserializer).map_err(|_| EarlyMediaError::InvalidJson {
            offset: start,
            message: "invalid JSON number",
        })?;
    Ok(start + raw.get().len())
}

fn map_jiter_error(input: &[u8], base: usize, error: JiterError) -> EarlyMediaError {
    let offset = base.saturating_add(error.index);
    match error.error_type {
        JiterErrorType::JsonError(JsonErrorType::LoneLeadingSurrogateInHexEscape) => {
            EarlyMediaError::UnsupportedUnicodeSurrogate { offset }
        }
        JiterErrorType::JsonError(
            JsonErrorType::UnexpectedEndOfHexEscape | JsonErrorType::EofWhileParsingString,
        ) if has_unpaired_high_surrogate(input, offset) => {
            EarlyMediaError::UnsupportedUnicodeSurrogate { offset }
        }
        JiterErrorType::JsonError(JsonErrorType::ControlCharacterWhileParsingString) => {
            EarlyMediaError::InvalidJson {
                offset,
                message: "control byte in string",
            }
        }
        _ => EarlyMediaError::InvalidJson {
            offset,
            message: "invalid JSON",
        },
    }
}

fn has_unpaired_high_surrogate(input: &[u8], offset: usize) -> bool {
    let start = offset.saturating_sub(8);
    for slash in start..=offset.min(input.len()) {
        if input.get(slash..slash + 2) != Some(b"\\u") {
            continue;
        }
        // A literal \u following an escaped backslash is not a Unicode escape.
        let preceding_slashes = input[..slash]
            .iter()
            .rev()
            .take_while(|&&byte| byte == b'\\')
            .count();
        if preceding_slashes % 2 != 0 {
            continue;
        }
        let Some(digits) = input.get(slash + 2..slash + 6) else {
            continue;
        };
        let Some(value) = digits.iter().try_fold(0u16, |value, digit| {
            hex_digit(*digit).map(|digit| value * 16 + u16::from(digit))
        }) else {
            continue;
        };
        let pair_start = slash + 6;
        if (0xD800..=0xDBFF).contains(&value)
            && offset >= pair_start
            && offset <= pair_start + 2
            && input.get(pair_start..pair_start + 2) != Some(b"\\u")
        {
            return true;
        }
    }
    false
}

#[derive(Clone, Debug)]
struct ObjectField {
    key: String,
    value_start: usize,
    value_end: usize,
}

#[derive(Clone, Debug)]
struct StructuredShape {
    property: String,
    content_type: String,
    kind: MediaPayloadKind,
}

struct ParsedDataUri<'a> {
    start: usize,
    end: usize,
    valid: Option<(&'a str, usize, &'a str)>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum MediaScanMode {
    /// A payload value or a generic JSON document. Media candidates are
    /// eligible except in known structural fields.
    Payload,
    /// An OTLP KeyValue list. The `key` is a metadata name, while the
    /// corresponding `value` contains the data-bearing AnyValue subtree.
    Attributes,
    /// The OTLP envelope itself. Only known payload-bearing descendants enter
    /// `Payload`; arbitrary envelope fields stay untouched.
    Envelope,
    /// A structural field. Traverse only to validate JSON and collect existing
    /// public references, never to create new media entries.
    Disabled,
}

fn is_otel_envelope_field(field: &str) -> bool {
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

/// Select the media scanning mode for one object field.
///
/// Early discovery walks the raw OTLP envelope before the normalizer has
/// projected `input`, `output`, and `metadata`. The envelope also contains
/// structural strings such as span names, IDs, timestamps, and attribute keys.
/// The legacy processor never treats those strings as media, so scanning them
/// here would create references that later become metadata keys or routing
/// fields. Unknown fields are eligible in a generic payload, while unknown
/// envelope fields remain disabled until their semantics are established.
fn media_scan_mode_for_field(parent: MediaScanMode, field: &str) -> MediaScanMode {
    // These names are structural only while walking the OTLP envelope. In a
    // user payload they are ordinary object fields and the legacy processor
    // scans their string values for Data URIs.
    if parent != MediaScanMode::Payload
        && matches!(
            field,
            "key"
                | "name"
                | "version"
                | "id"
                | "traceId"
                | "trace_id"
                | "spanId"
                | "span_id"
                | "parentSpanId"
                | "parent_span_id"
                | "traceState"
                | "trace_state"
                | "startTimeUnixNano"
                | "start_time_unix_nano"
                | "endTimeUnixNano"
                | "end_time_unix_nano"
                | "timeUnixNano"
                | "time_unix_nano"
                | "observedTimeUnixNano"
                | "observed_time_unix_nano"
                | "severityNumber"
                | "severity_number"
                | "severityText"
                | "severity_text"
                | "flags"
                | "kind"
                | "status"
                | "droppedAttributesCount"
                | "dropped_attributes_count"
                | "droppedEventsCount"
                | "dropped_events_count"
                | "droppedLinksCount"
                | "dropped_links_count"
                | "schemaUrl"
                | "schema_url"
        )
    {
        return MediaScanMode::Disabled;
    }

    match parent {
        MediaScanMode::Disabled => MediaScanMode::Disabled,
        MediaScanMode::Payload => MediaScanMode::Payload,
        MediaScanMode::Attributes => match field {
            // OTLP KeyValue keys are metadata names, never media payloads.
            "key" => MediaScanMode::Disabled,
            "value" => MediaScanMode::Payload,
            _ => MediaScanMode::Payload,
        },
        MediaScanMode::Envelope => match field {
            // These fields contain OTLP envelope objects. Their known
            // `attributes`, `body`, and AnyValue descendants opt into payload
            // scanning below.
            "resourceSpans" | "scopeSpans" | "spans" | "resource" | "scope" | "events"
            | "links" | "resourceLogs" | "scopeLogs" | "logRecords" => MediaScanMode::Envelope,
            // Attribute values and log bodies are the data-bearing boundary
            // consumed by the normalizer and legacy media processor.
            "attributes" => MediaScanMode::Attributes,
            "body" | "value" | "arrayValue" | "kvlistValue" | "values" => MediaScanMode::Payload,
            _ => MediaScanMode::Disabled,
        },
    }
}

fn parse_data_uri(value: &str, start: usize) -> Option<ParsedDataUri<'_>> {
    let bytes = value.as_bytes();
    let after_prefix = start + DATA_URI_PREFIX.len();
    let marker_start = bytes
        .get(after_prefix..)?
        .windows(BASE64_MARKER.len())
        .position(|window| window == BASE64_MARKER.as_bytes())
        .map(|offset| after_prefix + offset)?;
    let content_type_end = bytes
        .get(after_prefix..marker_start)?
        .iter()
        .position(|byte| *byte == b';')
        .map(|offset| after_prefix + offset)
        .unwrap_or(marker_start);
    let content_type = value.get(after_prefix..content_type_end)?;
    let parameters = value.get(content_type_end..marker_start)?;
    if !is_valid_content_type(content_type)
        || !is_valid_data_uri_parameters(parameters)
        || !is_supported_content_type(content_type)
    {
        return Some(ParsedDataUri {
            start,
            end: marker_start + BASE64_MARKER.len(),
            valid: None,
        });
    }
    let data_start = marker_start + BASE64_MARKER.len();
    let mut end = data_start;
    let mut padding = 0;
    let mut valid = true;
    while end < value.len() && is_base64_character(value.as_bytes()[end]) {
        match value.as_bytes()[end] {
            b'=' => {
                padding += 1;
                if padding > 2 {
                    valid = false;
                }
            }
            _ if padding > 0 => valid = false,
            _ => {}
        }
        end += 1;
    }
    if end < value.len() && !is_data_uri_terminator(value.as_bytes()[end]) {
        valid = false;
    }
    let encoded = &value[data_start..end];
    let valid = (valid && !encoded.is_empty() && encoded.len() % 4 != 1).then_some((
        content_type,
        end,
        encoded,
    ));
    Some(ParsedDataUri { start, end, valid })
}

fn find_data_uri_candidates(value: &str) -> Vec<(Range<usize>, &str)> {
    let mut candidates = Vec::new();
    let mut cursor = 0;
    while let Some(relative) = value[cursor..].find(DATA_URI_PREFIX) {
        let start = cursor + relative;
        if !has_data_uri_boundary(value, start) {
            cursor = start + DATA_URI_PREFIX.len();
            continue;
        }
        let Some(candidate) = parse_data_uri(value, start) else {
            cursor = start + DATA_URI_PREFIX.len();
            continue;
        };
        if let Some((content_type, _, _)) = candidate.valid {
            candidates.push((candidate.start..candidate.end, content_type));
        }
        cursor = candidate.end.max(start + DATA_URI_PREFIX.len());
    }
    candidates
}

fn decode_python_bytes_literal(value: &[u8]) -> Result<Vec<u8>, MediaDecodeError> {
    let mut output = Vec::with_capacity(value.len().saturating_sub(3));
    visit_python_bytes_literal(value, |byte| output.push(byte))?;
    Ok(output)
}

fn visit_python_bytes_literal(
    value: &[u8],
    mut visit_byte: impl FnMut(u8),
) -> Result<(), MediaDecodeError> {
    if value.len() < 3 || value[0] != b'b' || !matches!(value[1], b'\'' | b'"') {
        return Err(MediaDecodeError::InvalidPythonBytes);
    }
    let quote = value[1];
    if *value.last().unwrap_or(&0) != quote {
        return Err(MediaDecodeError::InvalidPythonBytes);
    }
    let mut cursor = 2;
    while cursor + 1 < value.len() {
        let byte = value[cursor];
        if byte != b'\\' {
            // Python's bytes repr escapes non-ASCII/control bytes and an unescaped
            // delimiter cannot occur inside the literal. Match the TypeScript decoder
            // instead of accepting a broader Rust-only grammar.
            if !(0x20..=0x7e).contains(&byte) || byte == quote {
                return Err(MediaDecodeError::InvalidPythonBytes);
            }
            visit_byte(byte);
            cursor += 1;
            continue;
        }
        cursor += 1;
        let Some(escaped) = value.get(cursor).copied() else {
            return Err(MediaDecodeError::InvalidPythonBytes);
        };
        match escaped {
            b'\\' | b'\'' | b'"' => visit_byte(escaped),
            b'n' => visit_byte(b'\n'),
            b'r' => visit_byte(b'\r'),
            b't' => visit_byte(b'\t'),
            b'x' => {
                let Some(bytes) = value
                    .get(cursor + 1..cursor + 3)
                    .and_then(|bytes| bytes.first_chunk::<2>())
                else {
                    return Err(MediaDecodeError::InvalidPythonBytes);
                };
                let Some(hi) = hex_digit(bytes[0]) else {
                    return Err(MediaDecodeError::InvalidPythonBytes);
                };
                let Some(lo) = hex_digit(bytes[1]) else {
                    return Err(MediaDecodeError::InvalidPythonBytes);
                };
                visit_byte((hi << 4) | lo);
                cursor += 2;
            }
            _ => return Err(MediaDecodeError::InvalidPythonBytes),
        }
        cursor += 1;
    }
    Ok(())
}

/// Hash decoded media without materializing the full decoded body. Uploading
/// still decodes on demand, but discovery only needs the stable content ID and
/// should not briefly retain both a base64 source and a second 47 MB byte
/// buffer.
fn hash_encoded_data(
    encoded_data: &[u8],
    encoding: MediaEncoding,
) -> Result<[u8; 32], MediaDecodeError> {
    let mut hasher = Sha256::new();
    match encoding {
        MediaEncoding::Base64DataUri => {
            let marker = encoded_data
                .windows(BASE64_MARKER.len())
                .position(|window| window == BASE64_MARKER.as_bytes())
                .ok_or(MediaDecodeError::InvalidDataUri)?;
            hash_base64(&mut hasher, &encoded_data[marker + BASE64_MARKER.len()..])?;
        }
        MediaEncoding::Base64 => hash_base64(&mut hasher, encoded_data)?,
        MediaEncoding::PythonBytesLiteral => hash_python_bytes_literal(&mut hasher, encoded_data)?,
    }
    Ok(hasher.finalize().into())
}

fn media_identity_from_encoded(
    encoded_data: &[u8],
    content_type: &str,
    source: MediaSource,
    encoding: MediaEncoding,
) -> Option<(String, String)> {
    let digest = hash_encoded_data(encoded_data, encoding).ok()?;
    let sha256_hash = BASE64.encode(digest);
    let media_id = sha256_hash
        .replace('+', "-")
        .replace('/', "_")
        .chars()
        .take(22)
        .collect::<String>();
    Some((
        format!(
            "@@@langfuseMedia:type={content_type}|id={media_id}|source={}@@@",
            source.as_str()
        ),
        sha256_hash,
    ))
}

fn collect_media_references(value: &str, references: &mut HashSet<String>) {
    let mut cursor = 0;
    while let Some(relative) = value[cursor..].find(MEDIA_REFERENCE_PREFIX) {
        let start = cursor + relative;
        let suffix_start = start + MEDIA_REFERENCE_PREFIX.len();
        let Some(relative_end) = value[suffix_start..].find(MEDIA_REFERENCE_SUFFIX) else {
            break;
        };
        let end = suffix_start + relative_end + MEDIA_REFERENCE_SUFFIX.len();
        let reference = &value[start..end];
        if is_media_reference(reference) {
            references.insert(reference.to_owned());
        }
        cursor = end;
    }
}

fn validate_manifest(input: &[u8], manifest: &MediaManifest) -> Result<(), EarlyMediaError> {
    let existing = manifest.existing_references.iter().collect::<HashSet<_>>();
    let mut representations = HashMap::<&str, &[u8]>::new();
    for (index, entry) in manifest.entries.iter().enumerate() {
        if existing.contains(&entry.reference) {
            return Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity {
                reference: entry.reference.clone(),
            });
        }
        let representation = match &entry.storage {
            ManifestMediaStorage::Owned(bytes) => bytes.as_slice(),
            ManifestMediaStorage::SourceRange(range) => input
                .get(range.clone())
                .ok_or(EarlyMediaError::InvalidEditPlan { entry: index })?,
        };
        if let Some(previous) = representations.insert(&entry.reference, representation) {
            if previous != representation {
                return Err(EarlyMediaError::UnsupportedMediaReferenceAmbiguity {
                    reference: entry.reference.clone(),
                });
            }
        }
    }
    Ok(())
}

/// Avoid pinning a large input snapshot for a handful of small media ranges.
/// Large source-backed media stays ranged so detaching it would create a
/// second large copy.
fn detach_small_source_ranges(source: &Arc<Vec<u8>>, media: &mut [ExtractedMedia]) {
    if source.len() < SOURCE_DETACH_MIN_BYTES {
        return;
    }

    let source_backed_bytes = media
        .iter()
        .filter_map(|entry| match &entry.storage {
            MediaStorage::Source { range, .. } => Some(range.len()),
            MediaStorage::Owned(_) => None,
        })
        .sum::<usize>();
    if source_backed_bytes.saturating_mul(2) >= source.len() {
        return;
    }

    for entry in media {
        let Some(range) = (match &entry.storage {
            MediaStorage::Source { range, .. } => Some(range.clone()),
            MediaStorage::Owned(_) => None,
        }) else {
            continue;
        };
        let Some(bytes) = source.get(range) else {
            continue;
        };
        entry.storage = MediaStorage::Owned(bytes.to_vec());
    }
}

fn hash_base64(hasher: &mut Sha256, value: &[u8]) -> Result<(), MediaDecodeError> {
    if value.is_empty() {
        return Err(MediaDecodeError::InvalidDataUri);
    }
    // Decode bounded chunks to hash large media without allocating the complete body.
    // A multiple of four preserves Base64 groups; the final chunk accepts omitted padding
    // and non-zero trailing bits, matching Node's decoding behavior.
    let mut decoded = [0_u8; BASE64_HASH_DECODED_CHUNK_SIZE];
    for chunk in value.chunks(BASE64_HASH_CHUNK_SIZE) {
        let decoded_length = BASE64
            .decode_slice(chunk, &mut decoded)
            .map_err(MediaDecodeError::Base64Slice)?;
        hasher.update(&decoded[..decoded_length]);
    }
    Ok(())
}

fn hash_python_bytes_literal(hasher: &mut Sha256, value: &[u8]) -> Result<(), MediaDecodeError> {
    let mut decoded = [0; BASE64_HASH_DECODED_CHUNK_SIZE];
    let mut decoded_len = 0;
    visit_python_bytes_literal(value, |byte| {
        decoded[decoded_len] = byte;
        decoded_len += 1;
        if decoded_len == decoded.len() {
            hasher.update(&decoded[..]);
            decoded_len = 0;
        }
    })?;
    hasher.update(&decoded[..decoded_len]);
    Ok(())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum UnicodeEscapeError {
    Invalid(&'static str),
    UnsupportedSurrogate,
}

fn parse_unicode_escape(input: &[u8], slash: usize) -> Result<(usize, char), UnicodeEscapeError> {
    let digits = input
        .get(slash + 2..slash + 6)
        .ok_or(UnicodeEscapeError::Invalid("short unicode escape"))?;
    let high = digits
        .iter()
        .try_fold(0u32, |value, digit| {
            hex_digit(*digit).map(|digit| value * 16 + u32::from(digit))
        })
        .ok_or(UnicodeEscapeError::Invalid("invalid unicode escape"))?;
    if (0xD800..=0xDBFF).contains(&high) {
        if input.get(slash + 6..slash + 8) != Some(b"\\u") {
            return Err(UnicodeEscapeError::UnsupportedSurrogate);
        }
        let low_digits = input
            .get(slash + 8..slash + 12)
            .ok_or(UnicodeEscapeError::Invalid("short unicode surrogate"))?;
        let low = low_digits
            .iter()
            .try_fold(0u32, |value, digit| {
                hex_digit(*digit).map(|digit| value * 16 + u32::from(digit))
            })
            .ok_or(UnicodeEscapeError::Invalid("invalid unicode surrogate"))?;
        if !(0xDC00..=0xDFFF).contains(&low) {
            return Err(UnicodeEscapeError::UnsupportedSurrogate);
        }
        let scalar = 0x10000 + ((high - 0xD800) << 10) + low - 0xDC00;
        return char::from_u32(scalar)
            .map(|character| (slash + 12, character))
            .ok_or(UnicodeEscapeError::Invalid("invalid unicode scalar"));
    }
    if (0xDC00..=0xDFFF).contains(&high) {
        return Err(UnicodeEscapeError::UnsupportedSurrogate);
    }
    char::from_u32(high)
        .map(|character| (slash + 6, character))
        .ok_or(UnicodeEscapeError::Invalid("invalid unicode scalar"))
}

fn skip_whitespace(input: &[u8], mut cursor: usize) -> usize {
    while matches!(input.get(cursor), Some(b' ' | b'\n' | b'\r' | b'\t')) {
        cursor += 1;
    }
    cursor
}

fn has_data_uri_boundary(value: &str, start: usize) -> bool {
    start == 0
        || !value.as_bytes()[start - 1].is_ascii_alphanumeric()
            && value.as_bytes()[start - 1] != b'-'
            && value.as_bytes()[start - 1] != b'_'
}

fn is_data_uri_terminator(byte: u8) -> bool {
    matches!(
        byte,
        b'\t'
            | b'\n'
            | b'\r'
            | b' '
            | b'!'
            | b'"'
            | b'\''
            | b')'
            | b','
            | b'.'
            | b';'
            | b'>'
            | b'?'
            | b']'
            | b'}'
    )
}

fn is_base64_character(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'=')
}

fn is_valid_content_type(value: &str) -> bool {
    let mut pieces = value.split('/');
    let Some(kind) = pieces.next() else {
        return false;
    };
    let Some(subtype) = pieces.next() else {
        return false;
    };
    pieces.next().is_none()
        && !kind.is_empty()
        && !subtype.is_empty()
        && kind
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"!#$&^_.+-".contains(&byte))
        && subtype
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"!#$&^_.+-".contains(&byte))
}

/// Validate the optional parameters between a Data URI media type and `;base64`.
///
/// The TypeScript detector accepts RFC-style token names and non-empty parameter
/// values, while rejecting delimiters that would make the header ambiguous. Keep
/// this check in the scanner so malformed headers remain ordinary inline text in
/// both implementations.
fn is_valid_data_uri_parameters(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    let bytes = value.as_bytes();
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor] != b';' {
            return false;
        }
        cursor += 1;
        let name_start = cursor;
        while cursor < bytes.len()
            && bytes[cursor] != b'='
            && bytes[cursor] != b';'
            && bytes[cursor] != b','
        {
            cursor += 1;
        }
        if cursor == name_start
            || cursor >= bytes.len()
            || bytes[cursor] != b'='
            || !bytes[name_start..cursor]
                .iter()
                .all(|byte| byte.is_ascii_alphanumeric() || b"!#$&^_.+-".contains(byte))
        {
            return false;
        }
        cursor += 1;
        let value_start = cursor;
        while cursor < bytes.len() && bytes[cursor] != b';' {
            cursor += 1;
        }
        if cursor == value_start
            || bytes[value_start..cursor]
                .iter()
                .any(|byte| b",\t\n\r \"'<>[]{}".contains(byte))
        {
            return false;
        }
    }
    true
}

fn is_supported_content_type(value: &str) -> bool {
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

fn is_media_reference(value: &str) -> bool {
    value.starts_with(MEDIA_REFERENCE_PREFIX) && value.ends_with(MEDIA_REFERENCE_SUFFIX)
}

fn is_python_bytes_literal(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[0] == b'b'
        && matches!(bytes[1], b'\'' | b'"')
        && bytes.last() == bytes.get(1)
}

fn is_valid_base64_syntax(value: &[u8]) -> bool {
    if value.is_empty() || value.len() % 4 == 1 {
        return false;
    }
    let mut padding = 0;
    for byte in value {
        if *byte == b'=' {
            padding += 1;
            if padding > 2 {
                return false;
            }
        } else if padding > 0 || !is_base64_character(*byte) {
            return false;
        }
    }
    true
}

fn may_contain_serialized_media(value: &str) -> bool {
    let has_data = value.contains("\"data\"");
    let has_mime_type = value.contains("\"mime_type\"");
    (has_data && (value.contains("\"media_type\"") || has_mime_type))
        || (value.contains("\"content\"") && has_mime_type)
        || ((has_data || value.contains("\"image\"")) && value.contains("\"mediaType\""))
        || (has_data
            && (value.contains("\"inline_data\"") || value.contains("\"inlineData\""))
            && (has_mime_type || value.contains("\"mimeType\"")))
}

/// Return true when a document might contain a media candidate. This is a
/// conservative string prefilter used only to choose between the fused
/// discovery walk and validation-only mode. Unicode escapes always fall back
/// to discovery because they can spell any marker after JSON decoding.
fn may_contain_media_candidate(value: &str) -> bool {
    // Every structured provider shape has one of these MIME/property
    // markers. Broad fragments are intentional: false positives only select
    // the full detector, while escaped nesting remains covered.
    MEDIA_CANDIDATE_MARKERS.is_match(value)
}

fn may_be_serialized_json(value: &str) -> bool {
    matches!(value.trim_start().as_bytes().first(), Some(b'{' | b'['))
}

fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests;
