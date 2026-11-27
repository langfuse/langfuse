//! Normalize OTLP attribute shapes for Langfuse event construction.
//!
//! `attributes_to_map` accepts OTLP KeyValue lists and replay maps, consumes their
//! wrappers, and moves the contents into an owned `JsonObject`. `any_value_to_json`
//! unwraps known AnyValue fields. Compatibility with TypeScript includes omitting
//! null KeyValue entries and retaining unrecognized AnyValue objects as JSON text.
//!
//! ```text
//! [{"key":"model","value":{"stringValue":"model-a"}}]
//!   -> attributes_to_map -> {"model":"model-a"}
//! ```
//!
//! During event construction, `EventAttributes` borrows span/resource/scope maps
//! and reads fields using ordered `AttributeSource` lists. Metadata and tool
//! extraction also read these maps. The instrumentation adapters in `providers/`
//! interpret conventions such as `gen_ai.request.model` to extract model names,
//! input/output and usage. Shared helpers apply JavaScript coercions and convert
//! nanosecond timestamps to milliseconds.
//!
//! `JsonParseCache` parses JSON inside attribute strings on demand. It remembers the
//! parse of a span attribute by the attribute's position, so extractors that read
//! the same attribute share one parse. `ParsedJson` borrows an existing value or
//! shares a parsed tree through `Rc`, so recursive tool extraction can hold it
//! while parsing nested strings.

use chrono::{DateTime, Datelike, Utc};
use num_bigint::BigUint;
use num_traits::{Num, ToPrimitive};
use serde::de::{DeserializeSeed, IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::value::RawValue;
use std::rc::Rc;

use super::value::{FastValue, JsString, JsonObject, Number, Object, Value};

pub(crate) use super::value::javascript_array_index;
pub use super::value::{javascript_json_stringify, javascript_number_to_string};

/// Ordered source keys used by the row schema. Coercion belongs to the field,
/// so nullish strings and truthy, SDK-decoded identities stay distinct.
#[derive(Clone, Copy)]
pub enum AttributeSource {
    Span(&'static str),
    Resource(&'static str),
    Scope(&'static str),
}

pub struct EventAttributes<'a> {
    pub span: &'a JsonObject,
    pub resource: &'a JsonObject,
    pub scope: &'a JsonObject,
    pub cache: &'a mut JsonParseCache,
    pub decode_metadata: bool,
    pub evaluation_fields: &'a mut Option<Box<JsonObject>>,
}

impl EventAttributes<'_> {
    fn get(&self, source: AttributeSource) -> Option<&Value> {
        match source {
            AttributeSource::Span(key) => self.span.get(key),
            AttributeSource::Resource(key) => self.resource.get(key),
            AttributeSource::Scope(key) => self.scope.get(key),
        }
    }

    pub fn text(&mut self, column: &str, sources: &[AttributeSource]) -> Option<String> {
        for source in sources {
            let (map, key) = match *source {
                AttributeSource::Span(key) => (self.span, key),
                AttributeSource::Resource(key) => (self.resource, key),
                AttributeSource::Scope(key) => (self.scope, key),
            };
            let Some(value) = map.get(key).filter(|value| !value.is_null()) else {
                continue;
            };
            retain_evaluation_value(self.evaluation_fields, column, value);
            return value_as_string(value);
        }
        None
    }

    pub fn truthy_text(&self, sources: &[AttributeSource]) -> Option<String> {
        sources.iter().find_map(|source| {
            let value = self.get(*source).filter(|value| is_js_truthy(value))?;
            Some(javascript_string(value))
        })
    }

    pub fn scope_name(&self, sources: &[AttributeSource]) -> Option<String> {
        sources
            .iter()
            .find_map(|source| self.get(*source)?.as_str().map(str::to_owned))
    }

    pub fn identity(&mut self, sources: &[AttributeSource]) -> Option<String> {
        for source in sources {
            let (map, key) = match *source {
                AttributeSource::Span(key) => (self.span, key),
                AttributeSource::Resource(key) => (self.resource, key),
                AttributeSource::Scope(key) => (self.scope, key),
            };
            let Some(value) = map.get(key) else { continue };
            let decoded = if self.decode_metadata
                && (key.starts_with("langfuse.observation.metadata.")
                    || key.starts_with("langfuse.trace.metadata."))
            {
                self.cache
                    .parse(Some(value))
                    .filter(|value| matches!(value, Value::String(_)))
                    .unwrap_or(value)
            } else {
                value
            };
            if let Some(value) = is_js_truthy(decoded)
                .then(|| value_as_string(decoded))
                .flatten()
                .filter(|value| !value.is_empty())
            {
                return Some(value);
            }
        }
        None
    }
}

/// Storage accepts coerced text, but evaluation validates the original field types.
/// Retain only values whose types would otherwise be hidden by stringification.
pub(crate) fn retain_evaluation_value(
    fields: &mut Option<Box<JsonObject>>,
    column: &str,
    value: &Value,
) {
    if !matches!(value, Value::String(_) | Value::Null) {
        fields
            .get_or_insert_with(Default::default)
            .insert(column.into(), value.clone());
    }
}

/// Convert an OTLP `AnyValue` wrapper into the plain value exposed by the legacy processor.
///
/// Consumes wrappers and reuses their payload allocations.
pub fn any_value_to_json(value: Value) -> Value {
    let mut object = match value {
        Value::Object(object) => object,
        // Text passes through: the decoder hands on a wrapper too deep to parse as its JSON text.
        Value::Null | Value::String(_) => return value,
        // Any other value without a wrapper is read as its JSON text, like an unrecognized wrapper.
        value => return Value::String(javascript_json_stringify(&value).into()),
    };

    if object.is_empty() {
        return Value::Null;
    }

    // An AnyValue normally holds one field. Read the common scalar kinds by position instead of
    // hashing each candidate name in turn; every other shape takes the general path below.
    if let (1, Some((name, value))) = (object.len(), object.get_index(0)) {
        match name.as_bytes() {
            b"stringValue" | b"boolValue" => {
                return object.pop().expect("one field").1;
            }
            b"doubleValue" => return parse_double(value),
            b"intValue" => {
                if let Some(integer) = parse_int(value) {
                    return integer;
                }
            }
            _ => {}
        }
    }

    if let Some(value) = object.shift_remove("stringValue") {
        return value;
    }
    if let Some(value) = object.shift_remove("doubleValue") {
        return parse_double(&value);
    }
    if let Some(value) = object.shift_remove("boolValue") {
        return value;
    }
    if let Some(value) = object
        .get_mut("arrayValue")
        .filter(|value| is_js_truthy(value))
    {
        let values = match std::mem::take(value) {
            Value::Object(mut object) => match object.shift_remove("values") {
                Some(Value::Array(values)) => values.into_iter().map(any_value_to_json).collect(),
                _ => Vec::new(),
            },
            _ => Vec::new(),
        };
        return Value::Array(values);
    }
    if let Some(value) = object.get("intValue") {
        // `convertValueToPlainJavascript` falls back to JSON.stringify of the complete
        // AnyValue wrapper when the int64 payload is not a supported number/Long shape. Keep
        // that wrapper instead of returning the invalid inner value, e.g. preserve
        // `{"intValue":"synthetic"}` as a string.
        return parse_int(value).unwrap_or_else(|| {
            Value::String(javascript_json_stringify(&Value::Object(object)).into())
        });
    }
    // An unrecognized AnyValue object follows the TypeScript fallback: retain its JSON text.
    Value::String(javascript_json_stringify(&Value::Object(object)).into())
}

/// Read either the OTLP array form (`[{key,value}]`) or a replay object's map form.
pub fn attributes_to_map(value: Value) -> JsonObject {
    match value {
        Value::Object(mut object) => {
            // A KeyValueList has a non-empty array of `{key, value}` entries. An ordinary
            // replay map may also have a user field named `values`.
            if let Some(Value::Array(values)) = object.get_mut("values") {
                if is_key_value_list(values) {
                    return key_value_array_to_map(std::mem::take(values));
                }
            }
            for value in object.values_mut() {
                *value = map_value_to_json(std::mem::take(value));
            }
            object
        }
        Value::Array(values) => key_value_array_to_map(values),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => JsonObject::new(),
    }
}

fn map_value_to_json(value: Value) -> Value {
    if is_any_value(&value) {
        any_value_to_json(value)
    } else {
        value
    }
}

/// Whether a value in a map-form attribute object is read as an OTLP AnyValue wrapper.
fn is_any_value(value: &Value) -> bool {
    value.as_object().is_some_and(|object| {
        object.is_empty()
            || [
                "stringValue",
                "doubleValue",
                "boolValue",
                "intValue",
                "arrayValue",
                "kvlistValue",
            ]
            .iter()
            .any(|key| object.contains_key(*key))
    })
}

pub(super) fn is_key_value_list(values: &[Value]) -> bool {
    !values.is_empty()
        && values.iter().all(|value| {
            let Value::Object(object) = value else {
                return false;
            };
            matches!(object.get("key"), Some(Value::String(_))) && object.contains_key("value")
        })
}

fn key_value_array_to_map(values: Vec<Value>) -> JsonObject {
    let mut result = JsonObject::with_capacity(values.len());
    for entry in values {
        let Value::Object(mut entry) = entry else {
            continue;
        };
        // Nearly every entry is exactly `{"key": ..., "value": ...}`; take both fields by
        // position instead of hashing their names.
        let is_key_then_value = entry.len() == 2
            && entry
                .get_index(0)
                .is_some_and(|(name, _)| name.as_bytes() == b"key")
            && entry
                .get_index(1)
                .is_some_and(|(name, _)| name.as_bytes() == b"value");
        let (key, value) = if is_key_then_value {
            let value = entry.pop().map(|(_, value)| value);
            (entry.pop().map(|(_, key)| key), value)
        } else {
            (entry.shift_remove("key"), entry.shift_remove("value"))
        };
        let Some(Value::String(key)) = key else {
            continue;
        };
        let Some(value) = value else {
            continue;
        };
        if value.is_null() || matches!(&value, Value::Object(object) if object.is_empty()) {
            continue;
        }
        result.insert(key, any_value_to_json(value));
    }
    result
}

/// Decode a KeyValue list whose entries are all `{"key": name, "value": {kind: payload}}`
/// straight into the attribute map. Scalar values are read without building the two wrapper
/// objects of their entry; any other kind is converted as the full parser converts it. The
/// result equals `attributes_to_map` of the parsed list. Any other entry shape returns `None`
/// and the caller parses the list in full.
pub(super) fn direct_attributes(source: &str) -> Option<JsonObject> {
    // An entry takes at least 40 bytes of JSON, which bounds the number of entries.
    let mut attributes = JsonObject::with_capacity((source.len() / 40).min(32));
    let mut deserializer = serde_json::Deserializer::from_str(source);
    DirectEntries(&mut attributes)
        .deserialize(&mut deserializer)
        .ok()?;
    deserializer.end().ok()?;
    // Callers pass the result to `attributes_to_map`, which converts object values that look
    // like an AnyValue and unwraps a KeyValue list stored under `values`. Only a map that it
    // returns unchanged may take this path.
    let is_unchanged_as_object = !attributes.values().any(is_any_value)
        && !matches!(
            attributes.get("values"),
            Some(Value::Array(values)) if is_key_value_list(values)
        );
    is_unchanged_as_object.then_some(attributes)
}

struct DirectEntries<'a>(&'a mut JsonObject);

impl<'de> DeserializeSeed<'de> for DirectEntries<'_> {
    type Value = ();

    fn deserialize<D: Deserializer<'de>>(self, deserializer: D) -> Result<(), D::Error> {
        deserializer.deserialize_seq(self)
    }
}

impl<'de> Visitor<'de> for DirectEntries<'_> {
    type Value = ();

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("a list of OTLP attributes")
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut entries: A) -> Result<(), A::Error> {
        while let Some(DirectEntry(name, value)) = entries.next_element()? {
            self.0.insert(name, value);
        }
        Ok(())
    }
}

struct DirectEntry(JsString, Value);

impl<'de> Deserialize<'de> for DirectEntry {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct EntryVisitor;

        impl<'de> Visitor<'de> for EntryVisitor {
            type Value = DirectEntry;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("an OTLP attribute with a key and a value")
            }

            fn visit_map<A: MapAccess<'de>>(self, mut entry: A) -> Result<DirectEntry, A::Error> {
                expect_field(&mut entry, r#""key""#)?;
                let Value::String(name) = entry.next_value::<FastValue>()?.0 else {
                    return Err(other_shape());
                };
                // A span whose attributes are an object reads that object's `attributes`
                // member instead, so a list holding this name must stay a list.
                if name.as_bytes() == b"attributes" {
                    return Err(other_shape());
                }
                expect_field(&mut entry, r#""value""#)?;
                let value = entry.next_value::<DirectAnyValue>()?.0;
                expect_end(&mut entry)?;
                Ok(DirectEntry(name, value))
            }
        }

        deserializer.deserialize_map(EntryVisitor)
    }
}

/// An AnyValue with exactly one field, already converted as `any_value_to_json` does.
struct DirectAnyValue(Value);

impl<'de> Deserialize<'de> for DirectAnyValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct AnyValueVisitor;

        impl<'de> Visitor<'de> for AnyValueVisitor {
            type Value = DirectAnyValue;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("an OTLP AnyValue with one field")
            }

            fn visit_map<A: MapAccess<'de>>(
                self,
                mut wrapper: A,
            ) -> Result<DirectAnyValue, A::Error> {
                let Some(kind) = wrapper.next_key::<&RawValue>()? else {
                    return Err(other_shape());
                };
                let kind = kind.get();
                let payload = wrapper.next_value::<FastValue>()?.0;
                expect_end(&mut wrapper)?;
                let scalar = match (kind, &payload) {
                    (r#""stringValue""#, Value::String(_)) | (r#""boolValue""#, Value::Bool(_)) => {
                        return Ok(DirectAnyValue(payload))
                    }
                    (r#""doubleValue""#, Value::Number(_) | Value::String(_)) => {
                        Some(parse_double(&payload))
                    }
                    (r#""intValue""#, Value::Number(_) | Value::String(_)) => parse_int(&payload),
                    _ => None,
                };
                if let Some(value) = scalar {
                    return Ok(DirectAnyValue(value));
                }
                // Arrays and every other kind take the conversion the full parser applies to
                // this wrapper. An escaped field name is left to the full parser to decode.
                if kind.contains('\\') {
                    return Err(other_shape());
                }
                let mut object = JsonObject::with_capacity(1);
                object.insert(kind[1..kind.len() - 1].into(), payload);
                Ok(DirectAnyValue(any_value_to_json(Value::Object(object))))
            }
        }

        deserializer.deserialize_map(AnyValueVisitor)
    }
}

/// Read the next field name, which must be exactly `token`, quotes included.
fn expect_field<'de, A: MapAccess<'de>>(object: &mut A, token: &str) -> Result<(), A::Error> {
    match object.next_key::<&RawValue>()? {
        Some(name) if name.get() == token => Ok(()),
        _ => Err(other_shape()),
    }
}

fn expect_end<'de, A: MapAccess<'de>>(object: &mut A) -> Result<(), A::Error> {
    match object.next_key::<IgnoredAny>()? {
        None => Ok(()),
        Some(_) => Err(other_shape()),
    }
}

fn other_shape<E: serde::de::Error>() -> E {
    E::custom("not a list of plain OTLP attributes")
}

/// Parse IDs emitted by the JS SDK, protobuf decoders, and OTLP JSON replay files.
pub fn parse_id(value: &Value) -> String {
    if let Some(value) = value.as_str() {
        return value.to_string();
    }
    if let Some(object) = value.as_object() {
        if let Some(data) = object.get("data") {
            return parse_id(data);
        }
    }
    if let Some(values) = value.as_array() {
        let bytes = values.iter().map(id_byte).collect::<Vec<_>>();
        return bytes_to_hex(&bytes);
    }
    String::new()
}

// Buffer.from(array) coerces every element to a byte, preserving the array length.
fn id_byte(value: &Value) -> u8 {
    let number = match value {
        Value::Number(number) => number.as_f64(),
        Value::Bool(value) => Some(u8::from(*value) as f64),
        Value::String(value) => parse_javascript_number(value.as_str()),
        Value::Array(_) => parse_javascript_number(&javascript_string(value)),
        Value::Null | Value::Object(_) => None,
    }
    .unwrap_or_default();
    // Truncate before wrapping; a direct float-to-byte cast would saturate.
    number.trunc().rem_euclid(256.0) as u8
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut output = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        output.push(HEX[(byte >> 4) as usize] as char);
        output.push(HEX[(byte & 0x0f) as usize] as char);
    }
    output
}

/// Convert an OTLP nanosecond timestamp to the millisecond precision used by JS `Date`.
/// The outer `None` is a missing or unreadable timestamp. The inner `None` is a time outside
/// years 0000-9999, which ClickHouse cannot store.
fn nano_timestamp_to_iso(value: Option<&Value>) -> Option<Option<String>> {
    let value = value?;
    let millis = match value {
        Value::String(value) => value.as_utf8()?.parse::<i128>().ok()? / 1_000_000,
        // JS Date divides numeric timestamps in floating point before truncating.
        Value::Number(value) => {
            (value.as_f64().filter(|value| value.is_finite())? / 1_000_000.0) as i128
        }
        Value::Object(object) => {
            let high = object.get("high")?.as_i64()? as i128;
            let low = object.get("low")?.as_i64()? as u32 as i128;
            ((high << 32) | low) / 1_000_000
        }
        _ => return None,
    };
    // JS `Date` holds 8.64e15 milliseconds either side of the epoch; more is an invalid date,
    // which TypeScript reads as a missing timestamp.
    let millis = i64::try_from(millis)
        .ok()
        .filter(|millis| millis.unsigned_abs() <= 8_640_000_000_000_000)?;
    Some(
        DateTime::<Utc>::from_timestamp_millis(millis)
            .filter(|date| (0..=9999).contains(&date.year()))
            .map(|date| date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)),
    )
}

/// Resolve missing OTLP span endpoints exactly once at the processing boundary. Returns `None`
/// when an endpoint lies outside years 0000-9999; the caller drops that span.
pub fn resolve_timestamps(
    start: Option<&Value>,
    end: Option<&Value>,
    fallback: &str,
) -> Option<(String, String)> {
    let start = nano_timestamp_to_iso(start);
    let end = nano_timestamp_to_iso(end);
    Some(match (start, end) {
        (Some(start), Some(end)) => (start?, end?),
        (Some(start), None) => (start.clone()?, start?),
        (None, Some(end)) => (end.clone()?, end?),
        (None, None) => (fallback.to_owned(), fallback.to_owned()),
    })
}

pub fn value_as_string(value: &Value) -> Option<String> {
    match value {
        Value::Null => None,
        Value::String(value) => Some(value.as_str().to_owned()),
        Value::Number(value) => Some(javascript_number_to_string(value)),
        value => Some(javascript_json_stringify(value)),
    }
}

/// Convert a JSON value using the JavaScript `String(value)` coercion used by the OTEL tag
/// adapter. This differs from JSON serialization for arrays and objects: `String([1, null])` is
/// `"1,"`, while `String({})` is `"[object Object]"`.
pub fn javascript_string(value: &Value) -> String {
    match value {
        Value::Null => "null".to_owned(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => javascript_number_to_string(value),
        Value::String(value) => value.as_str().to_owned(),
        Value::Array(values) => values
            .iter()
            .map(|value| match value {
                Value::Null => String::new(),
                Value::Array(_) => javascript_string(value),
                Value::String(value) => value.as_str().to_owned(),
                value => javascript_string(value),
            })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".to_owned(),
    }
}

/// Consume an object in JavaScript key order: canonical array indices first numerically, then
/// other keys in insertion order. Objects without index keys need no sorting buffer.
pub fn for_each_javascript_object_entry_owned(
    object: Object,
    mut visit: impl FnMut(JsString, Value),
) {
    if !object.keys().any(|key| {
        key.as_utf8()
            .is_some_and(|key| javascript_array_index(key).0 == 0)
    }) {
        for (key, value) in object {
            visit(key, value);
        }
        return;
    }

    let mut entries = object.into_iter().collect::<Vec<_>>();
    entries.sort_by_key(|(key, _)| key.as_utf8().map_or((1, 0), javascript_array_index));
    for (key, value) in entries {
        visit(key, value);
    }
}

pub fn value_as_bool(value: Option<&Value>) -> bool {
    match value {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(value)) => value.as_utf8() == Some("true"),
        Some(Value::Number(value)) => value.as_f64().map(|value| value != 0.0).unwrap_or(true),
        _ => false,
    }
}

pub fn value_as_f64(value: Option<&Value>) -> Option<f64> {
    match value {
        Some(Value::Number(value)) => value.as_f64().filter(|value| value.is_finite()),
        Some(Value::String(value)) => value
            .as_utf8()?
            .parse::<f64>()
            .ok()
            .filter(|value| value.is_finite()),
        _ => None,
    }
}

pub(super) fn trim_javascript(value: &str) -> &str {
    value.trim_matches(|character: char| {
        (character.is_whitespace() && character != '\u{0085}') || character == '\u{feff}'
    })
}

pub(super) fn parse_javascript_number(value: &str) -> Option<f64> {
    let value = trim_javascript(value);
    if value.is_empty() {
        return None;
    }

    let radix = match value.as_bytes() {
        [b'0', b'x' | b'X', ..] => Some(16),
        [b'0', b'b' | b'B', ..] => Some(2),
        [b'0', b'o' | b'O', ..] => Some(8),
        _ => None,
    };

    let number = match radix {
        Some(radix) if value.len() > 2 => {
            let digits = &value[2..];
            // BigUint accepts a leading '+' and '_' separators; JS radix strings do not.
            if digits.starts_with('+') || digits.contains('_') {
                return None;
            }
            u128::from_str_radix(digits, radix)
                .map(|value| value as f64)
                .ok()
                .or_else(|| BigUint::from_str_radix(digits, radix).ok()?.to_f64())?
        }
        Some(_) => return None,
        None if matches!(value, "Infinity" | "+Infinity") => f64::INFINITY,
        None if value == "-Infinity" => f64::NEG_INFINITY,
        None if value
            .bytes()
            .any(|byte| byte.is_ascii_alphabetic() && !matches!(byte, b'e' | b'E')) =>
        {
            return None
        }
        None => value.parse::<f64>().ok()?,
    };
    Some(number)
}

/// Match JavaScript's truthiness for values that participate in provider fallback chains.
///
/// Rust's `Option` checks are not interchangeable here: JavaScript treats empty arrays and
/// objects as truthy, while `0`, `false`, `null`, and `""` are falsy. Provider adapters use this
/// helper only where the legacy processor uses `||` or an `if (value)` guard.
pub fn is_js_truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value.as_f64() != Some(0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn parse_numeric_string(text: &JsString) -> Option<f64> {
    let text = trim_javascript(text.as_utf8()?);
    text.is_empty()
        .then_some(0.0)
        .or_else(|| parse_javascript_number(text))
}

fn parse_double(value: &Value) -> Value {
    let Value::String(text) = value else {
        return value.clone();
    };
    parse_numeric_string(text)
        .and_then(Number::from_f64)
        .map(Value::Number)
        .unwrap_or_else(|| value.clone())
}

fn parse_int(value: &Value) -> Option<Value> {
    if matches!(value, Value::Number(Number::Overflow { .. })) {
        return Some(value.clone());
    }
    if let Some(value) = value.as_f64() {
        return number_from_integer_like_f64(value).map(Value::Number);
    }
    if let Value::String(text) = value {
        return parse_numeric_string(text)
            .and_then(number_from_integer_like_f64)
            .map(Value::Number);
    }
    if let Some(object) = value.as_object() {
        if let (Some(high), Some(low)) = (object.get("high"), object.get("low")) {
            if let (Some(high), Some(low)) = (high.as_f64(), low.as_f64()) {
                if high == -1.0 && low == -1.0 {
                    return Some(Value::Number(Number::from(-1)));
                }
                let value = high * 4_294_967_296.0 + low;
                if let Some(value) = number_from_integer_like_f64(value) {
                    return Some(Value::Number(value));
                }
            }
        }
    }
    None
}

fn number_from_integer_like_f64(value: f64) -> Option<Number> {
    if value.is_nan() {
        return None;
    }
    if value.is_infinite() {
        return Some(Number::Overflow {
            negative: value.is_sign_negative(),
        });
    }
    // Keep small integer values in the compact integer representation used by the existing
    // attribute tests. Once the value reaches the exact-integer precision boundary, retain the
    // f64 representation so later JS-number normalization can make the rounding explicit.
    if value.fract() == 0.0
        && value.abs() < 9_007_199_254_740_992.0
        && value >= i64::MIN as f64
        && value <= i64::MAX as f64
    {
        return Some(Number::from(value as i64));
    }
    Number::from_f64(value)
}

/// Parse stringified JSON only when an event extractor actually needs it.
///
/// The queue graph is already normalized at its boundary, so non-string values can be borrowed
/// directly. Several extractors read the same span attribute, so the parse of an attribute value
/// is remembered by the attribute's position and shared between them. Any other string is parsed
/// each time it is requested and kept until the event is built, so extractors can borrow the
/// result. Input beyond the nesting limit is told apart from malformed JSON so tool
/// normalization can preserve its original string representation.
#[derive(Default)]
pub struct JsonParseCache {
    /// The span's attributes. Shared ownership keeps them alive and unchanged while this cache
    /// exists, so a value's position among them identifies its text.
    attributes: Option<Rc<JsonObject>>,
    /// Parses of attribute values, by position in `attributes`.
    by_position: Vec<Option<CachedParse>>,
    /// Parses of strings that are not span attributes. Nothing looks them up: they are held
    /// until the event is built so `parse` can return a reference to them.
    others: Vec<Value>,
}

enum CachedParse {
    Parsed(Rc<Value>),
    DepthLimited,
    Invalid,
}

impl CachedParse {
    fn of(text: &JsString) -> Self {
        match super::value::parse_js_string(text) {
            Ok(value) => Self::Parsed(Rc::new(value)),
            Err(error) if is_depth_limit_error(&error) => Self::DepthLimited,
            Err(_) => Self::Invalid,
        }
    }
}

impl JsonParseCache {
    /// Remember parses of the values in `attributes`, the attributes of the span being built.
    pub fn for_attributes(attributes: Rc<JsonObject>) -> Self {
        Self {
            attributes: Some(attributes),
            ..Self::default()
        }
    }

    pub fn parse<'a>(&'a mut self, value: Option<&'a Value>) -> Option<&'a Value> {
        let value = value?;
        let Value::String(text) = value else {
            return Some(value);
        };
        if !looks_like_json(text.as_str()) {
            return None;
        }
        let Some(position) = self.attribute_position(value) else {
            self.others.push(super::value::parse_js_string(text).ok()?);
            return self.others.last();
        };
        match self.attribute_parse(position, text) {
            CachedParse::Parsed(value) => Some(value),
            CachedParse::DepthLimited | CachedParse::Invalid => None,
        }
    }

    /// The position of `value` among the span's attributes, if it is one of them.
    fn attribute_position(&self, value: &Value) -> Option<usize> {
        let attributes = self.attributes.as_deref()?;
        let address = |value: &Value| std::ptr::from_ref(value) as usize;
        let (_, first) = attributes.get_index(0)?;
        let offset = address(value).checked_sub(address(first))?;
        let position = match attributes.get_index(1) {
            // The map stores its entries one after another, so one stride separates their values.
            Some((_, second)) => {
                let stride = address(second).checked_sub(address(first))?;
                offset.checked_div(stride)?
            }
            None => 0,
        };
        // Accept only the attribute itself, whatever the arithmetic produced.
        let (_, candidate) = attributes.get_index(position)?;
        std::ptr::eq(candidate, value).then_some(position)
    }

    /// The parse of the attribute at `position`, whose text is parsed on first use.
    fn attribute_parse(&mut self, position: usize, text: &JsString) -> &CachedParse {
        if self.by_position.len() <= position {
            let attributes = self
                .attributes
                .as_ref()
                .map_or(0, |attributes| attributes.len());
            self.by_position.resize_with(attributes, || None);
        }
        self.by_position[position].get_or_insert_with(|| CachedParse::of(text))
    }

    pub fn parse_or_self<'a>(&'a mut self, value: Option<&'a Value>) -> Option<&'a Value> {
        let value = value?;
        self.parse(Some(value)).or(Some(value))
    }

    /// Keep a parsed subtree alive while recursive tool inspection uses the cache again.
    /// Sharing avoids cloning the whole input just to inspect a few nested definitions.
    pub fn shared_or_self<'a>(&mut self, value: &'a Value) -> ParsedJson<'a> {
        let Value::String(text) = value else {
            return ParsedJson::Borrowed(value);
        };
        if !looks_like_json(text.as_str()) {
            return ParsedJson::Borrowed(value);
        }
        let unshared;
        let parse = match self.attribute_position(value) {
            Some(position) => self.attribute_parse(position, text),
            None => {
                unshared = CachedParse::of(text);
                &unshared
            }
        };
        match parse {
            CachedParse::Parsed(parsed) => ParsedJson::Shared(Rc::clone(parsed)),
            CachedParse::DepthLimited => ParsedJson::DepthLimited(value),
            CachedParse::Invalid => ParsedJson::Borrowed(value),
        }
    }
}

pub enum ParsedJson<'a> {
    Borrowed(&'a Value),
    DepthLimited(&'a Value),
    Shared(Rc<Value>),
}

impl std::ops::Deref for ParsedJson<'_> {
    type Target = Value;

    fn deref(&self) -> &Value {
        match self {
            Self::Borrowed(value) | Self::DepthLimited(value) => value,
            Self::Shared(value) => value,
        }
    }
}

impl ParsedJson<'_> {
    pub fn into_owned(self) -> Value {
        match self {
            Self::Borrowed(value) | Self::DepthLimited(value) => value.clone(),
            Self::Shared(value) => Rc::unwrap_or_clone(value),
        }
    }
}

fn is_depth_limit_error(error: &serde_json::Error) -> bool {
    error.to_string().starts_with("recursion limit exceeded")
}

fn looks_like_json(text: &str) -> bool {
    let text = text.trim();
    match text.as_bytes().first() {
        Some(b't') => text == "true",
        Some(b'f') => text == "false",
        Some(b'n') => text == "null",
        Some(b'{' | b'[' | b'"' | b'-' | b'0'..=b'9') => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::otel::value::json;

    proptest::proptest! {
        #[test]
        fn attribute_lists_decode_directly_like_the_full_parser(
            entries in proptest::collection::vec(
                (
                    proptest::sample::select(vec![
                        r#""a""#, r#""b""#, r#""a.b""#, r#""values""#, r#""attributes""#,
                        r#""a""#, r#""\ud800""#, "1", "null",
                    ]),
                    proptest::sample::select(vec![
                        r#"{"stringValue":"x"}"#, r#"{"boolValue":true}"#, r#"{"intValue":"42"}"#,
                        r#"{"intValue":42}"#, r#"{"intValue":1.5}"#, r#"{"intValue":"x"}"#,
                        r#"{"intValue":"18446744073709551616"}"#, r#"{"intValue":1e400}"#,
                        r#"{"intValue":{"high":-1,"low":-1}}"#, r#"{"doubleValue":1.5}"#,
                        r#"{"doubleValue":"1.5"}"#, r#"{"doubleValue":"x"}"#,
                        r#"{"doubleValue":[1]}"#, r#"{"stringValue":5}"#, r#"{"stringValue":null}"#,
                        r#"{"stringValue":{"intValue":"1"}}"#, r#"{"stringValue":"\ud800"}"#,
                        r#"{"boolValue":"true"}"#, r#"{"stringValue":"x","intValue":"1"}"#,
                        r#"{"arrayValue":{"values":[{"stringValue":"x"}]}}"#,
                        r#"{"kvlistValue":{"values":[]}}"#, r#"{"unknown":1}"#, "{}", "null",
                        r#""plain""#, r#"{"stringValue":{}}"#, r#"{"arrayValue":null}"#,
                        r#"{"arrayValue":{"values":[]}}"#, r#"{"string\u0056alue":"x"}"#,
                        r#"{"arrayValue":{"values":[{"stringValue":{"key":"k","value":1}}]}}"#,
                        r#"{"kvlistValue":{"values":[{"key":"k","value":{"intValue":"1"}}]}}"#,
                    ]),
                    0_u8..8,
                ),
                0..5,
            ),
        ) {
            let source = format!(
                "[{}]",
                entries
                    .iter()
                    .map(|(key, value, form)| match form {
                        0 => format!(r#"{{"value":{value},"key":{key}}}"#),
                        1 => format!(r#"{{"key":{key},"value":{value},"extra":1}}"#),
                        2 => format!(r#"{{"key":{key}}}"#),
                        _ => format!(r#"{{"key":{key},"value":{value}}}"#),
                    })
                    .collect::<Vec<_>>()
                    .join(",")
            );
            let direct = direct_attributes(&source);
            let is_plain = entries.iter().all(|(key, value, form)| {
                *form > 2
                    && [r#""a""#, r#""b""#, r#""a.b""#, r#""values""#].contains(key)
                    && [
                        r#"{"stringValue":"x"}"#, r#"{"boolValue":true}"#, r#"{"intValue":"42"}"#,
                        r#"{"arrayValue":{"values":[{"stringValue":"x"}]}}"#,
                    ]
                    .contains(value)
            });
            proptest::prop_assert!(direct.is_some() || !is_plain, "{}", source);
            if let Some(attributes) = direct {
                proptest::prop_assert!(!attributes.contains_key("attributes"), "{}", source);
                proptest::prop_assert_eq!(
                    attributes_to_map(Value::Object(attributes)),
                    attributes_to_map(Value::parse(&source).unwrap()),
                    "{}",
                    source
                );
            }
        }
    }

    #[test]
    fn converts_all_otlp_any_value_variants() {
        assert_eq!(any_value_to_json(json!({"stringValue": "x"})), json!("x"));
        assert_eq!(any_value_to_json(json!({"intValue": "7"})), json!(7));
        for (text, expected) in [
            ("", 0.0),
            ("\u{feff} 7 \u{a0}", 7.0),
            ("0x10", 16.0),
            ("0b11", 3.0),
            ("0o10", 8.0),
            (
                "0o13201110263767430620001170756334",
                f64::from_bits(0x45c681242cfef18d),
            ),
            ("1.5", 1.5),
        ] {
            for input in [json!({"intValue": text}), json!({"doubleValue": text})] {
                assert_eq!(any_value_to_json(input).as_f64(), Some(expected));
            }
        }
        assert_eq!(
            any_value_to_json(json!({"intValue": "9007199254740993"})),
            json!(9007199254740992u64 as f64)
        );
        for (text, negative) in [
            ("1e309", false),
            ("-1e309", true),
            ("Infinity", false),
            ("+Infinity", false),
            ("-Infinity", true),
        ] {
            let value = any_value_to_json(json!({"intValue": text}));
            let number = value.as_number().expect("overflow remains a number");
            assert_eq!(number.is_negative(), negative);
            assert!(number.as_f64().is_none());
            assert!(is_js_truthy(&value));
            assert!(value_as_bool(Some(&value)));
            assert_eq!(any_value_to_json(json!({"doubleValue": text})), json!(text));
        }
        let numeric = any_value_to_json(Value::parse(r#"{"intValue":1e309}"#).unwrap());
        assert_eq!(numeric, any_value_to_json(json!({"intValue": "1e309"})));
        for text in [
            "inf", "-inf", "infinity", "NaN", "0x", "0x1.5", "0x+1", "0x1^2", "0x1_2", "0b2", "0o8",
        ] {
            assert!(any_value_to_json(json!({"intValue": text})).is_string());
            assert_eq!(any_value_to_json(json!({"doubleValue": text})), json!(text));
        }
        assert_eq!(
            any_value_to_json(json!({"intValue": {"low": 6000, "high": 0}})),
            json!(6000)
        );
        assert_eq!(
            any_value_to_json(json!({"intValue": "synthetic-value"})),
            json!(r#"{"intValue":"synthetic-value"}"#)
        );
        assert_eq!(
            any_value_to_json(json!({"arrayValue": {"values": [{"boolValue": true}]}})),
            json!([true])
        );
        assert_eq!(
            any_value_to_json(
                json!({"kvlistValue": {"values": [{"key": "x", "value": {"stringValue": "y"}}]}})
            ),
            json!(r#"{"kvlistValue":{"values":[{"key":"x","value":{"stringValue":"y"}}]}}"#)
        );
    }

    #[test]
    fn preserves_wtf8_keys_in_otlp_key_value_lists() {
        let key = JsString::from_wtf8(vec![b'k', 0xed, 0xa0, 0x80]).unwrap();
        let values = Value::Array(vec![Value::Object(Object::from_iter([
            ("key".into(), Value::String(key.clone())),
            ("value".into(), json!({"stringValue": "value"})),
        ]))]);

        let mapped = attributes_to_map(values);
        assert_eq!(mapped.keys().next().unwrap().as_bytes(), key.as_bytes());
    }

    #[test]
    fn skips_plain_text_without_losing_json_literals() {
        let mut cache = JsonParseCache::default();
        for text in ["text-", "false alarm", "nothing", "true false"] {
            assert!(cache.parse(Some(&json!(text))).is_none());
        }
        assert!(cache.others.is_empty());
        for (text, expected) in [
            ("true", json!(true)),
            (" \tfalse\r\n", json!(false)),
            ("null ", Value::Null),
        ] {
            assert_eq!(cache.parse(Some(&json!(text))), Some(&expected));
        }
    }

    #[test]
    fn treats_malformed_embedded_json_as_a_missing_value() {
        let value = Value::String(r#"{"broken":}"#.into());
        let mut cache = JsonParseCache::default();
        assert!(cache.parse(Some(&value)).is_none());
        assert!(cache.others.is_empty());
    }

    #[test]
    fn parses_a_span_attribute_once_and_any_other_string_each_time() {
        let attributes = Rc::new(JsonObject::from_iter([
            ("plain".into(), json!("text")),
            ("payload".into(), json!(r#"{"a":[1]}"#)),
            ("broken".into(), json!(r#"{"a":}"#)),
        ]));
        let mut cache = JsonParseCache::for_attributes(Rc::clone(&attributes));
        let payload = attributes.get("payload");

        let first = std::ptr::from_ref(cache.parse(payload).unwrap());
        assert_eq!(std::ptr::from_ref(cache.parse(payload).unwrap()), first);
        let ParsedJson::Shared(shared) = cache.shared_or_self(payload.unwrap()) else {
            panic!("the attribute parses as JSON");
        };
        assert_eq!(std::ptr::from_ref(shared.as_ref()), first);
        assert!(cache.parse(attributes.get("broken")).is_none());
        assert!(cache.parse(attributes.get("plain")).is_none());

        // An equal string that is not the attribute itself gets its own parse.
        let copy = payload.unwrap().clone();
        let copied = std::ptr::from_ref(cache.parse(Some(&copy)).unwrap());
        assert_ne!(copied, first);
        assert_eq!(cache.others.len(), 1);
        assert_eq!(cache.by_position.iter().flatten().count(), 2);
    }

    #[test]
    fn supports_json_and_byte_ids() {
        assert_eq!(parse_id(&json!("abcd")), "abcd");
        assert_eq!(parse_id(&json!([0, 15, 255])), "000fff");
        assert_eq!(parse_id(&json!({"data": [1, 2]})), "0102");
        assert_eq!(parse_id(&json!([-1, 256, 1.5, "255"])), "ff0001ff");
    }

    #[test]
    fn resolves_missing_timestamp_edges() {
        for (start, expected) in [
            (json!("1000000000"), "1970-01-01T00:00:01.000Z"),
            (
                json!(1_700_000_000_000_999_936u64),
                "2023-11-14T22:13:20.001Z",
            ),
            (json!("1700000000000999936"), "2023-11-14T22:13:20.000Z"),
            (
                json!({"high": 395812094, "low": 909722112}),
                "2023-11-14T22:13:20.000Z",
            ),
        ] {
            assert_eq!(
                resolve_timestamps(Some(&start), None, "fallback"),
                Some((expected.to_owned(), expected.to_owned()))
            );
        }
        assert_eq!(
            resolve_timestamps(None, None, "fallback"),
            Some(("fallback".to_owned(), "fallback".to_owned()))
        );
    }

    #[test]
    fn rejects_timestamps_outside_four_digit_years() {
        for (start, end, expected) in [
            // Year 10000, the millisecond before year 0000, microseconds sent as milliseconds.
            ("253402300800000000000", None, None),
            ("-62167219200001000000", None, None),
            ("1750000000123000000000", None, None),
            // Only the end is out of range.
            ("1000000000", Some("253402300800000000000"), None),
            // The first and the last millisecond ClickHouse stores.
            (
                "-62167219200000000000",
                None,
                Some("0000-01-01T00:00:00.000Z"),
            ),
            (
                "253402300799999000000",
                None,
                Some("9999-12-31T23:59:59.999Z"),
            ),
            // The last instant of JS `Date` is a date; one millisecond later is a missing timestamp.
            ("8640000000000000000000", None, None),
            ("8640000000000001000000", None, Some("fallback")),
        ] {
            let end = end.map(|end| json!(end));
            let resolved = resolve_timestamps(Some(&json!(start)), end.as_ref(), "fallback");
            assert_eq!(
                resolved.map(|(start, _)| start).as_deref(),
                expected,
                "{start}"
            );
        }
    }

    #[test]
    fn preserves_lone_surrogates_when_an_extractor_consumes_embedded_json() {
        let consumed = Value::String(r#"{"text":"\uD800"}"#.into());
        let mut cache = JsonParseCache::default();

        let parsed = cache
            .parse(Some(&consumed))
            .expect("embedded JSON should parse");
        let text = parsed.get("text").and_then(Value::as_str).unwrap();
        assert_eq!(text.chars().collect::<Vec<_>>(), vec!['\u{fffd}']);
        assert_eq!(javascript_json_stringify(parsed), r#"{"text":"\ud800"}"#);
    }

    #[test]
    fn string_coercion_matches_javascript_for_tag_values() {
        assert_eq!(javascript_string(&json!(null)), "null");
        assert_eq!(javascript_string(&json!(false)), "false");
        assert_eq!(
            javascript_string(&json!([1, null, {"x": 1}, [2, 3]])),
            "1,,[object Object],2,3"
        );
    }

    #[test]
    fn truthy_text_matches_javascript_id_coercion() {
        for (value, expected) in [
            (json!(null), None),
            (json!(false), None),
            (json!(0), None),
            (json!(""), None),
            (json!("exp"), Some("exp")),
            (json!([]), Some("")),
            (json!([1, null, {"x": 1}]), Some("1,,[object Object]")),
            (json!({"x": 1}), Some("[object Object]")),
        ] {
            let mut span = JsonObject::new();
            span.insert("id".into(), value);
            let mut cache = JsonParseCache::default();
            let attributes = EventAttributes {
                span: &span,
                resource: &JsonObject::new(),
                scope: &JsonObject::new(),
                cache: &mut cache,
                decode_metadata: false,
                evaluation_fields: &mut None,
            };
            assert_eq!(
                attributes
                    .truthy_text(&[AttributeSource::Span("id")])
                    .as_deref(),
                expected
            );
        }
    }

    #[test]
    fn protobuf_long_negative_one_stays_negative_one() {
        assert_eq!(
            any_value_to_json(json!({"intValue": {"high": -1, "low": -1}})),
            json!(-1)
        );
    }

    #[test]
    fn preserves_plain_objects_and_omits_empty_any_values() {
        for (input, expected) in [
            (
                json!({"values": [1, 2], "nested": "keep"}),
                json!({"values": [1, 2], "nested": "keep"}),
            ),
            (
                json!([
                    {"key": "empty", "value": {}},
                    {"key": "null", "value": null},
                    {"key": "present", "value": {"stringValue": "ok"}}
                ]),
                json!({"present": "ok"}),
            ),
            (
                json!({"payload": {"nested": {"stringValue": "keep"}}}),
                json!({"payload": {"nested": {"stringValue": "keep"}}}),
            ),
            (
                json!([
                    {"key": "payload", "value": {"nested": {"stringValue": "keep"}}}
                ]),
                json!({"payload": r#"{"nested":{"stringValue":"keep"}}"#}),
            ),
            (
                json!([
                    {"key": "number", "value": 5},
                    {"key": "flag", "value": false},
                    {"key": "list", "value": ["a", 1]},
                    {"key": "wrapped", "value": {"arrayValue": {"values": [1, null]}}}
                ]),
                json!({
                    "number": "5",
                    "flag": "false",
                    "list": r#"["a",1]"#,
                    "wrapped": ["1", null]
                }),
            ),
        ] {
            let expected = expected.as_object().unwrap().clone();
            assert_eq!(attributes_to_map(input), expected);
        }
        for array_value in [json!(null), json!(false), json!(0), json!("")] {
            let wrapper = json!({"arrayValue": array_value, "bytesValue": "AA=="});
            let expected = json!(wrapper.to_json_string());
            assert_eq!(any_value_to_json(wrapper), expected);
            assert_eq!(
                any_value_to_json(json!({"arrayValue": array_value, "intValue": "7"})),
                json!(7)
            );
        }
        assert_eq!(
            any_value_to_json(json!({
                "arrayValue": {"values": [{}, {"stringValue": "ok"}]}, "intValue": "7"
            })),
            json!([null, "ok"])
        );
    }
}
