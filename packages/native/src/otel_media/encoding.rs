//! Byte encoding, Data URI syntax checks, and bounded hashing.

use base64::engine::general_purpose::{GeneralPurpose, GeneralPurposeConfig};
use base64::engine::{DecodePaddingMode, Engine};
use sha2::{Digest, Sha256};

use super::payload::{MediaDecodeError, MediaEncoding};
use super::rules::BASE64_MARKER;

// Node's Buffer.from(value, "base64") accepts canonical padding, omitted
// padding, and non-zero trailing bits. The TypeScript detector validates the
// character grammar separately, so use the same forgiving decode behavior
// after that grammar check has passed.
pub(super) const BASE64: GeneralPurpose = GeneralPurpose::new(
    &base64::alphabet::STANDARD,
    GeneralPurposeConfig::new()
        .with_decode_padding_mode(DecodePaddingMode::Indifferent)
        .with_decode_allow_trailing_bits(true),
);

pub(super) const BASE64_HASH_CHUNK_SIZE: usize = 16 * 1024;
pub(super) const BASE64_HASH_DECODED_CHUNK_SIZE: usize = BASE64_HASH_CHUNK_SIZE / 4 * 3;

pub(super) fn is_data_uri_terminator(byte: u8) -> bool {
    matches!(
        byte,
        b'\t'
            | b'\n'
            | b'\r'
            | b' '
            | b'!'
            | b'"'
            | b'\''
            | b')'
            | b','
            | b'.'
            | b';'
            | b'>'
            | b'?'
            | b']'
            | b'}'
    )
}

pub(super) fn is_base64_character(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b'+' | b'/' | b'=')
}

pub(super) fn is_valid_content_type(value: &str) -> bool {
    let mut pieces = value.split('/');
    let Some(kind) = pieces.next() else {
        return false;
    };
    let Some(subtype) = pieces.next() else {
        return false;
    };
    pieces.next().is_none()
        && !kind.is_empty()
        && !subtype.is_empty()
        && kind
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"!#$&^_.+-".contains(&byte))
        && subtype
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"!#$&^_.+-".contains(&byte))
}

/// Validate the optional parameters between a Data URI media type and `;base64`.
///
/// The TypeScript detector accepts RFC-style token names and non-empty parameter
/// values, while rejecting delimiters that would make the header ambiguous. Malformed
/// headers remain ordinary inline text in both implementations.
pub(super) fn is_valid_data_uri_parameters(value: &str) -> bool {
    if value.is_empty() {
        return true;
    }
    let bytes = value.as_bytes();
    let mut cursor = 0;
    while cursor < bytes.len() {
        if bytes[cursor] != b';' {
            return false;
        }
        cursor += 1;
        let name_start = cursor;
        while cursor < bytes.len()
            && bytes[cursor] != b'='
            && bytes[cursor] != b';'
            && bytes[cursor] != b','
        {
            cursor += 1;
        }
        if cursor == name_start
            || cursor >= bytes.len()
            || bytes[cursor] != b'='
            || !bytes[name_start..cursor]
                .iter()
                .all(|byte| byte.is_ascii_alphanumeric() || b"!#$&^_.+-".contains(byte))
        {
            return false;
        }
        cursor += 1;
        let value_start = cursor;
        while cursor < bytes.len() && bytes[cursor] != b';' {
            cursor += 1;
        }
        if cursor == value_start
            || bytes[value_start..cursor]
                .iter()
                .any(|byte| b",\t\n\r \"'<>[]{}".contains(byte))
        {
            return false;
        }
    }
    true
}

pub(super) fn has_data_uri_boundary(value: &str, start: usize) -> bool {
    start == 0
        || !value.as_bytes()[start - 1].is_ascii_alphanumeric()
            && value.as_bytes()[start - 1] != b'-'
            && value.as_bytes()[start - 1] != b'_'
}

pub(super) fn decode_python_bytes_literal(value: &[u8]) -> Result<Vec<u8>, MediaDecodeError> {
    let mut output = Vec::with_capacity(value.len().saturating_sub(3));
    visit_python_bytes_literal(value, |byte| output.push(byte))?;
    Ok(output)
}

fn visit_python_bytes_literal(
    value: &[u8],
    mut visit_byte: impl FnMut(u8),
) -> Result<(), MediaDecodeError> {
    if value.len() < 3 || value[0] != b'b' || !matches!(value[1], b'\'' | b'"') {
        return Err(MediaDecodeError::InvalidPythonBytes);
    }
    let quote = value[1];
    if *value.last().unwrap_or(&0) != quote {
        return Err(MediaDecodeError::InvalidPythonBytes);
    }
    let mut cursor = 2;
    while cursor + 1 < value.len() {
        let byte = value[cursor];
        if byte != b'\\' {
            // Python's bytes repr escapes non-ASCII/control bytes and an unescaped
            // delimiter cannot occur inside the literal. Match the TypeScript decoder
            // instead of accepting a broader Rust-only grammar.
            if !(0x20..=0x7e).contains(&byte) || byte == quote {
                return Err(MediaDecodeError::InvalidPythonBytes);
            }
            visit_byte(byte);
            cursor += 1;
            continue;
        }
        cursor += 1;
        if cursor == value.len() - 1 {
            return Err(MediaDecodeError::InvalidPythonBytes);
        }
        let Some(escaped) = value.get(cursor).copied() else {
            return Err(MediaDecodeError::InvalidPythonBytes);
        };
        match escaped {
            b'\\' | b'\'' | b'"' => visit_byte(escaped),
            b'n' => visit_byte(b'\n'),
            b'r' => visit_byte(b'\r'),
            b't' => visit_byte(b'\t'),
            b'x' => {
                let Some(bytes) = value
                    .get(cursor + 1..cursor + 3)
                    .and_then(|bytes| bytes.first_chunk::<2>())
                else {
                    return Err(MediaDecodeError::InvalidPythonBytes);
                };
                let Some(hi) = hex_digit(bytes[0]) else {
                    return Err(MediaDecodeError::InvalidPythonBytes);
                };
                let Some(lo) = hex_digit(bytes[1]) else {
                    return Err(MediaDecodeError::InvalidPythonBytes);
                };
                visit_byte((hi << 4) | lo);
                cursor += 2;
            }
            _ => return Err(MediaDecodeError::InvalidPythonBytes),
        }
        cursor += 1;
    }
    Ok(())
}

/// Hash decoded media without materializing the full decoded body. Uploading
/// still decodes on demand, but discovery only needs the stable content ID and
/// should not briefly retain both a base64 source and a second large body buffer.
pub(super) fn hash_encoded_data(
    encoded_data: &[u8],
    encoding: MediaEncoding,
) -> Result<[u8; 32], MediaDecodeError> {
    let mut hasher = Sha256::new();
    match encoding {
        MediaEncoding::Base64DataUri => {
            let marker = encoded_data
                .windows(BASE64_MARKER.len())
                .position(|window| window == BASE64_MARKER.as_bytes())
                .ok_or(MediaDecodeError::InvalidDataUri)?;
            hash_base64(&mut hasher, &encoded_data[marker + BASE64_MARKER.len()..])?;
        }
        MediaEncoding::Base64 => hash_base64(&mut hasher, encoded_data)?,
        MediaEncoding::PythonBytesLiteral => hash_python_bytes_literal(&mut hasher, encoded_data)?,
    }
    Ok(hasher.finalize().into())
}

/// After character/padding validation, match Buffer.from(..., "base64"):
/// padding can be redundant, and a lone final sextet cannot produce a byte.
/// Borrow the decodable prefix so hashing and upload decoding use identical bytes.
fn node_base64_payload(mut value: &[u8]) -> Result<&[u8], MediaDecodeError> {
    while value.last() == Some(&b'=') {
        value = &value[..value.len() - 1];
    }
    if value.len() % 4 == 1 {
        value = &value[..value.len() - 1];
    }
    // The TS media processor leaves zero-byte decoded payloads inline.
    if value.is_empty() {
        return Err(MediaDecodeError::InvalidDataUri);
    }
    Ok(value)
}

fn hash_base64(hasher: &mut Sha256, value: &[u8]) -> Result<(), MediaDecodeError> {
    let value = node_base64_payload(value)?;
    // Decode bounded chunks to hash large media without allocating the complete body.
    // A multiple of four preserves Base64 groups; the final chunk accepts omitted padding
    // and non-zero trailing bits, matching Node's decoding behavior.
    let mut decoded = [0_u8; BASE64_HASH_DECODED_CHUNK_SIZE];
    for chunk in value.chunks(BASE64_HASH_CHUNK_SIZE) {
        let decoded_length = BASE64
            .decode_slice(chunk, &mut decoded)
            .map_err(MediaDecodeError::Base64Slice)?;
        hasher.update(&decoded[..decoded_length]);
    }
    Ok(())
}

fn hash_python_bytes_literal(hasher: &mut Sha256, value: &[u8]) -> Result<(), MediaDecodeError> {
    let mut decoded = [0; BASE64_HASH_DECODED_CHUNK_SIZE];
    let mut decoded_len = 0;
    visit_python_bytes_literal(value, |byte| {
        decoded[decoded_len] = byte;
        decoded_len += 1;
        if decoded_len == decoded.len() {
            hasher.update(&decoded[..]);
            decoded_len = 0;
        }
    })?;
    hasher.update(&decoded[..decoded_len]);
    Ok(())
}

pub(super) fn is_python_bytes_literal(value: &str) -> bool {
    let bytes = value.as_bytes();
    bytes.len() >= 3
        && bytes[0] == b'b'
        && matches!(bytes[1], b'\'' | b'"')
        && bytes.last() == bytes.get(1)
}

pub(super) fn is_valid_base64_syntax(value: &[u8]) -> bool {
    if value.is_empty() || value.len() % 4 == 1 {
        return false;
    }
    let mut padding = 0;
    for byte in value {
        if *byte == b'=' {
            padding += 1;
            if padding > 2 {
                return false;
            }
        } else if padding > 0 || !is_base64_character(*byte) {
            return false;
        }
    }
    true
}

pub(super) fn hex_digit(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

pub(super) fn decode_encoded_data(
    encoded_data: &[u8],
    encoding: MediaEncoding,
) -> Result<Vec<u8>, MediaDecodeError> {
    match encoding {
        MediaEncoding::Base64DataUri => {
            let marker = encoded_data
                .windows(BASE64_MARKER.len())
                .position(|window| window == BASE64_MARKER.as_bytes())
                .ok_or(MediaDecodeError::InvalidDataUri)?;
            BASE64
                .decode(node_base64_payload(
                    &encoded_data[marker + BASE64_MARKER.len()..],
                )?)
                .map_err(MediaDecodeError::Base64)
        }
        MediaEncoding::Base64 => BASE64
            .decode(node_base64_payload(encoded_data)?)
            .map_err(MediaDecodeError::Base64),
        MediaEncoding::PythonBytesLiteral => decode_python_bytes_literal(encoded_data),
    }
}

#[cfg(test)]
mod tests {
    use base64::Engine;
    use proptest::prelude::*;
    use sha2::{Digest, Sha256};

    use super::{
        decode_python_bytes_literal, hash_encoded_data, BASE64, BASE64_HASH_DECODED_CHUNK_SIZE,
    };
    use super::{MediaDecodeError, MediaEncoding};

    #[test]
    fn hashes_large_base64_across_chunk_boundaries_with_or_without_padding() {
        // 12,289 decoded bytes produce a padded tail after one complete 16 KiB
        // encoded chunk. Exercise both the padded and Node-compatible unpadded form.
        let decoded = (0usize..12_289)
            .map(|index| index.wrapping_mul(31) as u8)
            .collect::<Vec<_>>();
        let padded = BASE64.encode(&decoded);
        let unpadded = padded.trim_end_matches('=');
        let expected: [u8; 32] = Sha256::digest(&decoded).into();

        assert_eq!(
            hash_encoded_data(padded.as_bytes(), MediaEncoding::Base64).unwrap(),
            expected
        );
        assert_eq!(
            hash_encoded_data(unpadded.as_bytes(), MediaEncoding::Base64).unwrap(),
            expected
        );
    }

    #[test]
    fn python_bytes_decoder_and_hasher_share_escape_validation() {
        let encoded = br#"b"abc\n\r\t\\\'\"\x41""#;
        let expected = b"abc\n\r\t\\'\"A";
        let expected_hash: [u8; 32] = Sha256::digest(expected).into();
        assert_eq!(decode_python_bytes_literal(encoded).unwrap(), expected);
        assert_eq!(
            hash_encoded_data(encoded, MediaEncoding::PythonBytesLiteral).unwrap(),
            expected_hash
        );

        let malformed_single_quote = b"b'abc\\'";
        let malformed_double_quote = b"b\"abc\\\"";
        for invalid in [
            b"b'bad\\q'".as_slice(),
            b"b'bad\\x0'",
            b"b'caf\xc3\xa9'",
            malformed_single_quote.as_slice(),
            malformed_double_quote.as_slice(),
        ] {
            assert!(matches!(
                decode_python_bytes_literal(invalid),
                Err(MediaDecodeError::InvalidPythonBytes)
            ));
            assert!(matches!(
                hash_encoded_data(invalid, MediaEncoding::PythonBytesLiteral),
                Err(MediaDecodeError::InvalidPythonBytes)
            ));
        }

        let valid_single_quote = b"b'abc\\''";
        let valid_double_quote = b"b\"abc\\\"\"";
        for (literal, expected) in [
            (valid_single_quote.as_slice(), b"abc'".as_slice()),
            (valid_double_quote.as_slice(), b"abc\"".as_slice()),
        ] {
            let expected_hash: [u8; 32] = Sha256::digest(expected).into();
            assert_eq!(decode_python_bytes_literal(literal).unwrap(), expected);
            assert_eq!(
                hash_encoded_data(literal, MediaEncoding::PythonBytesLiteral).unwrap(),
                expected_hash
            );
        }
    }

    #[test]
    fn hashes_large_python_bytes_literals_in_bounded_chunks() {
        let decoded = vec![b'a'; BASE64_HASH_DECODED_CHUNK_SIZE + 17];
        let mut encoded = Vec::with_capacity(decoded.len() + 3);
        encoded.extend_from_slice(b"b'");
        encoded.extend_from_slice(&decoded);
        encoded.push(b'\'');
        let expected_hash: [u8; 32] = Sha256::digest(&decoded).into();

        assert_eq!(
            hash_encoded_data(&encoded, MediaEncoding::PythonBytesLiteral).unwrap(),
            expected_hash
        );
    }

    proptest! {
        #[test]
        fn bounded_base64_hash_matches_decoded_content(bytes in prop_oneof![
                prop::collection::vec(any::<u8>(), 1..4096),
                prop::collection::vec(
                    any::<u8>(),
                    BASE64_HASH_DECODED_CHUNK_SIZE..(2 * BASE64_HASH_DECODED_CHUNK_SIZE + 17),
                ),
            ]) {
            let encoded = BASE64.encode(&bytes);
            let expected: [u8; 32] = Sha256::digest(&bytes).into();

            prop_assert_eq!(hash_encoded_data(encoded.as_bytes(), MediaEncoding::Base64).unwrap(), expected);
            let unpadded = encoded.trim_end_matches('=');
            prop_assert_eq!(hash_encoded_data(unpadded.as_bytes(), MediaEncoding::Base64).unwrap(), expected);
        }
    }
}
