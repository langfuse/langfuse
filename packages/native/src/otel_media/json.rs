//! JSON lexical validation and byte-range helpers.

use jiter::Jiter;
use memchr::memchr2;
use serde::Deserialize;
use serde_json::value::RawValue;

use super::encoding::hex_digit;
use super::payload::EarlyMediaError;

/// Validate one complete JSON value without decoding strings or numbers.
///
/// Jiter's skip path uses a fixed-size structural stack and does not decode
/// strings. RawValue handles valid JSON outside its depth/Unicode/number
/// limits with a heap stack. Even those inputs need at most two validation
/// walks; neither path builds a JSON tree or calls back into JavaScript.
pub(super) fn validate_json(text: &str) -> Result<(), EarlyMediaError> {
    let mut cursor = Jiter::new(text.as_bytes());
    if cursor.next_skip().is_ok() && cursor.finish().is_ok() {
        return Ok(());
    }

    // The input boundary has checked UTF-8 already. StrRead also lets RawValue
    // borrow its result without validating the entire byte range a second time.
    let input = text.as_bytes();
    let mut deserializer = serde_json::Deserializer::from_str(text);
    let raw = <&RawValue>::deserialize(&mut deserializer).map_err(|error| {
        EarlyMediaError::InvalidJson {
            offset: serde_error_offset(input, &error),
            message: "invalid JSON",
        }
    })?;

    let value_start = skip_whitespace(input, 0);
    let value_end = value_start + raw.get().len();
    if skip_whitespace(input, value_end) != input.len() {
        return Err(EarlyMediaError::TrailingBytes {
            offset: skip_whitespace(input, value_end),
        });
    }
    deserializer
        .end()
        .map_err(|error| EarlyMediaError::TrailingBytes {
            offset: serde_error_offset(input, &error),
        })
}

fn serde_error_offset(input: &[u8], error: &serde_json::Error) -> usize {
    let target_line = error.line().saturating_sub(1);
    let mut line = 0;
    let mut offset = 0;
    while line < target_line {
        let Some(relative) = input[offset..].iter().position(|&byte| byte == b'\n') else {
            return input.len();
        };
        offset += relative + 1;
        line += 1;
    }
    offset
        .saturating_add(error.column().saturating_sub(1))
        .min(input.len())
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(super) enum UnicodeEscapeError {
    Invalid(&'static str),
    UnsupportedSurrogate,
}

pub(super) fn parse_unicode_escape(
    input: &[u8],
    slash: usize,
) -> Result<(usize, char), UnicodeEscapeError> {
    let digits = input
        .get(slash + 2..slash + 6)
        .ok_or(UnicodeEscapeError::Invalid("short unicode escape"))?;
    let high = digits
        .iter()
        .try_fold(0u32, |value, digit| {
            hex_digit(*digit).map(|digit| value * 16 + u32::from(digit))
        })
        .ok_or(UnicodeEscapeError::Invalid("invalid unicode escape"))?;
    if (0xD800..=0xDBFF).contains(&high) {
        if input.get(slash + 6..slash + 8) != Some(b"\\u") {
            return Err(UnicodeEscapeError::UnsupportedSurrogate);
        }
        let low_digits = input
            .get(slash + 8..slash + 12)
            .ok_or(UnicodeEscapeError::Invalid("short unicode surrogate"))?;
        let low = low_digits
            .iter()
            .try_fold(0u32, |value, digit| {
                hex_digit(*digit).map(|digit| value * 16 + u32::from(digit))
            })
            .ok_or(UnicodeEscapeError::Invalid("invalid unicode surrogate"))?;
        if !(0xDC00..=0xDFFF).contains(&low) {
            return Err(UnicodeEscapeError::UnsupportedSurrogate);
        }
        let scalar = 0x10000 + ((high - 0xD800) << 10) + low - 0xDC00;
        return char::from_u32(scalar)
            .map(|character| (slash + 12, character))
            .ok_or(UnicodeEscapeError::Invalid("invalid unicode scalar"));
    }
    if (0xDC00..=0xDFFF).contains(&high) {
        return Err(UnicodeEscapeError::UnsupportedSurrogate);
    }
    char::from_u32(high)
        .map(|character| (slash + 6, character))
        .ok_or(UnicodeEscapeError::Invalid("invalid unicode scalar"))
}

/// Return the end of a JSON string token. Syntax has already been validated,
/// so this is only a lexical skip and never decodes escape sequences.
pub(super) fn string_end(input: &[u8], start: usize) -> usize {
    let mut cursor = start + 1;
    while cursor < input.len() {
        let Some(relative) = memchr2(b'"', b'\\', &input[cursor..]) else {
            return input.len();
        };
        cursor += relative;
        match input[cursor] {
            b'\\' => cursor = cursor.saturating_add(2),
            b'"' => return cursor + 1,
            _ => unreachable!("memchr2 only returns a quote or backslash"),
        }
    }
    input.len()
}

pub(super) fn skip_whitespace(input: &[u8], mut cursor: usize) -> usize {
    while matches!(input.get(cursor), Some(b' ' | b'\n' | b'\r' | b'\t')) {
        cursor += 1;
    }
    cursor
}
