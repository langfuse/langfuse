//! `normalize_tools_for_observation` moves tool definitions from metadata into input
//! when input can accept them. It returns normalized input and metadata, passes
//! output through with its original value, and returns `NormalizedTools` for storage.
//! Collection borrows metadata and records keys to remove. After input accepts
//! the definitions, cleanup edits the owned maps in place; unrelated values keep
//! their allocations. Stringified objects are decoded when cleanup requires them.
//!
//! `columns::ToolColumns` reads those input/output values to collect definitions,
//! calls and names. It deduplicates entries while reading the values by shared reference.

use std::collections::BTreeMap;
use std::sync::LazyLock;

mod columns;

use columns::ToolColumns;

use super::attributes::{
    is_js_truthy, javascript_json_stringify, javascript_number_to_string, javascript_string,
    JsonParseCache, ParsedJson,
};
use super::types::JsonObject;
use super::value::{JsString, Value};

#[derive(Clone, Debug, Default)]
pub struct NormalizedTools {
    pub tool_definitions: BTreeMap<String, String>,
    pub tool_calls: Vec<String>,
    pub tool_call_names: Vec<String>,
}

/// The result of the same post-provider normalization that the TypeScript processor applies
/// before constructing an EventInput. Tool definitions can be carried in metadata and are moved
/// into the input projection so downstream extraction sees one canonical request shape.
#[derive(Clone, Debug, Default)]
pub struct NormalizedObservation {
    pub input: Option<Value>,
    pub output: Option<Value>,
    pub metadata: JsonObject,
    pub tools: NormalizedTools,
}

/// Normalize tool metadata, augment the input when needed, then extract storage columns.
///
/// Append definitions from metadata to input before extracting definitions from it.
/// Extract tool calls from output in a separate pass.
pub fn normalize_tools_for_observation(
    mut input: Option<Value>,
    output: Option<Value>,
    mut metadata: JsonObject,
    parse_cache: &mut JsonParseCache,
) -> NormalizedObservation {
    let (tools, cleanup) = collect_metadata_tools(&metadata, parse_cache);
    if !tools.is_empty() && append_tools_to_input(&mut input, tools, parse_cache) {
        cleanup.apply(&mut metadata, parse_cache);
    }
    let mut columns = ToolColumns::new(parse_cache);
    if let Some(value) = &input {
        columns.input(value);
    }
    if let Some(value) = &output {
        columns.output(value);
    }
    NormalizedObservation {
        input,
        output,
        metadata,
        tools: columns.finish(),
    }
}

fn parse_if_string<'a>(value: &'a Value, parse_cache: &mut JsonParseCache) -> ParsedJson<'a> {
    parse_cache.shared_or_self(value)
}

fn definition_data(value: &Value) -> Option<&JsonObject> {
    let object = value.as_object()?;
    match object.get("function") {
        None | Some(Value::Null) => Some(object),
        Some(function) => function.as_object(),
    }
}

fn is_definition_like(
    value: &Value,
    allow_provider_without_name: bool,
    parse_cache: &mut JsonParseCache,
) -> bool {
    let parsed = parse_if_string(value, parse_cache);
    definition_data(&parsed)
        .and_then(|data| data.get("name"))
        .is_some_and(is_js_truthy)
        || (allow_provider_without_name
            && parsed
                .as_object()
                .and_then(|object| object.get("type"))
                .is_some_and(Value::is_string))
}

fn parse_definition_array(
    value: Option<&Value>,
    require_every_item: bool,
    allow_provider_without_name: bool,
    parse_cache: &mut JsonParseCache,
) -> Option<Vec<Value>> {
    let parsed = parse_if_string(value?, parse_cache);
    let values = parsed.as_array()?;
    let mut valid = Vec::new();
    for value in values {
        if is_definition_like(value, allow_provider_without_name, parse_cache) {
            valid.push(parse_if_string(value, parse_cache).into_owned());
        }
    }
    if require_every_item && valid.len() != values.len() {
        return None;
    }
    (values.is_empty() || !valid.is_empty()).then_some(valid)
}

fn dedupe_definitions(
    values: impl IntoIterator<Item = Value>,
    parse_cache: &mut JsonParseCache,
) -> Vec<Value> {
    let mut names = std::collections::HashSet::<(u8, JsString)>::new();
    values
        .into_iter()
        .filter(|value| {
            let parsed = parse_if_string(value, parse_cache);
            definition_data(&parsed)
                .and_then(|data| data.get("name"))
                .and_then(definition_name_identity)
                .map(|name| names.insert(name))
                .unwrap_or(true)
        })
        .collect()
}

/// Record metadata changes while collecting definitions. Apply them after input accepts the tools.
#[derive(Default)]
struct MetadataToolCleanup {
    remove_root_tools: bool,
    rewrite_attributes: bool,
    attribute_keys: Vec<JsString>,
    rewrite_model_parameters: bool,
    remove_function_tools: bool,
}

impl MetadataToolCleanup {
    fn apply(self, metadata: &mut JsonObject, cache: &mut JsonParseCache) {
        if self.remove_root_tools {
            metadata.shift_remove("tools");
        }
        if !self.rewrite_attributes {
            return;
        }
        let Some(attributes) = metadata
            .get_mut("attributes")
            .and_then(|value| decoded_object_mut(value, cache))
        else {
            return;
        };
        for key in self.attribute_keys {
            attributes.shift_remove(&key);
        }
        if self.rewrite_model_parameters {
            let empty = attributes
                .get_mut("model_request_parameters")
                .is_some_and(|value| {
                    clean_model_parameters(value, self.remove_function_tools, cache)
                });
            if empty {
                attributes.shift_remove("model_request_parameters");
            }
        }
        if attributes.is_empty() {
            metadata.shift_remove("attributes");
        }
    }
}

fn decoded_object_mut<'a>(
    value: &'a mut Value,
    cache: &mut JsonParseCache,
) -> Option<&'a mut JsonObject> {
    if value.is_string() {
        let parsed = parse_if_string(value, cache);
        if !parsed.is_object() {
            return None;
        }
        *value = parsed.into_owned();
    }
    value.as_object_mut()
}

/// Remove the selected tool list, preserving whether parameters were stored as JSON text.
/// Return true when the remaining object is empty and its attribute can be removed.
fn clean_model_parameters(
    value: &mut Value,
    remove_tools: bool,
    cache: &mut JsonParseCache,
) -> bool {
    let was_string = value.is_string();
    let Some(parameters) = decoded_object_mut(value, cache) else {
        return false;
    };
    if remove_tools {
        parameters.shift_remove("function_tools");
    }
    let empty = parameters.is_empty();
    if was_string && !empty {
        *value = javascript_json_stringify(value).into();
    }
    empty
}

fn metadata_attributes<'a>(value: &'a Value, cache: &mut JsonParseCache) -> Option<ParsedJson<'a>> {
    // Match the TypeScript boundary: strings containing tool keys become objects when
    // any tools move, including when that string's own tool definition is invalid.
    static TOOL_KEYS: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
        fancy_regex::Regex::new(r#""(?:ai\.prompt\.tools|gen_ai\.tool\.definitions|model_request_parameters|llm\.tools\.[0-9]+\.tool\.json_schema)"\s*:"#).expect("valid tool key pattern")
    });
    if let Value::String(text) = value {
        if !TOOL_KEYS.is_match(text.as_str()).unwrap_or(false) {
            return None;
        }
    }
    let parsed = parse_if_string(value, cache);
    parsed.is_object().then_some(parsed)
}

fn collect_metadata_tools(
    metadata: &JsonObject,
    cache: &mut JsonParseCache,
) -> (Vec<Value>, MetadataToolCleanup) {
    let mut cleanup = MetadataToolCleanup::default();
    let mut tools =
        parse_definition_array(metadata.get("tools"), true, false, cache).unwrap_or_default();
    cleanup.remove_root_tools = !tools.is_empty();
    let parsed = metadata
        .get("attributes")
        .and_then(|value| metadata_attributes(value, cache));
    if let Some(attributes) = parsed.as_deref().and_then(Value::as_object) {
        cleanup.rewrite_attributes = true;
        for (key, allow_unnamed) in [
            ("ai.prompt.tools", true),
            ("gen_ai.tool.definitions", false),
        ] {
            if let Some(values) =
                parse_definition_array(attributes.get(key), true, allow_unnamed, cache)
            {
                tools.extend(values);
                cleanup.attribute_keys.push(key.into());
            }
        }
        collect_model_parameter_tools(attributes, &mut tools, &mut cleanup, cache);
        collect_indexed_tools(attributes, &mut tools, &mut cleanup, cache);
    }
    (dedupe_definitions(tools, cache), cleanup)
}

fn collect_model_parameter_tools(
    attributes: &JsonObject,
    tools: &mut Vec<Value>,
    cleanup: &mut MetadataToolCleanup,
    cache: &mut JsonParseCache,
) {
    let Some(parsed) = attributes
        .get("model_request_parameters")
        .map(|value| parse_if_string(value, cache))
    else {
        return;
    };
    let Some(parameters) = parsed.as_object() else {
        return;
    };
    cleanup.rewrite_model_parameters = true;
    if let Some(values) =
        parse_definition_array(parameters.get("function_tools"), true, false, cache)
    {
        tools.extend(values);
        cleanup.remove_function_tools = true;
    }
}

fn collect_indexed_tools(
    attributes: &JsonObject,
    tools: &mut Vec<Value>,
    cleanup: &mut MetadataToolCleanup,
    cache: &mut JsonParseCache,
) {
    let mut indexed = attributes
        .keys()
        .filter_map(|key| {
            let suffix = key
                .as_str()
                .strip_prefix("llm.tools.")?
                .strip_suffix(".tool.json_schema")?;
            Some((suffix.parse::<usize>().ok()?, key.clone()))
        })
        .collect::<Vec<_>>();
    indexed.sort_by_key(|(index, _)| *index);
    for (_, key) in indexed {
        if let Some(value) = attributes.get(&key) {
            if is_definition_like(value, false, cache) {
                tools.push(parse_if_string(value, cache).into_owned());
                cleanup.attribute_keys.push(key);
            }
        }
    }
}

/// Check the merge shape before consuming input; compatible shapes receive the definitions and
/// incompatible shapes preserve the original fields.
fn append_tools_to_input(
    input: &mut Option<Value>,
    tools: Vec<Value>,
    cache: &mut JsonParseCache,
) -> bool {
    let parsed = input.as_ref().map(|value| cache.shared_or_self(value));
    let existing = match parsed.as_deref() {
        Some(Value::Bool(_) | Value::Number(_)) => return false,
        Some(Value::Object(object))
            if object.get("tools").is_some_and(|value| !value.is_null()) =>
        {
            let Some(existing) = parse_definition_array(object.get("tools"), false, true, cache)
            else {
                return false;
            };
            Some(existing)
        }
        Some(Value::Object(_) | Value::Array(_) | Value::String(_) | Value::Null) | None => None,
    };
    let value = match parsed {
        // Keep depth-limited input and its metadata tools intact. Malformed JSON
        // remains ordinary prompt text and can receive a tools wrapper.
        Some(ParsedJson::DepthLimited(_)) => return false,
        Some(ParsedJson::Shared(value)) => std::rc::Rc::unwrap_or_clone(value),
        Some(ParsedJson::Borrowed(_)) | None => input.take().unwrap_or(Value::Null),
    };
    let mut object = match value {
        Value::Object(object) => object,
        Value::Array(messages) => {
            JsonObject::from_iter([("messages".into(), Value::Array(messages))])
        }
        Value::String(prompt) => JsonObject::from_iter([("prompt".into(), Value::String(prompt))]),
        Value::Null => JsonObject::new(),
        value @ (Value::Bool(_) | Value::Number(_)) => {
            input.get_or_insert(value);
            return false;
        }
    };
    let tools = match existing {
        Some(existing) => dedupe_definitions(existing.into_iter().chain(tools), cache),
        None => tools,
    };
    object.insert("tools".into(), Value::Array(tools));
    *input = Some(Value::Object(object));
    true
}

fn string_value_js(value: &Value) -> Option<JsString> {
    match value {
        Value::String(value) => Some(value.clone()),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::Array(_) | Value::Object(_) => {
            None
        }
    }
}

fn definition_name_js(value: &Value) -> Option<JsString> {
    if !is_js_truthy(value) {
        return None;
    }
    match value {
        Value::String(value) => Some(value.clone()),
        _ => Some(javascript_string(value).into()),
    }
}

// Match JavaScript Set equality for primitive names; separately parsed arrays and objects retain
// identity semantics and therefore intentionally return no deduplication key.
fn definition_name_identity(value: &Value) -> Option<(u8, JsString)> {
    if !is_js_truthy(value) {
        return None;
    }
    match value {
        Value::String(value) => Some((0, value.clone())),
        Value::Number(value) => Some((1, javascript_number_to_string(value).into())),
        Value::Bool(true) => Some((2, JsString::default())),
        Value::Null | Value::Bool(false) | Value::Array(_) | Value::Object(_) => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::otel::value::json;

    fn normalize(
        input: Option<Value>,
        output: Option<Value>,
        metadata: Value,
    ) -> NormalizedObservation {
        normalize_tools_for_observation(
            input,
            output,
            metadata.as_object().unwrap().clone(),
            &mut JsonParseCache::default(),
        )
    }

    fn names(output: Value) -> Vec<String> {
        normalize(None, Some(output), json!({}))
            .tools
            .tool_call_names
    }

    #[test]
    fn normalizes_direct_and_metadata_tools_with_both_call_shapes() {
        let definition = json!({"type": "function", "function": {
            "name": "weather", "description": "forecast", "parameters": {"type": "object"}
        }});
        for (input, metadata) in [
            (json!({"tools": [definition]}), json!({})),
            (
                json!({"messages": [{"role": "user", "content": "weather"}]}),
                json!({"attributes": {"ai.prompt.tools": [definition]}}),
            ),
        ] {
            for output in [
                json!({"tool_calls": [{"id": "call-1", "type": "function", "function": {
                    "name": "weather", "arguments": {"city": "Amsterdam"}
                }}]}),
                json!({"content": [{"type": "tool-call", "toolName": "weather",
                    "input": {"city": "Amsterdam"}, "toolCallId": "call-1"}]}),
            ] {
                let normalized = normalize(Some(input.clone()), Some(output), metadata.clone());
                assert!(normalized.metadata.is_empty());
                assert_eq!(normalized.input.as_ref().unwrap()["tools"][0], definition);
                assert_eq!(normalized.tools.tool_call_names, ["weather"]);
                assert!(normalized.tools.tool_calls[0].contains("Amsterdam"));
                assert!(normalized.tools.tool_definitions["weather"].contains("forecast"));
            }
        }
        let output = Value::parse(
            r#"{"tool_calls":[{"id":"c","type":"function","function":{"name":"echo","arguments":"x\ud800"}}]}"#,
        ).unwrap();
        assert!(normalize(None, Some(output), json!({})).tools.tool_calls[0].contains(r#"x\ud800"#));
    }

    #[test]
    fn falls_back_to_the_first_parseable_call_array() {
        for (primary, expected) in [
            (Value::Null, vec!["fallback"]),
            (json!(false), vec!["fallback"]),
            (json!(0), vec!["fallback"]),
            (json!(""), vec!["fallback"]),
            (json!("not-json"), vec!["fallback"]),
            (json!({}), vec!["fallback"]),
            (json!([]), vec![]),
            (json!([null]), vec![]),
            (json!([{ "id": "a", "name": "primary" }]), vec!["primary"]),
        ] {
            for primary in [primary.clone(), javascript_json_stringify(&primary).into()] {
                let message = json!({
                    "tool_calls": primary,
                    "toolCalls": [{"id": "b", "name": "fallback"}]
                });
                assert_eq!(names(message.clone()), expected);
                assert_eq!(names(json!([message.clone()])), expected);
                assert_eq!(names(json!({"choices":[{"message":message}]})), expected);
            }
        }
    }

    #[test]
    fn matches_definition_wrapper_and_role_truthiness() {
        for (function, expected) in [
            (None, Some("outer")),
            (Some(Value::Null), Some("outer")),
            (Some(json!(false)), None),
            (Some(json!(0)), None),
            (Some(json!("")), None),
            (Some(json!("legacy")), None),
            (Some(json!([])), None),
            (Some(json!({})), None),
            (Some(json!({"name": "inner"})), Some("inner")),
        ] {
            let mut definition = json!({"type": "function", "name": "outer"});
            if let Some(function) = function {
                definition
                    .as_object_mut()
                    .unwrap()
                    .insert("function".into(), function);
            }
            for (input, metadata, expected) in [
                (Some(json!({"tools": [definition]})), json!({}), expected),
                (None, json!({"tools": [definition]}), expected),
                (
                    Some(json!([{"role": "tool", "content": definition}])),
                    json!({}),
                    expected.filter(|name| *name == "inner"),
                ),
            ] {
                let normalized = normalize(input, None, metadata.clone());
                assert_eq!(
                    normalized
                        .tools
                        .tool_definitions
                        .keys()
                        .map(String::as_str)
                        .collect::<Vec<_>>(),
                    expected.into_iter().collect::<Vec<_>>()
                );
                if expected.is_none() {
                    assert_eq!(&normalized.metadata, metadata.as_object().unwrap());
                }
            }
        }
    }

    #[test]
    fn keeps_empty_placeholders_and_rewrites_only_tool_metadata() {
        for (placeholder, retained) in [
            (json!([]), 0),
            (Value::Null, 0),
            (
                json!([
                    {"type": "provider", "name": "", "x": 1},
                    {"type": "provider", "name": "", "x": 2}
                ]),
                2,
            ),
        ] {
            for (attributes, expected) in [
                (json!(r#"{"custom":1}"#), json!(r#"{"custom":1}"#)),
                (
                    json!(r#"{"ai.prompt.tools":"{\"name\":\"single\"}"}"#),
                    json!({"ai.prompt.tools": r#"{"name":"single"}"#}),
                ),
                (
                    json!({
                        "model_request_parameters":
                            r#" {"function_tools":[], "temperature":0.2} "#
                    }),
                    json!({
                        "model_request_parameters": r#"{"temperature":0.2}"#
                    }),
                ),
            ] {
                let normalized = normalize(
                    Some(json!({"tools": placeholder})),
                    None,
                    json!({"tools": [{"name": "weather"}], "attributes": attributes}),
                );
                assert_eq!(normalized.tools.tool_definitions.len(), 1);
                assert_eq!(
                    normalized.input.as_ref().unwrap()["tools"]
                        .as_array()
                        .unwrap()
                        .len(),
                    retained + 1
                );
                assert!(normalized.metadata.get("tools").is_none());
                assert_eq!(normalized.metadata["attributes"], expected);
            }
        }
    }

    #[test]
    fn preserves_call_identity_and_falsy_marker_rules() {
        let output = json!({
            "tool_calls": [
                {
                    "call_id": null,
                    "id": "a",
                    "function": {"name": null, "arguments": null},
                    "name": "weather",
                    "arguments": null,
                    "args": {"city": "Oslo"},
                    "index": null
                },
                {"call_id": null, "id": "b", "name": "weather", "arguments": {"city": "Oslo"}},
                {"id": "c", "name": "", "arguments": {}},
                {"id": "c", "name": "weather", "arguments": {}},
                {"id": 1, "name": "weather", "arguments": {}},
                {"id": 2, "name": "weather", "arguments": {}},
                {"id": "1", "name": "weather", "arguments": {}},
                {"id": 1.0, "name": "weather", "arguments": {}},
                {"id": 0, "name": "weather", "arguments": {}},
                {"id": false, "name": "weather", "arguments": {}}
            ],
            "content": [{"type": "tool_use", "id": "d", "name": "weather", "input": null, "index": 3}]
        });
        let calls = normalize(None, Some(output), json!({})).tools.tool_calls;
        let calls = calls
            .iter()
            .map(|call| Value::parse(call).unwrap())
            .collect::<Vec<_>>();
        assert_eq!(
            calls
                .iter()
                .map(|call| call["id"].clone())
                .collect::<Vec<_>>(),
            vec![
                json!("a"),
                json!("b"),
                json!("c"),
                json!(1),
                json!(2),
                json!("1"),
                json!(0),
                json!("d")
            ]
        );
        assert_eq!(calls[0]["arguments"], json!("{\"city\":\"Oslo\"}"));
        assert_eq!(calls[0]["index"], json!(0));
        assert_eq!(calls.last().unwrap()["arguments"], json!("{}"));
        assert_eq!(calls.last().unwrap()["index"], json!(0));

        for falsy in [Value::Null, json!(false), json!(0), json!("")] {
            for placeholder in [
                json!({"call_id": falsy, "name": "weather", "arguments": null, "args": {}}),
                json!({"function": {"name": falsy, "arguments": null}, "name": "weather", "args": {}}),
                json!({"toolName": falsy, "name": "weather", "input": {}}),
            ] {
                let tools = normalize(
                    None,
                    Some(json!([
                        placeholder,
                        {"type": "function", "name": "weather", "arguments": null}
                    ])),
                    json!({}),
                )
                .tools;
                assert_eq!(tools.tool_call_names, ["weather"]);
                assert_eq!(
                    Value::parse(&tools.tool_calls[0]).unwrap()["type"],
                    json!("function")
                );
            }
        }
    }

    #[test]
    fn anthropic_parts_ignore_generic_fields_and_keep_canonical_values() {
        for part in [
            json!({"type": "tool_use"}),
            json!({"type": "tool_use", "name": "weather", "id": null, "input": {}}),
            json!({"type": "tool_use", "name": "weather", "id": "a", "input": null}),
            json!({"type": "tool_use", "name": "weather", "id": 7, "input": "text"}),
        ] {
            for noise in [
                json!({"toolName": "other", "toolCallId": "other"}),
                json!({"call_id": "other", "arguments": "other", "args": "other"}),
                json!({"function": {"name": "other", "arguments": "other"}, "index": 9}),
            ] {
                let null_id = part.get("id").is_some_and(Value::is_null);
                let mut noisy = part.clone();
                noisy
                    .as_object_mut()
                    .unwrap()
                    .extend(noise.as_object().unwrap().clone());
                let [expected, actual] = [part.clone(), noisy]
                    .map(|part| normalize(None, Some(json!({"content": [part]})), json!({})).tools);
                if null_id {
                    assert_eq!(
                        Value::parse(&actual.tool_calls[0]).unwrap()["id"],
                        json!("")
                    );
                }
                assert_eq!(actual.tool_calls, expected.tool_calls);
                assert_eq!(actual.tool_call_names, expected.tool_call_names);
            }
        }
    }

    #[test]
    fn extracts_only_definition_arrays_with_valid_names_and_parameters() {
        for tools in [json!(r#"[{"name":"weather"}]"#), json!({"weather": {}})] {
            assert!(normalize(Some(json!({"tools": tools})), None, json!({}))
                .tools
                .tool_definitions
                .is_empty());
        }
        for (parameters, expected) in [(Value::Null, r#"{"type":"object"}"#), (json!(false), "")] {
            let normalized = normalize(
                Some(json!({
                    "tools": [
                        {"name": ""},
                        {
                            "name": "weather",
                            "parameters": parameters,
                            "inputSchema": {"type": "object"}
                        }
                    ]
                })),
                None,
                json!({}),
            );
            assert_eq!(normalized.tools.tool_definitions.len(), 1);
            assert_eq!(
                Value::parse(&normalized.tools.tool_definitions["weather"]).unwrap()["parameters"],
                json!(expected)
            );
        }
        for (name, expected_key) in [
            (json!(5e-324), "5e-324"),
            (json!([]), ""),
            (json!({"provider": "tool"}), "[object Object]"),
        ] {
            let normalized = normalize(None, None, json!({"tools": [{"name": name}]}));
            assert_eq!(
                normalized
                    .tools
                    .tool_definitions
                    .keys()
                    .map(String::as_str)
                    .collect::<Vec<_>>(),
                [expected_key]
            );
        }
        for (tools, expected_len) in [
            (json!([{"name": 5e-324}, {"name": 5e-324}]), 1),
            (json!([{"name": 5e-324}, {"name": "5e-324"}]), 2),
            (json!([{"name": []}, {"name": []}]), 2),
        ] {
            let normalized = normalize(None, None, json!({"tools": tools}));
            assert_eq!(
                normalized.input.unwrap()["tools"].as_array().unwrap().len(),
                expected_len
            );
        }
        let input = Value::parse(r#"{"tools":[{"name":"\ud800"},{"name":"\udc00"}]}"#).unwrap();
        let output = Value::parse(
            r#"{"tool_calls":[{"name":"\ud800","arguments":{}},{"name":"\udc00","arguments":{}}]}"#,
        )
        .unwrap();
        let normalized = normalize(Some(input.clone()), Some(output.clone()), json!({}));
        assert!(normalized.tools.tool_definitions.is_empty());
        assert!(normalized.tools.tool_call_names.is_empty());
        assert_eq!(normalized.input, Some(input));
        assert_eq!(normalized.output, Some(output));
    }

    #[test]
    fn preserves_unmergeable_input_but_wraps_malformed_json() {
        for original in [
            json!(42),
            json!(false),
            json!("42"),
            json!({"tools": 42}),
            json!(r#"{"tools":42}"#),
            json!(format!("{}0{}", "[".repeat(128), "]".repeat(128))),
            json!(format!("{}0{}", "{\"a\":".repeat(256), "}".repeat(256))),
        ] {
            let mut cache = JsonParseCache::default();
            cache.parse(Some(&original));
            let normalized = normalize_tools_for_observation(
                Some(original.clone()),
                None,
                json!({"tools": [{"name": "weather"}]})
                    .as_object()
                    .unwrap()
                    .clone(),
                &mut cache,
            );
            assert_eq!(normalized.input, Some(original));
            assert_eq!(normalized.metadata["tools"][0]["name"], json!("weather"));
            assert!(normalized.tools.tool_definitions.is_empty());
        }
        let input = json!("{broken");
        let normalized = normalize(
            Some(input.clone()),
            None,
            json!({"tools": [{"name": "weather"}]}),
        );
        assert_eq!(normalized.input.as_ref().unwrap()["prompt"], input);
        assert!(normalized.metadata.is_empty());
        assert!(normalized.tools.tool_definitions.contains_key("weather"));
    }
}
