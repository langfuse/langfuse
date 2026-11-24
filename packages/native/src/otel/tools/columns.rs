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
use super::{
    definition_data, definition_name_js, javascript_to_string_throws, string_value_js,
    NormalizedTools, PropertyKeyTypeError,
};

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

    pub(super) fn input(&mut self, value: &Value) -> Result<(), super::PropertyKeyTypeError> {
        let parsed = self.cache.shared_or_self(value);
        if let Some(tools) = parsed.get("tools") {
            self.definitions(tools)?;
        }
        let messages = parsed
            .as_array()
            .or_else(|| parsed.get("messages").and_then(Value::as_array));
        for message in messages.into_iter().flatten() {
            if let Some(tools) = message.get("tools") {
                self.definitions(tools)?;
            }
            if message.get("role").and_then(Value::as_str) == Some("tool") {
                if let Some(content) = message.get("content").filter(|content| {
                    content.get("type").and_then(Value::as_str) == Some("function")
                        && content.get("function").is_some_and(is_js_truthy)
                }) {
                    self.definition(content)?;
                }
            }
        }
        Ok(())
    }

    fn definitions(&mut self, value: &Value) -> Result<(), super::PropertyKeyTypeError> {
        if let Some(values) = value.as_array() {
            for value in values {
                self.definition(value)?;
            }
        }
        Ok(())
    }

    fn definition(&mut self, value: &Value) -> Result<(), super::PropertyKeyTypeError> {
        let parsed = self.cache.shared_or_self(value);
        let Some(data) = definition_data(&parsed) else {
            return Ok(());
        };
        let name = match data.get("name") {
            Some(name) => definition_name_js(name)?,
            None => None,
        };
        let Some(name) = name else {
            return Ok(());
        };
        // Index columns use UTF-8 names. Store a key containing an unpaired UTF-16 surrogate only
        // in the payload because lossy replacement would merge distinct names.
        if name.as_utf8().is_none() {
            return Ok(());
        }
        if let Some(identity) = data.get("name").and_then(super::definition_name_identity) {
            if !self.names.insert(identity) {
                return Ok(());
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
        Ok(())
    }

    /// OpenAI Responses echoes available tools on the output object. TypeScript reads them
    /// only when the input produced no definitions and both `output` and `tools` are arrays.
    pub(super) fn responses_tool_definitions(
        &mut self,
        output: &Value,
    ) -> Result<(), PropertyKeyTypeError> {
        if !self.result.tool_definitions.is_empty() {
            return Ok(());
        }
        let tools = {
            let parsed = self.cache.shared_or_self(output);
            let Some(object) = parsed.as_object() else {
                return Ok(());
            };
            if object.get("output").and_then(Value::as_array).is_none() {
                return Ok(());
            }
            let Some(tools) = object
                .get("tools")
                .filter(|value| value.as_array().is_some())
            else {
                return Ok(());
            };
            tools.clone()
        };
        self.definitions(&tools)
    }

    pub(super) fn output(&mut self, value: &Value) -> Result<(), PropertyKeyTypeError> {
        let parsed = self.cache.shared_or_self(value);
        if let Some(values) = parsed.as_array() {
            for value in values {
                self.output_item(value, false)?;
            }
        } else {
            self.output_item(&parsed, true)?;
        }
        Ok(())
    }

    fn output_item(&mut self, value: &Value, top_level: bool) -> Result<(), PropertyKeyTypeError> {
        let Some(object) = value.as_object() else {
            return Ok(());
        };
        // `isToolCallLike` always evaluates `String(type)` when the object has neither `id`
        // nor `index`. That throw aborts extraction before later call arrays are read.
        if output_type_string_throws(object) {
            return Err(PropertyKeyTypeError);
        }
        if is_tool_call_like(object)
            && !["role", "content", "tool_calls", "additional_kwargs"]
                .iter()
                .any(|key| object.contains_key(*key))
        {
            return self.call(value, false);
        }
        // An OpenAI Responses object lists its calls as items of `output`. They are read
        // like the items of an output array, before the object's own call arrays.
        if top_level {
            for item in object
                .get("output")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                self.output_item(item, false)?;
            }
        }
        self.call_array(object, &["tool_calls", "toolCalls"])?;
        if top_level {
            for choice in object
                .get("choices")
                .and_then(Value::as_array)
                .into_iter()
                .flatten()
            {
                if let Some(message) = choice.get("message").and_then(Value::as_object) {
                    self.call_array(message, &["tool_calls", "toolCalls"])?;
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
                Some("tool_use") => self.call(part, true)?,
                Some("tool-call") => self.call(part, false)?,
                _ => {}
            }
        }
        if top_level {
            if let Some(kwargs) = object.get("additional_kwargs").and_then(Value::as_object) {
                self.call_array(kwargs, &["tool_calls"])?;
            }
        }
        Ok(())
    }

    fn call_array(
        &mut self,
        object: &JsonObject,
        keys: &[&str],
    ) -> Result<(), PropertyKeyTypeError> {
        for value in keys.iter().filter_map(|key| object.get(*key)) {
            let parsed = self.cache.shared_or_self(value);
            if let Some(calls) = parsed.as_array() {
                for call in calls {
                    self.call(call, false)?;
                }
                return Ok(());
            }
        }
        Ok(())
    }

    fn call(&mut self, value: &Value, content_tool_use: bool) -> Result<(), PropertyKeyTypeError> {
        let Some(object) = value.as_object() else {
            return Ok(());
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
        // With no truthy id, TypeScript builds the dedupe key with
        // `${name}-${arguments}`. `ToString` on that name throws before any column is stored.
        if name.is_some_and(|name| call_id_is_js_falsy(raw_id) && javascript_to_string_throws(name))
        {
            return Err(PropertyKeyTypeError);
        }
        let Some(name) = name.and_then(string_value_js) else {
            return Ok(());
        };
        let arguments = call_arguments(object, function, content_tool_use);
        let identity = call_identity(raw_id, &name, &arguments);
        if name.is_empty()
            || name.as_utf8().is_none()
            || identity.is_some_and(|identity| !self.calls.insert(identity))
        {
            return Ok(());
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
        Ok(())
    }
}

/// `isToolCallLike` evaluates `String(call.type)` only when `"id"` and `"index"` are absent.
/// The key check includes a present `null`, which still skips the conversion.
fn output_type_string_throws(object: &JsonObject) -> bool {
    if object.contains_key("id") || object.contains_key("index") {
        return false;
    }
    object.get("type").is_some_and(javascript_to_string_throws)
}

/// The dedupe key is `arg.id || `${arg.name}-${arg.arguments}``. A missing id becomes `""`.
fn call_id_is_js_falsy(raw_id: Option<&Value>) -> bool {
    raw_id.is_none_or(|value| !is_js_truthy(value))
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
