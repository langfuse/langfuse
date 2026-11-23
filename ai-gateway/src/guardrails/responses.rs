//! Responses takes `input` as a string or a list of items, and the system prompt as
//! `instructions`. The last turn is every item after the last one the model
//! produced (an assistant message, a tool call or reasoning): the user's message or
//! the outputs of the model's tool calls. Instructions count only on the first turn.
use std::borrow::Cow;

use serde::Deserialize;
use serde_json::value::RawValue;

use super::text;

pub(super) const MEMBERS: &[&str] = &["input", "instructions"];

#[derive(Deserialize)]
struct Item<'a> {
    #[serde(borrow, default, rename = "type")]
    kind: Option<&'a RawValue>,
    #[serde(borrow, default)]
    role: Option<&'a RawValue>,
    #[serde(borrow, default)]
    content: Option<&'a RawValue>,
    /// The result of a tool call, in `*_call_output` items.
    #[serde(borrow, default)]
    output: Option<&'a RawValue>,
}

impl Item<'_> {
    /// Items the model produced: its messages, its tool calls (`function_call`,
    /// `web_search_call`, `mcp_call`, ...) and its reasoning.
    fn is_from_model(&self) -> bool {
        let role = self.role.and_then(text::string);
        let kind = self.kind.and_then(text::string);
        let kind = kind.as_deref().unwrap_or_default();
        role.as_deref() == Some("assistant")
            || kind == "reasoning"
            || kind.ends_with("_call")
            || (kind.starts_with("mcp_") && kind != "mcp_approval_response")
    }
}

pub(super) fn last_turn<'a>(
    member: impl Fn(&str) -> Option<&'a str>,
    texts: &mut Vec<Cow<'a, str>>,
) {
    let input = member("input").and_then(|raw| serde_json::from_str::<&RawValue>(raw).ok());
    let items = input
        .filter(|input| input.get().starts_with('['))
        .and_then(|input| serde_json::from_str::<Vec<Item<'a>>>(input.get()).ok())
        .unwrap_or_default();
    let last_from_model = items.iter().rposition(Item::is_from_model);
    if last_from_model.is_none()
        && let Some(instructions) =
            member("instructions").and_then(|raw| serde_json::from_str::<&RawValue>(raw).ok())
    {
        text::collect(instructions, texts);
    }
    if let Some(input) = input.filter(|input| input.get().starts_with('"')) {
        texts.extend(text::string(input));
        return;
    }
    let start = last_from_model.map_or(0, |index| index + 1);
    for item in &items[start..] {
        for value in [item.content, item.output].into_iter().flatten() {
            text::collect(value, texts);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan(instructions: &str, input: &str) -> Vec<String> {
        let mut texts = Vec::new();
        last_turn(
            |name| match name {
                "instructions" => Some(instructions),
                "input" => Some(input),
                _ => None,
            },
            &mut texts,
        );
        texts.into_iter().map(Cow::into_owned).collect()
    }

    #[test]
    fn the_last_turn_follows_the_last_item_the_model_produced() {
        assert_eq!(scan(r#""sys""#, r#""hello""#), ["sys", "hello"]);
        assert_eq!(
            scan(
                r#""sys""#,
                r#"[{"role":"user","content":[{"type":"input_text","text":"old"}]},
                {"type":"reasoning","summary":[]},
                {"type":"function_call","call_id":"a","name":"f","arguments":"{}"},
                {"type":"function_call","call_id":"b","name":"f","arguments":"{}"},
                {"type":"function_call_output","call_id":"a","output":"result a"},
                {"type":"function_call_output","call_id":"b","output":[{"type":"input_text","text":"result b"}]}]"#
            ),
            ["result a", "result b"]
        );
    }
}
