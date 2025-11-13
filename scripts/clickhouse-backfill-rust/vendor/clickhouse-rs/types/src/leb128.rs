use crate::error::TypesError;
use crate::error::TypesError::{NotEnoughData, TypeParsingError};
use bytes::{Buf, BufMut};

#[inline]
#[doc(hidden)]
pub fn read_leb128(mut buffer: impl Buf) -> Result<u64, TypesError> {
    let mut value = 0u64;
    let mut shift = 0;
    loop {
        if buffer.remaining() < 1 {
            return Err(NotEnoughData(
                "decoding LEB128, 0 bytes remaining".to_string(),
            ));
        }
        let byte = buffer.get_u8();
        value |= (byte as u64 & 0x7f) << shift;
        if byte & 0x80 == 0 {
            break;
        }
        shift += 7;
        if shift > 57 {
            return Err(TypeParsingError(
                "decoding LEB128, unexpected shift value".to_string(),
            ));
        }
    }
    Ok(value)
}

#[inline]
#[doc(hidden)]
pub fn put_leb128(mut buffer: impl BufMut, mut value: u64) {
    while {
        let mut byte = value as u8 & 0x7f;
        value >>= 7;

        if value != 0 {
            byte |= 0x80;
        }

        buffer.put_u8(byte);

        value != 0
    } {}
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn read() {
        let test_cases = vec![
            // (input bytes, expected value)
            (vec![0], 0),
            (vec![1], 1),
            (vec![127], 127),
            (vec![128, 1], 128),
            (vec![255, 1], 255),
            (vec![0x85, 0x91, 0x26], 624773),
            (vec![0xE5, 0x8E, 0x26], 624485),
        ];

        for (input, expected) in test_cases {
            let result = read_leb128(&mut input.as_slice()).unwrap();
            assert_eq!(result, expected, "Failed decoding {input:?}");
        }
    }

    #[test]
    fn read_errors() {
        let test_cases = vec![
            // (input bytes, expected error message)
            (vec![], "decoding LEB128, 0 bytes remaining"),
            (
                vec![0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0x01],
                "decoding LEB128, unexpected shift value",
            ),
        ];

        for (input, expected_error) in test_cases {
            let result = read_leb128(&mut input.as_slice());
            assert!(result.is_err(), "Expected error for input {input:?}");
            if let Err(e) = result {
                assert!(
                    e.to_string().contains(expected_error),
                    "Error message mismatch for `{input:?}`; error was: `{e}`, should contain: `{expected_error}`"
                );
            }
        }
    }

    #[test]
    fn put_and_read() {
        let test_cases: Vec<(u64, Vec<u8>)> = vec![
            // (value, expected encoding)
            (0u64, vec![0x00]),
            (1, vec![0x01]),
            (127, vec![0x7F]),
            (128, vec![0x80, 0x01]),
            (255, vec![0xFF, 0x01]),
            (300_000, vec![0xE0, 0xA7, 0x12]),
            (624_773, vec![0x85, 0x91, 0x26]),
            (624_485, vec![0xE5, 0x8E, 0x26]),
            (10_000_000, vec![0x80, 0xAD, 0xE2, 0x04]),
            (u32::MAX as u64, vec![0xFF, 0xFF, 0xFF, 0xFF, 0x0F]),
        ];

        for (value, expected_encoding) in test_cases {
            // Test encoding
            let mut encoded = Vec::new();
            put_leb128(&mut encoded, value);
            assert_eq!(encoded, expected_encoding, "Incorrect encoding for {value}");

            // Test round-trip
            let decoded = read_leb128(&mut encoded.as_slice()).unwrap();
            assert_eq!(
                decoded, value,
                "Failed round trip for {value}: encoded as {encoded:?}, decoded as {decoded}"
            );
        }
    }
}
