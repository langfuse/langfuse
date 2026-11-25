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

/// One decoded JSON string leaf together with its raw JSON literal slice in the
/// caller's request body.
#[derive(Clone, Copy, Debug)]
pub(crate) struct TextLeaf<'a> {
    pub raw: &'a str,
    pub text: &'a str,
}

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
pub(crate) fn collect(
    raw: &RawValue,
    sink: &mut dyn FnMut(TextLeaf<'_>),
) -> Result<(), Unreadable> {
    collect_nested(raw, sink, 0)
}

/// Sends the text of one content part to `sink`.
pub(crate) fn collect_part(
    raw: &RawValue,
    sink: &mut dyn FnMut(TextLeaf<'_>),
) -> Result<(), Unreadable> {
    collect_part_nested(raw, sink, 0)
}

fn collect_nested(
    raw: &RawValue,
    sink: &mut dyn FnMut(TextLeaf<'_>),
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
    sink: &mut dyn FnMut(TextLeaf<'_>),
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
    sink: &mut dyn FnMut(TextLeaf<'_>),
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

/// Sends a JSON string to `sink`; other values hold no text. A string a Rust
/// string cannot hold, such as one with a lone surrogate escape, is unreadable.
fn collect_string(raw: &RawValue, sink: &mut dyn FnMut(TextLeaf<'_>)) -> Result<(), Unreadable> {
    if !raw.get().starts_with('"') {
        return Ok(());
    }
    let decoded = string(raw).ok_or(Unreadable)?;
    sink(TextLeaf {
        raw: raw.get(),
        text: &decoded,
    });
    Ok(())
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

/// A conversation message with a `role` and `content`, as in Chat Completions and
/// Anthropic Messages.
#[derive(Deserialize)]
struct RoleMessage<'a> {
    #[serde(borrow, default)]
    role: Option<&'a RawValue>,
    #[serde(borrow, default)]
    content: Option<&'a RawValue>,
}

/// An `assistant` message is the model's; every other role is a caller message.
pub(crate) fn classify_role_message(item: &RawValue) -> Result<TurnItem, Unreadable> {
    let message: RoleMessage<'_> = serde_json::from_str(item.get()).map_err(|_| Unreadable)?;
    Ok(
        if message.role.and_then(string).as_deref() == Some("assistant") {
            TurnItem::Model
        } else {
            TurnItem::Message
        },
    )
}

pub(crate) fn read_role_message(
    item: &RawValue,
    sink: &mut dyn FnMut(TextLeaf<'_>),
) -> Result<(), Unreadable> {
    let message: RoleMessage<'_> = serde_json::from_str(item.get()).map_err(|_| Unreadable)?;
    message
        .content
        .map_or(Ok(()), |content| collect(content, sink))
}

/// Who produced a conversation item.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum TurnItem {
    /// From the model: a reply, reasoning or a tool call.
    Model,
    /// A user, system or developer message.
    Message,
    /// A tool output or other caller item that answers the model.
    Output,
}

/// Tells who produced one conversation item.
pub(crate) type ClassifyItem = fn(&RawValue) -> Result<TurnItem, Unreadable>;

/// Reads the text leaves of one conversation item.
pub(crate) type ReadItem = fn(&RawValue, &mut dyn FnMut(TextLeaf<'_>)) -> Result<(), Unreadable>;

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
    /// Model items before byte `tail` are skipped: only trailing ones, such as an
    /// assistant prefill, come from the caller.
    Items {
        member: &'static str,
        start: usize,
        tail: usize,
        classify: ClassifyItem,
        read: ReadItem,
    },
}

impl LastTurn {
    /// Bytes of JSON the scan reads.
    pub(crate) fn bytes(&self) -> usize {
        self.bytes
    }

    /// Adds all of member `name`, whose JSON is `raw`.
    pub(crate) fn push_member(&mut self, name: &'static str, raw: &str) {
        self.push_member_with(name, raw, collect);
    }

    /// Adds member `name`, whose JSON is `raw`, read by `read`.
    pub(crate) fn push_member_with(&mut self, name: &'static str, raw: &str, read: ReadItem) {
        self.parts.push(TurnPart::Member { member: name, read });
        self.bytes += raw.len();
    }

    /// Adds the last turn of the conversation in member `name`: the caller items
    /// after the last message the model answered before a later caller item, and
    /// any model items after the last caller item, such as an assistant prefill.
    /// Tool outputs of the newest calls belong to it however they interleave with
    /// the calls; in a tool loop without model replies, outputs since the last
    /// message are read again, since a stateless request cannot tell them apart.
    /// Returns whether the model spoke before the newest caller item.
    pub(crate) fn push_items(
        &mut self,
        name: &'static str,
        raw: &str,
        classify: ClassifyItem,
        read: ReadItem,
    ) -> Result<bool, Unreadable> {
        let mut first = None;
        let mut start = None;
        let mut tail = None;
        let mut after_message = None;
        let mut model_since_message = false;
        let mut model_seen = false;
        let mut model_before_caller = false;
        for_each(raw, |item: &RawValue| {
            let offset = item.get().as_ptr().addr() - raw.as_ptr().addr();
            let end = offset + item.get().len();
            first.get_or_insert(offset);
            let kind = classify(item)?;
            if kind == TurnItem::Model {
                model_since_message = true;
                model_seen = true;
                return Ok(());
            }
            if model_since_message && after_message.is_some() {
                start = after_message;
            }
            if kind == TurnItem::Message {
                after_message = Some(end);
                model_since_message = false;
            }
            tail = Some(end);
            model_before_caller = model_seen;
            Ok(())
        })?;
        let start = start.or(first).unwrap_or(raw.len());
        self.parts.push(TurnPart::Items {
            member: name,
            start,
            tail: tail.unwrap_or(start),
            classify,
            read,
        });
        self.bytes += raw.len() - start;
        Ok(model_before_caller)
    }

    /// Sends the last turn's text leaves (raw JSON slice + decoded text) to
    /// `sink`, reading the members `member` returns.
    pub(crate) fn read_leaves<'a>(
        &self,
        member: impl Fn(&str) -> Option<&'a str>,
        sink: &mut dyn FnMut(TextLeaf<'_>),
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
                    tail,
                    classify,
                    read,
                } => {
                    let Some(raw) = member(name) else { continue };
                    let rest = raw.get(start..).ok_or(Unreadable)?.trim_start();
                    let mut rest = rest.strip_prefix(',').unwrap_or(rest).trim_start();
                    // The array was validated when the turn was found, so the
                    // items from `start` are values separated by commas up to `]`.
                    while !rest.is_empty() && !rest.starts_with(']') {
                        let mut items =
                            serde_json::Deserializer::from_str(rest).into_iter::<&RawValue>();
                        let item = items.next().ok_or(Unreadable)?.map_err(|_| Unreadable)?;
                        let offset = item.get().as_ptr().addr() - raw.as_ptr().addr();
                        if offset >= tail || classify(item)? != TurnItem::Model {
                            read(item, sink)?;
                        }
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

    /// Sends the conversation items skipped by [`Self::read_leaves`] (earlier
    /// turns and pre-tail model items) to `sink`, so local `redact` guardrails
    /// also scrub previously sent history that stateless clients resend.
    pub(crate) fn read_earlier_leaves<'a>(
        &self,
        member: impl Fn(&str) -> Option<&'a str>,
        sink: &mut dyn FnMut(TextLeaf<'_>),
    ) -> Result<(), Unreadable> {
        for part in &self.parts {
            let TurnPart::Items {
                member: name,
                start,
                tail,
                classify,
                read,
            } = *part
            else {
                continue;
            };
            let Some(raw) = member(name) else { continue };
            for_each(raw, |item: &RawValue| {
                let offset = item.get().as_ptr().addr() - raw.as_ptr().addr();
                if offset < start || (offset < tail && classify(item)? == TurnItem::Model) {
                    read(item, sink)?;
                }
                Ok(())
            })?;
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn read<'a>(
        &self,
        member: impl Fn(&str) -> Option<&'a str>,
        sink: &mut dyn FnMut(&str),
    ) -> Result<(), Unreadable> {
        self.read_leaves(member, &mut |leaf| sink(leaf.text))
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
        collect(raw, &mut |leaf| texts.push(leaf.text.to_owned()))?;
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
    fn a_lone_surrogate_escape_is_unreadable() {
        assert!(texts(r#""ssn 123-45-6789 \ud83d""#).is_err());
        assert!(texts(r#"[{"type":"text","text":"\udc00 card"}]"#).is_err());
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

    fn read_role(item: &RawValue, sink: &mut dyn FnMut(TextLeaf<'_>)) -> Result<(), Unreadable> {
        collect(item, sink)
    }

    fn classify_role(item: &RawValue) -> Result<TurnItem, Unreadable> {
        let role: &str = serde_json::from_str(item.get()).map_err(|_| Unreadable)?;
        Ok(match role {
            "assistant" | "call" => TurnItem::Model,
            "tool" => TurnItem::Output,
            _ => TurnItem::Message,
        })
    }

    fn turn(raw: &str) -> (Vec<String>, usize) {
        let mut turn = LastTurn::default();
        turn.push_items("messages", raw, classify_role, read_role)
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
        assert_eq!(
            turn(&raw),
            (
                vec!["user".to_owned()],
                r#" , "assistant" , "user" ]"#.len()
            )
        );
    }

    #[test]
    fn a_part_with_a_duplicated_field_is_unreadable() {
        assert!(texts(r#"[{"type":"text","text":"a","text":"123-45-6789"}]"#).is_err());
    }
}
