//! Reading text out of the shapes API formats share: a string, or an array of
//! strings and parts whose `text` is a string. Tool results nest their own content.
//! Arrays are walked item by item and each text goes straight to a sink, so a
//! body of millions of short strings allocates nothing per string.
use std::{borrow::Cow, fmt, marker::PhantomData};

use serde::{
    Deserialize,
    de::{Error as _, IgnoredAny, MapAccess, SeqAccess, Visitor},
};
use serde_json::value::RawValue;

/// Tool results nest content once (Anthropic `tool_result` blocks); deeper nesting
/// is not a shape any format defines.
const MAX_NESTING: usize = 2;

/// A member the gateway cannot read the way a provider might, such as an object
/// with a duplicated field. Guardrails treat it as matching, since the provider
/// could read text the gateway skipped.
#[derive(Debug)]
pub(crate) struct Unreadable;

#[derive(Deserialize)]
struct Part<'a> {
    #[serde(borrow, default)]
    text: Option<&'a RawValue>,
    #[serde(borrow, default)]
    content: Option<&'a RawValue>,
    /// Anthropic `document` blocks carry plain text in their source.
    #[serde(borrow, default)]
    source: Option<&'a RawValue>,
}

/// A document source: plain text in `data` (`type: "text"`) or content blocks in
/// `content` (`type: "content"`). Base64 and URL sources hold no text to scan.
#[derive(Deserialize)]
struct Source<'a> {
    #[serde(borrow, default, rename = "type")]
    kind: Option<&'a RawValue>,
    #[serde(borrow, default)]
    data: Option<&'a RawValue>,
    #[serde(borrow, default)]
    content: Option<&'a RawValue>,
}

/// Sends the text in `raw` to `sink`; skips images, files and other non-text
/// parts without copying them. Values in other shapes hold no text: the provider
/// rejects a request it cannot read.
pub(crate) fn collect(raw: &RawValue, sink: &mut dyn FnMut(&str)) -> Result<(), Unreadable> {
    collect_nested(raw, sink, 0)
}

/// Sends the text of one content part to `sink`.
pub(crate) fn collect_part(raw: &RawValue, sink: &mut dyn FnMut(&str)) -> Result<(), Unreadable> {
    collect_part_nested(raw, sink, 0)
}

fn collect_nested(
    raw: &RawValue,
    sink: &mut dyn FnMut(&str),
    depth: usize,
) -> Result<(), Unreadable> {
    match raw.get().as_bytes().first() {
        Some(b'"') => collect_string(raw, sink),
        Some(b'[') if depth <= MAX_NESTING => for_each(raw.get(), |item: &RawValue| {
            match item.get().as_bytes().first() {
                Some(b'"') => collect_string(item, sink),
                Some(b'{') => collect_part_nested(item, sink, depth),
                _ => Ok(()),
            }
        }),
        _ => Ok(()),
    }
}

/// A part's `text`, the text of a document source, and nested tool-result content.
fn collect_part_nested(
    raw: &RawValue,
    sink: &mut dyn FnMut(&str),
    depth: usize,
) -> Result<(), Unreadable> {
    let part: Part<'_> = serde_json::from_str(raw.get()).map_err(|_| Unreadable)?;
    if let Some(text) = part.text {
        collect_string(text, sink)?;
    }
    if let Some(source) = part.source.filter(|source| source.get().starts_with('{')) {
        collect_source(source, sink, depth)?;
    }
    part.content
        .map_or(Ok(()), |content| collect_nested(content, sink, depth + 1))
}

fn collect_source(
    raw: &RawValue,
    sink: &mut dyn FnMut(&str),
    depth: usize,
) -> Result<(), Unreadable> {
    let source: Source<'_> = serde_json::from_str(raw.get()).map_err(|_| Unreadable)?;
    match source.kind.and_then(string).as_deref() {
        Some("text") => source
            .data
            .map_or(Ok(()), |data| collect_string(data, sink)),
        Some("content") => source
            .content
            .map_or(Ok(()), |content| collect_nested(content, sink, depth + 1)),
        _ => Ok(()),
    }
}

/// Sends a JSON string to `sink`; other values hold no text. A lone surrogate
/// escape, which a Rust string cannot hold, is read as U+FFFD, so the text around
/// it is still scanned.
fn collect_string(raw: &RawValue, sink: &mut dyn FnMut(&str)) -> Result<(), Unreadable> {
    if !raw.get().starts_with('"') {
        return Ok(());
    }
    let text = string(raw)
        .or_else(|| lossy_string(raw.get()).map(Cow::Owned))
        .ok_or(Unreadable)?;
    sink(&text);
    Ok(())
}

fn lossy_string(raw: &str) -> Option<String> {
    let mut repaired = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(index) = rest.find('\\') {
        let (before, escape) = rest.split_at(index);
        repaired.push_str(before);
        let surrogate = escape
            .get(2..6)
            .filter(|_| escape.as_bytes().get(1) == Some(&b'u'))
            .and_then(|hex| u16::from_str_radix(hex, 16).ok())
            .is_some_and(|unit| (0xD800..=0xDFFF).contains(&unit));
        let (kept, next) = if surrogate {
            ("\\ufffd", escape.get(6..)?)
        } else {
            (escape.get(..2)?, escape.get(2..)?)
        };
        repaired.push_str(kept);
        rest = next;
    }
    repaired.push_str(rest);
    serde_json::from_str(&repaired).ok()
}

/// Calls `visit` with each value of the JSON object `raw`, duplicated keys included.
pub(crate) fn for_each_value<'a>(
    raw: &'a str,
    visit: impl FnMut(&'a RawValue) -> Result<(), Unreadable>,
) -> Result<(), Unreadable> {
    struct Values<F>(F);

    impl<'de, F: FnMut(&'de RawValue) -> Result<(), Unreadable>> Visitor<'de> for Values<F> {
        type Value = ();

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a JSON object")
        }

        fn visit_map<A: MapAccess<'de>>(mut self, mut entries: A) -> Result<(), A::Error> {
            while let Some((_, value)) = entries.next_entry::<IgnoredAny, &'de RawValue>()? {
                (self.0)(value).map_err(|_| A::Error::custom("unreadable value"))?;
            }
            Ok(())
        }
    }

    let mut deserializer = serde_json::Deserializer::from_str(raw);
    serde::Deserializer::deserialize_map(&mut deserializer, Values(visit))
        .and_then(|()| deserializer.end())
        .map_err(|_| Unreadable)
}

/// Calls `visit` with each item of the JSON array `raw`, without collecting them.
pub(crate) fn for_each<'a, T: Deserialize<'a>>(
    raw: &'a str,
    visit: impl FnMut(T) -> Result<(), Unreadable>,
) -> Result<(), Unreadable> {
    struct Each<F, T>(F, PhantomData<T>);

    impl<'de, T: Deserialize<'de>, F: FnMut(T) -> Result<(), Unreadable>> Visitor<'de> for Each<F, T> {
        type Value = ();

        fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
            formatter.write_str("a JSON array")
        }

        fn visit_seq<A: SeqAccess<'de>>(mut self, mut items: A) -> Result<(), A::Error> {
            while let Some(item) = items.next_element::<T>()? {
                (self.0)(item).map_err(|_| A::Error::custom("unreadable item"))?;
            }
            Ok(())
        }
    }

    let mut deserializer = serde_json::Deserializer::from_str(raw);
    serde::Deserializer::deserialize_seq(&mut deserializer, Each(visit, PhantomData))
        .and_then(|()| deserializer.end())
        .map_err(|_| Unreadable)
}

/// Reads the text of one conversation item.
pub(crate) type ReadItem = fn(&RawValue, &mut dyn FnMut(&str)) -> Result<(), Unreadable>;

/// Where a request's last turn is: whole members, and conversation items from an
/// offset on. Finding it reads the conversation's structure; reading its text is a
/// separate step, so the caller can size the scan first.
#[derive(Debug, Default)]
pub(crate) struct LastTurn {
    parts: Vec<TurnPart>,
    bytes: usize,
}

#[derive(Debug)]
enum TurnPart {
    /// A whole member, read by `read`.
    Member {
        member: &'static str,
        read: ReadItem,
    },
    /// The items of a member's array from byte `start` on, each read by `read`.
    Items {
        member: &'static str,
        start: usize,
        read: ReadItem,
    },
}

impl LastTurn {
    /// Bytes of JSON the scan reads.
    pub(crate) fn bytes(&self) -> usize {
        self.bytes
    }

    /// Adds all of member `name`, whose JSON is `raw`.
    pub(crate) fn member(&mut self, name: &'static str, raw: &str) {
        self.member_with(name, raw, collect);
    }

    /// Adds member `name`, whose JSON is `raw`, read by `read`.
    pub(crate) fn member_with(&mut self, name: &'static str, raw: &str, read: ReadItem) {
        self.parts.push(TurnPart::Member { member: name, read });
        self.bytes += raw.len();
    }

    /// Adds the last turn of the conversation in member `name`: every item after
    /// the last `is_boundary` item (a model turn) that precedes a non-boundary
    /// item. Trailing boundary items, such as an assistant prefill, belong to it
    /// too, so the newest caller message is never skipped. Returns whether an
    /// earlier model turn exists.
    pub(crate) fn items<'a, T: Deserialize<'a>>(
        &mut self,
        name: &'static str,
        raw: &'a str,
        is_boundary: impl Fn(&T) -> bool,
        read: ReadItem,
    ) -> Result<bool, Unreadable> {
        let mut first = None;
        let mut after_boundary = None;
        let mut previous_was_boundary = false;
        let mut turn_start = None;
        for_each(raw, |item: &'a RawValue| {
            let offset = item.get().as_ptr().addr() - raw.as_ptr().addr();
            first.get_or_insert(offset);
            if previous_was_boundary {
                after_boundary = Some(offset);
            }
            let parsed: T = serde_json::from_str(item.get()).map_err(|_| Unreadable)?;
            previous_was_boundary = is_boundary(&parsed);
            if !previous_was_boundary {
                turn_start = after_boundary;
            }
            Ok(())
        })?;
        let start = turn_start.or(first).unwrap_or(raw.len());
        self.parts.push(TurnPart::Items {
            member: name,
            start,
            read,
        });
        self.bytes += raw.len() - start;
        Ok(turn_start.is_some())
    }

    /// Sends the last turn's text to `sink`, reading the members `member` returns.
    pub(crate) fn read<'a>(
        &self,
        member: impl Fn(&str) -> Option<&'a str>,
        sink: &mut dyn FnMut(&str),
    ) -> Result<(), Unreadable> {
        for part in &self.parts {
            match *part {
                TurnPart::Member { member: name, read } => {
                    let Some(raw) = member(name) else { continue };
                    let raw: &RawValue = serde_json::from_str(raw).map_err(|_| Unreadable)?;
                    read(raw, sink)?;
                }
                TurnPart::Items {
                    member: name,
                    start,
                    read,
                } => {
                    let Some(raw) = member(name) else { continue };
                    let mut rest = raw.get(start..).ok_or(Unreadable)?.trim_start();
                    // The array was validated when the turn was found, so the
                    // items from `start` are values separated by commas up to `]`.
                    while !rest.is_empty() && !rest.starts_with(']') {
                        let mut items =
                            serde_json::Deserializer::from_str(rest).into_iter::<&RawValue>();
                        let item = items.next().ok_or(Unreadable)?.map_err(|_| Unreadable)?;
                        read(item, sink)?;
                        rest = rest
                            .get(items.byte_offset()..)
                            .ok_or(Unreadable)?
                            .trim_start();
                        rest = rest.strip_prefix(',').unwrap_or(rest).trim_start();
                    }
                }
            }
        }
        Ok(())
    }
}

/// A JSON string, borrowed when it has no escapes.
pub(crate) fn string(raw: &RawValue) -> Option<Cow<'_, str>> {
    serde_json::from_str::<&str>(raw.get())
        .map(Cow::Borrowed)
        .or_else(|_| serde_json::from_str::<String>(raw.get()).map(Cow::Owned))
        .ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(json: &str) -> Result<Vec<String>, Unreadable> {
        let raw: &RawValue = serde_json::from_str(json).unwrap();
        let mut texts = Vec::new();
        collect(raw, &mut |text| texts.push(text.to_owned()))?;
        Ok(texts)
    }

    #[test]
    fn strings_parts_and_nested_tool_results_are_text() {
        assert_eq!(texts(r#""plain \u00e9""#).unwrap(), ["plain é"]);
        assert_eq!(
            texts(
                r#"[{"type":"text","text":"a"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}},"b",3,
                {"type":"tool_result","tool_use_id":"t","content":[{"type":"text","text":"c"}]},
                {"type":"tool_result","content":"d"}]"#
            )
            .unwrap(),
            ["a", "b", "c", "d"]
        );
        assert!(texts("42").unwrap().is_empty());
        assert!(texts(r#"{"text":"not a list"}"#).unwrap().is_empty());
    }

    #[test]
    fn a_lone_surrogate_escape_is_read_lossily() {
        assert_eq!(
            texts(r#""ssn 123-45-6789 \ud83d""#).unwrap(),
            ["ssn 123-45-6789 \u{fffd}"]
        );
        assert_eq!(
            texts(r#"[{"type":"text","text":"\udc00 card"}]"#).unwrap(),
            ["\u{fffd} card"]
        );
        // An escaped backslash before `u` is text, not an escape.
        assert_eq!(texts(r#""\\ud83d""#).unwrap(), ["\\ud83d"]);
    }

    #[test]
    fn plain_text_documents_are_text() {
        assert_eq!(
            texts(
                r#"[{"type":"document","source":{"type":"text","media_type":"text/plain","data":"a"}},
                {"type":"document","source":{"type":"content","content":[{"type":"text","text":"b"}]}},
                {"type":"document","source":{"type":"base64","media_type":"application/pdf","data":"JVBERi0="}}]"#
            )
            .unwrap(),
            ["a", "b"]
        );
    }

    fn read_role(item: &RawValue, sink: &mut dyn FnMut(&str)) -> Result<(), Unreadable> {
        collect(item, sink)
    }

    fn turn(raw: &str) -> (Vec<String>, usize) {
        let mut turn = LastTurn::default();
        turn.items(
            "messages",
            raw,
            |role: &&str| *role == "assistant",
            read_role,
        )
        .unwrap();
        let mut roles = Vec::new();
        turn.read(|_| Some(raw), &mut |role| roles.push(role.to_owned()))
            .unwrap();
        (roles, turn.bytes())
    }

    #[test]
    fn the_last_turn_starts_after_the_model_turn_before_the_newest_caller_item() {
        assert_eq!(
            turn(r#"["user","assistant","tool","tool"]"#).0,
            ["tool", "tool"]
        );
        // An assistant prefill follows the newest user message.
        assert_eq!(
            turn(r#"["user","assistant","user","assistant"]"#).0,
            ["user", "assistant"]
        );
        assert_eq!(turn(r#"["user"]"#).0, ["user"]);
        assert!(turn("[]").0.is_empty());
    }

    #[test]
    fn a_turn_is_sized_by_its_own_items_not_the_conversation() {
        let history = "x".repeat(100_000);
        let raw = format!(r#"[ "{history}" , "assistant" , "user" ]"#);
        assert_eq!(turn(&raw), (vec!["user".to_owned()], r#""user" ]"#.len()));
    }

    #[test]
    fn a_part_with_a_duplicated_field_is_unreadable() {
        assert!(texts(r#"[{"type":"text","text":"a","text":"123-45-6789"}]"#).is_err());
    }
}
