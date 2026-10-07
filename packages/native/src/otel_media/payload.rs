//! Owned media registry, source storage, and compaction.

use std::collections::HashSet;
use std::fmt;
use std::io::Write;
use std::ops::Range;
use std::sync::Arc;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;

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

/// Content-derived strings shared by occurrences of the same public reference.
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
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ExtractedMedia {
    pub(crate) metadata: Arc<MediaMetadata>,
    occurrence_id: u128,
    pub kind: MediaPayloadKind,
    pub encoding: MediaEncoding,
    /// Exact source text for the candidate. When the candidate was ASCII-safe
    /// in the original document this is a range into the one source allocation
    /// retained by the registry. A decoded nested JSON value can use the same
    /// range when its encoded media text survived JSON escaping unchanged;
    /// otherwise it falls back to one owned candidate allocation.
    storage: MediaStorage,
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

    /// Decode an extracted candidate only when the storage adapter is ready to
    /// upload it. The encoded text remains owned by the registry for retry and
    /// restoration until that work is complete.
    pub fn decode(&self) -> Result<Vec<u8>, MediaDecodeError> {
        super::encoding::decode_encoded_data(self.encoded_data(), self.encoding)
    }

    /// Return the decoded media text for restoring one failed occurrence after
    /// normalization. JSON-escaped candidates use their decoded spelling;
    /// source-backed candidates retain the same bytes in the source document.
    pub fn original_value(&self) -> Result<String, MediaDecodeError> {
        String::from_utf8(self.encoded_data().to_vec())
            .map_err(|_| MediaDecodeError::InvalidSourceText)
    }

    /// Number of UTF-8 bytes in the source representation restored when an
    /// upload fails. This is the same unit as the TypeScript media counters.
    pub fn original_byte_length(&self) -> usize {
        self.encoded_data().len()
    }

    pub(crate) fn retained_bytes(&self, seen: &mut HashSet<*const MediaMetadata>) -> usize {
        let metadata = if seen.insert(Arc::as_ptr(&self.metadata)) {
            self.metadata.retained_bytes()
        } else {
            0
        };
        metadata
            + match &self.storage {
                MediaStorage::Owned(bytes) => bytes.capacity(),
                MediaStorage::Source { .. } => 0,
            }
    }

    pub(crate) fn source_capacity(&self) -> Option<usize> {
        match &self.storage {
            MediaStorage::Source { bytes, .. } => Some(bytes.capacity()),
            MediaStorage::Owned(_) => None,
        }
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
            // Discovery found no value to rewrite. Transfer
            // the one owned Vec instead of parsing and copying a large no-media
            // document into an identical compact buffer.
            return Ok(EarlyMediaResult {
                compact_json: source,
                media: Vec::new(),
            });
        }
        apply_edit_plan(Arc::new(source), manifest)
    }

    /// Consume the validation handle and transfer its original allocation to a
    /// caller that intentionally keeps the document un-compacted. This is the
    /// extraction-disabled path; discovery has not run, so transfer the source
    /// allocation directly.
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
                    (if seen.insert(Arc::as_ptr(&entry.metadata)) {
                        entry.metadata.retained_bytes()
                    } else {
                        0
                    }) + match &entry.storage {
                        ManifestMediaStorage::SourceRange(_) => 0,
                        ManifestMediaStorage::Owned(bytes) => bytes.capacity(),
                    }
                })
                .sum::<usize>()
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) struct MediaManifestEntry {
    pub(crate) metadata: Arc<MediaMetadata>,
    pub kind: MediaPayloadKind,
    pub encoding: MediaEncoding,
    /// Exact raw source span replaced during compaction.
    pub(super) edit_range: Range<usize>,
    /// Source-backed candidate bytes when the raw representation is identical,
    /// or one owned decoded candidate when JSON escaping changed its bytes.
    pub(super) storage: ManifestMediaStorage,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub(super) enum ManifestMediaStorage {
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
    /// Syntax failures never request a different processing implementation.
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

fn apply_edit_plan(
    source: Arc<Vec<u8>>,
    manifest: MediaManifest,
) -> Result<EarlyMediaResult, EarlyMediaError> {
    let input = source.as_slice();
    validate_edit_plan(input, &manifest.entries)?;
    let mut nonce = [0; 16];
    getrandom::fill(&mut nonce).map_err(|_| EarlyMediaError::RandomnessUnavailable)?;
    let first_id = u128::from_le_bytes(nonce);
    let replacement_bytes = manifest
        .entries
        .iter()
        .map(|entry| {
            // The temporary ID has a fixed-width representation, independent of the index.
            reference_length(&entry.metadata)
        })
        .sum::<usize>();
    let removed_bytes = manifest
        .entries
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
    let mut media = Vec::with_capacity(manifest.entries.len());
    for (index, entry) in manifest.entries.into_iter().enumerate() {
        let occurrence_id = first_id.wrapping_add(index as u128);
        compact_json.extend_from_slice(&input[cursor..entry.edit_range.start]);
        write_reference(&mut compact_json, &entry.metadata, occurrence_id);
        cursor = entry.edit_range.end;
        let storage = match entry.storage {
            ManifestMediaStorage::Owned(bytes) => MediaStorage::Owned(bytes),
            ManifestMediaStorage::SourceRange(range) => MediaStorage::Source {
                bytes: Arc::clone(&source),
                range: range.clone(),
            },
        };
        media.push(ExtractedMedia {
            metadata: entry.metadata,
            occurrence_id,
            kind: entry.kind,
            encoding: entry.encoding,
            storage,
        });
    }
    compact_json.extend_from_slice(&input[cursor..]);

    detach_small_source_ranges(&source, &mut media);
    Ok(EarlyMediaResult {
        compact_json,
        media,
    })
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

#[cfg(test)]
#[path = "payload_tests.rs"]
mod tests;
