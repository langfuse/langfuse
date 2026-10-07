//! Forward JSON discovery walk for OTEL media candidates.

use std::borrow::Cow;
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
use super::json::{parse_unicode_escape, skip_whitespace, string_end, UnicodeEscapeError};
use super::payload::{
    validate_edit_plan, EarlyMediaError, ManifestMediaStorage, MediaEncoding, MediaManifest,
    MediaManifestEntry, MediaMetadata, MediaPayloadKind, MediaSource,
};
use super::rules::{
    is_media_reference, is_otel_envelope_field, is_supported_content_type, may_be_serialized_json,
    may_contain_media_candidate, may_contain_serialized_media, media_scan_mode_for_field,
    MediaScanMode, BASE64_MARKER, DATA_URI_PREFIX,
};

const MAX_EMBEDDED_JSON_DEPTH: usize = 10;

#[derive(Default)]
struct ScanState {
    metadata: HashMap<String, Arc<MediaMetadata>>,
}

#[derive(Default)]
struct WalkStats {
    #[cfg(test)]
    bytes_walked: usize,
    // Stack and candidate-index backing storage; owned keys, decoded strings,
    // and retained media are measured separately by retention tests/benchmarks.
    #[cfg(test)]
    peak_index_bytes: usize,
}

impl WalkStats {
    #[inline(always)]
    fn add_bytes(&mut self, bytes: usize) {
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
    fn update_peak(&mut self, bytes: usize) {
        self.peak_index_bytes = self.peak_index_bytes.max(bytes);
    }
}

/// Discover media only when extraction is requested. Validation happens in
/// `ValidatedPayload` with library syntax validators; this pass
/// walks that already-valid source once with an explicit stack.
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
    // Most payloads have no media-specific markers. This packed-literal
    // prefilter avoids allocating a structural stack for those documents.
    if std::str::from_utf8(input).is_ok_and(|text| !may_contain_media_candidate(text)) {
        stats.add_bytes(input.len());
        return Ok(MediaManifest {
            entries: Vec::new(),
        });
    }

    let mut walk = StructuralWalk::new(input, embedded_depth == 0, stats);
    let root_end = walk.run()?;
    let StructuralWalk {
        candidates,
        mask_operations,
        stats,
        ..
    } = walk;
    if skip_whitespace(input, root_end) != input.len() {
        return Err(EarlyMediaError::TrailingBytes {
            offset: skip_whitespace(input, root_end),
        });
    }

    let mut candidates = apply_mask_operations(candidates, &mask_operations);
    let mut entries = Vec::new();
    let mut discovery = MediaDiscovery {
        input,
        state,
        stats,
        embedded_depth,
        entries: &mut entries,
    };
    for candidate in candidates.drain(..) {
        if candidate.mask == 0 {
            continue;
        }
        match candidate.kind {
            PendingKind::String(token_range) => {
                discovery.discover_string_token(token_range)?;
            }
            PendingKind::Structured {
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

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum ShapeKey {
    Type,
    Data,
    MediaType,
    MimeType,
    MimeTypeCamel,
    MediaTypeCamel,
    Content,
    Image,
    InlineData,
    InlineDataCamel,
}

impl ShapeKey {
    const ALL: [Self; 10] = [
        Self::Type,
        Self::Data,
        Self::MediaType,
        Self::MimeType,
        Self::MimeTypeCamel,
        Self::MediaTypeCamel,
        Self::Content,
        Self::Image,
        Self::InlineData,
        Self::InlineDataCamel,
    ];

    fn from_name(name: &str) -> Option<Self> {
        Some(match name {
            "type" => Self::Type,
            "data" => Self::Data,
            "media_type" => Self::MediaType,
            "mime_type" => Self::MimeType,
            "mimeType" => Self::MimeTypeCamel,
            "mediaType" => Self::MediaTypeCamel,
            "content" => Self::Content,
            "image" => Self::Image,
            "inline_data" => Self::InlineData,
            "inlineData" => Self::InlineDataCamel,
            _ => return None,
        })
    }

    fn index(self) -> usize {
        Self::ALL
            .iter()
            .position(|key| *key == self)
            .expect("shape keys belong to the fixed key set")
    }
}

#[derive(Clone, Debug)]
enum ShapeValue {
    String(Range<usize>),
    InlineObject {
        fields: Box<InlineFields>,
        range: Range<usize>,
    },
    Other(Range<usize>),
}

#[derive(Clone, Debug, Default)]
struct InlineFields {
    data: Option<ShapeValue>,
    mime_type: Option<ShapeValue>,
    mime_type_camel: Option<ShapeValue>,
}

impl InlineFields {
    fn from_provider(fields: &ProviderFields) -> Self {
        Self {
            data: fields.get(ShapeKey::Data).map(to_inline_value),
            mime_type: fields.get(ShapeKey::MimeType).map(to_inline_value),
            mime_type_camel: fields.get(ShapeKey::MimeTypeCamel).map(to_inline_value),
        }
    }
}

fn to_inline_value(value: &ShapeValue) -> ShapeValue {
    match value {
        ShapeValue::String(range) => ShapeValue::String(range.clone()),
        ShapeValue::InlineObject { range, .. } | ShapeValue::Other(range) => {
            ShapeValue::Other(range.clone())
        }
    }
}

#[derive(Clone, Debug)]
struct ProviderFields {
    values: [Option<ShapeValue>; ShapeKey::ALL.len()],
}

impl Default for ProviderFields {
    fn default() -> Self {
        Self {
            values: std::array::from_fn(|_| None),
        }
    }
}

impl ProviderFields {
    fn set(&mut self, key: ShapeKey, value: ShapeValue) {
        self.values[key.index()] = Some(value);
    }

    fn get(&self, key: ShapeKey) -> Option<&ShapeValue> {
        self.values[key.index()].as_ref()
    }
}

enum ValueShape {
    String(Range<usize>),
    Object {
        range: Range<usize>,
        fields: Option<Box<ProviderFields>>,
    },
    Other(Range<usize>),
}

struct ValueSummary {
    end: usize,
    shape: ValueShape,
}

#[derive(Clone)]
struct PendingCandidate {
    /// Bit zero is the generic payload path; bit one is the possible OTLP
    /// envelope path. A root object or root-array object chooses one at close.
    mask: u8,
    kind: PendingKind,
}

#[derive(Clone)]
enum PendingKind {
    String(Range<usize>),
    Structured {
        token_range: Range<usize>,
        content_type: String,
        kind: MediaPayloadKind,
    },
}

struct MaskOperation {
    start: usize,
    end: usize,
    clear_mask: u8,
}

struct WalkFrame {
    start: usize,
    cursor: usize,
    first_child: bool,
    candidate_start: usize,
    modes: [MediaScanMode; 2],
    is_envelope_decider: bool,
    is_root_array: bool,
    kind: ContainerKind,
}

struct ObjectFrame<'a> {
    has_envelope_field: bool,
    current_shape_key: Option<ShapeKey>,
    current_key: Option<Cow<'a, str>>,
    current_candidate_start: usize,
    provider_fields: Option<Box<ProviderFields>>,
    last_key_candidates: HashMap<String, Range<usize>>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum ContainerKind {
    Object,
    Array,
}

impl WalkFrame {
    fn new(
        input: &[u8],
        start: usize,
        candidate_start: usize,
        modes: [MediaScanMode; 2],
        is_envelope_decider: bool,
        is_root_array: bool,
    ) -> Self {
        let kind = match input.get(start) {
            Some(b'{') => ContainerKind::Object,
            Some(b'[') => ContainerKind::Array,
            _ => unreachable!("container frame starts with an opening delimiter"),
        };
        Self {
            start,
            cursor: start + 1,
            first_child: true,
            candidate_start,
            modes,
            is_envelope_decider,
            is_root_array,
            kind,
        }
    }

    fn adopt<'a>(&mut self, summary: ValueSummary, object_states: &mut Vec<ObjectFrame<'a>>) {
        self.cursor = summary.end;
        if self.kind != ContainerKind::Object {
            return;
        }
        let object = object_states
            .last_mut()
            .expect("every open object frame has object state");
        if let Some(key) = object.current_shape_key.take() {
            let value = match summary.shape {
                ValueShape::String(range) => ShapeValue::String(range),
                ValueShape::Object { range, fields }
                    if matches!(key, ShapeKey::InlineData | ShapeKey::InlineDataCamel) =>
                {
                    fields.map_or_else(
                        || ShapeValue::Other(range.clone()),
                        |fields| ShapeValue::InlineObject {
                            fields: Box::new(InlineFields::from_provider(&fields)),
                            range: range.clone(),
                        },
                    )
                }
                ValueShape::Object { range, .. } | ValueShape::Other(range) => {
                    ShapeValue::Other(range)
                }
            };
            object
                .provider_fields
                .get_or_insert_with(|| Box::new(ProviderFields::default()))
                .set(key, value);
        }
    }
}

enum NextValue {
    Child {
        start: usize,
        modes: [MediaScanMode; 2],
        is_envelope_decider: bool,
        is_root_array: bool,
    },
    Closed(usize),
}

struct StructuralWalk<'a, 'stats> {
    input: &'a [u8],
    allow_envelope: bool,
    stats: &'stats mut WalkStats,
    candidates: Vec<PendingCandidate>,
    mask_operations: Vec<MaskOperation>,
}

impl<'a, 'stats> StructuralWalk<'a, 'stats> {
    fn new(input: &'a [u8], allow_envelope: bool, stats: &'stats mut WalkStats) -> Self {
        Self {
            input,
            allow_envelope,
            stats,
            candidates: Vec::new(),
            mask_operations: Vec::new(),
        }
    }

    fn run(&mut self) -> Result<usize, EarlyMediaError> {
        let input = self.input;
        let mut stack: Vec<WalkFrame> = Vec::new();
        let mut object_states: Vec<ObjectFrame<'a>> = Vec::new();
        let root_start = measured_skip_whitespace(input, 0, self.stats);
        let root_is_object = self.allow_envelope && input.get(root_start) == Some(&b'{');
        let root_is_array = self.allow_envelope && input.get(root_start) == Some(&b'[');
        let mut next_value = Some((
            root_start,
            if root_is_object {
                [MediaScanMode::Payload, MediaScanMode::Envelope]
            } else {
                [MediaScanMode::Payload, MediaScanMode::Payload]
            },
            root_is_object,
            root_is_array,
        ));
        let mut completed: Option<ValueSummary> = None;

        loop {
            if let Some((start, modes, is_envelope_decider, is_root_array)) = next_value.take() {
                match input.get(start).copied() {
                    Some(b'{') | Some(b'[') => {
                        let frame = WalkFrame::new(
                            input,
                            start,
                            self.candidates.len(),
                            modes,
                            is_envelope_decider,
                            is_root_array,
                        );
                        if frame.kind == ContainerKind::Object {
                            object_states.push(ObjectFrame {
                                has_envelope_field: false,
                                current_shape_key: None,
                                current_key: None,
                                current_candidate_start: frame.candidate_start,
                                provider_fields: None,
                                last_key_candidates: HashMap::new(),
                            });
                        }
                        stack.push(frame);
                        self.update_peak(&stack, &object_states);
                    }
                    Some(b'"') => {
                        let end = string_end(input, start);
                        self.stats.add_bytes(end - start);
                        let range = start..end;
                        let raw = input
                            .get(start + 1..end.saturating_sub(1))
                            .unwrap_or_default();
                        self.stats.add_bytes(raw.len());
                        if std::str::from_utf8(raw).is_ok_and(may_contain_media_candidate) {
                            let mask = payload_mask(modes);
                            if mask != 0 {
                                self.candidates.push(PendingCandidate {
                                    mask,
                                    kind: PendingKind::String(range.clone()),
                                });
                                self.update_peak(&stack, &object_states);
                            }
                        }
                        completed = Some(ValueSummary {
                            end,
                            shape: ValueShape::String(range),
                        });
                    }
                    Some(_) => {
                        let end = primitive_end(input, start, self.stats);
                        completed = Some(ValueSummary {
                            end,
                            shape: ValueShape::Other(start..end),
                        });
                    }
                    None => {
                        return Err(EarlyMediaError::InvalidJson {
                            offset: start,
                            message: "missing JSON value",
                        });
                    }
                }
            }

            if let Some(summary) = completed.take() {
                let mut duplicate_range = None;
                if let Some(parent) = stack.last_mut() {
                    let child_end = self.candidates.len();
                    if parent.kind == ContainerKind::Object {
                        let object = object_states
                            .last_mut()
                            .expect("every open object frame has object state");
                        if let Some(key) = object.current_key.take() {
                            let candidate_range = object.current_candidate_start..child_end;
                            if let Some(previous) = object.last_key_candidates.remove(key.as_ref())
                            {
                                duplicate_range = Some(previous);
                            }
                            if candidate_range.start < candidate_range.end {
                                object
                                    .last_key_candidates
                                    .insert(key.into_owned(), candidate_range);
                            }
                        }
                    }
                    parent.adopt(summary, &mut object_states);
                } else {
                    return Ok(summary.end);
                }
                if let Some(previous) = duplicate_range {
                    self.add_mask_operation(previous.start, previous.end, 0b11);
                }
                self.update_peak(&stack, &object_states);
            }

            let Some(frame) = stack.last_mut() else {
                return Err(EarlyMediaError::InvalidJson {
                    offset: 0,
                    message: "missing JSON value",
                });
            };
            match next_frame_value(
                input,
                frame,
                &mut object_states,
                self.stats,
                self.candidates.len(),
            )? {
                NextValue::Child {
                    start,
                    modes,
                    is_envelope_decider,
                    is_root_array,
                } => {
                    next_value = Some((start, modes, is_envelope_decider, is_root_array));
                    self.update_peak(&stack, &object_states);
                }
                NextValue::Closed(end) => {
                    let frame = stack.pop().expect("the current frame is on the stack");
                    let shape = self.close_frame(frame, end, &mut object_states);
                    completed = Some(ValueSummary { end, shape });
                }
            }
        }
    }

    fn close_frame(
        &mut self,
        frame: WalkFrame,
        end: usize,
        object_states: &mut Vec<ObjectFrame<'_>>,
    ) -> ValueShape {
        let WalkFrame {
            start,
            candidate_start,
            modes,
            is_envelope_decider,
            kind,
            ..
        } = frame;
        if kind != ContainerKind::Object {
            return ValueShape::Other(start..end);
        }
        let mut object = object_states
            .pop()
            .expect("every closed object frame has object state");
        let candidate_end = self.candidates.len();
        let provider_fields = object.provider_fields.as_deref();
        let active = if is_envelope_decider {
            let selected_bit = if object.has_envelope_field {
                0b10
            } else {
                0b01
            };
            self.add_mask_operation(candidate_start, candidate_end, (!selected_bit) & 0b11);
            if selected_bit == 0b01 {
                selected_bit
            } else {
                0
            }
        } else {
            payload_mask(modes)
        };
        if active != 0 {
            if let Some(shape) =
                provider_fields.and_then(|fields| structured_shape(self.input, fields))
            {
                self.add_mask_operation(candidate_start, candidate_end, active);
                self.candidates.push(PendingCandidate {
                    mask: active,
                    kind: PendingKind::Structured {
                        token_range: shape.token_range,
                        content_type: shape.content_type,
                        kind: shape.kind,
                    },
                });
            }
        }
        self.update_peak_from_capacities(0);
        ValueShape::Object {
            range: start..end,
            fields: object.provider_fields.take(),
        }
    }

    fn add_mask_operation(&mut self, start: usize, end: usize, clear_mask: u8) {
        if start < end && clear_mask != 0 {
            self.mask_operations.push(MaskOperation {
                start,
                end,
                clear_mask,
            });
        }
    }

    fn update_peak(&mut self, stack: &Vec<WalkFrame>, object_states: &Vec<ObjectFrame<'_>>) {
        #[cfg(test)]
        {
            let stack_bytes = stack
                .capacity()
                .saturating_mul(std::mem::size_of::<WalkFrame>());
            let object_state_bytes = object_states
                .capacity()
                .saturating_mul(std::mem::size_of::<ObjectFrame>());
            self.update_peak_from_capacities(stack_bytes.saturating_add(object_state_bytes));
        }
        #[cfg(not(test))]
        let _ = (stack, object_states);
    }

    fn update_peak_from_capacities(&mut self, stack_bytes: usize) {
        #[cfg(test)]
        {
            let candidate_bytes = self
                .candidates
                .capacity()
                .saturating_mul(std::mem::size_of::<PendingCandidate>());
            let operation_bytes = self
                .mask_operations
                .capacity()
                .saturating_mul(std::mem::size_of::<MaskOperation>());
            self.stats.update_peak(
                stack_bytes
                    .saturating_add(candidate_bytes)
                    .saturating_add(operation_bytes),
            );
        }
        #[cfg(not(test))]
        let _ = stack_bytes;
    }
}

fn next_frame_value<'a>(
    input: &'a [u8],
    frame: &mut WalkFrame,
    object_states: &mut Vec<ObjectFrame<'a>>,
    stats: &mut WalkStats,
    candidate_count: usize,
) -> Result<NextValue, EarlyMediaError> {
    let mut cursor = measured_skip_whitespace(input, frame.cursor, stats);
    let is_array = frame.kind == ContainerKind::Array;
    let closing = if is_array { b']' } else { b'}' };
    if frame.first_child {
        if input.get(cursor) == Some(&closing) {
            stats.add_bytes(1);
            return Ok(NextValue::Closed(cursor + 1));
        }
    } else {
        match input.get(cursor).copied() {
            Some(b',') => {
                stats.add_bytes(1);
                cursor += 1;
                cursor = measured_skip_whitespace(input, cursor, stats);
            }
            Some(byte) if byte == closing => {
                stats.add_bytes(1);
                return Ok(NextValue::Closed(cursor + 1));
            }
            _ => {
                return Err(EarlyMediaError::InvalidJson {
                    offset: cursor,
                    message: "invalid container separator",
                });
            }
        }
    }

    let (value_start, child_modes, shape_key, current_key) = if is_array {
        (cursor, frame.modes, None, None)
    } else {
        let object = object_states
            .last_mut()
            .expect("every open object frame has object state");
        if input.get(cursor) != Some(&b'"') {
            return Err(EarlyMediaError::InvalidJson {
                offset: cursor,
                message: "expected object key",
            });
        }
        let key_end = string_end(input, cursor);
        stats.add_bytes(key_end - cursor);
        let key = decode_json_string(input, cursor..key_end);
        let shape_key = key.as_deref().and_then(ShapeKey::from_name);
        let mut child_modes = frame.modes;
        for (index, mode) in frame.modes.iter().enumerate() {
            child_modes[index] = match key.as_deref() {
                Some(key) => media_scan_mode_for_field(*mode, key),
                // An undecodable key cannot participate in duplicate-key
                // resolution; leave its value inline rather than extract
                // a potentially shadowed occurrence.
                None => MediaScanMode::Disabled,
            };
        }
        if key.as_deref().is_some_and(is_otel_envelope_field) {
            object.has_envelope_field = true;
        }
        let mut colon = measured_skip_whitespace(input, key_end, stats);
        if input.get(colon) != Some(&b':') {
            return Err(EarlyMediaError::InvalidJson {
                offset: colon,
                message: "expected object colon",
            });
        }
        stats.add_bytes(1);
        colon += 1;
        (
            measured_skip_whitespace(input, colon, stats),
            child_modes,
            shape_key,
            key,
        )
    };

    frame.first_child = false;
    frame.cursor = value_start;
    if !is_array {
        let object = object_states
            .last_mut()
            .expect("every open object frame has object state");
        object.current_shape_key = shape_key;
        object.current_key = current_key;
        object.current_candidate_start = candidate_count;
        if shape_key.is_some() {
            object
                .provider_fields
                .get_or_insert_with(|| Box::new(ProviderFields::default()));
        }
    }
    let is_envelope_decider =
        is_array && frame.is_root_array && input.get(value_start) == Some(&b'{');
    let modes = if is_envelope_decider {
        [MediaScanMode::Payload, MediaScanMode::Envelope]
    } else {
        child_modes
    };
    Ok(NextValue::Child {
        start: value_start,
        modes,
        is_envelope_decider,
        is_root_array: false,
    })
}

fn measured_skip_whitespace(input: &[u8], mut cursor: usize, stats: &mut WalkStats) -> usize {
    while matches!(input.get(cursor), Some(b' ' | b'\n' | b'\r' | b'\t')) {
        stats.add_bytes(1);
        cursor += 1;
    }
    cursor
}

fn primitive_end(input: &[u8], start: usize, stats: &mut WalkStats) -> usize {
    let end = input[start..]
        .iter()
        .position(|byte| matches!(*byte, b',' | b']' | b'}' | b' ' | b'\n' | b'\r' | b'\t'))
        .map_or(input.len(), |length| start + length);
    stats.add_bytes(end - start);
    end
}

fn payload_mask(modes: [MediaScanMode; 2]) -> u8 {
    modes
        .iter()
        .enumerate()
        .filter(|(_, mode)| **mode == MediaScanMode::Payload)
        .fold(0, |mask, (index, _)| mask | (1 << index))
}

fn apply_mask_operations(
    mut candidates: Vec<PendingCandidate>,
    operations: &[MaskOperation],
) -> Vec<PendingCandidate> {
    let mut clear_payload = vec![0i32; candidates.len() + 1];
    let mut clear_envelope = vec![0i32; candidates.len() + 1];
    for operation in operations {
        if operation.clear_mask & 0b01 != 0 {
            clear_payload[operation.start] += 1;
            clear_payload[operation.end] -= 1;
        }
        if operation.clear_mask & 0b10 != 0 {
            clear_envelope[operation.start] += 1;
            clear_envelope[operation.end] -= 1;
        }
    }
    let (mut active_payload, mut active_envelope) = (0, 0);
    for (index, candidate) in candidates.iter_mut().enumerate() {
        active_payload += clear_payload[index];
        active_envelope += clear_envelope[index];
        if active_payload > 0 {
            candidate.mask &= !0b01;
        }
        if active_envelope > 0 {
            candidate.mask &= !0b10;
        }
    }
    candidates
}

fn decode_json_string<'a>(input: &'a [u8], token_range: Range<usize>) -> Option<Cow<'a, str>> {
    let raw = input.get(token_range.start + 1..token_range.end.checked_sub(1)?)?;
    if !raw.contains(&b'\\') {
        return std::str::from_utf8(raw).ok().map(Cow::Borrowed);
    }
    let token = input.get(token_range)?;
    let mut jiter = Jiter::new(token);
    jiter
        .next_str()
        .ok()
        .map(|value| Cow::Owned(value.to_owned()))
}

fn structured_shape(input: &[u8], fields: &ProviderFields) -> Option<StructuredCandidate> {
    let Some(type_name) = fields
        .get(ShapeKey::Type)
        .and_then(|value| field_string(input, value))
    else {
        return structured_gemini_shape(input, fields);
    };
    let provider = match type_name.as_ref() {
        "base64" => Some((
            ShapeKey::MediaType,
            fields.get(ShapeKey::Data),
            MediaPayloadKind::Anthropic,
        )),
        "media" => Some((
            ShapeKey::MimeType,
            fields.get(ShapeKey::Data),
            MediaPayloadKind::Vertex,
        )),
        "blob" => Some((
            ShapeKey::MimeType,
            fields.get(ShapeKey::Content),
            MediaPayloadKind::AiSdkV7,
        )),
        "file" => {
            let data = fields
                .get(ShapeKey::Data)
                .filter(|value| matches!(value, ShapeValue::String(_)))
                .or_else(|| fields.get(ShapeKey::Image));
            Some((ShapeKey::MediaTypeCamel, data, MediaPayloadKind::AiSdkV6))
        }
        _ => None,
    };
    if let Some((content_type_key, data_value, kind)) = provider {
        if let (Some(data_range), Some(content_type)) = (
            data_value.and_then(shape_string_range),
            fields
                .get(content_type_key)
                .and_then(|value| field_string(input, value)),
        ) {
            return Some(StructuredCandidate {
                token_range: data_range,
                content_type: content_type.into_owned(),
                kind,
            });
        }
    }
    structured_gemini_shape(input, fields)
}

fn structured_gemini_shape(input: &[u8], fields: &ProviderFields) -> Option<StructuredCandidate> {
    for inline_key in [ShapeKey::InlineData, ShapeKey::InlineDataCamel] {
        let Some(ShapeValue::InlineObject { fields: inline, .. }) = fields.get(inline_key) else {
            continue;
        };
        let Some(data_range) = inline.data.as_ref().and_then(shape_string_range) else {
            continue;
        };
        let snake_is_null = inline
            .mime_type
            .as_ref()
            .is_some_and(|value| value_starts_with_null(input, value));
        let selected_type = if inline.mime_type.is_some() && !snake_is_null {
            inline.mime_type.as_ref()
        } else {
            inline.mime_type_camel.as_ref()
        };
        let Some(content_type) = selected_type.and_then(|value| field_string(input, value)) else {
            continue;
        };
        return Some(StructuredCandidate {
            token_range: data_range,
            content_type: content_type.into_owned(),
            kind: MediaPayloadKind::Gemini,
        });
    }
    None
}

struct StructuredCandidate {
    token_range: Range<usize>,
    content_type: String,
    kind: MediaPayloadKind,
}

fn shape_string_range(value: &ShapeValue) -> Option<Range<usize>> {
    match value {
        ShapeValue::String(range) => Some(range.clone()),
        ShapeValue::InlineObject { .. } | ShapeValue::Other(_) => None,
    }
}

fn field_string<'a>(input: &'a [u8], value: &ShapeValue) -> Option<Cow<'a, str>> {
    match value {
        ShapeValue::String(range) => decode_json_string(input, range.clone()),
        ShapeValue::InlineObject { .. } | ShapeValue::Other(_) => None,
    }
}

fn value_starts_with_null(input: &[u8], value: &ShapeValue) -> bool {
    match value {
        ShapeValue::Other(range) => input
            .get(range.clone())
            .is_some_and(|bytes| bytes.starts_with(b"null")),
        ShapeValue::String(_) | ShapeValue::InlineObject { .. } => false,
    }
}

struct MediaDiscovery<'a, 'state, 'stats> {
    input: &'a [u8],
    state: &'state mut ScanState,
    stats: &'stats mut WalkStats,
    embedded_depth: usize,
    entries: &'stats mut Vec<MediaManifestEntry>,
}

impl MediaDiscovery<'_, '_, '_> {
    fn discover_string_token(&mut self, token_range: Range<usize>) -> Result<(), EarlyMediaError> {
        let input = self.input;
        let mut decoder = Jiter::new(&input[token_range.clone()]);
        let Ok(value) = decoder.next_str() else {
            // One escaped lone surrogate makes only this string unavailable to
            // the detector. Structural scanning has already continued through
            // sibling fields, so unrelated candidates remain discoverable.
            return Ok(());
        };
        // Keep escaped payloads borrowed from the decoder until discovery ends;
        // copying this string would duplicate an entire media-heavy document.
        self.discover_string(value, token_range)
    }

    fn discover_string(
        &mut self,
        value: &str,
        token_range: Range<usize>,
    ) -> Result<(), EarlyMediaError> {
        if is_media_reference(value) {
            return Ok(());
        }

        if may_be_serialized_json(value)
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

        let candidates = find_data_uri_candidates(value);
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
            self.register_candidate(
                value[range].as_bytes(),
                content_type,
                MediaPayloadKind::DataUri,
                MediaSource::Base64DataUri,
                MediaEncoding::Base64DataUri,
                mapped[index * 2]..mapped[index * 2 + 1],
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
        if !is_supported_content_type(content_type) {
            return Ok(());
        }
        let input = self.input;
        let mut decoder = Jiter::new(&input[token_range.clone()]);
        let Ok(content) = decoder.next_str() else {
            return Ok(());
        };
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
