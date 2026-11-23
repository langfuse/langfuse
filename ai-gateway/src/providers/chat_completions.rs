//! Chat Completions only reports streamed usage when the caller opts in, so the
//! gateway opts in on the caller's behalf. The resulting usage chunk is relayed.
use std::{fmt, ops::Range};

use serde::{
    Deserialize, Deserializer,
    de::{MapAccess, Visitor},
};
use serde_json::value::RawValue;

/// Where the body's top-level `stream_options` member sits, recorded by the request parse.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub(crate) enum StreamOptions {
    #[default]
    Absent,
    /// The byte range of the member's value.
    At(Range<usize>),
    /// Parsers disagree on which duplicate wins, so the body is forwarded unchanged.
    Duplicated,
}

impl StreamOptions {
    #[cfg(test)]
    pub(crate) fn from_body(body: &[u8]) -> Self {
        // `Option<&RawValue>` alone would read `null` as absent.
        fn present<'de, D: Deserializer<'de>>(
            deserializer: D,
        ) -> Result<Option<&'de RawValue>, D::Error> {
            <&RawValue>::deserialize(deserializer).map(Some)
        }
        #[derive(Deserialize)]
        struct Site<'a> {
            #[serde(borrow, default, deserialize_with = "present")]
            stream_options: Option<&'a RawValue>,
        }
        match serde_json::from_slice::<Site<'_>>(body) {
            Ok(Site {
                stream_options: Some(raw),
            }) => {
                let start = raw.get().as_ptr().addr() - body.as_ptr().addr();
                Self::At(start..start + raw.get().len())
            }
            Ok(Site {
                stream_options: None,
            }) => Self::Absent,
            Err(_) => Self::Duplicated,
        }
    }
}

/// The edit that opts a streamed request into usage: a byte range of `body` and its
/// replacement. `None` when the caller already opted in or the body must be forwarded
/// unchanged. Every other byte keeps its original position.
pub(super) fn stream_usage_edit(
    body: &[u8],
    stream_options: &StreamOptions,
) -> Option<(Range<usize>, Vec<u8>)> {
    let (range, existing) = match stream_options {
        StreamOptions::Duplicated => return None,
        StreamOptions::At(range) => (range.clone(), Some(body.get(range.clone())?)),
        // Appended before the closing brace; the object has a `model`, so never empty.
        StreamOptions::Absent => {
            let close = body.iter().rposition(|byte| !byte.is_ascii_whitespace())?;
            (body.get(close) == Some(&b'}')).then_some(())?;
            (close..close, None)
        }
    };
    // Parsed as raw members: a full `Value` tree can take ~100x the bytes.
    let mut options = match existing {
        None | Some(b"null") => Vec::new(),
        Some(raw) => serde_json::from_slice::<Members>(raw).ok()?.0,
    };
    if count(&options, "include_usage") > 1 || member(&options, "include_usage") == Some("true") {
        return None;
    }
    let include_usage = RawValue::from_string("true".to_owned()).ok()?;
    match options.iter_mut().find(|(key, _)| key == "include_usage") {
        Some((_, raw)) => *raw = include_usage,
        None => options.push(("include_usage".to_owned(), include_usage)),
    }
    let options = object_bytes(&options, 32)?;
    let replacement = if existing.is_some() {
        options
    } else {
        [br#","stream_options":"#.as_slice(), &options].concat()
    };
    Some((range, replacement))
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
        let (range, replacement) =
            stream_usage_edit(body.as_bytes(), &StreamOptions::from_body(body.as_bytes()))?;
        let mut rewritten = body.as_bytes().to_vec();
        rewritten.splice(range, replacement);
        Some(String::from_utf8(rewritten).unwrap())
    }

    #[test]
    fn streamed_requests_gain_include_usage_without_touching_other_members() {
        assert_eq!(
            rewrite(r#"{"model":"m", "messages":[{"role":"user","content":"1.0e2 \u00e9"}],"stream":true} "#)
                .as_deref(),
            Some(
                r#"{"model":"m", "messages":[{"role":"user","content":"1.0e2 \u00e9"}],"stream":true,"stream_options":{"include_usage":true}} "#
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
            rewrite(r#"{"model":"m","stream":true,"stream_options":null}"#).as_deref(),
            Some(r#"{"model":"m","stream":true,"stream_options":{"include_usage":true}}"#)
        );
    }

    #[test]
    fn other_bodies_are_forwarded_unchanged() {
        for body in [
            r#"{"model":"m","stream":true,"stream_options":{"include_usage":true}}"#,
            r#"{"model":"m","stream":true,"stream_options":"invalid"}"#,
            r#"{"model":"m","stream":true,"stream_options":{},"stream_options":{}}"#,
            r#"{"model":"m","stream":true,"stream_options":{"include_usage":false,"include_usage":false}}"#,
        ] {
            assert_eq!(rewrite(body), None, "{body}");
        }
    }
}
