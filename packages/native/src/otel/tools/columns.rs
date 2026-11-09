//! Extract tool definitions, calls and names into `NormalizedTools`.
//!
//! `ToolColumns::input` reads definitions; `output` reads calls. Both borrow
//! `Value`s and store serialized definitions/calls and deduplication keys.

use std::collections::HashSet;

use super::super::attributes::{
    is_js_truthy, javascript_json_stringify, javascript_number_to_string, JsonParseCache,
};
use super::super::types::JsonObject;
use super::super::value::{JsString, Value};
use super::{definition_data, definition_name_js, string_value_js, NormalizedTools};

/// Extract tool definitions and calls from borrowed normalized values.
pub(super) struct ToolColumns<'a> {
    result: NormalizedTools,
    names: HashSet<(u8, JsString)>,
    calls: HashSet<CallIdentity>,
    cache: &'a mut JsonParseCache,
}

impl<'a> ToolColumns<'a> {
    pub(super) fn new(cache: &'a mut JsonParseCache) -> Self {
        ToolColumns {
            result: NormalizedTools::default(),
            names: HashSet::new(),
            calls: HashSet::new(),
            cache,
        }
    }

    pub(super) fn finish(self) -> NormalizedTools {
        self.result
    }

    pub(super) fn input(&mut self, value: &Value) {
        let parsed = self.cache.shared_or_self(value);
        if let Some(tools) = parsed.get("tools") {
            self.definitions(tools);
        }
        let messages = parsed
            .as_array()
            .or_else(|| parsed.get("messages").and_then(Value::as_array));
        for message in messages.into_iter().flatten() {
            if let Some(tools) = message.get("tools") {
                self.definitions(tools);
            }
            if message.get("role").and_then(Value::as_str) == Some("tool") {
                if let Some(content) = message.get("content").filter(|content| {
                    content.get("type").and_then(Value::as_str) == Some("function")
                        && content.get("function").is_some_and(is_js_truthy)
                }) {
                    self.definition(content);
                }
            }
        }
    }

    fn definitions(&mut self, value: &Value) {
        if let Some(values) = value.as_array() {
            for value in values {
                self.definition(value);
            }
        }
    }

    fn definition(&mut self, value: &Value) {
        let parsed = self.cache.shared_or_self(value);
        let Some(data) = definition_data(&parsed) else {
            return;
        };
        let Some(name) = data.get("name").and_then(definition_name_js) else {
            return;
        };
        // Index columns use UTF-8 names. Store a key containing an unpaired UTF-16 surrogate only
        // in the payload because lossy replacement would merge distinct names.
        if name.as_utf8().is_none() {
            return;
        }
        if let Some(identity) = data.get("name").and_then(super::definition_name_identity) {
            if !self.names.insert(identity) {
                return;
            }
        }
        let description = first(data, &["description", "desc"])
            .and_then(string_value_js)
            .unwrap_or_default();
        let parameters = first(
            data,
            &["parameters", "parameters_json_schema", "inputSchema"],
        )
        .filter(|value| is_js_truthy(value))
        .map(javascript_json_stringify)
        .unwrap_or_default();
        let normalized = Value::Object(JsonObject::from_iter([
            ("description".into(), Value::String(description)),
            ("parameters".into(), parameters.into()),
        ]));
        self.result.tool_definitions.insert(
            name.into_utf8_lossy(),
            javascript_json_stringify(&normalized),
        );
    }

    pub(super) fn output(&mut self, value: &Value) {
        let parsed = self.cache.shared_or_self(value);
        if let Some(values) = parsed.as_array() {
            for value in values {
                self.output_item(value, false);
            }
        } else {
            self.output_item(&parsed, true);
        }
    }

    fn output_item(&mut self, value: &Value, top_level: bool) {
        let Some(object) = value.as_object() else {
            return;
        };
        if is_tool_call_like(object)
            && !["role", "content", "tool_calls", "additional_kwargs"]
                .iter()
                .any(|key| object.contains_key(*key))
        {
            self.call(value, false);
            return;
        }
        self.call_array(object, &["tool_calls", "toolCalls"]);
        if top_level {
            for choice in object
                .get("choices")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if let Some(message) = choice.get("message").and_then(Value::as_object) {
                    self.call_array(message, &["tool_calls", "toolCalls"]);
                }
            }
        }
        for part in object
            .get("content")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            match part.get("type").and_then(Value::as_str) {
                Some("tool_use") => self.call(part, true),
                Some("tool-call") => self.call(part, false),
                _ => {}
            }
        }
        if top_level {
            if let Some(kwargs) = object.get("additional_kwargs").and_then(Value::as_object) {
                self.call_array(kwargs, &["tool_calls"]);
            }
        }
    }

    fn call_array(&mut self, object: &JsonObject, keys: &[&str]) {
        for value in keys.iter().filter_map(|key| object.get(*key)) {
            let parsed = self.cache.shared_or_self(value);
            if let Some(calls) = parsed.as_array() {
                for call in calls {
                    self.call(call, false);
                }
                return;
            }
        }
    }

    fn call(&mut self, value: &Value, content_tool_use: bool) {
        let Some(object) = value.as_object() else {
            return;
        };
        let (function, name, raw_id) = if content_tool_use {
            (None, object.get("name"), object.get("id"))
        } else {
            let function = object.get("function").and_then(Value::as_object);
            (
                function,
                function
                    .and_then(|function| function.get("name"))
                    .filter(|value| !value.is_null())
                    .or_else(|| first(object, &["name", "toolName"])),
                first(object, &["call_id", "id", "toolCallId"]),
            )
        };
        let Some(name) = name.and_then(string_value_js) else {
            return;
        };
        let arguments = call_arguments(object, function, content_tool_use);
        let identity = call_identity(raw_id, &name, &arguments);
        if name.is_empty()
            || name.as_utf8().is_none()
            || identity.is_some_and(|identity| !self.calls.insert(identity))
        {
            return;
        }
        let kind = object
            .get("type")
            .and_then(string_value_js)
            .unwrap_or_else(|| function.map_or_else(JsString::default, |_| "function".into()));
        let index = if content_tool_use {
            None
        } else {
            object
                .get("index")
                .filter(|value| !value.is_null())
                .cloned()
        };
        let call = Value::Object(JsonObject::from_iter([
            (
                "id".into(),
                raw_id
                    .filter(|value| !value.is_null())
                    .cloned()
                    .unwrap_or_else(|| Value::String(JsString::default())),
            ),
            ("arguments".into(), Value::String(arguments)),
            ("type".into(), Value::String(kind)),
            ("index".into(), index.unwrap_or_else(|| Value::from(0))),
        ]));
        self.result.tool_call_names.push(name.into_utf8_lossy());
        self.result
            .tool_calls
            .push(javascript_json_stringify(&call));
    }
}

fn call_arguments(
    object: &JsonObject,
    function: Option<&JsonObject>,
    content_tool_use: bool,
) -> JsString {
    let function_arguments = function
        .and_then(|function| function.get("arguments"))
        .filter(|value| !value.is_null());
    if content_tool_use {
        javascript_json_stringify(
            object
                .get("input")
                .filter(|value| !value.is_null())
                .unwrap_or(&Value::Object(JsonObject::new())),
        )
        .into()
    } else {
        match function_arguments.or_else(|| first(object, &["arguments", "args", "input"])) {
            Some(Value::String(text)) => text.clone(),
            Some(value) => javascript_json_stringify(value).into(),
            None => "{}".into(),
        }
    }
}

fn first<'a>(object: &'a JsonObject, keys: &[&str]) -> Option<&'a Value> {
    keys.iter()
        .find_map(|key| object.get(*key).filter(|value| !value.is_null()))
}

fn is_tool_call_like(object: &JsonObject) -> bool {
    let kind = object.get("type").and_then(Value::as_str);
    if kind == Some("tool-result") {
        return false;
    }
    let has = |key| object.contains_key(key);
    let truthy = |key| object.get(key).is_some_and(is_js_truthy);
    object
        .get("function")
        .and_then(Value::as_object)
        .is_some_and(|function| {
            function.get("name").is_some_and(is_js_truthy) && function.contains_key("arguments")
        })
        || (truthy("toolName") && (kind == Some("tool-call") || has("input") || has("args")))
        || (truthy("call_id") && truthy("name") && has("arguments"))
        || (kind == Some("tool_use") && truthy("name") && has("input"))
        || (truthy("name")
            && has("arguments")
            && (has("id")
                || has("index")
                || matches!(
                    kind,
                    Some("function" | "function_call" | "tool-call" | "tool_use")
                )))
}

fn call_identity(
    raw_id: Option<&Value>,
    name: &JsString,
    arguments: &JsString,
) -> Option<CallIdentity> {
    match raw_id.filter(|value| is_js_truthy(value)) {
        Some(Value::String(value)) => Some(CallIdentity::StringId(value.clone())),
        Some(Value::Number(value)) => {
            Some(CallIdentity::NumberId(javascript_number_to_string(value)))
        }
        Some(Value::Bool(true)) => Some(CallIdentity::BoolId),
        // JSON object and array values have identity semantics in JavaScript. Distinct
        // occurrences are therefore emitted without content-based deduplication.
        Some(Value::Array(_) | Value::Object(_)) => None,
        Some(Value::Null | Value::Bool(false)) | None => Some(CallIdentity::NameAndArguments(
            name.clone(),
            arguments.clone(),
        )),
    }
}

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
enum CallIdentity {
    StringId(JsString),
    NumberId(String),
    BoolId,
    NameAndArguments(JsString, JsString),
}
