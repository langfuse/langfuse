use super::{MAX_CAPTURE_BYTES, identity_encoding, sse::SseDecoder};
use axum::http::{HeaderMap, header};

pub(super) enum ResponseBody {
    Unknown,
    Json(Vec<u8>),
    Sse(SseDecoder),
    Unavailable,
}

impl ResponseBody {
    pub(super) fn from_headers(headers: &HeaderMap) -> Self {
        let content_type = headers
            .get(header::CONTENT_TYPE)
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .trim();
        if !identity_encoding(headers) {
            Self::Unavailable
        } else if content_type.eq_ignore_ascii_case("text/event-stream") {
            Self::Sse(SseDecoder::default())
        } else if content_type.eq_ignore_ascii_case("application/json") {
            Self::Json(Vec::new())
        } else {
            Self::Unavailable
        }
    }

    pub(super) fn push(&mut self, bytes: &[u8], on_event: impl FnMut(&[u8])) -> bool {
        match self {
            Self::Sse(sse) => {
                sse.push(bytes, MAX_CAPTURE_BYTES, on_event);
                true
            }
            Self::Json(buffer) if buffer.len().saturating_add(bytes.len()) <= MAX_CAPTURE_BYTES => {
                buffer.extend_from_slice(bytes);
                true
            }
            Self::Json(_) => {
                *self = Self::Unavailable;
                false
            }
            Self::Unknown | Self::Unavailable => true,
        }
    }
}
