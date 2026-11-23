//! Anthropic Messages keeps the conversation in `messages` and the system prompt in
//! `system`. The last turn is every message after the last assistant message; tool
//! results arrive as `tool_result` blocks of one user message. The system prompt
//! counts only on the first turn.
use std::borrow::Cow;

use serde::Deserialize;
use serde_json::value::RawValue;

use super::text;

pub(super) const MEMBERS: &[&str] = &["messages", "system"];

#[derive(Deserialize)]
struct Message<'a> {
    #[serde(borrow, default)]
    role: Option<&'a RawValue>,
    #[serde(borrow, default)]
    content: Option<&'a RawValue>,
}

pub(super) fn last_turn<'a>(
    member: impl Fn(&str) -> Option<&'a str>,
    texts: &mut Vec<Cow<'a, str>>,
) {
    let messages = member("messages")
        .and_then(|raw| serde_json::from_str::<Vec<Message<'a>>>(raw).ok())
        .unwrap_or_default();
    let last_assistant = messages
        .iter()
        .rposition(|message| message.role.and_then(text::string).as_deref() == Some("assistant"));
    if last_assistant.is_none()
        && let Some(system) =
            member("system").and_then(|raw| serde_json::from_str::<&RawValue>(raw).ok())
    {
        text::collect(system, texts);
    }
    let start = last_assistant.map_or(0, |index| index + 1);
    for content in messages[start..]
        .iter()
        .filter_map(|message| message.content)
    {
        text::collect(content, texts);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scan(system: &str, messages: &str) -> Vec<String> {
        let mut texts = Vec::new();
        last_turn(
            |name| match name {
                "system" => Some(system),
                "messages" => Some(messages),
                _ => None,
            },
            &mut texts,
        );
        texts.into_iter().map(Cow::into_owned).collect()
    }

    #[test]
    fn the_system_prompt_counts_only_on_the_first_turn() {
        assert_eq!(
            scan(
                r#"[{"type":"text","text":"sys"}]"#,
                r#"[{"role":"user","content":"first"}]"#
            ),
            ["sys", "first"]
        );
        assert_eq!(
            scan(
                r#""sys""#,
                r#"[{"role":"user","content":"old"},
                {"role":"assistant","content":[{"type":"tool_use","id":"a","input":{}},{"type":"tool_use","id":"b","input":{}}]},
                {"role":"user","content":[
                    {"type":"tool_result","tool_use_id":"a","content":"result a"},
                    {"type":"tool_result","tool_use_id":"b","content":[{"type":"text","text":"result b"}]}]}]"#
            ),
            ["result a", "result b"]
        );
    }
}
