//! Stateful JSON discovery walk for OTEL media candidates.

use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::ops::Range;
use std::sync::Arc;

use base64::Engine;
use jiter::Jiter;

use super::encoding::{
    has_data_uri_boundary, hash_encoded_data, is_base64_character, is_data_uri_terminator,
    is_valid_content_type, is_valid_data_uri_parameters, BASE64,
};
use super::encoding::{is_python_bytes_literal, is_valid_base64_syntax};
use super::json::{
    map_jiter_error, parse_unicode_escape, scan_jiter_value, skip_whitespace, validate_utf8,
    UnicodeEscapeError, MAX_JSON_DEPTH,
};
use super::payload::{
    validate_edit_plan, validate_manifest, EarlyMediaError, ManifestMediaStorage, MediaEncoding,
    MediaPayloadKind, ValidatedPayload,
};
use super::payload::{MediaManifest, MediaManifestEntry, MediaSource};
use super::rules::{
    is_media_reference, is_otel_envelope_field, is_supported_content_type, may_be_serialized_json,
    may_contain_media_candidate, may_contain_serialized_media, media_scan_mode_for_field,
    MediaScanMode, BASE64_MARKER, DATA_URI_PREFIX, MEDIA_REFERENCE_PREFIX, MEDIA_REFERENCE_SUFFIX,
};

// Embedded JSON strings are recursively scanned only to this smaller depth.
const MAX_EMBEDDED_JSON_DEPTH: usize = 10;

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
        Extractor::new(&source).discover()?
    } else {
        Extractor::new(&source).validate_only()?
    };
    if end != source.len() {
        return Err(EarlyMediaError::TrailingBytes { offset: end });
    }
    Ok(ValidatedPayload::from_discovery(source, manifest))
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

struct Extractor<'a> {
    input: &'a [u8],
    embedded_depth: usize,
    /// Cache validated value boundaries while the extractor walks a document.
    ///
    /// The containing object scan and the discovery walk both need child
    /// boundaries. Caching large values prevents rescanning media-sized strings.
    scan_cache: Option<HashMap<usize, usize>>,
    manifest: Vec<MediaManifestEntry>,
    existing_references: HashSet<String>,
    pending_ambiguity: Option<EarlyMediaError>,
}

impl<'a> Extractor<'a> {
    fn new(input: &'a [u8]) -> Self {
        Self::new_with_embedded_depth(input, 0)
    }

    fn new_with_embedded_depth(input: &'a [u8], embedded_depth: usize) -> Self {
        Self {
            input,
            embedded_depth,
            scan_cache: Some(HashMap::new()),
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
        let selected_outer = fields.iter().rev().find(|field| field.key == outer_key);

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
            let selected_inner = inline_fields
                .iter()
                .rev()
                .find(|field| field.key == inner_key);
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
            let Some(field) = fields.iter().rev().find(|field| field.key == outer) else {
                return Ok(());
            };
            let Ok(inline_fields) = self.object_fields(field.value_start, field.value_end, 0)
            else {
                return Ok(());
            };
            let Some(inline_field) = inline_fields.iter().rev().find(|field| field.key == inner)
            else {
                return Ok(());
            };
            inline_field.value_start..inline_field.value_end
        } else {
            let Some(field) = fields
                .iter()
                .rev()
                .find(|field| field.key == shape.property)
            else {
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
        let field = |name: &str| fields.iter().rev().find(|field| field.key == name);
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
            let Some(data) = inline_fields.iter().rev().find(|field| field.key == "data") else {
                continue;
            };
            // JSON.parse keeps the last exact key, while Gemini gives the snake-case
            // alias precedence unless it is absent or null.
            let content_type_field = inline_fields
                .iter()
                .rfind(|field| field.key == "mime_type")
                .filter(|field| self.input.get(field.value_start) != Some(&b'n'))
                .or_else(|| inline_fields.iter().rfind(|field| field.key == "mimeType"));
            let Some(content_type) = content_type_field
                .filter(|field| self.input.get(field.value_start) == Some(&b'"'))
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

struct ParsedDataUri<'a> {
    start: usize,
    end: usize,
    valid: Option<&'a str>,
}

fn parse_data_uri(value: &str, mut start: usize) -> Option<ParsedDataUri<'_>> {
    let bytes = value.as_bytes();
    let mut header_cursor = start + DATA_URI_PREFIX.len();
    // Advance once through the header, restarting at a later plausible prefix.
    // Searching the remaining suffix separately for every `data:` is quadratic
    // on text with many prefixes and no Base64 marker.
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
