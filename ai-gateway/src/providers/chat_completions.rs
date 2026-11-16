//! Chat Completions only reports streamed usage when the caller opts in, so the
//! gateway opts in on the caller's behalf. The resulting usage chunk is relayed.
use std::fmt;

use axum::body::Bytes;
use serde::{
    Deserialize, Deserializer,
    de::{MapAccess, Visitor},
};
use serde_json::value::RawValue;

pub(super) enum StreamUsage {
    /// The body for a streamed request that did not ask for usage, opted in.
    /// Every other top-level member keeps its original bytes and position.
    Requested(Bytes),
    /// The request is not streamed, or already asks for usage.
    Reported,
    /// The body is ambiguous or malformed, so whether usage is reported is unknown.
    Unknown,
}

pub(super) fn request_stream_usage(body: &[u8], provider_model: &str) -> StreamUsage {
    let Ok(Members(members)) = serde_json::from_slice(body) else {
        return StreamUsage::Unknown;
    };
    // Duplicate members are resolved differently by different parsers.
    if count(&members, "stream") > 1 {
        return StreamUsage::Unknown;
    }
    if member(&members, "stream") != Some("true") {
        return StreamUsage::Reported;
    }
    if count(&members, "model") != 1 || count(&members, "stream_options") > 1 {
        return StreamUsage::Unknown;
    }
    // Parsed as raw members too: a full `Value` tree can take ~100x the bytes.
    let options = match member(&members, "stream_options") {
        None | Some("null") => Vec::new(),
        Some(raw) => match serde_json::from_str::<Members>(raw) {
            Ok(Members(options)) => options,
            Err(_) => return StreamUsage::Unknown,
        },
    };
    if count(&options, "include_usage") > 1 {
        return StreamUsage::Unknown;
    }
    if member(&options, "include_usage") == Some("true") {
        return StreamUsage::Reported;
    }
    opt_in(members, options, provider_model, body.len())
        .map_or(StreamUsage::Unknown, StreamUsage::Requested)
}

fn opt_in(
    mut members: Vec<(String, Box<RawValue>)>,
    mut options: Vec<(String, Box<RawValue>)>,
    provider_model: &str,
    body_len: usize,
) -> Option<Bytes> {
    let include_usage = RawValue::from_string("true".to_owned()).ok()?;
    match options.iter_mut().find(|(key, _)| key == "include_usage") {
        Some((_, raw)) => *raw = include_usage,
        None => options.push(("include_usage".to_owned(), include_usage)),
    }
    let options =
        RawValue::from_string(String::from_utf8(object_bytes(&options, 32)?).ok()?).ok()?;
    let model = RawValue::from_string(serde_json::to_string(provider_model).ok()?).ok()?;
    members.iter_mut().find(|(key, _)| key == "model")?.1 = model;
    match members.iter_mut().find(|(key, _)| key == "stream_options") {
        Some((_, raw)) => *raw = options,
        None => members.push(("stream_options".to_owned(), options)),
    }
    object_bytes(&members, body_len + 32).map(Bytes::from)
}

fn object_bytes(members: &[(String, Box<RawValue>)], capacity: usize) -> Option<Vec<u8>> {
    let mut bytes = Vec::with_capacity(capacity);
    bytes.push(b'{');
    for (index, (key, raw)) in members.iter().enumerate() {
        if index > 0 {
            bytes.push(b',');
        }
        serde_json::to_writer(&mut bytes, key).ok()?;
        bytes.push(b':');
        bytes.extend_from_slice(raw.get().as_bytes());
    }
    bytes.push(b'}');
    Some(bytes)
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
            fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
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

    fn rewrite(body: &str) -> Option<String> {
        match request_stream_usage(body.as_bytes(), "provider-model") {
            StreamUsage::Requested(bytes) => Some(String::from_utf8(bytes.to_vec()).unwrap()),
            StreamUsage::Reported | StreamUsage::Unknown => None,
        }
    }

    #[test]
    fn streamed_requests_gain_include_usage_without_touching_other_members() {
        assert_eq!(
            rewrite(r#"{"model":"gpt-4.1", "messages":[{"role":"user","content":"1.0e2 \u00e9"}],"stream":true}"#)
                .as_deref(),
            Some(
                r#"{"model":"provider-model","messages":[{"role":"user","content":"1.0e2 \u00e9"}],"stream":true,"stream_options":{"include_usage":true}}"#
            )
        );
        assert_eq!(
            rewrite(r#"{"stream_options":{"include_obfuscation":false,"include_usage":false},"stream":true,"model":"m"}"#)
                .as_deref(),
            Some(
                r#"{"stream_options":{"include_obfuscation":false,"include_usage":true},"stream":true,"model":"provider-model"}"#
            )
        );
        assert_eq!(
            rewrite(r#"{"model":"m","stream":true,"stream_options":null}"#).as_deref(),
            Some(
                r#"{"model":"provider-model","stream":true,"stream_options":{"include_usage":true}}"#
            )
        );
    }

    #[test]
    fn requests_that_already_report_usage_are_left_alone() {
        for body in [
            r#"{"model":"m","messages":[]}"#,
            r#"{"stream":false}"#,
            r#"{"stream":"true"}"#,
            r#"{"model":"m","stream":true,"stream_options":{"include_usage":true}}"#,
        ] {
            let usage = request_stream_usage(body.as_bytes(), "provider-model");
            assert!(matches!(usage, StreamUsage::Reported), "{body}");
        }
    }

    #[test]
    fn ambiguous_streamed_requests_report_unknown_usage() {
        for body in [
            r#"{"model":"m","stream":true,"stream_options":"invalid"}"#,
            r#"{"model":"m","stream":true,"stream":true}"#,
            r#"{"model":"m","stream":true,"stream_options":{},"stream_options":{}}"#,
            r#"{"model":"m","stream":true,"stream_options":{"include_usage":true,"include_usage":false}}"#,
            r#"[{"stream":true}]"#,
            r#"{"stream":true"#,
            "",
        ] {
            let usage = request_stream_usage(body.as_bytes(), "provider-model");
            assert!(matches!(usage, StreamUsage::Unknown), "{body}");
        }
    }
}
