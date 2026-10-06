//! JSON validation and byte-range parsing helpers.

use std::collections::HashMap;

use jiter::{Jiter, JiterError, JiterErrorType, JsonErrorType, Peek};
use serde::Deserialize;
use serde_json::value::RawValue;

use super::encoding::hex_digit;
use super::payload::EarlyMediaError;

// OTLP envelopes commonly contain more than ten structural levels before their
// attribute values. Keep full JSON validation permissive enough for those
// documents; the smaller limit applies only to recursively parsed embedded JSON.
pub(super) const MAX_JSON_DEPTH: usize = 128;
const SCAN_CACHE_MIN_BYTES: usize = 1024;

pub(super) fn validate_utf8(input: &[u8]) -> Result<&str, EarlyMediaError> {
    std::str::from_utf8(input).map_err(|error| EarlyMediaError::InvalidJson {
        offset: error.valid_up_to(),
        message: "invalid UTF-8",
    })
}

pub(super) fn scan_jiter_value<'j>(
    input: &'j [u8],
    scan_cache: &mut Option<HashMap<usize, usize>>,
    cursor: &mut Jiter<'j>,
    base: &mut usize,
    depth: usize,
    known_peek: Option<Peek>,
) -> Result<usize, EarlyMediaError> {
    let value_start = skip_whitespace(input, (*base).saturating_add(cursor.current_index()));
    if depth > MAX_JSON_DEPTH {
        return Err(EarlyMediaError::NestingLimit {
            offset: value_start,
        });
    }
    let peek = match known_peek {
        Some(peek) => peek,
        None => cursor
            .peek()
            .map_err(|error| map_jiter_error(input, *base, error))?,
    };
    let value_start = skip_whitespace(input, (*base).saturating_add(cursor.current_index()));

    match peek {
        Peek::Null => cursor
            .known_null()
            .map_err(|error| map_jiter_error(input, *base, error))?,
        Peek::True | Peek::False => cursor
            .known_bool(peek)
            .map(drop)
            .map_err(|error| map_jiter_error(input, *base, error))?,
        Peek::String => cursor
            .known_bytes()
            .map(drop)
            .map_err(|error| map_jiter_error(input, *base, error))?,
        Peek::Array => {
            if let Some(first) = cursor
                .known_array()
                .map_err(|error| map_jiter_error(input, *base, error))?
            {
                scan_jiter_value(input, scan_cache, cursor, base, depth + 1, Some(first))?;
                while let Some(next) = cursor
                    .array_step()
                    .map_err(|error| map_jiter_error(input, *base, error))?
                {
                    scan_jiter_value(input, scan_cache, cursor, base, depth + 1, Some(next))?;
                }
            }
        }
        Peek::Object => {
            if cursor
                .next_object_bytes()
                .map_err(|error| map_jiter_error(input, *base, error))?
                .is_some()
            {
                scan_jiter_value(input, scan_cache, cursor, base, depth + 1, None)?;
                while cursor
                    .next_key_bytes()
                    .map_err(|error| map_jiter_error(input, *base, error))?
                    .is_some()
                {
                    scan_jiter_value(input, scan_cache, cursor, base, depth + 1, None)?;
                }
            }
        }
        number if number.is_num() => {
            if let Err(error) = cursor.known_number_bytes(peek) {
                if matches!(
                    error.error_type,
                    JiterErrorType::JsonError(JsonErrorType::NumberOutOfRange)
                ) {
                    let end = raw_number_end(input, value_start)?;
                    *base = end;
                    *cursor = Jiter::new(&input[end..]);
                } else {
                    return Err(map_jiter_error(input, *base, error));
                }
            }
        }
        _ => {
            return Err(EarlyMediaError::InvalidJson {
                offset: value_start,
                message: "invalid JSON",
            });
        }
    }

    let end = (*base).saturating_add(cursor.current_index());
    if end.saturating_sub(value_start) >= SCAN_CACHE_MIN_BYTES {
        if let Some(cache) = scan_cache {
            cache.insert(value_start, end);
        }
    }
    Ok(end)
}

/// Jiter's lexical number-range decoder caps very long integers. RawValue uses
/// serde_json's lexical skip path and borrows the token, preserving the input's
/// accepted number grammar without allocating a number representation.
pub(super) fn raw_number_end(input: &[u8], start: usize) -> Result<usize, EarlyMediaError> {
    let suffix = input.get(start..).ok_or(EarlyMediaError::InvalidJson {
        offset: start,
        message: "invalid JSON number",
    })?;
    let mut deserializer = serde_json::Deserializer::from_slice(suffix);
    let raw =
        <&RawValue>::deserialize(&mut deserializer).map_err(|_| EarlyMediaError::InvalidJson {
            offset: start,
            message: "invalid JSON number",
        })?;
    Ok(start + raw.get().len())
}

pub(super) fn map_jiter_error(input: &[u8], base: usize, error: JiterError) -> EarlyMediaError {
    let offset = base.saturating_add(error.index);
    match error.error_type {
        JiterErrorType::JsonError(JsonErrorType::LoneLeadingSurrogateInHexEscape) => {
            EarlyMediaError::UnsupportedUnicodeSurrogate { offset }
        }
        JiterErrorType::JsonError(
            JsonErrorType::UnexpectedEndOfHexEscape | JsonErrorType::EofWhileParsingString,
        ) if has_unpaired_high_surrogate(input, offset) => {
            EarlyMediaError::UnsupportedUnicodeSurrogate { offset }
        }
        JiterErrorType::JsonError(JsonErrorType::ControlCharacterWhileParsingString) => {
            EarlyMediaError::InvalidJson {
                offset,
                message: "control byte in string",
            }
        }
        _ => EarlyMediaError::InvalidJson {
            offset,
            message: "invalid JSON",
        },
    }
}

pub(super) fn has_unpaired_high_surrogate(input: &[u8], offset: usize) -> bool {
    let start = offset.saturating_sub(8);
    for slash in start..=offset.min(input.len()) {
        if input.get(slash..slash + 2) != Some(b"\\u") {
            continue;
        }
        // A literal \u following an escaped backslash is not a Unicode escape.
        let preceding_slashes = input[..slash]
            .iter()
            .rev()
            .take_while(|&&byte| byte == b'\\')
            .count();
        if preceding_slashes % 2 != 0 {
            continue;
        }
        let Some(digits) = input.get(slash + 2..slash + 6) else {
            continue;
        };
        let Some(value) = digits.iter().try_fold(0u16, |value, digit| {
            hex_digit(*digit).map(|digit| value * 16 + u16::from(digit))
        }) else {
            continue;
        };
        let pair_start = slash + 6;
        if (0xD800..=0xDBFF).contains(&value)
            && offset >= pair_start
            && offset <= pair_start + 2
            && input.get(pair_start..pair_start + 2) != Some(b"\\u")
        {
            return true;
        }
    }
    false
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

pub(super) fn skip_whitespace(input: &[u8], mut cursor: usize) -> usize {
    while matches!(input.get(cursor), Some(b' ' | b'\n' | b'\r' | b'\t')) {
        cursor += 1;
    }
    cursor
}
