//! Select media candidates while keeping the field context needed to interpret them.
//!
//! `scanner::discover_inner` calls `scan` with validated JSON. Token boundaries come
//! from `json_cursor`; this module owns the container stack and candidate selection.
//!
//! ```text
//! scan -> StructuralWalk::run
//!   |-- JsonCursor::advance / consume_scalar   keys, delimiters, and value ranges
//!   |-- ObjectFrame::child_modes               apply OTLP field rules
//!   |-- finish_object_field                    suppress duplicate keys; retain provider fields
//!   `-- close_frame -> provider_shapes         recognize completed media objects
//! scan -> apply_mask_operations -> Candidate  emit only surviving string/body ranges
//! ```
//!
//! Each open container has a `WalkFrame`; objects also have an `ObjectFrame` for
//! duplicate keys and provider fields. Completed `ValueShape`s feed the parent.
//! Candidates keep two eligibility bits: generic payload and OTLP envelope. The
//! root selects one on close. Later fields can suppress earlier candidates, so
//! masks are applied once after traversal. Returned ranges include JSON quotes.

use std::borrow::Cow;
use std::collections::HashMap;
use std::ops::Range;

use jiter::Peek;

use super::json::{decode_json_string, skip_whitespace};
use super::json_cursor::{ContainerState, ContainerStep, JsonCursor};
use super::payload::{EarlyMediaError, MediaPayloadKind};
use super::provider_shapes::{structured_shape, ProviderFields, ShapeKey, ValueShape};
use super::rules::{
    is_otel_envelope_field, may_contain_media_candidate, media_scan_mode_for_field, MediaScanMode,
    MIN_EARLY_MEDIA_BYTES,
};
use super::WalkStats;

// Below this depth in embedded JSON, scan for Data URIs without deriving provider shapes or
// retaining provider state for every nesting level.
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
    state: ContainerState,
    candidate_start: usize,
    modes: [MediaScanMode; 2],
    is_envelope_decider: bool,
    is_root_array: bool,
}

#[derive(Default)]
struct ObjectFrame<'a> {
    has_envelope_field: bool,
    current_shape_key: Option<ShapeKey>,
    current_key: Option<Cow<'a, str>>,
    current_candidate_start: usize,
    provider_fields: Option<Box<ProviderFields>>,
    last_key_candidates: HashMap<String, Range<usize>>,
}

impl<'a> ObjectFrame<'a> {
    fn child_modes(
        &mut self,
        input: &'a [u8],
        key: Option<Range<usize>>,
        modes: [MediaScanMode; 2],
        candidate_start: usize,
    ) -> [MediaScanMode; 2] {
        self.current_key = key.and_then(|range| decode_json_string(input, range));
        self.current_shape_key = self.current_key.as_deref().and_then(ShapeKey::from_name);
        self.current_candidate_start = candidate_start;
        self.has_envelope_field |= self
            .current_key
            .as_deref()
            .is_some_and(is_otel_envelope_field);
        modes.map(|mode| {
            self.current_key
                .as_deref()
                .map_or(MediaScanMode::Disabled, |key| {
                    media_scan_mode_for_field(mode, key)
                })
        })
    }

    fn adopt(&mut self, shape: ValueShape) {
        let Some(key) = self.current_shape_key.take() else {
            return;
        };
        self.provider_fields
            .get_or_insert_with(|| Box::new(ProviderFields::default()))
            .record(key, shape);
    }
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
        let mut cursor = JsonCursor::new(input);
        let root = cursor.peek(self.stats)?;
        let mut next_value = Some((
            [MediaScanMode::Payload; 2],
            self.allow_envelope && root == Peek::Object,
            self.allow_envelope && root == Peek::Array,
        ));
        let mut completed = None;

        loop {
            if let Some((mut modes, envelope_decider, is_root_array)) = next_value.take() {
                let peek = cursor.peek(self.stats)?;
                let start = cursor.position();
                let is_envelope_decider = envelope_decider && peek == Peek::Object;
                if is_envelope_decider {
                    modes = [MediaScanMode::Payload, MediaScanMode::Envelope];
                }
                match peek {
                    Peek::Object | Peek::Array => {
                        let frame = WalkFrame {
                            start,
                            state: ContainerState::new(peek),
                            modes,
                            is_envelope_decider,
                            is_root_array,
                            candidate_start: self.candidates.len(),
                        };
                        completed = self.enter_container(
                            &mut cursor,
                            frame,
                            &mut stack,
                            &mut object_states,
                        )?;
                        if completed.is_some() {
                            continue;
                        }
                    }
                    _ => {
                        completed = Some(self.scan_scalar(
                            &mut cursor,
                            peek,
                            payload_mask(modes),
                            false,
                        )?);
                        self.update_peak(&stack, &object_states);
                    }
                }
            }

            if let Some(shape) = completed.take() {
                let Some(parent) = stack.last() else {
                    return Ok(cursor.position());
                };
                if parent.state.is_object() {
                    let object = object_states.last_mut().expect("open object state");
                    self.finish_object_field(object, shape);
                }
                self.update_peak(&stack, &object_states);
            }

            let frame = stack
                .last_mut()
                .expect("open container after visiting a value");
            match cursor.advance(&mut frame.state, self.stats)? {
                ContainerStep::Child(key) => {
                    let modes = if frame.state.is_object() {
                        object_states
                            .last_mut()
                            .expect("open object state")
                            .child_modes(input, key, frame.modes, self.candidates.len())
                    } else {
                        frame.modes
                    };
                    next_value = Some((modes, frame.is_root_array, false));
                    self.update_peak(&stack, &object_states);
                }
                ContainerStep::Closed => {
                    let frame = stack.pop().expect("the current frame is on the stack");
                    completed =
                        Some(self.close_frame(frame, cursor.position(), &mut object_states));
                }
            }
        }
    }

    fn enter_container(
        &mut self,
        cursor: &mut JsonCursor<'a>,
        frame: WalkFrame,
        stack: &mut Vec<WalkFrame>,
        object_states: &mut Vec<ObjectFrame<'a>>,
    ) -> Result<Option<ValueShape>, EarlyMediaError> {
        // Keep outer OTLP semantics; deep embedded documents only need text scanning.
        if !self.allow_envelope && stack.len() >= MAX_STRUCTURAL_DEPTH {
            self.scan_deep_container(cursor, frame.state, payload_mask(frame.modes))?;
            return Ok(Some(ValueShape::Other(frame.start..cursor.position())));
        }
        if frame.state.is_object() {
            object_states.push(ObjectFrame::default());
        }
        stack.push(frame);
        self.update_peak(stack, object_states);
        Ok(None)
    }

    fn finish_object_field(&mut self, object: &mut ObjectFrame<'a>, shape: ValueShape) {
        if let Some(key) = object.current_key.take() {
            if let Some(previous) = object.last_key_candidates.remove(key.as_ref()) {
                self.add_mask_operation(previous.start, previous.end, 0b11);
            }
            let range = object.current_candidate_start..self.candidates.len();
            if !range.is_empty() {
                object.last_key_candidates.insert(key.into_owned(), range);
            }
        }
        object.adopt(shape);
    }

    /// Retain one byte per open container, without provider fields or duplicate-key maps.
    fn scan_deep_container(
        &mut self,
        cursor: &mut JsonCursor<'a>,
        state: ContainerState,
        mask: u8,
    ) -> Result<(), EarlyMediaError> {
        let mut stack = vec![state];
        while let Some(state) = stack.last_mut() {
            match cursor.advance(state, self.stats)? {
                ContainerStep::Closed => {
                    stack.pop();
                }
                ContainerStep::Child(_) => {
                    let peek = cursor.peek(self.stats)?;
                    match peek {
                        Peek::Object | Peek::Array => {
                            stack.push(ContainerState::new(peek));
                            self.update_peak_from_capacities(
                                stack
                                    .capacity()
                                    .saturating_mul(std::mem::size_of::<ContainerState>()),
                            );
                        }
                        _ => {
                            self.scan_scalar(cursor, peek, mask, true)?;
                            self.update_peak_from_capacities(0);
                        }
                    }
                }
            }
        }
        Ok(())
    }

    fn scan_scalar(
        &mut self,
        cursor: &mut JsonCursor<'a>,
        peek: Peek,
        mask: u8,
        text_only: bool,
    ) -> Result<ValueShape, EarlyMediaError> {
        let range = cursor.consume_scalar(peek, self.stats)?;
        if peek == Peek::String {
            self.record_string(range.clone(), mask, text_only);
            Ok(ValueShape::String(range))
        } else {
            Ok(ValueShape::Other(range))
        }
    }

    fn record_string(&mut self, range: Range<usize>, mask: u8, text_only: bool) {
        let raw = &self.input[range.start + 1..range.end - 1];
        self.stats.add_bytes(raw.len());
        if mask != 0
            && raw.len() >= MIN_EARLY_MEDIA_BYTES
            && std::str::from_utf8(raw).is_ok_and(may_contain_media_candidate)
        {
            self.candidates.push(PendingCandidate {
                mask,
                candidate: if text_only {
                    Candidate::Text(range)
                } else {
                    Candidate::String(range)
                },
            });
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
            state,
            ..
        } = frame;
        if !state.is_object() {
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
