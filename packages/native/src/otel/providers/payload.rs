//! Select input/output payloads from SDK attributes and span events.
//!
//! `extract_input_output` calls `provider_payload`, whose ordered steps stop at the first
//! selected provider. `rules` declares keys, event names and selection conditions; the named
//! functions here decode and combine each provider's values. `flattened` reconstructs dotted
//! attributes such as `gen_ai.prompt.0.role` into arrays and objects.
//!
//! The result contains input/output values copied from attributes or built from events,
//! plus a filtered attribute map for metadata. The exclusions in `rules` apply regardless
//! of which provider supplies the payload.

mod flattened;
mod rules;

use rules::{
    AI_INPUT_RULE, AI_OUTPUT_KEYS, ANTHROPIC_TOOL_RESULT, DIRECT_IO, FLATTENED_IO, FLUE_IO,
    GATEWAY_ATTRIBUTES, GEN_AI_DETAIL_EVENT, GEN_AI_INPUT_EVENTS, GEN_AI_IO, GEN_AI_OUTPUT_EVENT,
    LIVEKIT_INPUT_RULE, LIVEKIT_OUTPUT_RULE, LIVEKIT_USER_INPUT, LOGFIRE_IO, PAYLOAD_GROUPS,
    PREFIXES, PYDANTIC_IO, SDK_IO, SEMANTIC_KERNEL_EVENTS, TOOL_IO,
};
pub(super) use rules::{GENKIT_IO, VERTEX_IO};

use flattened::flattened_payload;
#[cfg(test)]
use flattened::MAX_ARRAY_SLOTS;

use super::select_first;
use crate::otel::attributes::{
    is_js_truthy, javascript_json_stringify, javascript_string, JsonParseCache,
};
use crate::otel::input::SpanEvent;
use crate::otel::types::JsonObject;
use crate::otel::value::{JsString, Value};

#[derive(Clone, Debug, Default)]
pub struct ProviderIO {
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub filtered_attributes: JsonObject,
}

type Payload = [Option<Value>; 2];

fn io_values(attributes: &JsonObject, keys: [&str; 2]) -> Payload {
    keys.map(|key| attributes.get(key).cloned())
}

type AttributeRule = (&'static [&'static str], fn(&Value) -> bool);

fn read_attribute(attributes: &JsonObject, (keys, accept): AttributeRule) -> Option<&Value> {
    select_first(attributes, keys, accept)
}

fn accepted_payload(payload: Payload, accept: impl Fn(&Value) -> bool) -> Option<Payload> {
    payload.iter().flatten().any(accept).then_some(payload)
}

fn truthy_pair(attributes: &JsonObject, keys: [&str; 2]) -> Option<Payload> {
    accepted_payload(io_values(attributes, keys), is_js_truthy)
}

/// Extract provider payloads and the legacy diagnostic attribute remainder.
pub fn extract_input_output(
    scope_name: &str,
    attributes: &JsonObject,
    events: Vec<SpanEvent>,
    domain: Option<&str>,
    parse_cache: &mut JsonParseCache,
) -> ProviderIO {
    let [input, output] = provider_payload(scope_name, attributes, events, domain, parse_cache);
    ProviderIO {
        input,
        output,
        filtered_attributes: filter_attributes(attributes, scope_name),
    }
}

/// Steps return `None` to try the next provider and `Some(payload)` to stop.
/// AI and Genkit select their scope even when both payload fields are absent.
fn provider_payload(
    scope_name: &str,
    attributes: &JsonObject,
    mut events: Vec<SpanEvent>,
    domain: Option<&str>,
    parse_cache: &mut JsonParseCache,
) -> Payload {
    sdk_payload(attributes, domain)
        .or_else(|| scoped_payload(scope_name, attributes, parse_cache))
        .or_else(|| gen_ai_detail_events(&mut events, parse_cache))
        .or_else(|| gen_ai_message_events(&mut events))
        .or_else(|| semantic_kernel_events(scope_name, &mut events, parse_cache))
        .or_else(|| vertex_payload(attributes))
        .or_else(|| truthy_pair(attributes, LOGFIRE_IO))
        .or_else(|| accepted_payload(livekit_io(attributes), is_js_truthy))
        .or_else(|| logfire_events(attributes, parse_cache))
        .or_else(|| {
            DIRECT_IO
                .iter()
                .find_map(|&keys| truthy_pair(attributes, keys))
        })
        .or_else(|| pydantic_payload(scope_name, attributes, parse_cache))
        .or_else(|| truthy_pair(attributes, TOOL_IO))
        .or_else(|| {
            FLATTENED_IO
                .iter()
                .find_map(|&keys| flattened_pair(attributes, keys))
        })
        .or_else(|| gen_ai_io(attributes, parse_cache))
        .unwrap_or_default()
}

fn sdk_payload(attributes: &JsonObject, domain: Option<&str>) -> Option<Payload> {
    // In the trace domain, a truthy trace field overrides its observation counterpart.
    accepted_payload(
        [0, 1].map(|side| {
            (domain == Some("trace"))
                .then(|| {
                    attributes
                        .get(SDK_IO[0][side])
                        .filter(|value| is_js_truthy(value))
                })
                .flatten()
                .or_else(|| attributes.get(SDK_IO[1][side]))
                .cloned()
        }),
        |value| !value.is_null(),
    )
}

fn scoped_payload(
    scope_name: &str,
    attributes: &JsonObject,
    parse_cache: &mut JsonParseCache,
) -> Option<Payload> {
    match scope_name {
        "genkit-tracer" => Some(genkit_payload(attributes, parse_cache)),
        "ai" => Some(ai_payload(attributes, parse_cache)),
        "@flue/opentelemetry" => accepted_payload(
            FLUE_IO.map(|rule| {
                let raw = read_attribute(attributes, rule);
                parse_cache
                    .parse(raw)
                    .filter(|value| !value.is_null())
                    .or(raw)
                    .cloned()
            }),
            |_| true,
        ),
        _ => None,
    }
}

fn genkit_payload(attributes: &JsonObject, parse_cache: &mut JsonParseCache) -> Payload {
    [0, 1].map(|side| {
        let raw = attributes.get(GENKIT_IO[side]);
        let value = parse_cache
            .parse(raw)
            .filter(|value| !value.is_null())
            .or(raw)?;
        Some(
            value
                .get(["messages", "message"][side])
                .filter(|value| !value.is_null())
                .unwrap_or(value)
                .clone(),
        )
    })
}

fn ai_payload(attributes: &JsonObject, parse_cache: &mut JsonParseCache) -> Payload {
    let mut payload = [
        read_attribute(attributes, AI_INPUT_RULE).cloned(),
        ai_output(attributes),
    ];
    if let Some(fallback) = gen_ai_io(attributes, parse_cache) {
        for (value, fallback) in payload.iter_mut().zip(fallback) {
            if value.as_ref().is_none_or(Value::is_null) {
                *value = fallback;
            }
        }
    }
    payload
}

fn gen_ai_detail_events(
    events: &mut [SpanEvent],
    parse_cache: &mut JsonParseCache,
) -> Option<Payload> {
    events
        .iter_mut()
        .filter(|event| event.name() == Some(GEN_AI_DETAIL_EVENT))
        .find_map(|event| gen_ai_io(&event_to_map(event), parse_cache))
}

fn gen_ai_message_events(events: &mut [SpanEvent]) -> Option<Payload> {
    let mut inputs = Vec::new();
    let mut outputs = Vec::new();
    for event in events {
        if event
            .name()
            .is_some_and(|name| GEN_AI_INPUT_EVENTS.contains(&name))
        {
            inputs.push(event_to_message(event));
        } else if event.name() == Some(GEN_AI_OUTPUT_EVENT) {
            outputs.push(Value::Object(event_to_map(event)));
        }
    }
    accepted_payload(
        [
            nonempty_array(inputs),
            match outputs.len() {
                1 => outputs.pop(),
                _ => nonempty_array(outputs),
            },
        ],
        |_| true,
    )
}

fn semantic_kernel_events(
    scope_name: &str,
    events: &mut [SpanEvent],
    parse_cache: &mut JsonParseCache,
) -> Option<Payload> {
    // The first event of each name decides the side. If either has attributes,
    // select both payloads, filling the missing side with `{}`.
    let selected = SEMANTIC_KERNEL_EVENTS.map(|name| {
        events
            .iter()
            .position(|event| event.name() == Some(name))
            .filter(|&index| {
                events[index]
                    .attributes
                    .as_deref()
                    .is_some_and(is_js_truthy)
            })
    });
    selected.iter().any(Option::is_some).then(|| {
        [0, 1].map(|side| {
            let attributes = selected[side]
                .map(|index| event_to_map(&mut events[index]))
                .unwrap_or_default();
            Some(
                provider_payload(scope_name, &attributes, Vec::new(), None, parse_cache)[side]
                    .take()
                    .filter(is_js_truthy)
                    .unwrap_or(Value::Object(attributes)),
            )
        })
    })
}

fn vertex_payload(attributes: &JsonObject) -> Option<Payload> {
    accepted_payload(
        [0, 1].map(|side| {
            attributes
                .get(VERTEX_IO[0][side])
                .filter(|value| is_js_truthy(value) && value.as_str() != Some("{}"))
                .or_else(|| attributes.get(VERTEX_IO[1][side]))
                .cloned()
        }),
        is_js_truthy,
    )
}

fn pydantic_payload(
    scope_name: &str,
    attributes: &JsonObject,
    parse_cache: &mut JsonParseCache,
) -> Option<Payload> {
    if scope_name != "pydantic-ai" {
        return None;
    }
    let [input, output] = io_values(attributes, PYDANTIC_IO);
    let input = input.map(|value| {
        prepend_system_instructions(
            value,
            attributes.get("gen_ai.system_instructions"),
            parse_cache,
        )
    });
    accepted_payload([input, output], is_js_truthy)
}

/// Once either side has flattened messages, preserve the missing counterpart as `{}` to
/// match the TypeScript adapter's stored payloads.
fn flattened_pair(attributes: &JsonObject, keys: [&str; 2]) -> Option<Payload> {
    let payload = [
        flattened_payload(attributes, keys[0]),
        flattened_payload(attributes, keys[1]),
    ];
    payload.iter().any(Option::is_some).then(|| {
        payload.map(|value| Some(value.unwrap_or_else(|| Value::Object(JsonObject::new()))))
    })
}

fn logfire_events(attributes: &JsonObject, parse_cache: &mut JsonParseCache) -> Option<Payload> {
    let events = parse_cache.parse(attributes.get("events"))?.as_array()?;
    let is_choice = |event: &&Value| {
        event.get("event.name").and_then(Value::as_str) == Some(GEN_AI_OUTPUT_EVENT)
    };
    let output = events.iter().find(is_choice).cloned();
    let input = nonempty_array(
        events
            .iter()
            .filter(|event| !is_choice(event))
            .cloned()
            .collect(),
    );
    accepted_payload([input, output], |_| true)
}

fn nonempty_array(values: Vec<Value>) -> Option<Value> {
    (!values.is_empty()).then_some(Value::Array(values))
}

fn livekit_io(attributes: &JsonObject) -> Payload {
    let user_input = read_attribute(attributes, LIVEKIT_USER_INPUT);
    let input = read_attribute(attributes, LIVEKIT_INPUT_RULE)
        .cloned()
        .or_else(|| {
            attributes
                .get("lk.pii.instructions")
                .filter(|value| is_js_truthy(value))
                .map(|instructions| {
                    let mut messages = vec![json_message("system", instructions.clone())];
                    if let Some(user) = user_input {
                        messages.push(json_message("user", user.clone()));
                    }
                    Value::Array(messages)
                })
        })
        .or_else(|| user_input.cloned())
        .or_else(|| attributes.get("lk.pii.function_tool.arguments").cloned());
    let output = read_attribute(attributes, LIVEKIT_OUTPUT_RULE)
        .or_else(|| {
            attributes
                .get("lk.pii.response.function_calls")
                .filter(|value| is_js_truthy(value) && value.as_str() != Some("[]"))
        })
        .cloned();
    [input, output]
}

/// Return attributes after removing payload and metadata carriers; callers store the remainder
/// under `metadata.attributes`.
pub fn filter_attributes(attributes: &JsonObject, scope_name: &str) -> JsonObject {
    attributes
        .iter()
        .filter(|(key, _)| {
            let key = key.as_str();
            !PAYLOAD_GROUPS.iter().any(|keys| keys.contains(&key))
                && !PREFIXES.iter().any(|prefix| key.starts_with(prefix))
                && !(scope_name == "langfuse-ai-gateway" && GATEWAY_ATTRIBUTES.contains(&key))
        })
        .map(|(key, value)| {
            let value = match value {
                Value::String(_) => value.clone(),
                _ => Value::String(javascript_json_stringify(value).into()),
            };
            (key.clone(), value)
        })
        .collect()
}
fn ai_output(attributes: &JsonObject) -> Option<Value> {
    if let (Some(text), Some(calls)) = (
        attributes.get("ai.response.text"),
        attributes.get("ai.response.toolCalls"),
    ) {
        return Some(Value::String(
            crate::otel::attributes::javascript_json_stringify(&Value::Object(
                JsonObject::from_iter([
                    ("role".into(), "assistant".into()),
                    ("content".into(), text.clone()),
                    ("tool_calls".into(), calls.clone()),
                ]),
            ))
            .into(),
        ));
    }
    attributes
        .get(AI_OUTPUT_KEYS[0])
        .filter(|value| is_js_truthy(value))
        .or_else(|| select_first(attributes, &AI_OUTPUT_KEYS[1..], |_| true))
        .cloned()
}

fn gen_ai_io(attributes: &JsonObject, parse_cache: &mut JsonParseCache) -> Option<Payload> {
    for (index, keys) in GEN_AI_IO.into_iter().enumerate() {
        let [input, mut output] = io_values(attributes, keys);
        if index == 1 && attributes.get(keys[1]).is_none_or(Value::is_null) {
            output = attributes.get(ANTHROPIC_TOOL_RESULT).cloned();
        }
        if input.as_ref().is_some_and(is_js_truthy) || output.as_ref().is_some_and(is_js_truthy) {
            return Some([
                input.map(|value| {
                    if index == 0 {
                        prepend_system_instructions(
                            value,
                            attributes.get("gen_ai.system_instructions"),
                            parse_cache,
                        )
                    } else {
                        value
                    }
                }),
                output,
            ]);
        }
    }
    None
}

fn event_to_message(event: &mut SpanEvent) -> Value {
    let name = event.name().unwrap_or_default();
    let role = name
        .strip_prefix("gen_ai.")
        .unwrap_or(name)
        .strip_suffix(".message")
        .unwrap_or(name);
    let mut message = JsonObject::new();
    message.insert("role".into(), Value::String(role.to_owned().into()));
    message.extend(event_to_map(event));
    Value::Object(message)
}

fn event_to_map(event: &mut SpanEvent) -> JsonObject {
    event
        .attributes
        .take()
        .map(|attributes| crate::otel::attributes::attributes_to_map(attributes.into_value()))
        .unwrap_or_default()
}

fn json_message(role: &str, content: Value) -> Value {
    Value::Object(JsonObject::from_iter([
        ("role".into(), Value::String(role.into())),
        ("content".into(), content),
    ]))
}

fn prepend_system_instructions(
    input: Value,
    instructions: Option<&Value>,
    parse_cache: &mut JsonParseCache,
) -> Value {
    let Some(instructions) = instructions.filter(|value| is_js_truthy(value)) else {
        return input;
    };
    let Some(mut messages) = parse_cache
        .parse(Some(&input))
        .and_then(Value::as_array)
        .cloned()
    else {
        return input;
    };
    if messages
        .iter()
        .any(|message| message.get("role") == Some(&Value::String("system".into())))
    {
        return input;
    }
    let content = match parse_cache
        .parse_or_self(Some(instructions))
        .expect("instructions present")
    {
        Value::Array(parts) => {
            parts
                .iter()
                .enumerate()
                .fold(JsString::default(), |mut content, (index, part)| {
                    if index > 0 {
                        content.push_str("\n");
                    }
                    let part = part
                        .get("content")
                        .filter(|value| is_js_truthy(value))
                        .map(|value| {
                            js_string_value(value)
                                .unwrap_or_else(|| javascript_string(value).into())
                        })
                        .unwrap_or_else(|| {
                            js_string_value(part).unwrap_or_else(|| javascript_string(part).into())
                        });
                    content.push_slice(&part, 0..part.len());
                    content
                })
        }
        value => js_string_value(value).unwrap_or_else(|| javascript_string(value).into()),
    };
    messages.insert(0, json_message("system", Value::String(content)));
    if input.is_string() {
        Value::String(
            crate::otel::attributes::javascript_json_stringify(&Value::Array(messages)).into(),
        )
    } else {
        Value::Array(messages)
    }
}

fn js_string_value(value: &Value) -> Option<JsString> {
    match value {
        Value::String(value) => Some(value.clone()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::otel::providers::extract_model_parameters;
    use crate::otel::value::json;

    #[test]
    fn provider_fallbacks_match_typescript() {
        let cases = [
            (
                "SDK null falls through",
                "ai",
                json!({
                    "langfuse.observation.input": null, "ai.prompt": "fallback",
                }),
                Some(json!("fallback")),
                None,
            ),
            (
                "Flue skips null aliases",
                "@flue/opentelemetry",
                json!({
                    "flue.turn.input": null, "flue.tool.arguments": "{\"x\":1}",
                }),
                Some(json!({"x": 1})),
                None,
            ),
            (
                "LiveKit accepts another scope",
                "other",
                json!({
                    "lk.user_input": "hello",
                }),
                Some(json!("hello")),
                None,
            ),
            (
                "LiveKit keeps bare user input",
                "livekit-agents",
                json!({
                    "lk.user_input": "hello",
                }),
                Some(json!("hello")),
                None,
            ),
            (
                "Anthropic output retains empty arguments",
                "other",
                json!({
                    "gen_ai.tool.call.arguments": "", "anthropic.tool_result.content": "result",
                }),
                Some(json!("")),
                Some(json!("result")),
            ),
            (
                "AI prompt and combined tool calls",
                "ai",
                json!({
                    "ai.prompt.messages": [{"role":"user","content":"hi"}],
                    "ai.response.text": "done",
                    "ai.response.toolCalls": [{"name":"weather"}],
                }),
                Some(json!([{"role":"user","content":"hi"}])),
                Some(json!(
                    r#"{"role":"assistant","content":"done","tool_calls":[{"name":"weather"}]}"#
                )),
            ),
            (
                "Flattened input supplies an empty output object",
                "other",
                json!({"llm.input_messages.0.message.content": false}),
                Some(json!([{"message": {"content": false}}])),
                Some(json!({})),
            ),
            (
                "Flattened output supplies an empty input object",
                "other",
                json!({"llm.output_messages.0.message.content": false}),
                Some(json!({})),
                Some(json!([{"message": {"content": false}}])),
            ),
        ];
        let failures = cases
            .into_iter()
            .filter_map(|(name, scope, attributes, input, output)| {
                let io = extract_input_output(
                    scope,
                    attributes.as_object().unwrap(),
                    Vec::new(),
                    None,
                    &mut JsonParseCache::default(),
                );
                let actual = (io.input, io.output, io.filtered_attributes);
                let expected = (input, output, JsonObject::new());
                (actual != expected)
                    .then(|| format!("{name}: expected {expected:?}, got {actual:?}"))
            })
            .collect::<Vec<_>>();
        assert!(failures.is_empty(), "{}", failures.join("\n"));
    }

    #[test]
    fn legacy_events_distinguish_absent_attributes_from_empty_attributes() {
        let attributes = json!({"input": "fallback"});
        for side in 0..2 {
            for event_attributes in [None, Some(json!(null)), Some(json!([]))] {
                let name = ["gen_ai.content.prompt", "gen_ai.content.completion"][side];
                let mut event = json!({"name": name});
                if let Some(value) = &event_attributes {
                    event
                        .as_object_mut()
                        .unwrap()
                        .insert("attributes".into(), value.clone());
                }
                let events = serde_json::from_str(
                    &json!([
                        event, {"name": name, "attributes": []}
                    ])
                    .to_json_string(),
                )
                .unwrap();
                let payload = provider_payload(
                    "other",
                    attributes.as_object().unwrap(),
                    events,
                    None,
                    &mut JsonParseCache::default(),
                );
                let expected = if event_attributes.as_ref().is_some_and(is_js_truthy) {
                    [Some(json!({})), Some(json!({}))]
                } else {
                    [Some(json!("fallback")), None]
                };
                assert_eq!(
                    payload, expected,
                    "side={side}, attributes={event_attributes:?}"
                );
            }
        }
    }

    #[test]
    fn provider_wrappers_keep_non_null_fallbacks_and_diagnostic_values() {
        let attributes = json!({
            "genkit:input": {"messages": null, "config": {"temperature": 1}},
            "genkit:output": "null",
            "tool_arguments": "args",
            "custom": {"nested": true},
        });
        let io = extract_input_output(
            "genkit-tracer",
            attributes.as_object().unwrap(),
            Vec::new(),
            None,
            &mut JsonParseCache::default(),
        );
        assert_eq!(
            io.input,
            Some(json!({"messages": null, "config": {"temperature": 1}}))
        );
        assert_eq!(io.output, Some(json!("null")));
        assert_eq!(io.filtered_attributes["tool_arguments"], json!("args"));
        assert_eq!(
            io.filtered_attributes["custom"],
            json!(r#"{"nested":true}"#)
        );

        let gateway = json!({
            "langfuse.trace.name": "trace",
            "langfuse.observation.custom": "keep",
        });
        let filtered = filter_attributes(gateway.as_object().unwrap(), "langfuse-ai-gateway");
        assert!(!filtered.contains_key("langfuse.trace.name"));
        assert_eq!(filtered["langfuse.observation.custom"], json!("keep"));
    }

    #[test]
    fn reconstructs_flattened_message_arrays_and_prefers_truthy_exact_values() {
        for (attributes, expected) in [
            (
                json!({
                    "gen_ai.prompt.0.role": "user",
                    "gen_ai.prompt.0.content": "hello",
                    "gen_ai.prompt.1.role": "assistant",
                    "gen_ai.prompt.1.content": "world",
                }),
                json!([
                    {"role": "user", "content": "hello"},
                    {"role": "assistant", "content": "world"}
                ]),
            ),
            (
                json!({
                    "gen_ai.prompt": [{"role": "system", "content": "exact"}],
                    "gen_ai.prompt.0.role": "ignored",
                }),
                json!([{"role": "system", "content": "exact"}]),
            ),
            (
                json!({
                    "gen_ai.prompt.__proto__.polluted": true,
                    "gen_ai.prompt.0.content": "kept",
                }),
                json!([{"content": "kept"}]),
            ),
        ] {
            assert_eq!(
                flattened_payload(attributes.as_object().unwrap(), "gen_ai.prompt"),
                Some(expected),
                "{attributes:?}",
            );
        }
    }

    #[test]
    fn flattened_paths_do_not_cross_containers_or_mutate_explicit_nulls() {
        let attributes = json!({
            "gen_ai.prompt.a.x.z": 1,
            "gen_ai.prompt.b.x": {"old": 2},
            "gen_ai.prompt.b.x.new": 3,
        });
        let payload = flattened_payload(attributes.as_object().unwrap(), "gen_ai.prompt")
            .expect("flattened payload should be reconstructed");

        assert_eq!(
            payload["a"],
            json!({"x": {"z": 1}}),
            "a later branch must not write through b's generated container"
        );
        assert_eq!(payload["b"]["x"], json!({"old": 2}));

        let attributes = json!({
            "gen_ai.prompt.0.0": null,
            "gen_ai.prompt.0.0.new": 1,
        });
        let payload = flattened_payload(attributes.as_object().unwrap(), "gen_ai.prompt")
            .expect("flattened payload should be reconstructed");
        assert_eq!(payload[0][0], Value::Null);
    }

    proptest::proptest! {
        #[test]
        fn flattened_paths_reserve_array_budget_atomically(first in 0usize..9999) {
            let mut attributes = JsonObject::new();
            attributes.insert(format!("gen_ai.prompt.0.{first}").into(), json!("first"));
            attributes.insert("gen_ai.prompt.1.10000".into(), json!("rejected"));
            attributes.insert("gen_ai.prompt.0.9999".into(), json!("last"));
            let payload = flattened_payload(&attributes, "gen_ai.prompt").unwrap();
            proptest::prop_assert_eq!(&payload[0][first], &json!("first"));
            proptest::prop_assert_eq!(&payload[0][9999], &json!("last"));
            let root = payload.as_array().unwrap();
            proptest::prop_assert_eq!(root.len(), 1);
            proptest::prop_assert_eq!(root.len() + root[0].as_array().unwrap().len(), MAX_ARRAY_SLOTS);
        }
    }

    #[test]
    fn flattened_array_holes_can_be_filled_later() {
        for (attributes, expected) in [
            (
                json!({
                    "gen_ai.prompt.1.role": "assistant",
                    "gen_ai.prompt.0.role": "user",
                }),
                json!([{"role": "user"}, {"role": "assistant"}]),
            ),
            (
                json!({
                    "gen_ai.prompt.1.role": "assistant",
                    "gen_ai.prompt.0": null,
                    "gen_ai.prompt.0.role": "ignored",
                }),
                json!([null, {"role": "assistant"}]),
            ),
            (
                json!({
                    "gen_ai.prompt.1.role": "assistant",
                    "gen_ai.prompt.0": {"explicit": true},
                    "gen_ai.prompt.0.role": "ignored",
                }),
                json!([{"explicit": true}, {"role": "assistant"}]),
            ),
        ] {
            assert_eq!(
                flattened_payload(attributes.as_object().unwrap(), "gen_ai.prompt"),
                Some(expected)
            );
        }
    }

    proptest::proptest! {
        #[test]
        fn flattened_indices_reject_overflow_and_keep_noncanonical_keys(
            digits in "(10001|18446744073709551615|[1-9][0-9]{20,40})"
        ) {
            for parent in ["", "0."] {
                let mut attributes = JsonObject::new();
                attributes.insert(format!("gen_ai.prompt.{parent}role").into(), json!("kept"));
                attributes.insert(format!("gen_ai.prompt.{parent}{digits}.role").into(), json!("dropped"));
                let mut expected = JsonObject::new();
                expected.insert("role".into(), json!("kept"));
                for key in ["+1".to_owned(), "01".to_owned(), format!("+{digits}"), format!("0{digits}")] {
                    attributes.insert(format!("gen_ai.prompt.{parent}{key}.role").into(), json!("user"));
                    expected.insert(key.into(), json!({"role": "user"}));
                }
                let expected = Value::Object(expected);
                let expected = if parent.is_empty() { expected } else { Value::Array(vec![expected]) };
                proptest::prop_assert_eq!(
                    flattened_payload(&attributes, "gen_ai.prompt"),
                    Some(expected)
                );
            }
        }
    }

    #[test]
    fn preserves_wtf8_segments_in_flattened_payload_paths() {
        let mut attributes = JsonObject::new();
        let mut key = b"gen_ai.prompt.0.".to_vec();
        key.extend_from_slice(&[b'l', 0xed, 0xa0, 0x80]);
        attributes.insert(
            JsString::from_wtf8(key).unwrap(),
            Value::String("value".into()),
        );

        let payload = flattened_payload(&attributes, "gen_ai.prompt")
            .expect("flattened payload should be reconstructed");
        let field = payload[0]
            .as_object()
            .unwrap()
            .iter()
            .next()
            .expect("field should exist");
        assert_eq!(field.0.as_bytes(), b"l\xed\xa0\x80");
        assert_eq!(field.1.as_str(), Some("value"));
    }

    #[test]
    fn preserves_wtf8_json_message_content() {
        let content = Value::String(JsString::from_wtf8(vec![b'x', 0xed, 0xa0, 0x80]).unwrap());
        let message = json_message("user", content);
        assert_eq!(message["content"].as_str(), Some("x\u{fffd}"));
        let Value::String(content) = &message["content"] else {
            panic!("message content should remain a string");
        };
        assert_eq!(content.as_bytes(), b"x\xed\xa0\x80");

        let attributes = Value::parse(r#"{"gen_ai.system":"\ud800","ai.response.providerMetadata":{"openai":{"serviceTier":"\ud801"}}}"#).unwrap();
        let parameters = extract_model_parameters(
            attributes.as_object().unwrap(),
            "ai",
            &mut JsonParseCache::default(),
        )
        .unwrap();
        assert_eq!(parameters["system"].to_json_string(), r#""\ud800""#);
        assert_eq!(parameters["service_tier"].to_json_string(), r#""\ud801""#);
    }

    #[test]
    fn prepending_system_instructions_preserves_wtf8_content() {
        let input = json!([{"role": "user", "content": "hello"}]);
        let instructions = Value::parse(r#"[{"content":"x\ud800"},"part",null]"#).unwrap();

        let result =
            prepend_system_instructions(input, Some(&instructions), &mut JsonParseCache::default());
        let Value::Array(messages) = result else {
            panic!("expected an array of messages");
        };
        let Value::String(content) = &messages[0]["content"] else {
            panic!("expected system content to remain a string");
        };
        assert_eq!(content.as_bytes(), b"x\xed\xa0\x80\npart\nnull");
    }

    #[test]
    fn system_instructions_follow_javascript_truthiness_and_coercion() {
        let input = json!([{"role": "user", "content": "hello"}]);
        for (instructions, content) in [
            (json!(null), None),
            (json!(false), None),
            (json!(""), None),
            (json!({"text": "hello"}), Some("[object Object]")),
            (json!("{\"text\":\"hello\"}"), Some("[object Object]")),
        ] {
            let mut expected = input.as_array().unwrap().clone();
            if let Some(content) = content {
                expected.insert(0, json!({"role": "system", "content": content}));
            }
            assert_eq!(
                prepend_system_instructions(
                    input.clone(),
                    Some(&instructions),
                    &mut JsonParseCache::default(),
                ),
                Value::Array(expected)
            );
        }
    }

    #[test]
    fn filtering_attributes_keeps_the_javascript_object_order() {
        let attributes = json!({
            "input": "removed",
            "first": "kept",
            "gen_ai.prompt.messages": "removed",
            "middle": "kept",
            "langfuse.observation.input": "removed",
            "last": "kept",
        });
        let filtered = filter_attributes(attributes.as_object().unwrap(), "unexpected scope");
        assert_eq!(
            filtered
                .keys()
                .map(|key| key.as_str().to_owned())
                .collect::<Vec<_>>(),
            ["first".to_owned(), "middle".to_owned(), "last".to_owned()]
        );
    }
}
