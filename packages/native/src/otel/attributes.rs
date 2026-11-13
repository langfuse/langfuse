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
//! `JsonParseCache` parses JSON inside attribute strings on demand, caching both
//! successes and failures for one event. `ParsedJson` borrows an existing value or
//! shares a cached tree through `Rc`, allowing recursive tool extraction to reuse
//! the cache without copying that tree.

use chrono::{DateTime, Utc};
use num_bigint::BigUint;
use num_traits::{Num, ToPrimitive};
use std::collections::HashMap;
use std::rc::Rc;

use super::value::{JsString, JsonObject, Number, Object, Value};

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
}

impl EventAttributes<'_> {
    fn get(&self, source: AttributeSource) -> Option<&Value> {
        match source {
            AttributeSource::Span(key) => self.span.get(key),
            AttributeSource::Resource(key) => self.resource.get(key),
            AttributeSource::Scope(key) => self.scope.get(key),
        }
    }

    pub fn text(&self, sources: &[AttributeSource]) -> Option<String> {
        sources
            .iter()
            .find_map(|source| self.get(*source).and_then(value_as_string))
    }

    pub fn truthy_text(&self, sources: &[AttributeSource]) -> Option<String> {
        sources.iter().find_map(|source| {
            let value = self.get(*source).filter(|value| is_js_truthy(value))?;
            Some(javascript_string(value))
        })
    }

    pub fn scope_name(&self, sources: &[AttributeSource]) -> Option<String> {
        sources.iter().find_map(|source| {
            self.get(*source)?
                .as_str()
                .filter(|text| !text.is_empty())
                .map(str::to_owned)
        })
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

/// Convert an OTLP `AnyValue` wrapper into the plain value exposed by the legacy processor.
///
/// Consumes wrappers and reuses their payload allocations.
pub fn any_value_to_json(value: Value) -> Value {
    let Value::Object(mut object) = value else {
        return value;
    };

    if object.is_empty() {
        return Value::Null;
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
    let is_any_value = value.as_object().is_some_and(|object| {
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
    });
    if is_any_value {
        any_value_to_json(value)
    } else {
        value
    }
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
    let mut result = JsonObject::new();
    for entry in values {
        let Value::Object(mut entry) = entry else {
            continue;
        };
        let Some(Value::String(key)) = entry.shift_remove("key") else {
            continue;
        };
        let Some(value) = entry.shift_remove("value") else {
            continue;
        };
        if value.is_null() || matches!(&value, Value::Object(object) if object.is_empty()) {
            continue;
        }
        result.insert(key, any_value_to_json(value));
    }
    result
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
pub fn nano_timestamp_to_iso(value: Option<&Value>) -> Option<String> {
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
    let millis = i64::try_from(millis).ok()?;
    DateTime::<Utc>::from_timestamp_millis(millis)
        .map(|date| date.to_rfc3339_opts(chrono::SecondsFormat::Millis, true))
}

/// Resolve missing OTLP span endpoints exactly once at the processing boundary.
pub fn resolve_timestamps(
    start: Option<&Value>,
    end: Option<&Value>,
    fallback: &str,
) -> (String, String) {
    let start = nano_timestamp_to_iso(start);
    let end = nano_timestamp_to_iso(end);
    match (start, end) {
        (Some(start), Some(end)) => (start, end),
        (Some(start), None) => (start.clone(), start),
        (None, Some(end)) => (end.clone(), end),
        (None, None) => (fallback.to_owned(), fallback.to_owned()),
    }
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

/// Memoize stringified JSON only when an event extractor actually needs to parse it.
///
/// The queue graph is already normalized at its boundary, so non-string values can be borrowed
/// directly. Parsed strings are normalized once and borrowed by all provider extractors that use
/// the same source. The cache distinguishes inputs beyond the nesting limit from malformed JSON
/// so tool normalization can preserve their original string representation.
#[derive(Default)]
pub struct JsonParseCache {
    parsed_strings: HashMap<JsString, CachedParse>,
}

enum CachedParse {
    Parsed(Rc<Value>),
    DepthLimited,
    Invalid,
}

impl JsonParseCache {
    pub fn parse<'a>(&'a mut self, value: Option<&'a Value>) -> Option<&'a Value> {
        let value = value?;
        let Value::String(text) = value else {
            return Some(value);
        };
        if !looks_like_json(text.as_str()) {
            return None;
        }
        if !self.parsed_strings.contains_key(text) {
            let parsed = match super::value::parse_js_string(text) {
                Ok(value) => CachedParse::Parsed(Rc::new(value)),
                Err(error) if is_depth_limit_error(&error) => CachedParse::DepthLimited,
                Err(_) => CachedParse::Invalid,
            };
            self.parsed_strings.insert(text.clone(), parsed);
        }
        match self.parsed_strings.get(text) {
            Some(CachedParse::Parsed(value)) => Some(value),
            Some(CachedParse::DepthLimited | CachedParse::Invalid) | None => None,
        }
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
        self.parse(Some(value));
        match self.parsed_strings.get(text) {
            Some(CachedParse::Parsed(parsed)) => ParsedJson::Shared(Rc::clone(parsed)),
            Some(CachedParse::DepthLimited) => ParsedJson::DepthLimited(value),
            Some(CachedParse::Invalid) | None => ParsedJson::Borrowed(value),
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
        assert!(cache.parsed_strings.is_empty());
        for (text, expected) in [
            ("true", json!(true)),
            (" \tfalse\r\n", json!(false)),
            ("null ", Value::Null),
        ] {
            assert_eq!(cache.parse(Some(&json!(text))), Some(&expected));
        }
    }

    #[test]
    fn caches_malformed_embedded_json_as_a_missing_value() {
        let value = Value::String(r#"{"broken":}"#.into());
        let mut cache = JsonParseCache::default();
        assert!(cache.parse(Some(&value)).is_none());
        assert_eq!(cache.parsed_strings.len(), 1);
        assert!(cache.parse(Some(&value)).is_none());
        assert_eq!(cache.parsed_strings.len(), 1);
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
                (expected.to_owned(), expected.to_owned())
            );
        }
        assert_eq!(
            resolve_timestamps(None, None, "fallback"),
            ("fallback".to_owned(), "fallback".to_owned())
        );
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
