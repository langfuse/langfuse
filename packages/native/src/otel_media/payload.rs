//! Owned media registry, source storage, and compaction.

use std::collections::{HashMap, HashSet};
use std::fmt;
use std::ops::Range;
use std::sync::Arc;

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
        super::encoding::decode_encoded_data(self.encoded_data(), self.encoding)
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
    pub(super) fn from_discovery(source: Arc<Vec<u8>>, manifest: MediaManifest) -> Self {
        Self { source, manifest }
    }

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
    pub(super) existing_references: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MediaManifestEntry {
    pub content_type: String,
    pub kind: MediaPayloadKind,
    pub source: MediaSource,
    pub encoding: MediaEncoding,
    /// Exact raw source span replaced during compaction.
    pub(super) edit_range: Range<usize>,
    /// Source-backed candidate bytes when the raw representation is identical,
    /// or one owned decoded candidate when JSON escaping changed its bytes.
    pub(super) storage: ManifestMediaStorage,
    pub(super) reference: String,
    /// Full decoded-content digest computed during discovery. Reusing it during
    /// compaction avoids decoding and hashing the same large media twice.
    pub(super) sha256_hash: String,
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

pub(super) fn validate_edit_plan(
    input: &[u8],
    entries: &[MediaManifestEntry],
) -> Result<(), EarlyMediaError> {
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

pub(super) fn validate_manifest(
    input: &[u8],
    manifest: &MediaManifest,
) -> Result<(), EarlyMediaError> {
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

#[cfg(test)]
#[path = "payload_tests.rs"]
mod tests;
