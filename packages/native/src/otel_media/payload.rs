//! Source ownership and compaction; discovery borrows, this module owns.
//!
//! ```text
//! ValidatedPayload { source } + MediaManifest
//!   | apply_edit_plan: replace ranges, copy untouched JSON verbatim
//!   v
//! EarlyMediaResult
//!   + compact_json                  reuses source if no edits
//!   + ExtractedMedia[]
//!       + Arc<MediaMetadata>        content identity shared across occurrences
//!       + occurrence ID             replacement/restoration identity
//!       + storage                   spelling after parsing the outer JSON once
//!       + json_decode_layers        remaining JSON string decodes before media decoding
//! ```
//!
//! `MediaPayloadKind` identifies the media shape; `MediaSource` distinguishes URI
//! from provider values; `MediaEncoding` selects base64 or Python-bytes decoding.
//! The stored spelling can differ from the raw span replaced during compaction.
//! `MediaStorage` borrows a source range or owns its bytes; small retained ranges
//! can be detached to release a large source allocation.

use std::borrow::Cow;
use std::collections::HashSet;
use std::fmt;
use std::io::Write;
use std::ops::Range;
use std::sync::Arc;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use jiter::Jiter;

const SOURCE_DETACH_MIN_BYTES: usize = 8 * 1024 * 1024;

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
    /// Stable labels used when reporting extracted media.
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

/// Metadata shared by occurrences with the same source, content type and hash.
/// Source ranges and encodings stay on the occurrence so restoration retains
/// its exact representation rather than just the decoded content identity.
#[derive(Debug, Eq, PartialEq)]
pub struct MediaMetadata {
    pub source: MediaSource,
    pub content_type: String,
    pub sha256_hash: String,
}

impl MediaMetadata {
    fn retained_bytes(&self) -> usize {
        std::mem::size_of::<Self>() + self.content_type.capacity() + self.sha256_hash.capacity()
    }
}

/// One media occurrence removed from the compact document.
///
/// Temporary references identify occurrences; metadata hashes identify assets.
/// Distinct source spellings can share an upload without sharing restoration text.
///
/// Store the spelling visible after parsing the outer JSON once. Restoration
/// reads that spelling; upload removes `json_decode_layers` remaining string
/// layers before decoding base64/Python bytes. A plain base64 span stays borrowed.
///
/// For a slash escaped inside an embedded JSON string (quotes omitted):
/// ```text
/// outer source      a\\/b
/// stored spelling   a\/b   outer JSON layer removed during compaction
/// media text        a/b    one remaining JSON decode before media decoding
/// ```
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExtractedMedia {
    pub(crate) metadata: Arc<MediaMetadata>,
    occurrence_id: u128,
    /// Number of serialized JSON documents between the outer input and this candidate.
    /// Used to adjust restoration to the consumer's current serialization layer.
    original_json_depth: u8,
    pub kind: MediaPayloadKind,
    pub encoding: MediaEncoding,
    /// Source spelling after parsing the outer JSON, retaining any nested escapes.
    storage: MediaStorage,
    /// Remaining JSON unescapes needed to reach media text. Zero when the stored
    /// spelling already matches, even if the candidate was in an embedded document.
    json_decode_layers: u8,
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
    /// Temporary identity travels with this occurrence through normalization.
    /// Upload deduplication uses the separate content hash.
    pub fn reference(&self) -> String {
        let mut bytes = Vec::with_capacity(reference_length(&self.metadata));
        write_reference(&mut bytes, &self.metadata, self.occurrence_id);
        String::from_utf8(bytes).expect("media reference is UTF-8")
    }

    /// Decode a body without consuming its encoded text, allowing retry or inline restoration.
    pub fn decode(&self) -> Result<Vec<u8>, MediaDecodeError> {
        super::encoding::decode_encoded_data(&self.encoded_data()?, self.encoding)
    }

    /// Return the media text used for inline restoration.
    pub fn original_value(&self) -> Result<String, MediaDecodeError> {
        String::from_utf8(self.original_data().to_vec())
            .map_err(|_| MediaDecodeError::InvalidSourceText)
    }

    /// Return the source spelling at a requested number of remaining JSON layers.
    /// `None` returns the exact spelling after parsing the outer document;
    /// zero returns the fully decoded candidate.
    pub fn original_value_for_layers(
        &self,
        json_layers: Option<u32>,
    ) -> Result<String, MediaDecodeError> {
        let Some(json_layers) = json_layers else {
            return self.original_value();
        };
        if json_layers > MAX_JSON_LAYER_ADJUSTMENT {
            return Err(MediaDecodeError::JsonLayerLimit);
        }
        if json_layers == 0 {
            return String::from_utf8(self.encoded_data()?.into_owned())
                .map_err(|_| MediaDecodeError::InvalidSourceText);
        }

        let source_depth = u32::from(self.original_json_depth);
        let mut value = self.original_data().to_vec();
        if json_layers < source_depth {
            for _ in 0..(source_depth - json_layers) {
                value = unescape_json_layer(&value)?;
            }
        } else {
            for _ in 0..(json_layers - source_depth) {
                value = escape_json_layer(&value)?;
            }
        }
        String::from_utf8(value).map_err(|_| MediaDecodeError::InvalidSourceText)
    }

    /// Whether inline restoration differs from the fully decoded media text.
    pub fn original_has_json_escapes(&self) -> bool {
        self.json_decode_layers != 0
    }

    /// Number of serialized JSON documents containing this candidate.
    pub fn original_json_depth(&self) -> u8 {
        self.original_json_depth
    }

    /// Number of UTF-8 bytes in the source representation restored when an
    /// upload fails.
    pub fn original_byte_length(&self) -> usize {
        self.original_data().len()
    }

    pub(crate) fn retained_bytes(&self, seen: &mut HashSet<*const MediaMetadata>) -> usize {
        let metadata = if seen.insert(Arc::as_ptr(&self.metadata)) {
            self.metadata.retained_bytes()
        } else {
            0
        };
        metadata + storage_retained_bytes(&self.storage)
    }

    pub(crate) fn source_capacity(&self) -> Option<usize> {
        match &self.storage {
            MediaStorage::Source { bytes, .. } => Some(bytes.capacity()),
            MediaStorage::Owned(_) => None,
        }
    }

    fn encoded_data(&self) -> Result<Cow<'_, [u8]>, MediaDecodeError> {
        let mut value = Cow::Borrowed(self.original_data());
        for _ in 0..self.json_decode_layers {
            value = Cow::Owned(unescape_json_layer(&value)?);
        }
        Ok(value)
    }

    fn original_data(&self) -> &[u8] {
        storage_bytes(&self.storage)
    }
}

fn storage_bytes(storage: &MediaStorage) -> &[u8] {
    match storage {
        MediaStorage::Owned(bytes) => bytes,
        MediaStorage::Source { bytes, range } => &bytes[range.clone()],
    }
}

fn storage_retained_bytes(storage: &MediaStorage) -> usize {
    match storage {
        MediaStorage::Owned(bytes) => bytes.capacity(),
        MediaStorage::Source { .. } => 0,
    }
}

/// Result of validating and extracting one JSON document.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EarlyMediaResult {
    /// Valid JSON with extracted values replaced by temporary occurrence references.
    pub compact_json: Vec<u8>,
    /// Media removed from `compact_json`, in source traversal order.
    pub media: Vec<ExtractedMedia>,
}

/// An owned, syntax-validated source snapshot. Discovery is deferred until
/// extraction so masking cannot cause media hashing of a discarded input.
#[derive(Debug, Eq, PartialEq)]
pub struct ValidatedPayload {
    source: Vec<u8>,
    normalized: bool,
}

/// OTLP receivers sanitize invalid UTF-8 sequences to U+FFFD before processing:
/// https://github.com/open-telemetry/opentelemetry-proto/blob/main/docs/specification.md#utf-8-string-handling
/// All later offsets refer to the sanitized source. Valid UTF-8 keeps its allocation.
pub fn validate(input: Vec<u8>) -> Result<ValidatedPayload, EarlyMediaError> {
    let (input, normalized) = match String::from_utf8(input) {
        Ok(input) => (input, false),
        Err(error) => (String::from_utf8_lossy(error.as_bytes()).into_owned(), true),
    };
    super::json::validate_json(&input)?;
    Ok(ValidatedPayload {
        source: input.into_bytes(),
        normalized,
    })
}

impl ValidatedPayload {
    pub(crate) fn normalized_bytes(&self) -> Option<&[u8]> {
        self.normalized.then_some(self.source.as_slice())
    }

    /// Retained source allocation used for the validation handle's baseline.
    pub(crate) fn retained_bytes(&self) -> usize {
        self.source.capacity()
    }

    /// Discover and apply edits only for the accepted payload selected for extraction.
    /// Source-backed candidates keep ranges into the owned source allocation.
    pub fn compact(self) -> Result<EarlyMediaResult, EarlyMediaError> {
        let ValidatedPayload { source, .. } = self;
        let manifest = super::scanner::discover(source.as_slice())?;
        if manifest.entries.is_empty() {
            // Reuse the source allocation when there are no replacements.
            return Ok(EarlyMediaResult {
                compact_json: source,
                media: Vec::new(),
            });
        }
        apply_edit_plan(Arc::new(source), manifest)
    }

    /// Return the validated source allocation without running media discovery.
    pub fn into_source(self) -> Vec<u8> {
        self.source
    }
}

/// Transient discovery output consumed by compaction.
#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct MediaManifest {
    pub(super) entries: Vec<MediaManifestEntry>,
}

#[cfg(test)]
impl MediaManifest {
    /// Retained allocations in the transient discovery result for bounded-memory tests.
    pub(super) fn retained_bytes(&self) -> usize {
        let mut seen = HashSet::new();
        self.entries.capacity() * std::mem::size_of::<MediaManifestEntry>()
            + self
                .entries
                .iter()
                .map(|entry| {
                    if seen.insert(Arc::as_ptr(&entry.metadata)) {
                        entry.metadata.retained_bytes()
                    } else {
                        0
                    }
                })
                .sum::<usize>()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct MediaManifestEntry {
    pub(crate) metadata: Arc<MediaMetadata>,
    pub(crate) original_json_depth: u8,
    pub kind: MediaPayloadKind,
    pub encoding: MediaEncoding,
    /// Exact raw source span replaced during compaction. Also supplies the
    /// restoration spelling; it need not equal the JSON-unescaped upload text.
    pub(super) edit_range: Range<usize>,
    /// JSON unescapes remaining after the outer input is parsed once.
    pub(super) json_decode_layers: u8,
}

/// JSON syntax errors and failures to construct or apply a media edit plan.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EarlyMediaError {
    InvalidJson {
        offset: usize,
        message: &'static str,
    },
    TrailingBytes {
        offset: usize,
    },
    InvalidEditPlan {
        entry: usize,
    },
    RandomnessUnavailable,
}

impl fmt::Display for EarlyMediaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidJson { offset, message } => {
                write!(f, "invalid JSON at byte {offset}: {message}")
            }
            Self::TrailingBytes { offset } => write!(f, "trailing JSON bytes at byte {offset}"),
            Self::RandomnessUnavailable => f.write_str("could not create temporary media identity"),
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

impl EarlyMediaError {
    /// Stable error codes exposed through N-API.
    pub fn code(&self) -> &'static str {
        match self {
            Self::InvalidEditPlan { .. } | Self::RandomnessUnavailable => "ERR_OTEL_INTERNAL",
            Self::InvalidJson { .. } | Self::TrailingBytes { .. } => "ERR_OTEL_INVALID_JSON",
        }
    }
}

#[derive(Debug)]
pub enum MediaDecodeError {
    Base64(base64::DecodeError),
    Base64Slice(base64::DecodeSliceError),
    InvalidPythonBytes,
    InvalidDataUri,
    InvalidSourceText,
    InvalidJsonString,
    JsonLayerLimit,
}

impl fmt::Display for MediaDecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Base64(error) => write!(f, "invalid base64 media: {error}"),
            Self::Base64Slice(error) => write!(f, "invalid base64 media: {error}"),
            Self::InvalidPythonBytes => f.write_str("invalid Python bytes literal"),
            Self::InvalidDataUri => f.write_str("invalid Data URI media"),
            Self::InvalidSourceText => f.write_str("media source is not UTF-8 text"),
            Self::InvalidJsonString => f.write_str("invalid JSON string representation"),
            Self::JsonLayerLimit => f.write_str("JSON string layer limit exceeded"),
        }
    }
}

impl std::error::Error for MediaDecodeError {}

fn apply_edit_plan(
    source: Arc<Vec<u8>>,
    manifest: MediaManifest,
) -> Result<EarlyMediaResult, EarlyMediaError> {
    let entries = manifest.entries;
    let input = source.as_slice();
    validate_edit_plan(input, &entries)?;
    let mut nonce = [0; 16];
    getrandom::fill(&mut nonce).map_err(|_| EarlyMediaError::RandomnessUnavailable)?;
    let first_id = u128::from_le_bytes(nonce);
    let replacement_bytes = entries
        .iter()
        .map(|entry| {
            // The temporary ID has a fixed-width representation, independent of the index.
            reference_length(&entry.metadata)
        })
        .sum::<usize>();
    let removed_bytes = entries
        .iter()
        .map(|entry| entry.edit_range.len())
        .sum::<usize>();
    let mut compact_json = Vec::with_capacity(
        input
            .len()
            .saturating_sub(removed_bytes)
            .saturating_add(replacement_bytes),
    );
    let mut cursor = 0;
    let mut media = Vec::with_capacity(entries.len());
    for (index, entry) in entries.into_iter().enumerate() {
        let occurrence_id = first_id.wrapping_add(index as u128);
        compact_json.extend_from_slice(&input[cursor..entry.edit_range.start]);
        write_reference(&mut compact_json, &entry.metadata, occurrence_id);
        cursor = entry.edit_range.end;
        let raw = &input[entry.edit_range.clone()];
        let storage = if raw.contains(&b'\\') {
            MediaStorage::Owned(
                unescape_json_layer(raw)
                    .map_err(|_| EarlyMediaError::InvalidEditPlan { entry: index })?,
            )
        } else {
            MediaStorage::Source {
                bytes: Arc::clone(&source),
                range: entry.edit_range,
            }
        };
        media.push(ExtractedMedia {
            metadata: entry.metadata,
            occurrence_id,
            original_json_depth: entry.original_json_depth,
            kind: entry.kind,
            encoding: entry.encoding,
            storage,
            json_decode_layers: entry.json_decode_layers,
        });
    }
    compact_json.extend_from_slice(&input[cursor..]);

    detach_small_source_ranges(&source, &mut media);
    Ok(EarlyMediaResult {
        compact_json,
        media,
    })
}

const MAX_JSON_LAYER_ADJUSTMENT: u32 = 16;

fn unescape_json_layer(value: &[u8]) -> Result<Vec<u8>, MediaDecodeError> {
    let mut token = Vec::with_capacity(value.len() + 2);
    token.push(b'"');
    token.extend_from_slice(value);
    token.push(b'"');
    let mut decoder = Jiter::new(&token);
    let decoded = decoder
        .next_str()
        .map_err(|_| MediaDecodeError::InvalidJsonString)?
        .as_bytes()
        .to_vec();
    decoder
        .finish()
        .map_err(|_| MediaDecodeError::InvalidJsonString)?;
    Ok(decoded)
}

fn escape_json_layer(value: &[u8]) -> Result<Vec<u8>, MediaDecodeError> {
    let value = std::str::from_utf8(value).map_err(|_| MediaDecodeError::InvalidSourceText)?;
    let encoded = serde_json::to_string(value).map_err(|_| MediaDecodeError::InvalidJsonString)?;
    Ok(encoded.as_bytes()[1..encoded.len() - 1].to_vec())
}

pub(super) fn validate_edit_plan(
    input: &[u8],
    entries: &[MediaManifestEntry],
) -> Result<(), EarlyMediaError> {
    // Compaction consumes entries in source order. Keeping this invariant here
    // makes overlapping edits fail before any output or media handle is built.
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

fn reference_length(metadata: &MediaMetadata) -> usize {
    "@@@langfuseMedia:type=|id=|source=@@@".len()
        + metadata.content_type.len()
        + 22
        + metadata.source.as_str().len()
}

fn write_reference(output: &mut Vec<u8>, metadata: &MediaMetadata, id: u128) {
    // The registry distinguishes pending occurrences from pre-existing public
    // references. Both use 22-character IDs, so temporary IDs do not inflate JSON.
    let mut encoded_id = [0; 22];
    URL_SAFE_NO_PAD
        .encode_slice(id.to_le_bytes(), &mut encoded_id)
        .expect("22 bytes hold an unpadded base64-encoded 128-bit ID");
    let id = std::str::from_utf8(&encoded_id).expect("base64 IDs are ASCII");
    write!(
        output,
        "@@@langfuseMedia:type={}|id={id}|source={}@@@",
        metadata.content_type,
        metadata.source.as_str()
    )
    .expect("writing a media reference to a Vec cannot fail");
}

/// Detach small source-backed ranges when they account for less than half of
/// the source snapshot. Keeping a source-backed range for a media-heavy
/// document avoids replacing one large allocation with another large copy.
fn detach_small_source_ranges(source: &Arc<Vec<u8>>, media: &mut [ExtractedMedia]) {
    if source.len() < SOURCE_DETACH_MIN_BYTES {
        return;
    }

    let source_backed_bytes = media
        .iter()
        .map(|entry| &entry.storage)
        .filter_map(|storage| match storage {
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

#[cfg(test)]
#[path = "payload_tests.rs"]
mod tests;
