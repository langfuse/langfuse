//! Text in the shapes API formats share: a string, or an array of strings and parts
//! whose `text` is a string. Tool results nest their own content. Values in any other
//! shape hold no text to scan; the provider rejects a request it cannot read.
use std::borrow::Cow;

use serde::Deserialize;
use serde_json::value::RawValue;

/// Tool results nest content once (Anthropic `tool_result` blocks); deeper nesting
/// is not a shape any format defines.
const MAX_NESTING: usize = 2;

#[derive(Deserialize)]
struct Part<'a> {
    #[serde(borrow, default)]
    text: Option<&'a RawValue>,
    #[serde(borrow, default)]
    content: Option<&'a RawValue>,
}

/// Pushes the text in `raw`; skips images, files and other non-text parts without
/// copying them.
pub(crate) fn collect<'a>(raw: &'a RawValue, texts: &mut Vec<Cow<'a, str>>) {
    collect_nested(raw, texts, 0);
}

fn collect_nested<'a>(raw: &'a RawValue, texts: &mut Vec<Cow<'a, str>>, depth: usize) {
    match raw.get().as_bytes().first() {
        Some(b'"') => texts.extend(string(raw)),
        Some(b'[') if depth <= MAX_NESTING => {
            let Ok(items) = serde_json::from_str::<Vec<&RawValue>>(raw.get()) else {
                return;
            };
            for item in items {
                match item.get().as_bytes().first() {
                    Some(b'"') => texts.extend(string(item)),
                    Some(b'{') => {
                        let Ok(part) = serde_json::from_str::<Part<'_>>(item.get()) else {
                            continue;
                        };
                        texts.extend(part.text.and_then(string));
                        if let Some(content) = part.content {
                            collect_nested(content, texts, depth + 1);
                        }
                    }
                    _ => {}
                }
            }
        }
        _ => {}
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

    fn texts(json: &str) -> Vec<String> {
        let raw: &RawValue = serde_json::from_str(json).unwrap();
        let mut texts = Vec::new();
        collect(raw, &mut texts);
        texts.into_iter().map(Cow::into_owned).collect()
    }

    #[test]
    fn strings_parts_and_nested_tool_results_are_text() {
        assert_eq!(texts(r#""plain \u00e9""#), ["plain é"]);
        assert_eq!(
            texts(
                r#"[{"type":"text","text":"a"},{"type":"image_url","image_url":{"url":"data:image/png;base64,AAAA"}},"b",3,
                {"type":"tool_result","tool_use_id":"t","content":[{"type":"text","text":"c"}]},
                {"type":"tool_result","content":"d"}]"#
            ),
            ["a", "b", "c", "d"]
        );
        assert!(texts("42").is_empty());
        assert!(texts(r#"{"text":"not a list"}"#).is_empty());
    }
}
