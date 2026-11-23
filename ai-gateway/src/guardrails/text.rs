//! Reading text out of the shapes API formats share: a string, or an array of
//! strings and parts whose `text` is a string. Tool results nest their own content.
//! Arrays are walked item by item and each text goes straight to a sink, so a
//! body of millions of short strings allocates nothing per string.
use std::{borrow::Cow, fmt, marker::PhantomData};

use serde::{
    Deserialize,
    de::{Error as _, SeqAccess, Visitor},
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

fn collect_nested(
    raw: &RawValue,
    sink: &mut dyn FnMut(&str),
    depth: usize,
) -> Result<(), Unreadable> {
    match raw.get().as_bytes().first() {
        Some(b'"') => {
            if let Some(text) = string(raw) {
                sink(&text);
            }
            Ok(())
        }
        Some(b'[') if depth <= MAX_NESTING => for_each(raw.get(), |item: &RawValue| {
            match item.get().as_bytes().first() {
                Some(b'"') => collect_nested(item, sink, depth),
                Some(b'{') => {
                    let part: Part<'_> =
                        serde_json::from_str(item.get()).map_err(|_| Unreadable)?;
                    if let Some(text) = part.text.and_then(string) {
                        sink(&text);
                    }
                    if let Some(source) = part.source.filter(|source| source.get().starts_with('{'))
                    {
                        let source: Source<'_> =
                            serde_json::from_str(source.get()).map_err(|_| Unreadable)?;
                        match source.kind.and_then(string).as_deref() {
                            Some("text") => {
                                if let Some(text) = source.data.and_then(string) {
                                    sink(&text);
                                }
                            }
                            Some("content") => {
                                if let Some(content) = source.content {
                                    collect_nested(content, sink, depth + 1)?;
                                }
                            }
                            _ => {}
                        }
                    }
                    part.content
                        .map_or(Ok(()), |content| collect_nested(content, sink, depth + 1))
                }
                _ => Ok(()),
            }
        }),
        _ => Ok(()),
    }
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

/// Visits the last turn of the conversation `raw`: every item after the last
/// `is_boundary` item (a model turn) that precedes a non-boundary item. Trailing
/// boundary items, such as an assistant prefill, are visited too, so the newest
/// caller message is never skipped. Two passes, so no item is kept. Returns
/// whether an earlier model turn exists.
pub(crate) fn for_each_in_last_turn<'a, T: Deserialize<'a>>(
    raw: &'a str,
    is_boundary: impl Fn(&T) -> bool,
    mut visit: impl FnMut(T) -> Result<(), Unreadable>,
) -> Result<bool, Unreadable> {
    let mut index = 0usize;
    let mut last_boundary = None;
    let mut turn_boundary = None;
    for_each(raw, |item: T| {
        if is_boundary(&item) {
            last_boundary = Some(index);
        } else {
            turn_boundary = last_boundary;
        }
        index += 1;
        Ok(())
    })?;
    let start = turn_boundary.map_or(0, |boundary| boundary + 1);
    let mut index = 0usize;
    for_each(raw, |item: T| {
        index += 1;
        if index > start { visit(item) } else { Ok(()) }
    })?;
    Ok(turn_boundary.is_some())
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

    #[test]
    fn the_last_turn_starts_after_the_model_turn_before_the_newest_caller_item() {
        let turn = |raw: &str| {
            let mut roles = Vec::new();
            for_each_in_last_turn(
                raw,
                |role: &&str| *role == "assistant",
                |role: &str| {
                    roles.push(role.to_owned());
                    Ok(())
                },
            )
            .unwrap();
            roles
        };
        assert_eq!(
            turn(r#"["user","assistant","tool","tool"]"#),
            ["tool", "tool"]
        );
        // An assistant prefill follows the newest user message.
        assert_eq!(
            turn(r#"["user","assistant","user","assistant"]"#),
            ["user", "assistant"]
        );
        assert_eq!(turn(r#"["user"]"#), ["user"]);
    }

    #[test]
    fn a_part_with_a_duplicated_field_is_unreadable() {
        assert!(texts(r#"[{"type":"text","text":"a","text":"123-45-6789"}]"#).is_err());
    }
}
