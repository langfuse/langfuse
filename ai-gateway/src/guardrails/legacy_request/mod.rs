//! The request readers as they were before they read through spec trees, kept
//! as a test oracle for the equivalence fuzz test in `tests`.

mod tests;
mod text;

use crate::guardrails::spec::Members;

pub(super) fn chat_turn(members: &Members<'_, '_>) -> Result<text::LastTurn, text::Unreadable> {
    let mut turn = text::LastTurn::default();
    if let Some(messages) = members.get("messages")? {
        turn.push_items(
            "messages",
            messages,
            text::classify_role_message,
            read_object_message,
        )?;
    }
    Ok(turn)
}

pub(super) fn anthropic_turn(
    members: &Members<'_, '_>,
) -> Result<text::LastTurn, text::Unreadable> {
    let mut turn = text::LastTurn::default();
    let had_model_turn = match members.get("messages")? {
        Some(messages) => turn.push_items(
            "messages",
            messages,
            text::classify_role_message,
            read_object_message,
        )?,
        None => false,
    };
    if let Some(system) = members.get("system")? {
        if had_model_turn {
            turn.push_earlier_member("system", system);
        } else {
            turn.push_member("system", system);
        }
    }
    Ok(turn)
}

pub(super) fn embeddings_turn(
    members: &Members<'_, '_>,
) -> Result<text::LastTurn, text::Unreadable> {
    let mut turn = text::LastTurn::default();
    if let Some(input) = members.get("input")? {
        turn.push_member("input", input);
    }
    Ok(turn)
}

pub(super) fn decisions_turn(
    members: &Members<'_, '_>,
) -> Result<text::LastTurn, text::Unreadable> {
    let mut turn = text::LastTurn::default();
    if let Some(input) = members.get("input")? {
        turn.push_member("input", input);
    }
    Ok(turn)
}

#[derive(serde::Deserialize)]
struct GuardrailItem<'a> {
    #[serde(borrow, default, rename = "type")]
    kind: Option<&'a serde_json::value::RawValue>,
    #[serde(borrow, default)]
    role: Option<&'a serde_json::value::RawValue>,
    #[serde(borrow, default)]
    content: Option<&'a serde_json::value::RawValue>,
    /// The result of a tool call, in `*_call_output` items.
    #[serde(borrow, default)]
    output: Option<&'a serde_json::value::RawValue>,
}

impl GuardrailItem<'_> {
    /// The model's messages, reasoning and tool calls (`function_call`,
    /// `web_search_call`, `mcp_call`, ...) come from the model; user, system and
    /// developer messages are messages; tool outputs and anything else answer it.
    fn turn_item(&self) -> text::TurnItem {
        let role = self.role.and_then(text::string);
        let kind = self.kind.and_then(text::string);
        let kind = kind.as_deref().unwrap_or_default();
        match role.as_deref() {
            Some("assistant") => text::TurnItem::Model,
            Some("user" | "system" | "developer") => text::TurnItem::Message,
            _ if kind == "reasoning"
                || kind.ends_with("_call")
                || (kind.starts_with("mcp_") && kind != "mcp_approval_response") =>
            {
                text::TurnItem::Model
            }
            _ => text::TurnItem::Output,
        }
    }
}

fn classify_guardrail_item(
    item: &serde_json::value::RawValue,
) -> Result<text::TurnItem, text::Unreadable> {
    let item: GuardrailItem<'_> = serde_json::from_str(item.get()).map_err(|_| text::Unreadable)?;
    Ok(item.turn_item())
}

pub(super) fn responses_turn(
    members: &Members<'_, '_>,
) -> Result<text::LastTurn, text::Unreadable> {
    let mut turn = text::LastTurn::default();
    let had_model_item = match members.get("input")? {
        Some(items) if items.starts_with('[') => {
            turn.push_items("input", items, classify_guardrail_item, read_object_item)?
        }
        Some(input) => {
            turn.push_member("input", input);
            false
        }
        None => false,
    };
    // Instructions are resent on every turn, also when the provider stores the earlier
    // turns, so they are scanned only on the first one.
    let mut continues = false;
    for name in ["previous_response_id", "conversation"] {
        continues |= members.get(name)?.is_some_and(|value| value != "null");
    }
    if let Some(instructions) = members.get("instructions")? {
        if had_model_item || continues {
            turn.push_earlier_member("instructions", instructions);
        } else {
            turn.push_member("instructions", instructions);
        }
    }
    // Variables fill a stored prompt with new caller text on every request.
    if let Some(prompt) = members
        .get("prompt")?
        .filter(|prompt| prompt.starts_with('{'))
    {
        turn.push_member_with("prompt", prompt, read_guardrail_prompt);
    }
    Ok(turn)
}

#[derive(serde::Deserialize)]
struct GuardrailPrompt<'a> {
    #[serde(borrow, default)]
    variables: Option<&'a serde_json::value::RawValue>,
}

fn read_guardrail_prompt(
    prompt: &serde_json::value::RawValue,
    sink: &mut dyn FnMut(text::TextLeaf<'_>),
) -> Result<(), text::Unreadable> {
    let prompt: GuardrailPrompt<'_> =
        serde_json::from_str(prompt.get()).map_err(|_| text::Unreadable)?;
    let Some(variables) = prompt
        .variables
        .filter(|variables| variables.get().starts_with('{'))
    else {
        return Ok(());
    };
    text::for_each_value(variables.get(), |value| {
        if value.get().starts_with('{') {
            text::collect_part(value, sink)
        } else {
            text::collect(value, sink)
        }
    })
}

fn read_guardrail_item(
    item: &serde_json::value::RawValue,
    sink: &mut dyn FnMut(text::TextLeaf<'_>),
) -> Result<(), text::Unreadable> {
    let item: GuardrailItem<'_> = serde_json::from_str(item.get()).map_err(|_| text::Unreadable)?;
    for value in [item.content, item.output].into_iter().flatten() {
        text::collect(value, sink)?;
    }
    Ok(())
}

// The one intended difference: the previous readers parsed an item with serde's
// struct deserializer, which also reads a JSON array positionally, so a "message"
// `[role, content]` had its second element scanned. Providers reject such items;
// the spec trees read object items only.
fn read_object_message(
    item: &serde_json::value::RawValue,
    sink: &mut dyn FnMut(text::TextLeaf<'_>),
) -> Result<(), text::Unreadable> {
    if item.get().starts_with('{') {
        text::read_role_message(item, sink)
    } else {
        Ok(())
    }
}

fn read_object_item(
    item: &serde_json::value::RawValue,
    sink: &mut dyn FnMut(text::TextLeaf<'_>),
) -> Result<(), text::Unreadable> {
    if item.get().starts_with('{') {
        read_guardrail_item(item, sink)
    } else {
        Ok(())
    }
}
