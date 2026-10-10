//! Find media inside the strings selected by `structural_walk`.
//!
//! `ValidatedPayload::compact` calls `discover` with validated JSON bytes. The result
//! is a `MediaManifest`: an edit plan containing source ranges and media metadata.
//!
//! ```text
//! discover -> discover_inner
//!   |-- may_contain_media_candidate        no markers -> empty edit plan
//!   |-- structural_walk::scan              select quoted-string ranges
//!   |-- for each Candidate:
//!   |    |-- String/Text -> discover_string_token
//!   |    |    |-- Jiter::next_str          decode the selected JSON string
//!   |    |    `-- discover_string
//!   |    |         |-- try_discover_embedded_document
//!   |    |         |    validate_json -> discover_inner -> translate_nested_entries
//!   |    |         `-- discover_data_uri_candidates
//!   |    |              data_uri::find_data_uri_candidates -> register_candidate
//!   |    `-- Structured -> discover_structured
//!   |         Jiter::next_str -> inspect provider body -> register_candidate
//!   `-- sort entries + validate_edit_plan  return non-overlapping source ranges
//! ```
//!
//! Before registration, decoded media boundaries are mapped back to source bytes.
//! Embedded JSON strings follow the same process up to `MAX_EMBEDDED_JSON_DEPTH`;
//! beyond that, strings are inspected for Data URI text only. This module records
//! edits; `payload` applies them and keeps the data needed for later restoration.

use std::collections::HashMap;
use std::ops::Range;
use std::sync::Arc;

use base64::Engine;
use jiter::Jiter;

use super::data_uri::{find_data_uri_candidates, parse_data_uri};
use super::encoding::{hash_encoded_data, is_python_bytes_literal, is_valid_base64_syntax, BASE64};
use super::payload::{
    validate_edit_plan, EarlyMediaError, MediaEncoding, MediaManifest, MediaManifestEntry,
    MediaMetadata, MediaPayloadKind, MediaSource,
};
use super::rules::{
    is_media_reference, is_supported_content_type, may_be_serialized_json,
    may_contain_media_candidate, may_contain_serialized_media, DATA_URI_PREFIX,
    MIN_EARLY_MEDIA_BYTES,
};
use super::WalkStats;

// Count JSON documents parsed from strings, excluding the outer input, not object/array depth.
// After two embedded documents, stop interpreting further strings as structured documents;
// still extract directly recognizable Data URIs from their text.
const MAX_EMBEDDED_JSON_DEPTH: usize = 2;
/// Content metadata shared by the outer document and JSON embedded in its strings.
#[derive(Default)]
struct ScanState {
    metadata: HashMap<String, Arc<MediaMetadata>>,
}

/// Discover media in an already-validated source using an explicit stack.
pub(super) fn discover(input: &[u8]) -> Result<MediaManifest, EarlyMediaError> {
    discover_inner(
        input,
        0,
        &mut ScanState::default(),
        &mut WalkStats::default(),
    )
}

#[cfg(test)]
pub(super) fn discover_measured(
    input: &[u8],
) -> Result<(MediaManifest, usize, usize, usize), EarlyMediaError> {
    let mut state = ScanState::default();
    let mut stats = WalkStats::default();
    let manifest = discover_inner(input, 0, &mut state, &mut stats)?;
    Ok((
        manifest,
        stats.bytes_walked,
        stats.peak_index_bytes,
        state.metadata.len(),
    ))
}

fn discover_inner(
    input: &[u8],
    embedded_depth: usize,
    state: &mut ScanState,
    stats: &mut WalkStats,
) -> Result<MediaManifest, EarlyMediaError> {
    // Most payloads have no media markers. Avoid allocating the structural walk
    // for those documents.
    if std::str::from_utf8(input).is_ok_and(|text| !may_contain_media_candidate(text)) {
        stats.add_bytes(input.len());
        return Ok(MediaManifest {
            entries: Vec::new(),
        });
    }

    let candidates = super::structural_walk::scan(input, embedded_depth == 0, stats)?;
    let mut entries = Vec::new();
    let mut discovery = MediaDiscovery {
        input,
        state,
        stats,
        embedded_depth,
        entries: &mut entries,
    };
    for candidate in candidates {
        match candidate {
            super::structural_walk::Candidate::String(token_range) => {
                discovery.discover_string_token(token_range, true)?;
            }
            super::structural_walk::Candidate::Text(token_range) => {
                discovery.discover_string_token(token_range, false)?;
            }
            super::structural_walk::Candidate::Structured {
                token_range,
                content_type,
                kind,
            } => discovery.discover_structured(token_range, &content_type, kind)?,
        }
    }

    entries.sort_by_key(|entry| entry.edit_range.start);
    validate_edit_plan(input, &entries)?;
    Ok(MediaManifest { entries })
}

/// One document's scan. Entry offsets refer to `input` until a parent maps them back.
struct MediaDiscovery<'a, 'state, 'stats> {
    input: &'a [u8],
    state: &'state mut ScanState,
    stats: &'stats mut WalkStats,
    embedded_depth: usize,
    entries: &'stats mut Vec<MediaManifestEntry>,
}

impl MediaDiscovery<'_, '_, '_> {
    fn discover_string_token(
        &mut self,
        token_range: Range<usize>,
        allow_embedded_json: bool,
    ) -> Result<(), EarlyMediaError> {
        let input = self.input;
        let mut decoder = Jiter::new(&input[token_range.clone()]);
        let Ok(value) = decoder.next_str() else {
            // An undecodable string cannot be safely rewritten. The structural
            // walk has already continued, so sibling values remain discoverable.
            return Ok(());
        };
        // Do not clone the decoded token. Candidate storage copies only the
        // representation it needs, while source-backed candidates keep ranges.
        self.discover_string(value, token_range, allow_embedded_json)
    }

    fn discover_string(
        &mut self,
        value: &str,
        token_range: Range<usize>,
        allow_embedded_json: bool,
    ) -> Result<(), EarlyMediaError> {
        if is_media_reference(value) {
            return Ok(());
        }

        if self.try_discover_embedded_document(value, &token_range, allow_embedded_json)? {
            return Ok(());
        }

        self.discover_data_uri_candidates(value, &token_range, allow_embedded_json)
    }

    fn try_discover_embedded_document(
        &mut self,
        value: &str,
        token_range: &Range<usize>,
        allow_embedded_json: bool,
    ) -> Result<bool, EarlyMediaError> {
        if !(allow_embedded_json
            && may_be_serialized_json(value)
            && self.embedded_depth < MAX_EMBEDDED_JSON_DEPTH
            && (value.contains(DATA_URI_PREFIX)
                || value.contains("\\u")
                || may_contain_serialized_media(value))
            && super::json::validate_json(value).is_ok())
        {
            return Ok(false);
        }

        let mut nested = discover_inner(
            value.as_bytes(),
            self.embedded_depth + 1,
            self.state,
            self.stats,
        )?;
        self.translate_nested_entries(value, token_range, &mut nested.entries)?;
        self.entries.extend(nested.entries);
        Ok(true)
    }

    fn discover_data_uri_candidates(
        &mut self,
        value: &str,
        token_range: &Range<usize>,
        allow_embedded_json: bool,
    ) -> Result<(), EarlyMediaError> {
        let text_only = !allow_embedded_json
            || (self.embedded_depth >= MAX_EMBEDDED_JSON_DEPTH && may_be_serialized_json(value));
        let candidates = find_data_uri_candidates(value)
            .into_iter()
            .filter(|(range, _)| value[range.clone()].len() >= MIN_EARLY_MEDIA_BYTES)
            .collect::<Vec<_>>();
        if candidates.is_empty() {
            return Ok(());
        }
        self.entries.reserve(candidates.len());
        let boundaries = candidates
            .iter()
            .flat_map(|(range, _)| [range.start, range.end])
            .collect::<Vec<_>>();
        let mapped = self.map_string_boundaries(token_range, value, &boundaries)?;
        for (index, (range, content_type)) in candidates.into_iter().enumerate() {
            let source_range = mapped[index * 2]..mapped[index * 2 + 1];
            // At a bounded text-only boundary, escaped spellings are ambiguous:
            // the candidate range is decoded text, while restoration needs the
            // exact source spelling. Leave those values untouched so a later
            // pass can handle them with the surrounding representation.
            if text_only
                && self
                    .input
                    .get(source_range.clone())
                    .is_some_and(|source| source.contains(&b'\\'))
            {
                continue;
            }
            self.register_candidate(
                value[range].as_bytes(),
                content_type,
                MediaPayloadKind::DataUri,
                MediaSource::Base64DataUri,
                MediaEncoding::Base64DataUri,
                source_range,
            )?;
        }
        Ok(())
    }

    fn discover_structured(
        &mut self,
        token_range: Range<usize>,
        content_type: &str,
        kind: MediaPayloadKind,
    ) -> Result<(), EarlyMediaError> {
        let input = self.input;
        let mut decoder = Jiter::new(&input[token_range.clone()]);
        let Ok(content) = decoder.next_str() else {
            return Ok(());
        };
        if content.starts_with(DATA_URI_PREFIX) {
            let Some(candidate) = parse_data_uri(content, 0) else {
                return Ok(());
            };
            let Some(uri_content_type) = candidate
                .valid
                .filter(|_| candidate.start == 0 && candidate.end == content.len())
            else {
                return Ok(());
            };
            return self.register_candidate(
                content.as_bytes(),
                uri_content_type,
                MediaPayloadKind::DataUri,
                MediaSource::Base64DataUri,
                MediaEncoding::Base64DataUri,
                token_range.start + 1..token_range.end - 1,
            );
        }
        if !is_supported_content_type(content_type) {
            return Ok(());
        }
        let (encoding, valid) = if is_python_bytes_literal(content) {
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

        self.register_candidate(
            content.as_bytes(),
            content_type,
            kind,
            MediaSource::Bytes,
            encoding,
            token_range.start + 1..token_range.end - 1,
        )
    }

    /// Map child edits into the parent source. Added escapes below the outer
    /// input remain in the retained spelling and must be removed before upload.
    fn translate_nested_entries(
        &mut self,
        decoded_document: &str,
        containing_string: &Range<usize>,
        entries: &mut [MediaManifestEntry],
    ) -> Result<(), EarlyMediaError> {
        let boundaries = entries
            .iter()
            .flat_map(|entry| [entry.edit_range.start, entry.edit_range.end])
            .collect::<Vec<_>>();
        let mapped =
            self.map_string_boundaries(containing_string, decoded_document, &boundaries)?;
        for (index, entry) in entries.iter_mut().enumerate() {
            let parent_range = mapped[index * 2]..mapped[index * 2 + 1];
            if self.embedded_depth > 0
                && decoded_document.as_bytes().get(entry.edit_range.clone())
                    != self.input.get(parent_range.clone())
            {
                entry.json_decode_layers = entry.original_json_depth;
            }
            entry.edit_range = parent_range;
        }
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
        if encoded_data.len() < MIN_EARLY_MEDIA_BYTES {
            return Ok(());
        }
        let same_source_spelling = self
            .input
            .get(source_range.clone())
            .is_some_and(|bytes| bytes == encoded_data);
        let Some((reference, sha256_hash)) =
            media_identity_from_encoded(encoded_data, content_type, source, encoding)
        else {
            return Ok(());
        };
        let metadata = if let Some(metadata) = self.state.metadata.get(&reference) {
            Arc::clone(metadata)
        } else {
            let metadata = Arc::new(MediaMetadata {
                source,
                content_type: content_type.to_owned(),
                sha256_hash,
            });
            self.state.metadata.insert(reference, Arc::clone(&metadata));
            metadata
        };
        self.entries.push(MediaManifestEntry {
            metadata,
            original_json_depth: self.embedded_depth as u8,
            kind,
            encoding,
            edit_range: source_range,
            json_decode_layers: if same_source_spelling {
                0
            } else {
                self.embedded_depth as u8
            },
        });
        Ok(())
    }

    /// Map selected offsets in Jiter's decoded string back to the source token.
    /// Jiter has already validated the escapes: the decoded character tells us
    /// whether a Unicode escape occupies six source bytes or a twelve-byte pair.
    /// Plain runs are skipped together; only requested boundaries are stored.
    ///
    /// With the opening quote at input byte 0:
    /// ```text
    /// source token:  "x\u0061y"    decoded text: xay
    /// decoded range: 1..2 (a)  ->  source range: 2..8 (\u0061)
    /// ```
    /// The preceding `x` advances both cursors by one; `a` advances the decoded
    /// cursor by one and the source cursor by six. The opening quote adds one.
    fn map_string_boundaries(
        &self,
        token_range: &Range<usize>,
        decoded: &str,
        decoded_offsets: &[usize],
    ) -> Result<Vec<usize>, EarlyMediaError> {
        let invalid = |offset, message| EarlyMediaError::InvalidJson { offset, message };
        let content_start = token_range.start + 1;
        let content_end = token_range.end - 1;
        let raw_content = self
            .input
            .get(content_start..content_end)
            .ok_or_else(|| invalid(token_range.start, "invalid JSON string range"))?;
        let mut boundaries = Vec::with_capacity(decoded_offsets.len());
        let has_escapes = raw_content.contains(&b'\\');
        let mut raw_cursor = content_start;
        let mut decoded_cursor = 0usize;
        let mut plain_run_end = None;
        for &target in decoded_offsets {
            if target < decoded_cursor || !decoded.is_char_boundary(target) {
                return Err(invalid(raw_cursor, "invalid or unordered string boundary"));
            }
            if !has_escapes {
                boundaries.push(content_start + target);
                decoded_cursor = target;
                continue;
            }
            while decoded_cursor < target {
                if raw_cursor >= content_end {
                    return Err(invalid(raw_cursor, "invalid string boundary"));
                }
                if self.input[raw_cursor] == b'\\' {
                    let character = decoded
                        .get(decoded_cursor..)
                        .and_then(|text| text.chars().next())
                        .ok_or_else(|| invalid(raw_cursor, "invalid decoded string boundary"))?;
                    raw_cursor += if self.input.get(raw_cursor + 1) == Some(&b'u') {
                        6 * character.len_utf16()
                    } else {
                        2
                    };
                    decoded_cursor += character.len_utf8();
                } else {
                    let run_end = *plain_run_end.get_or_insert_with(|| {
                        memchr::memchr(b'\\', &self.input[raw_cursor..content_end])
                            .map_or(content_end, |length| raw_cursor + length)
                    });
                    let amount = (target - decoded_cursor).min(run_end - raw_cursor);
                    raw_cursor += amount;
                    decoded_cursor += amount;
                    if raw_cursor == run_end {
                        plain_run_end = None;
                    }
                }
            }
            if decoded_cursor != target || raw_cursor > content_end {
                return Err(invalid(raw_cursor, "invalid string boundary"));
            }
            boundaries.push(raw_cursor);
        }
        Ok(boundaries)
    }
}

pub(super) fn media_identity_from_encoded(
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
