//! Check JSON syntax and locate byte boundaries within JSON text.
//!
//! Validation checks the entire document without constructing its objects or arrays.
//! The structural walk uses Jiter to traverse those bytes and skips trailing whitespace here.
//!
//! ```text
//! payload::validate
//!   `-- validate_json         jiter skip/finish; borrowed RawValue if that fails
//!        -> success/error    source bytes stay unchanged here
//!
//! structural_walk
//!   `-- skip_whitespace      advance to the next token after Jiter's walk
//! ```

use std::borrow::Cow;
use std::ops::Range;

use jiter::Jiter;
use serde::Deserialize;
use serde_json::value::RawValue;

use super::payload::EarlyMediaError;

/// Validate one complete JSON value without building a JSON tree.
///
/// The fast path uses jiter's skip parser. If it cannot validate the input, the
/// `RawValue` fallback checks a borrowed value instead of materializing a tree;
/// neither path calls back into JavaScript.
pub(super) fn validate_json(text: &str) -> Result<(), EarlyMediaError> {
    let mut cursor = Jiter::new(text.as_bytes());
    if cursor.next_skip().is_ok() && cursor.finish().is_ok() {
        return Ok(());
    }

    // The input boundary has checked UTF-8. `RawValue` borrows from the string,
    // so the fallback need not check UTF-8 or copy the whole input again.
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

pub(super) fn skip_whitespace(input: &[u8], mut cursor: usize) -> usize {
    while matches!(input.get(cursor), Some(b' ' | b'\n' | b'\r' | b'\t')) {
        cursor += 1;
    }
    cursor
}

pub(super) fn decode_json_string<'a>(
    input: &'a [u8],
    token_range: Range<usize>,
) -> Option<Cow<'a, str>> {
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
