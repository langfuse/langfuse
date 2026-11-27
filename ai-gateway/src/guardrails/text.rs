//! Finding a request's last turn, and reading its text along the format's
//! [`spec`](super::spec) trees.
use std::{borrow::Cow, fmt, marker::PhantomData};

use serde::{
    Deserialize,
    de::{Error as _, IgnoredAny, MapAccess, SeqAccess, Visitor},
};
use serde_json::value::RawValue;

use super::spec::{CONTENT, Node, walker::read_leaves};

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
    /// Read by [`super::spec::ROLE_MESSAGE`]; declared so that a duplicated
    /// `content` makes the conversation unreadable even where it is not read.
    #[serde(borrow, default, rename = "content")]
    _content: Option<&'a RawValue>,
}

/// An `assistant` message is the model's; every other role is a caller message.
pub(crate) fn classify_role_message(item: &RawValue) -> Result<TurnItem, Unreadable> {
    let message = object_item::<RoleMessage<'_>>(item)?;
    Ok(
        if message.role.and_then(string).as_deref() == Some("assistant") {
            TurnItem::Model
        } else {
            TurnItem::Message
        },
    )
}

/// A conversation item, which is an object. Serde would also read an array into
/// the struct positionally, as text the spec trees never scan, so any other value
/// is unreadable.
pub(crate) fn object_item<'a, T: Deserialize<'a>>(item: &'a RawValue) -> Result<T, Unreadable> {
    if !item.get().starts_with('{') {
        return Err(Unreadable);
    }
    serde_json::from_str(item.get()).map_err(|_| Unreadable)
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
        read: &'static Node,
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
        read: &'static Node,
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
        self.push_member_with(name, raw, &CONTENT);
    }

    /// Adds all of member `name`, whose JSON is `raw`, as earlier-turn input
    /// (scanned only by guardrails with `entire_input` scope).
    pub(crate) fn push_earlier_member(&mut self, name: &'static str, raw: &str) {
        self.parts.push(TurnPart::Member {
            member: name,
            read: &CONTENT,
            in_last_turn: false,
        });
        self.entire_bytes += raw.len();
    }

    /// Adds member `name`, whose JSON is `raw`, read by `read`.
    pub(crate) fn push_member_with(&mut self, name: &'static str, raw: &str, read: &'static Node) {
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
        read: &'static Node,
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
                    read_leaves(read, raw, &mut |leaf| {
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
                            read_leaves(read, item.get(), &mut |leaf| {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn texts(json: &str) -> Result<Vec<String>, Unreadable> {
        let mut texts = Vec::new();
        read_leaves(&CONTENT, json, &mut |leaf| texts.push(leaf.text.to_owned()))?;
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
        turn.push_items("messages", raw, classify_role, &CONTENT)
            .unwrap();
        let mut roles = Vec::new();
        turn.read(
            &crate::guardrails::spec::Members::new(&["messages"], &|_| Some(raw)),
            &mut |role| {
                roles.push(role.to_owned());
            },
        )
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
