#![expect(dead_code, reason = "test-only copy of the previous request readers")]
use std::{borrow::Cow, fmt, marker::PhantomData};

use serde::{
    Deserialize,
    de::{Error as _, IgnoredAny, MapAccess, SeqAccess, Visitor},
};
use serde_json::value::RawValue;

/// Tool results nest content once (Anthropic `tool_result` blocks); deeper nesting
/// is not a shape any format defines.
const MAX_NESTING: usize = 2;

pub(crate) use crate::guardrails::text::Unreadable;

pub(crate) use crate::guardrails::text::TextLeaf;

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

/// Where a request's last turn and full input sit: whole members, and
/// conversation items from an offset on. Finding it reads the conversation's
/// structure; reading its text is a separate step, so the caller can size the
/// scan first.
#[derive(Debug, Default)]
pub(crate) struct LastTurn {
    parts: Vec<TurnPart>,
    bytes: usize,
    entire_bytes: usize,
}

#[derive(Debug)]
enum TurnPart {
    /// A whole member, read by `read`. `in_last_turn` is `false` for resent
    /// top-level prompts (`system` / `instructions`) after the first turn.
    Member {
        member: &'static str,
        read: ReadItem,
        in_last_turn: bool,
    },
    /// The items of a member's array: `first` starts the entire array, while
    /// `start` starts the last turn. Model items before byte `tail` are skipped
    /// for last-turn-only scans: only trailing ones, such as an assistant
    /// prefill, come from the caller.
    Items {
        member: &'static str,
        first: usize,
        start: usize,
        tail: usize,
        classify: ClassifyItem,
        read: ReadItem,
    },
}

impl LastTurn {
    /// Bytes of JSON the scan reads for the requested scope.
    pub(crate) fn bytes_for_scope(&self, entire_input: bool) -> usize {
        if entire_input {
            self.entire_bytes
        } else {
            self.bytes
        }
    }

    #[cfg(test)]
    pub(crate) fn bytes(&self) -> usize {
        self.bytes
    }

    /// Adds all of member `name`, whose JSON is `raw`, as part of the last turn.
    pub(crate) fn push_member(&mut self, name: &'static str, raw: &str) {
        self.push_member_with(name, raw, collect);
    }

    /// Adds all of member `name`, whose JSON is `raw`, as earlier-turn input
    /// (scanned only by guardrails with `entire_input` scope).
    pub(crate) fn push_earlier_member(&mut self, name: &'static str, raw: &str) {
        self.parts.push(TurnPart::Member {
            member: name,
            read: collect,
            in_last_turn: false,
        });
        self.entire_bytes += raw.len();
    }

    /// Adds member `name`, whose JSON is `raw`, read by `read`.
    pub(crate) fn push_member_with(&mut self, name: &'static str, raw: &str, read: ReadItem) {
        self.parts.push(TurnPart::Member {
            member: name,
            read,
            in_last_turn: true,
        });
        self.bytes += raw.len();
        self.entire_bytes += raw.len();
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
        let first_offset = first.unwrap_or(raw.len());
        let start = start.or(first).unwrap_or(raw.len());
        self.parts.push(TurnPart::Items {
            member: name,
            first: first_offset,
            start,
            tail: tail.unwrap_or(start),
            classify,
            read,
        });
        self.bytes += raw.len() - start;
        self.entire_bytes += raw.len() - first_offset;
        Ok(model_before_caller)
    }

    /// Sends text leaves (raw JSON slice + decoded text) together with whether
    /// each leaf belongs to the last turn. When `include_entire_input` is
    /// `false`, earlier items and resent system prompts are skipped completely.
    /// Returning `false` from `sink` stops walking early.
    pub(crate) fn read_scoped_leaves(
        &self,
        members: &crate::guardrails::spec::Members<'_, '_>,
        include_entire_input: bool,
        sink: &mut dyn FnMut(TextLeaf<'_>, bool) -> bool,
    ) -> Result<(), Unreadable> {
        let mut keep_going = true;
        for part in &self.parts {
            if !keep_going {
                break;
            }
            match *part {
                TurnPart::Member {
                    member: name,
                    read,
                    in_last_turn,
                } => {
                    if !include_entire_input && !in_last_turn {
                        continue;
                    }
                    let Some(raw) = members.get(name)? else {
                        continue;
                    };
                    let raw: &RawValue = serde_json::from_str(raw).map_err(|_| Unreadable)?;
                    read(raw, &mut |leaf| {
                        if keep_going {
                            keep_going = sink(leaf, in_last_turn);
                        }
                    })?;
                }
                TurnPart::Items {
                    member: name,
                    first,
                    start,
                    tail,
                    classify,
                    read,
                } => {
                    let Some(raw) = members.get(name)? else {
                        continue;
                    };
                    let begin = if include_entire_input { first } else { start };
                    let rest = raw.get(begin..).ok_or(Unreadable)?.trim_start();
                    let mut rest = rest.strip_prefix(',').unwrap_or(rest).trim_start();
                    // The array was validated when the turn was found, so the
                    // items from `begin` are values separated by commas up to `]`.
                    while keep_going && !rest.is_empty() && !rest.starts_with(']') {
                        let mut items =
                            serde_json::Deserializer::from_str(rest).into_iter::<&RawValue>();
                        let item = items.next().ok_or(Unreadable)?.map_err(|_| Unreadable)?;
                        let offset = item.get().as_ptr().addr() - raw.as_ptr().addr();
                        let in_last_turn = offset >= start
                            && (offset >= tail || classify(item)? != TurnItem::Model);
                        if include_entire_input || in_last_turn {
                            read(item, &mut |leaf| {
                                if keep_going {
                                    keep_going = sink(leaf, in_last_turn);
                                }
                            })?;
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

    #[cfg(test)]
    pub(crate) fn read_leaves(
        &self,
        members: &crate::guardrails::spec::Members<'_, '_>,
        sink: &mut dyn FnMut(TextLeaf<'_>),
    ) -> Result<(), Unreadable> {
        self.read_scoped_leaves(members, false, &mut |leaf, _| {
            sink(leaf);
            true
        })
    }

    #[cfg(test)]
    pub(crate) fn read(
        &self,
        members: &crate::guardrails::spec::Members<'_, '_>,
        sink: &mut dyn FnMut(&str),
    ) -> Result<(), Unreadable> {
        self.read_leaves(members, &mut |leaf| sink(leaf.text))
    }
}

/// A JSON string, borrowed when it has no escapes.
pub(crate) fn string(raw: &RawValue) -> Option<Cow<'_, str>> {
    serde_json::from_str::<&str>(raw.get())
        .map(Cow::Borrowed)
        .or_else(|_| serde_json::from_str::<String>(raw.get()).map(Cow::Owned))
        .ok()
}
