//! `OpenAI` Embeddings request and JSON response capture.
use super::{
    MAX_OUTPUT_CAPTURE_BYTES, RawRequest, bounded_string, error_detail, facts::ProviderFacts,
    parse_request, response::ResponseBody,
};
use crate::resolution::IngestionMode;
use axum::http::HeaderMap;
use base64::{Engine, engine::general_purpose::STANDARD};
use serde_json::{Map, Value, json};

pub(super) struct OpenAiEmbeddingsCapture {
    pub(super) facts: ProviderFacts,
    mode: IngestionMode,
    body: Option<EmbeddingsBody>,
    request_complete: bool,
}

impl OpenAiEmbeddingsCapture {
    pub(super) fn new(headers: &HeaderMap, body: &[u8], mode: IngestionMode) -> Self {
        let mut capture = Self {
            facts: ProviderFacts::default(),
            mode,
            body: None,
            request_complete: false,
        };
        match parse_request(headers, body) {
            Ok(request) => {
                capture.capture_request(request);
                capture.request_complete = true;
            }
            Err(omission) if mode == IngestionMode::Full => {
                capture.facts.input_omission = Some(omission);
            }
            Err(_) => {}
        }
        capture
    }

    pub(super) fn record_response(&mut self, headers: &HeaderMap) {
        self.body = matches!(ResponseBody::from_headers(headers), ResponseBody::Json(_))
            .then(EmbeddingsBody::default);
    }

    /// Embeddings answer in a single JSON body, so completion never starts early.
    pub(super) fn push_bytes(&mut self, bytes: &[u8]) -> bool {
        if let Some(body) = &mut self.body {
            body.push(bytes);
        }
        false
    }

    pub(super) fn end_body(&mut self) {
        let Some(body) = self.body.take() else {
            return;
        };
        let Some((mut response, vectors)) = body.finish() else {
            return;
        };
        if let Some(error) = response.get("error").and_then(Value::as_object) {
            self.record_error(error);
        }
        for (key, target) in [
            ("id", &mut self.facts.provider_response_id),
            ("model", &mut self.facts.model),
        ] {
            if let Some(value) = response
                .get(key)
                .and_then(Value::as_str)
                .and_then(bounded_string)
            {
                *target = Some(value);
            }
        }
        if let Some(usage) = response.remove("usage").filter(Value::is_object) {
            self.facts.usage_details = Some(usage);
        }
        // Vercel's Embeddings reply names it `providerMetadata`.
        if let Some(metadata) = response
            .remove("provider_metadata")
            .or_else(|| response.remove("providerMetadata"))
            .filter(Value::is_object)
        {
            self.facts.provider_metadata = Some(metadata);
        }
        if let Some(vectors) = vectors {
            if self.mode == IngestionMode::Full {
                self.facts.output = Some(vectors);
            }
            self.facts.output_complete = true;
        }
        self.facts.capture_complete = self.request_complete && self.facts.output_complete;
    }

    pub(super) fn into_facts(self) -> ProviderFacts {
        self.facts
    }

    fn capture_request(&mut self, mut request: RawRequest) {
        self.facts.requested_model = request
            .take("model")
            .as_ref()
            .and_then(Value::as_str)
            .and_then(bounded_string);
        if self.mode != IngestionMode::Full {
            return;
        }
        for key in ["dimensions", "encoding_format"] {
            if let Some(value) = request.take(key) {
                self.facts.model_parameters.insert(key.to_owned(), value);
            }
        }
        if let Some(value) = request.take("user") {
            self.facts.request_metadata.insert("user".to_owned(), value);
        }
        // The text to embed is the input, as Langfuse's `OpenAI` SDK integration records it.
        self.facts.input = request.members.remove("input");
        self.facts.input_complete = self.facts.input.is_some();
    }

    fn record_error(&mut self, error: &Map<String, Value>) {
        // Provider error messages may echo prompt content, so retain them only in full mode.
        if self.mode != IngestionMode::Full {
            return;
        }
        if let Some(detail) = error_detail(error, ["code", "message"]) {
            self.facts.error_message = Some(detail);
        }
    }
}

/// Scans an embeddings response as it streams. Its `data` vectors can be far larger
/// than the capture limit while `usage` follows them, so `data` is reduced to an
/// item count and its first item, and only the other members are buffered.
#[derive(Default)]
struct EmbeddingsBody {
    members: Vec<u8>,
    first_item: Vec<u8>,
    items: usize,
    lexer: JsonLexer,
    data: DataArray,
    exceeded: bool,
}

#[derive(Default, PartialEq, Eq)]
enum DataArray {
    #[default]
    Pending,
    Inside {
        expect_item: bool,
    },
    Done,
}

#[derive(Default)]
struct JsonLexer {
    depth: usize,
    in_string: bool,
    escaped: bool,
}

impl JsonLexer {
    fn structural(&self, depth: usize) -> bool {
        !self.in_string && self.depth == depth
    }

    fn step(&mut self, byte: u8) {
        if self.in_string {
            if self.escaped {
                self.escaped = false;
            } else if byte == b'\\' {
                self.escaped = true;
            } else if byte == b'"' {
                self.in_string = false;
            }
            return;
        }
        match byte {
            b'"' => self.in_string = true,
            b'{' | b'[' => self.depth += 1,
            b'}' | b']' => self.depth = self.depth.saturating_sub(1),
            _ => {}
        }
    }
}

impl EmbeddingsBody {
    fn push(&mut self, bytes: &[u8]) {
        for &byte in bytes {
            if self.exceeded {
                return;
            }
            if let DataArray::Inside { expect_item } = self.data {
                self.step_data(byte, expect_item);
            } else if self.data == DataArray::Pending
                && byte == b'['
                && self.lexer.structural(1)
                && self.follows_data_key()
            {
                self.data = DataArray::Inside { expect_item: true };
                self.lexer.depth = 2;
            } else {
                self.lexer.step(byte);
                self.keep(&[byte]);
            }
        }
    }

    fn step_data(&mut self, byte: u8, expect_item: bool) {
        if self.lexer.structural(2) {
            match byte {
                b']' => {
                    self.data = DataArray::Done;
                    self.lexer.depth = 1;
                    self.keep(b"null");
                    return;
                }
                b',' => {
                    self.data = DataArray::Inside { expect_item: true };
                    return;
                }
                b' ' | b'\t' | b'\n' | b'\r' => return,
                _ if expect_item => {
                    self.items += 1;
                    self.data = DataArray::Inside { expect_item: false };
                }
                _ => {}
            }
        }
        self.lexer.step(byte);
        if self.items == 1 && self.first_item.len() < MAX_OUTPUT_CAPTURE_BYTES {
            self.first_item.push(byte);
        }
    }

    fn keep(&mut self, bytes: &[u8]) {
        if self.members.len() + bytes.len() > MAX_OUTPUT_CAPTURE_BYTES {
            self.exceeded = true;
        } else {
            self.members.extend_from_slice(bytes);
        }
    }

    /// Whether the buffered members end with a top-level `"data":` key.
    fn follows_data_key(&self) -> bool {
        let Some(before_colon) = self.members.trim_ascii_end().strip_suffix(b":") else {
            return false;
        };
        before_colon
            .trim_ascii_end()
            .strip_suffix(b"\"data\"")
            .is_some_and(|before| !before.ends_with(b"\\"))
    }

    /// The other members, with `data` replaced by `null`, and the vector summary
    /// when the response had a `data` array.
    fn finish(self) -> Option<(Map<String, Value>, Option<Value>)> {
        if self.exceeded {
            return None;
        }
        let Ok(Value::Object(members)) = serde_json::from_slice(&self.members) else {
            return None;
        };
        let summary = (self.data == DataArray::Done).then(|| {
            let mut summary = Map::new();
            if let Some(dimensions) = dimensions(&self.first_item) {
                summary.insert("dimensions".to_owned(), json!(dimensions));
            }
            summary.insert("count".to_owned(), json!(self.items));
            Value::Object(summary)
        });
        Some((members, summary))
    }
}

/// A float vector's length, or a `base64` vector's count of little-endian f32s.
fn dimensions(item: &[u8]) -> Option<usize> {
    let item: Value = serde_json::from_slice(item).ok()?;
    match item.get("embedding")? {
        Value::Array(values) => Some(values.len()),
        Value::String(encoded) => Some(STANDARD.decode(encoded).ok()?.len() / 4),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderValue, header};

    fn scan(chunks: &[&[u8]]) -> Option<(Map<String, Value>, Option<Value>)> {
        let mut body = EmbeddingsBody::default();
        for chunk in chunks {
            body.push(chunk);
        }
        body.finish()
    }

    #[test]
    fn keeps_usage_after_vectors_larger_than_the_capture_limit() {
        let vector = vec!["0.0123"; 3072].join(",");
        let item = format!(r#"{{"object":"embedding","index":0,"embedding":[{vector}]}}"#);
        let items = vec![item; 100].join(",");
        let body = format!(
            r#"{{"object":"list","data":[{items}],"model":"text-embedding-3-large","usage":{{"prompt_tokens":800,"total_tokens":800}}}}"#
        );
        assert!(body.len() > MAX_OUTPUT_CAPTURE_BYTES);

        let chunks = body.as_bytes().chunks(4096).collect::<Vec<_>>();
        let (members, summary) = scan(&chunks).unwrap();

        assert_eq!(members["data"], Value::Null);
        assert_eq!(members["model"], "text-embedding-3-large");
        assert_eq!(members["usage"]["prompt_tokens"], 800);
        assert_eq!(summary, Some(json!({"dimensions": 3072, "count": 100})));
    }

    #[test]
    fn measures_base64_vectors() {
        let encoded = STANDARD.encode([0_u8; 4 * 256]);
        let body = format!(
            r#"{{"data": [ {{"embedding":"{encoded}","index":0}} , {{"embedding":"{encoded}","index":1}} ], "usage":{{"prompt_tokens":2}}}}"#
        );
        let (_, summary) = scan(&[body.as_bytes()]).unwrap();
        assert_eq!(summary, Some(json!({"dimensions": 256, "count": 2})));
    }

    #[test]
    fn ignores_data_keys_below_the_top_level() {
        let (members, summary) =
            scan(&[br#"{"error":{"message":"\"data\": [bad]","data":[1,2]},"note":"data"}"#])
                .unwrap();
        assert_eq!(members["error"]["data"], json!([1, 2]));
        assert_eq!(summary, None);
    }

    #[test]
    fn keeps_vercel_billing_reported_in_camel_case() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        let mut capture = OpenAiEmbeddingsCapture::new(
            &headers,
            br#"{"model":"amazon/titan-embed-text-v2","input":"hi"}"#,
            IngestionMode::Usage,
        );
        capture.record_response(&headers);
        // A Vercel Embeddings reply, trimmed to its usage and billing.
        let gateway = json!({
            "routing": {"modelAttempts": [{"success": true, "providerAttempts": [
                {"provider": "bedrock", "credentialType": "system", "success": true, "statusCode": 200},
            ]}]},
            "cost": "0.00000012",
        });
        let response = json!({
            "object": "list",
            "data": [{"object": "embedding", "embedding": [0.1, 0.2], "index": 0}],
            "model": "amazon/titan-embed-text-v2",
            "usage": {"prompt_tokens": 6, "total_tokens": 6},
            "providerMetadata": {"gateway": gateway},
        });
        capture.push_bytes(response.to_string().as_bytes());
        capture.end_body();
        assert_eq!(capture.facts.provider_metadata.unwrap()["gateway"], gateway);
    }

    #[test]
    fn drops_truncated_bodies() {
        assert!(scan(&[br#"{"data":[{"embedding":[1,2"#]).is_none());
    }
}
