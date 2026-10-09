//! Recognize base64 Data URI spans inside decoded strings.

use std::ops::Range;

use super::encoding::{
    has_data_uri_boundary, is_base64_character, is_data_uri_terminator, is_valid_content_type,
    is_valid_data_uri_parameters,
};
use super::rules::{is_supported_content_type, BASE64_MARKER, DATA_URI_PREFIX};

pub(super) struct ParsedDataUri<'a> {
    pub(super) start: usize,
    pub(super) end: usize,
    pub(super) valid: Option<&'a str>,
}

pub(super) fn parse_data_uri(value: &str, mut start: usize) -> Option<ParsedDataUri<'_>> {
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

pub(super) fn find_data_uri_candidates(value: &str) -> Vec<(Range<usize>, &str)> {
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
