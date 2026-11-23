//! Chat Completions keeps the whole conversation in `messages`. The last turn is
//! every message after the last assistant message: the user's message, or the
//! results of the assistant's (possibly parallel) tool calls.
use std::borrow::Cow;

use serde::Deserialize;
use serde_json::value::RawValue;

use super::text;

pub(super) const MEMBERS: &[&str] = &["messages"];

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
    let Some(messages) =
        member("messages").and_then(|raw| serde_json::from_str::<Vec<Message<'a>>>(raw).ok())
    else {
        return;
    };
    let start = messages
        .iter()
        .rposition(|message| message.role.and_then(text::string).as_deref() == Some("assistant"))
        .map_or(0, |index| index + 1);
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

    fn scan(messages: &str) -> Vec<String> {
        let mut texts = Vec::new();
        last_turn(|name| (name == "messages").then_some(messages), &mut texts);
        texts.into_iter().map(Cow::into_owned).collect()
    }

    #[test]
    fn the_last_turn_is_everything_after_the_last_assistant_message() {
        assert_eq!(
            scan(r#"[{"role":"system","content":"sys"},{"role":"user","content":"first"}]"#),
            ["sys", "first"]
        );
        assert_eq!(
            scan(
                r#"[{"role":"system","content":"sys"},{"role":"user","content":"old"},
                {"role":"assistant","content":null,"tool_calls":[{"id":"a"},{"id":"b"}]},
                {"role":"tool","tool_call_id":"a","content":"result a"},
                {"role":"tool","tool_call_id":"b","content":[{"type":"text","text":"result b"}]}]"#
            ),
            ["result a", "result b"]
        );
    }
}
