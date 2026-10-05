//! Chat Completions only reports streamed usage when the caller opts in, so the
//! gateway opts in on the caller's behalf and hides the extra chunk again.
use std::fmt;

use axum::{body::Bytes, http::HeaderMap};
use serde::{
    Deserialize, Deserializer,
    de::{MapAccess, Visitor},
};
use serde_json::{Value, value::RawValue};

use crate::transport::identity_encoding;

/// The rewritten body for a streamed request that did not ask for usage, or
/// `None` when the original bytes must be forwarded unchanged. Every other
/// top-level member keeps its original bytes and position.
pub(super) fn request_stream_usage(headers: &HeaderMap, body: &[u8]) -> Option<Bytes> {
    if !identity_encoding(headers) {
        return None;
    }
    let Members(mut members) = serde_json::from_slice(body).ok()?;
    // Duplicate members are resolved differently by different parsers.
    if count(&members, "stream") != 1 || count(&members, "stream_options") > 1 {
        return None;
    }
    if member(&members, "stream")? != "true" {
        return None;
    }
    let options = match member(&members, "stream_options") {
        None => serde_json::Map::new(),
        Some(raw) => match serde_json::from_str::<Value>(raw).ok()? {
            Value::Object(options) => options,
            Value::Null => serde_json::Map::new(),
            _ => return None,
        },
    };
    if options.get("include_usage") == Some(&Value::Bool(true)) {
        return None;
    }
    let mut options = options;
    options.insert("include_usage".to_owned(), Value::Bool(true));
    let options = RawValue::from_string(Value::Object(options).to_string()).ok()?;
    match members.iter_mut().find(|(key, _)| key == "stream_options") {
        Some((_, raw)) => *raw = options,
        None => members.push(("stream_options".to_owned(), options)),
    }
    let mut rewritten = Vec::with_capacity(body.len() + 32);
    rewritten.push(b'{');
    for (index, (key, raw)) in members.iter().enumerate() {
        if index > 0 {
            rewritten.push(b',');
        }
        serde_json::to_writer(&mut rewritten, key).ok()?;
        rewritten.push(b':');
        rewritten.extend_from_slice(raw.get().as_bytes());
    }
    rewritten.push(b'}');
    Some(Bytes::from(rewritten))
}

fn count(members: &[(String, Box<RawValue>)], name: &str) -> usize {
    members.iter().filter(|(key, _)| key == name).count()
}

fn member<'a>(members: &'a [(String, Box<RawValue>)], name: &str) -> Option<&'a str> {
    members
        .iter()
        .find(|(key, _)| key == name)
        .map(|(_, raw)| raw.get())
}

/// A top-level JSON object in source order, with each value left unparsed.
struct Members(Vec<(String, Box<RawValue>)>);

impl<'de> Deserialize<'de> for Members {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct MembersVisitor;
        impl<'de> Visitor<'de> for MembersVisitor {
            type Value = Members;
            fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
                formatter.write_str("a JSON object")
            }
            fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Members, A::Error> {
                let mut members = Vec::with_capacity(map.size_hint().unwrap_or(0));
                while let Some(member) = map.next_entry()? {
                    members.push(member);
                }
                Ok(Members(members))
            }
        }
        deserializer.deserialize_map(MembersVisitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::{HeaderValue, header};

    fn rewrite(body: &str) -> Option<String> {
        request_stream_usage(&HeaderMap::new(), body.as_bytes())
            .map(|bytes| String::from_utf8(bytes.to_vec()).unwrap())
    }

    #[test]
    fn streamed_requests_gain_include_usage_without_touching_other_members() {
        assert_eq!(
            rewrite(r#"{"model":"gpt-4.1", "messages":[{"role":"user","content":"1.0e2 \u00e9"}],"stream":true}"#)
                .as_deref(),
            Some(
                r#"{"model":"gpt-4.1","messages":[{"role":"user","content":"1.0e2 \u00e9"}],"stream":true,"stream_options":{"include_usage":true}}"#
            )
        );
        assert_eq!(
            rewrite(r#"{"stream_options":{"include_obfuscation":false,"include_usage":false},"stream":true,"model":"m"}"#)
                .as_deref(),
            Some(
                r#"{"stream_options":{"include_obfuscation":false,"include_usage":true},"stream":true,"model":"m"}"#
            )
        );
        assert_eq!(
            rewrite(r#"{"stream":true,"stream_options":null}"#).as_deref(),
            Some(r#"{"stream":true,"stream_options":{"include_usage":true}}"#)
        );
    }

    #[test]
    fn other_bodies_are_forwarded_unchanged() {
        for body in [
            r#"{"model":"m","messages":[]}"#,
            r#"{"stream":false}"#,
            r#"{"stream":"true"}"#,
            r#"{"stream":true,"stream_options":{"include_usage":true}}"#,
            r#"{"stream":true,"stream_options":"invalid"}"#,
            r#"{"stream":true,"stream":true}"#,
            r#"{"stream":true,"stream_options":{},"stream_options":{}}"#,
            r#"[{"stream":true}]"#,
            r#"{"stream":true"#,
            "",
        ] {
            assert_eq!(rewrite(body), None, "{body}");
        }
        let mut encoded = HeaderMap::new();
        encoded.insert(header::CONTENT_ENCODING, HeaderValue::from_static("gzip"));
        assert!(request_stream_usage(&encoded, br#"{"stream":true}"#).is_none());
    }
}
