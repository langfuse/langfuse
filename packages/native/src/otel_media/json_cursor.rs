//! Advance through validated JSON while keeping offsets in the original input.
//!
//! `structural_walk` owns the container stack; each frame supplies `ContainerState`.
//! Jiter consumes the next key, array element, closing delimiter, or scalar token.
//! For a token Jiter cannot represent, `recover_token` borrows its span through
//! serde's `RawValue`, then resumes Jiter at the following byte. No value tree is built.
//!
//! ```text
//! advance(state) -> Child(key range) | Closed
//! consume_scalar(peek) -> token range
//! position() -> absolute input offset, including after recovery
//! ```

use std::ops::Range;

use jiter::{Jiter, JiterError, JiterErrorType, JsonErrorType, Peek};
use serde::Deserialize;
use serde_json::value::RawValue;

use super::payload::EarlyMediaError;
use super::WalkStats;

// The same one-byte grammar state drives both the semantic walk and deep text scan.
#[repr(u8)]
#[derive(Clone, Copy)]
pub(super) enum ContainerState {
    ObjectFirst,
    ObjectNext,
    ArrayFirst,
    ArrayNext,
}

impl ContainerState {
    pub(super) fn new(peek: Peek) -> Self {
        match peek {
            Peek::Object => Self::ObjectFirst,
            Peek::Array => Self::ArrayFirst,
            _ => unreachable!("container state starts at an object or array"),
        }
    }

    pub(super) fn is_object(self) -> bool {
        matches!(self, Self::ObjectFirst | Self::ObjectNext)
    }
}

pub(super) enum ContainerStep {
    // No key for an array element or an object key containing an unpaired surrogate.
    Child(Option<Range<usize>>),
    Closed,
}

pub(super) struct JsonCursor<'a> {
    input: &'a [u8],
    base: usize,
    parser: Jiter<'a>,
}

impl<'a> JsonCursor<'a> {
    pub(super) fn new(input: &'a [u8]) -> Self {
        Self {
            input,
            base: 0,
            parser: Jiter::new(input),
        }
    }

    pub(super) fn position(&self) -> usize {
        self.base + self.parser.current_index()
    }

    pub(super) fn peek(&mut self, stats: &mut WalkStats) -> Result<Peek, EarlyMediaError> {
        let start = self.position();
        let peek = self
            .parser
            .peek()
            .map_err(|error| jiter_invalid(self.base, &error))?;
        stats.add_bytes(self.position() - start);
        Ok(peek)
    }

    fn rebase(&mut self, position: usize) {
        self.base = position;
        self.parser = Jiter::new(&self.input[position..]);
    }

    // RawValue borrows exactly one token; it does not build a value tree or change its spelling.
    fn recover_token(
        &mut self,
        start: usize,
        stats: &mut WalkStats,
    ) -> Result<(), EarlyMediaError> {
        let mut deserializer = serde_json::Deserializer::from_slice(&self.input[start..]);
        let raw = <&RawValue>::deserialize(&mut deserializer).map_err(|_| {
            EarlyMediaError::InvalidJson {
                offset: start,
                message: "invalid JSON value",
            }
        })?;
        stats.add_bytes(raw.get().len());
        self.rebase(start + raw.get().len());
        Ok(())
    }

    pub(super) fn consume_scalar(
        &mut self,
        peek: Peek,
        stats: &mut WalkStats,
    ) -> Result<Range<usize>, EarlyMediaError> {
        let start = self.position();
        let result = match peek {
            Peek::String => self.parser.next_bytes().map(|_| ()),
            Peek::Null => self.parser.known_null(),
            Peek::True | Peek::False => self.parser.known_bool(peek).map(|_| ()),
            number if number.is_num() => self.parser.next_number_bytes().map(|_| ()),
            _ => {
                return Err(EarlyMediaError::InvalidJson {
                    offset: start,
                    message: "unexpected JSON value",
                })
            }
        };
        if let Err(error) = result {
            if can_recover_token(&error) {
                self.recover_token(start, stats)?;
            } else {
                return Err(jiter_invalid(self.base, &error));
            }
        }
        let end = self.position();
        stats.add_bytes(end - start);
        Ok(start..end)
    }

    pub(super) fn advance(
        &mut self,
        state: &mut ContainerState,
        stats: &mut WalkStats,
    ) -> Result<ContainerStep, EarlyMediaError> {
        let start = self.position();
        let step = if state.is_object() {
            self.advance_object(*state, stats)?
        } else {
            self.advance_array(*state)?
        };
        *state = if state.is_object() {
            ContainerState::ObjectNext
        } else {
            ContainerState::ArrayNext
        };
        stats.add_bytes(self.position() - start);
        Ok(step)
    }

    fn advance_object(
        &mut self,
        state: ContainerState,
        stats: &mut WalkStats,
    ) -> Result<ContainerStep, EarlyMediaError> {
        let key = match state {
            ContainerState::ObjectFirst => self.parser.next_object_bytes(),
            _ => self.parser.next_key_bytes(),
        };
        Ok(match key {
            Ok(Some(bytes)) => {
                // Jiter returns key contents borrowed from input, excluding the quotes.
                let quote = bytes.as_ptr() as usize - self.input.as_ptr() as usize - 1;
                debug_assert_eq!(self.input.get(quote), Some(&b'"'));
                debug_assert_eq!(self.input.get(quote + bytes.len() + 1), Some(&b'"'));
                ContainerStep::Child(Some(quote..quote + bytes.len() + 2))
            }
            Ok(None) => ContainerStep::Closed,
            Err(error) if can_recover_token(&error) => {
                self.recover_token(self.position(), stats)?;
                // Jiter consumes a key and its colon together. After recovering a
                // surrogate key, consume that one delimiter before resuming Jiter.
                if self.peek(stats)?.into_inner() != b':' {
                    return Err(EarlyMediaError::InvalidJson {
                        offset: self.position(),
                        message: "expected object colon",
                    });
                }
                self.rebase(self.position() + 1);
                ContainerStep::Child(None)
            }
            Err(error) => return Err(jiter_invalid(self.base, &error)),
        })
    }

    fn advance_array(&mut self, state: ContainerState) -> Result<ContainerStep, EarlyMediaError> {
        let value = match state {
            ContainerState::ArrayFirst => self.parser.next_array(),
            _ => self.parser.array_step(),
        }
        .map_err(|error| jiter_invalid(self.base, &error))?;
        Ok(match value {
            Some(_) => ContainerStep::Child(None),
            None => ContainerStep::Closed,
        })
    }
}

fn can_recover_token(error: &JiterError) -> bool {
    matches!(
        error.error_type,
        JiterErrorType::JsonError(
            JsonErrorType::LoneLeadingSurrogateInHexEscape
                | JsonErrorType::UnexpectedEndOfHexEscape
                | JsonErrorType::NumberOutOfRange
        )
    )
}

fn jiter_invalid(base: usize, error: &JiterError) -> EarlyMediaError {
    EarlyMediaError::InvalidJson {
        offset: base.saturating_add(error.index),
        message: "invalid JSON",
    }
}
