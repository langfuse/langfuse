//! Structural JSON walk that emits candidate source spans for media discovery.
//!
//! This phase owns container traversal, duplicate-key precedence, envelope selection, and
//! provider-field shapes. It does not interpret candidate text as media; `scanner.rs` owns that
//! second phase.

use std::borrow::Cow;
use std::collections::HashMap;
use std::ops::Range;

use jiter::Jiter;

use super::json::{skip_whitespace, string_end};
use super::payload::{EarlyMediaError, MediaPayloadKind};
use super::rules::{
    is_otel_envelope_field, may_contain_media_candidate, media_scan_mode_for_field, MediaScanMode,
};
use super::scanner::{WalkStats, MIN_EARLY_MEDIA_BYTES};

// Below this depth in embedded JSON, scan for Data URIs without deriving provider shapes or
// allocating one frame per nesting level.
const MAX_STRUCTURAL_DEPTH: usize = 256;

/// A candidate span selected by the structural walk for media interpretation.
pub(super) enum Candidate {
    String(Range<usize>),
    Text(Range<usize>),
    Structured {
        token_range: Range<usize>,
        content_type: String,
        kind: MediaPayloadKind,
    },
}

macro_rules! shape_keys {
    ($($variant:ident => $name:literal),+ $(,)?) => {
        #[derive(Clone, Copy, Debug, Eq, PartialEq)]
        enum ShapeKey {
            $($variant,)+
        }

        impl ShapeKey {
            const COUNT: usize = [$(Self::$variant),+].len();

            fn from_name(name: &str) -> Option<Self> {
                match name {
                    $($name => Some(Self::$variant),)+
                    _ => None,
                }
            }

            fn index(self) -> usize {
                self as usize
            }
        }
    };
}

shape_keys! {
    Type => "type",
    Data => "data",
    MediaType => "media_type",
    MimeType => "mime_type",
    MimeTypeCamel => "mimeType",
    MediaTypeCamel => "mediaType",
    Content => "content",
    Image => "image",
    InlineData => "inline_data",
    InlineDataCamel => "inlineData",
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

#[derive(Clone, Debug, Default)]
struct ProviderFields {
    values: [Option<ShapeValue>; ShapeKey::COUNT],
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

struct PendingCandidate {
    /// Bit zero tracks generic-payload eligibility; bit one tracks envelope
    /// eligibility. The root shape selects the active path when it closes.
    mask: u8,
    candidate: Candidate,
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
                        // Keep the outer OTLP walk fully structural so duplicate-key and
                        // provider-field semantics remain unchanged. Embedded documents have
                        // no envelope semantics and can use the bounded lexical walk instead.
                        if !self.allow_envelope && stack.len() >= MAX_STRUCTURAL_DEPTH {
                            let end = self.scan_deep_container(start, modes)?;
                            completed = Some(ValueSummary {
                                end,
                                shape: ValueShape::Other(start..end),
                            });
                            continue;
                        }
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
                        if raw.len() >= MIN_EARLY_MEDIA_BYTES
                            && std::str::from_utf8(raw).is_ok_and(may_contain_media_candidate)
                        {
                            let mask = payload_mask(modes);
                            if mask != 0 {
                                self.candidates.push(PendingCandidate {
                                    mask,
                                    candidate: Candidate::String(range.clone()),
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

    /// Scan a deeply nested container without retaining one frame per child.
    /// This intentionally records only ordinary string candidates. Provider
    /// object semantics require structural context and are left inline here.
    fn scan_deep_container(
        &mut self,
        start: usize,
        modes: [MediaScanMode; 2],
    ) -> Result<usize, EarlyMediaError> {
        let input = self.input;
        let mut cursor = start;
        let mut depth = 0usize;
        let mask = payload_mask(modes);
        while cursor < input.len() {
            match input[cursor] {
                b'{' | b'[' => {
                    depth += 1;
                    cursor += 1;
                    self.stats.add_bytes(1);
                }
                b'}' | b']' => {
                    if depth == 0 {
                        return Err(EarlyMediaError::InvalidJson {
                            offset: cursor,
                            message: "unexpected container close",
                        });
                    }
                    depth -= 1;
                    cursor += 1;
                    self.stats.add_bytes(1);
                    if depth == 0 {
                        return Ok(cursor);
                    }
                }
                b'"' => {
                    let end = string_end(input, cursor);
                    if end > input.len() {
                        return Err(EarlyMediaError::InvalidJson {
                            offset: cursor,
                            message: "unterminated string",
                        });
                    }
                    self.stats.add_bytes(end - cursor);
                    let raw = input
                        .get(cursor + 1..end.saturating_sub(1))
                        .unwrap_or_default();
                    self.stats.add_bytes(raw.len());
                    // The normal walk only considers values. A lexical scan
                    // must skip object keys explicitly to preserve that rule.
                    let after = skip_whitespace(input, end);
                    if input.get(after) == Some(&b':') {
                        cursor = end;
                        continue;
                    }
                    if mask != 0
                        && raw.len() >= MIN_EARLY_MEDIA_BYTES
                        && std::str::from_utf8(raw).is_ok_and(may_contain_media_candidate)
                    {
                        self.candidates.push(PendingCandidate {
                            mask,
                            candidate: Candidate::Text(cursor..end),
                        });
                        self.update_peak_from_capacities(0);
                    }
                    cursor = end;
                }
                _ => {
                    cursor += 1;
                    self.stats.add_bytes(1);
                }
            }
        }
        Err(EarlyMediaError::InvalidJson {
            offset: start,
            message: "unterminated container",
        })
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
                    candidate: Candidate::Structured {
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
                // Without a decoded key, duplicate-key masking is unsafe. Leave
                // this value inline rather than extract a shadowed occurrence.
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

/// Find eligible JSON value spans before interpreting their contents as media.
pub(super) fn scan(
    input: &[u8],
    allow_envelope: bool,
    stats: &mut WalkStats,
) -> Result<impl Iterator<Item = Candidate>, EarlyMediaError> {
    let mut walk = StructuralWalk::new(input, allow_envelope, stats);
    let root_end = walk.run()?;
    let trailing_bytes = skip_whitespace(input, root_end);
    if trailing_bytes != input.len() {
        return Err(EarlyMediaError::TrailingBytes {
            offset: trailing_bytes,
        });
    }

    let StructuralWalk {
        candidates,
        mask_operations,
        ..
    } = walk;
    let candidates = apply_mask_operations(candidates, &mask_operations);
    Ok(candidates
        .into_iter()
        .filter(|candidate| candidate.mask != 0)
        .map(|candidate| candidate.candidate))
}
