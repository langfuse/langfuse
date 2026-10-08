//! Discover media after `payload::validate` has checked the input's JSON syntax.
//!
//! Discovery has two stages: `structural_walk` traverses JSON containers and selects candidate
//! spans while preserving duplicate-key, envelope, and provider-shape rules; this module interprets
//! those spans as media, follows bounded serialized-JSON strings, and maps decoded offsets back to
//! source bytes. The payload layer then compacts validated spans without building a complete JSON
//! value tree.

use std::collections::HashMap;
use std::ops::Range;
use std::sync::Arc;

use base64::Engine;
use jiter::Jiter;

use super::encoding::{
    has_data_uri_boundary, hash_encoded_data, is_base64_character, is_data_uri_terminator,
    is_python_bytes_literal, is_valid_base64_syntax, is_valid_content_type,
    is_valid_data_uri_parameters, BASE64,
};
use super::json::{parse_unicode_escape, UnicodeEscapeError};
use super::payload::{
    validate_edit_plan, EarlyMediaError, ManifestMediaStorage, MediaEncoding, MediaManifest,
    MediaManifestEntry, MediaMetadata, MediaPayloadKind, MediaSource,
};
use super::rules::{
    is_media_reference, is_supported_content_type, may_be_serialized_json,
    may_contain_media_candidate, may_contain_serialized_media, BASE64_MARKER, DATA_URI_PREFIX,
};

// Count JSON documents parsed from strings, excluding the outer input, not object/array depth.
// After two embedded documents, stop interpreting further strings as structured documents;
// still extract directly recognizable Data URIs from their text.
const MAX_EMBEDDED_JSON_DEPTH: usize = 2;
// Leave sub-KiB encoded candidates (including a Data URI header) for the later
// media pass to limit per-occurrence descriptors and hash entries. The 1 KiB
// cutoff favors measured replay gains for small attachments; escaped embedded
// media can still retain more memory than leaving it inline.
pub(super) const MIN_EARLY_MEDIA_BYTES: usize = 1024;

#[derive(Default)]
struct ScanState {
    metadata: HashMap<String, Arc<MediaMetadata>>,
}

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

        if allow_embedded_json
            && may_be_serialized_json(value)
            && self.embedded_depth < MAX_EMBEDDED_JSON_DEPTH
            && (value.contains(DATA_URI_PREFIX)
                || value.contains("\\u")
                || may_contain_serialized_media(value))
            && super::json::validate_json(value).is_ok()
        {
            let mut nested = discover_inner(
                value.as_bytes(),
                self.embedded_depth + 1,
                self.state,
                self.stats,
            )?;
            self.translate_nested_entries(value, &token_range, &mut nested.entries)?;
            self.entries.extend(nested.entries);
            return Ok(());
        }

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
        let mapped = self.map_string_boundaries(&token_range, &boundaries)?;
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
            let raw_range = self.map_string_boundaries(&token_range, &[0, content.len()])?;
            return self.register_candidate(
                content.as_bytes(),
                uri_content_type,
                MediaPayloadKind::DataUri,
                MediaSource::Base64DataUri,
                MediaEncoding::Base64DataUri,
                raw_range[0]..raw_range[1],
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

        let raw_range = self.map_string_boundaries(&token_range, &[0, content.len()])?;
        self.register_candidate(
            content.as_bytes(),
            content_type,
            kind,
            MediaSource::Bytes,
            encoding,
            raw_range[0]..raw_range[1],
        )
    }

    fn translate_nested_entries(
        &mut self,
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
        let source_backed = self
            .input
            .get(source_range.clone())
            .is_some_and(|bytes| bytes == encoded_data);
        let Some((reference, sha256_hash)) =
            media_identity_from_encoded(encoded_data, content_type, source, encoding)
        else {
            return Ok(());
        };
        let storage = if source_backed {
            ManifestMediaStorage::SourceRange(source_range.clone())
        } else {
            ManifestMediaStorage::Owned(encoded_data.to_vec())
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
            storage,
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
                invalid(
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
                            b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't' => {
                                raw_cursor += 2;
                                decoded_cursor += 1;
                            }
                            b'u' => {
                                let (next, character) =
                                    parse_unicode_escape(self.input, raw_cursor)
                                        .map_err(|error| unicode_error(raw_cursor, error))?;
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
}

fn unicode_error(offset: usize, error: UnicodeEscapeError) -> EarlyMediaError {
    match error {
        UnicodeEscapeError::Invalid(message) => EarlyMediaError::InvalidJson { offset, message },
        UnicodeEscapeError::UnsupportedSurrogate => EarlyMediaError::InvalidJson {
            offset,
            message: "cannot map an unpaired Unicode surrogate",
        },
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

struct ParsedDataUri<'a> {
    start: usize,
    end: usize,
    valid: Option<&'a str>,
}

fn parse_data_uri(value: &str, mut start: usize) -> Option<ParsedDataUri<'_>> {
    let bytes = value.as_bytes();
    let mut header_cursor = start + DATA_URI_PREFIX.len();
    let marker_start = loop {
        let Some(&byte) = bytes.get(header_cursor) else {
            return Some(ParsedDataUri {
                start,
                end: bytes.len(),
                valid: None,
            });
        };
        if byte == b',' {
            return Some(ParsedDataUri {
                start,
                end: header_cursor + 1,
                valid: None,
            });
        }
        if byte == b'd' && bytes[header_cursor..].starts_with(DATA_URI_PREFIX.as_bytes()) {
            if has_data_uri_boundary(value, header_cursor) {
                start = header_cursor;
            }
            header_cursor += DATA_URI_PREFIX.len();
            continue;
        }
        if byte == b';' && bytes[header_cursor..].starts_with(BASE64_MARKER.as_bytes()) {
            break header_cursor;
        }
        header_cursor += 1;
    };
    let after_prefix = start + DATA_URI_PREFIX.len();
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
    let valid = (valid && !encoded.is_empty() && encoded.len() % 4 != 1).then_some(content_type);
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
        if let Some(content_type) = candidate.valid {
            candidates.push((candidate.start..candidate.end, content_type));
        }
        cursor = candidate.end.max(start + DATA_URI_PREFIX.len());
    }
    candidates
}
