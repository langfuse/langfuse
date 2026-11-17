//! JavaScript-compatible JSON values for dynamic OTEL fields such as attributes.
//!
//! `Value` is an owned tree; `Object` is its insertion-ordered map. `JsString`
//! normally stores UTF-8, using `Wtf8String` only to preserve lone surrogates such
//! as `\ud800`. `Number` handles JavaScript rounding and overflow such as `1e309`.
//! These are values that ordinary `serde_json::Value` cannot fully represent.
//!
//! Serde builds values directly through `FastValue` and `FastValueVisitor`.
//! `BytesVisitor` accepts Serde's decoded bytes for `JsString`, preserving surrogates.
//! On failure, `CompatibilityParser` lets Jiter traverse JSON and borrows Serde
//! `RawValue` tokens where Jiter cannot decode them. `input::JsonField` applies this
//! decoding to each dynamic field independently; malformed JSON still fails.
//!
//! ```text
//! input::JsonField -> parse_field -----------------+
//! attributes::JsonParseCache -> parse_js_string ---+-> Value::parse / parse
//!                                                     |-- FastValue -> Value
//!                                                     `-- on decoding error:
//!                                                          CompatibilityParser -> Value
//! ```
//!
//! Parsers borrow input while decoding; returned values own their strings and
//! containers. `to_json_string` / `Serialize` use `javascript_json_stringify` to
//! reproduce JavaScript key ordering, number formatting and surrogate escapes;
//! overflow becomes `null`. `into_serde_lossy` instead produces ordinary Serde
//! values, replacing lone surrogates with U+FFFD.

use std::fmt;
use std::hash::{Hash, Hasher};
#[cfg(test)]
use std::ops::Index;
use std::ops::Range;

use hstr::wtf8::{CodePoint, IllFormedUtf16CodeUnits, Wtf8, Wtf8Buf};
use indexmap::{Equivalent, IndexMap};
use serde::de::{self, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{Number as SerdeNumber, Value as SerdeValue};

#[cfg(test)]
macro_rules! json {
    ($($json:tt)+) => { $crate::otel::value::Value::from(serde_json::json!($($json)+)) };
}
#[cfg(test)]
pub(crate) use json;

/// An object map whose keys retain JavaScript string code units.
pub type Object = IndexMap<JsString, Value>;

/// Compatibility alias used by the attribute adapter; all logical objects use the same map.
pub type JsonObject = Object;

/// A JSON string represented as UTF-8 or canonical WTF-8 bytes.
#[derive(Clone)]
pub enum JsString {
    Utf8(String),
    Wtf8(Box<Wtf8String>),
}

/// The exceptional representation keeps the original WTF-8 code units and a
/// same-width UTF-8 projection for APIs that need to inspect a JavaScript
/// string without losing its length or replacing one surrogate with three
/// UTF-8 error bytes.
#[derive(Clone)]
pub struct Wtf8String {
    wtf8: Wtf8Buf,
    projection: String,
}

impl JsString {
    pub fn from_wtf8(bytes: Vec<u8>) -> Result<Self, &'static str> {
        match String::from_utf8(bytes) {
            Ok(value) => Ok(Self::Utf8(value)),
            Err(error) => Ok(Self::from_wtf8_buf(parse_wtf8_bytes(error.into_bytes())?)),
        }
    }

    fn from_wtf8_buf(wtf8: Wtf8Buf) -> Self {
        match wtf8.into_string() {
            Ok(value) => Self::Utf8(value),
            Err(wtf8) => {
                let projection = wtf8.to_string_lossy().into_owned();
                Self::Wtf8(Box::new(Wtf8String { wtf8, projection }))
            }
        }
    }

    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Self::Utf8(value) => value.as_bytes(),
            Self::Wtf8(value) => value.wtf8.as_bytes(),
        }
    }

    pub fn as_utf8(&self) -> Option<&str> {
        match self {
            Self::Utf8(value) => Some(value),
            Self::Wtf8(_) => None,
        }
    }

    /// Return a string projection using one U+FFFD per unpaired surrogate.
    pub fn as_str(&self) -> &str {
        match self {
            Self::Utf8(value) => value,
            Self::Wtf8(value) => &value.projection,
        }
    }

    pub fn into_utf8_lossy(self) -> String {
        match self {
            Self::Utf8(value) => value,
            Self::Wtf8(value) => value.projection,
        }
    }

    pub fn len(&self) -> usize {
        self.as_bytes().len()
    }

    pub fn is_empty(&self) -> bool {
        self.as_bytes().is_empty()
    }

    pub(crate) fn utf16_units(&self) -> IllFormedUtf16CodeUnits<'_> {
        let value: &Wtf8 = match self {
            Self::Utf8(value) => Wtf8::from_str(value),
            Self::Wtf8(value) => &value.wtf8,
        };
        value.to_ill_formed_utf16()
    }

    pub(crate) fn from_utf16_unit(unit: u16) -> Self {
        Self::from_wtf8_buf(Wtf8Buf::from_ill_formed_utf16(&[unit]))
    }

    /// Remove a prefix while retaining the remaining JavaScript string code units.
    pub fn strip_prefix(&self, prefix: &str) -> Option<Self> {
        self.as_bytes()
            .strip_prefix(prefix.as_bytes())
            .and_then(|suffix| Self::from_wtf8(suffix.to_vec()).ok())
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self::Utf8(String::with_capacity(capacity))
    }

    pub fn push_str(&mut self, value: &str) {
        match self {
            Self::Utf8(current) => current.push_str(value),
            Self::Wtf8(current) => {
                current.wtf8.push_str(value);
                current.projection.push_str(value);
            }
        }
    }

    pub fn push_slice(&mut self, value: &Self, range: Range<usize>) {
        let slice = match value {
            Self::Utf8(source) => hstr::wtf8::Wtf8::from_str(&source[range]),
            Self::Wtf8(source) => source.wtf8.slice(range.start, range.end),
        };
        if let (Self::Utf8(current), Some(text)) = (&mut *self, slice.as_str()) {
            current.push_str(text);
            return;
        }
        let mut wtf8 = match std::mem::take(self) {
            Self::Utf8(value) => Wtf8Buf::from_string(value),
            Self::Wtf8(value) => value.wtf8,
        };
        wtf8.push_wtf8(slice);
        *self = Self::from_wtf8_buf(wtf8);
    }

    pub fn replace_range(&mut self, range: Range<usize>, replacement: &str) {
        match self {
            Self::Utf8(value) => {
                value.replace_range(range, replacement);
            }
            Self::Wtf8(value) => {
                assert!(range.start <= range.end, "invalid JsString range");
                let mut wtf8 = Wtf8Buf::with_capacity(
                    value
                        .wtf8
                        .len()
                        .saturating_sub(range.end - range.start)
                        .saturating_add(replacement.len()),
                );
                let end = value.wtf8.len();
                wtf8.push_wtf8(value.wtf8.slice(0, range.start));
                wtf8.push_str(replacement);
                wtf8.push_wtf8(value.wtf8.slice(range.end, end));
                *self = Self::from_wtf8_buf(wtf8);
            }
        }
    }
}

impl Default for JsString {
    fn default() -> Self {
        Self::Utf8(String::new())
    }
}

impl From<String> for JsString {
    fn from(value: String) -> Self {
        Self::Utf8(value)
    }
}

impl From<&str> for JsString {
    fn from(value: &str) -> Self {
        Self::Utf8(value.to_owned())
    }
}

impl PartialEq for JsString {
    fn eq(&self, other: &Self) -> bool {
        self.as_bytes() == other.as_bytes()
    }
}

impl Eq for JsString {}

impl Hash for JsString {
    fn hash<H: Hasher>(&self, state: &mut H) {
        match self {
            Self::Utf8(value) => value.hash(state),
            Self::Wtf8(value) => value.wtf8.as_bytes().hash(state),
        }
    }
}

impl fmt::Debug for JsString {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_tuple("JsString")
            .field(&self.as_str())
            .finish()
    }
}

impl Equivalent<JsString> for str {
    fn equivalent(&self, key: &JsString) -> bool {
        key.as_utf8() == Some(self)
    }
}

impl Equivalent<JsString> for String {
    fn equivalent(&self, key: &JsString) -> bool {
        key.as_utf8() == Some(self.as_str())
    }
}

impl<'de> Deserialize<'de> for JsString {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        let bytes = deserializer.deserialize_bytes(BytesVisitor)?;
        Self::from_wtf8(bytes).map_err(de::Error::custom)
    }
}

impl Serialize for JsString {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        if let Self::Utf8(value) = self {
            return serializer.serialize_str(value);
        }
        let mut json = String::with_capacity(self.len().saturating_add(2));
        append_json_string(self, &mut json);
        serde_json::value::RawValue::from_string(json)
            .map_err(serde::ser::Error::custom)? // codespell:ignore ser
            .serialize(serializer)
    }
}

/// A JSON number with the same finite representation as `serde_json::Number`.
///
/// `serde_json` rejects numerals outside the range of its non-arbitrary-precision
/// representation. JavaScript parses those as an infinity, and JSON.stringify
/// emits `null`; retaining only the sign is sufficient for the rest of the OTEL
/// pipeline and avoids retaining a potentially unbounded numeric token.
#[derive(Clone, Debug, Eq, Hash, PartialEq)]
pub enum Number {
    Finite(SerdeNumber),
    Overflow { negative: bool },
}

impl Number {
    /// Parsed JSON integers cross the same IEEE-754 boundary as JavaScript's JSON.parse.
    /// Computed integer constructors stay exact for native row accounting.
    pub fn from_json(value: SerdeNumber) -> Self {
        let integer = value
            .as_i64()
            .map(i64::unsigned_abs)
            .or_else(|| value.as_u64());
        if integer.is_some_and(|integer| integer >= (1_u64 << 53)) {
            return Self::from_f64(value.as_f64().expect("JSON integer fits f64"))
                .expect("JSON integer converts to a finite f64");
        }
        Self::Finite(value)
    }

    pub fn from_f64(value: f64) -> Option<Self> {
        SerdeNumber::from_f64(value).map(Self::Finite)
    }

    pub fn parse_validated(text: &str) -> Self {
        match serde_json::from_str::<SerdeNumber>(text) {
            Ok(value) => Self::from_json(value),
            Err(_) => text
                .trim()
                .parse::<f64>()
                .ok()
                .and_then(Self::from_f64)
                .unwrap_or_else(|| Self::Overflow {
                    negative: text.trim_start().starts_with('-'),
                }),
        }
    }

    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Self::Finite(value) => value.as_i64(),
            Self::Overflow { .. } => None,
        }
    }

    pub fn as_u64(&self) -> Option<u64> {
        match self {
            Self::Finite(value) => value.as_u64(),
            Self::Overflow { .. } => None,
        }
    }

    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Self::Finite(value) => value.as_f64(),
            Self::Overflow { .. } => None,
        }
    }

    pub fn is_negative(&self) -> bool {
        match self {
            Self::Finite(value) => value.as_f64().is_some_and(f64::is_sign_negative),
            Self::Overflow { negative } => *negative,
        }
    }
}

macro_rules! from_number_type {
    ($($ty:ty),* $(,)?) => {
        $(impl From<$ty> for Number {
            fn from(value: $ty) -> Self {
                Self::Finite(SerdeNumber::from(value))
            }
        })*
    };
}

from_number_type!(u8, u16, u32, u64, usize, i8, i16, i32, i64, isize);

impl std::fmt::Display for Number {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Finite(value) => value.fmt(formatter),
            Self::Overflow { negative: true } => formatter.write_str("-Infinity"),
            Self::Overflow { negative: false } => formatter.write_str("Infinity"),
        }
    }
}

/// JSON values which preserve JavaScript string code units.
#[derive(Clone, Debug, PartialEq, Eq, Default)]
pub enum Value {
    #[default]
    Null,
    Bool(bool),
    Number(Number),
    String(JsString),
    Array(Vec<Value>),
    Object(Object),
}

impl Value {
    pub fn parse(text: &str) -> Result<Self, serde_json::Error> {
        parse(text)
    }
    pub fn is_string(&self) -> bool {
        matches!(self, Self::String(_))
    }
    pub fn is_object(&self) -> bool {
        matches!(self, Self::Object(_))
    }
    pub fn is_array(&self) -> bool {
        matches!(self, Self::Array(_))
    }
    pub fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }
    pub fn as_i64(&self) -> Option<i64> {
        if let Self::Number(v) = self {
            v.as_i64()
        } else {
            None
        }
    }
    pub fn as_u64(&self) -> Option<u64> {
        if let Self::Number(v) = self {
            v.as_u64()
        } else {
            None
        }
    }
    pub fn as_f64(&self) -> Option<f64> {
        if let Self::Number(v) = self {
            v.as_f64()
        } else {
            None
        }
    }
    #[cfg(test)]
    pub fn as_number(&self) -> Option<&Number> {
        if let Self::Number(v) = self {
            Some(v)
        } else {
            None
        }
    }
    /// UTF-8 projection with U+FFFD for lone surrogates. Keep `Value::String` itself
    /// when rebuilding JSON so its original JavaScript code units survive.
    pub fn as_str(&self) -> Option<&str> {
        if let Self::String(v) = self {
            Some(v.as_str())
        } else {
            None
        }
    }
    pub fn as_array(&self) -> Option<&Vec<Self>> {
        if let Self::Array(v) = self {
            Some(v)
        } else {
            None
        }
    }
    pub fn as_object(&self) -> Option<&Object> {
        if let Self::Object(v) = self {
            Some(v)
        } else {
            None
        }
    }
    pub fn as_object_mut(&mut self) -> Option<&mut Object> {
        if let Self::Object(v) = self {
            Some(v)
        } else {
            None
        }
    }
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.as_object()?.get(key)
    }
    /// Follow object keys without materializing a projection or coercing containers.
    pub fn path<const N: usize>(&self, keys: [&str; N]) -> Option<&Value> {
        keys.into_iter().try_fold(self, |value, key| value.get(key))
    }
    pub fn into_serde_lossy(self) -> SerdeValue {
        match self {
            Self::Null => SerdeValue::Null,
            Self::Bool(v) => SerdeValue::Bool(v),
            Self::Number(Number::Finite(v)) => SerdeValue::Number(v),
            Self::Number(Number::Overflow { .. }) => SerdeValue::Null,
            Self::String(v) => SerdeValue::String(v.into_utf8_lossy()),
            Self::Array(v) => {
                SerdeValue::Array(v.into_iter().map(Self::into_serde_lossy).collect())
            }
            Self::Object(v) => SerdeValue::Object(
                v.into_iter()
                    .map(|(k, v)| (k.into_utf8_lossy(), v.into_serde_lossy()))
                    .collect(),
            ),
        }
    }
    pub fn to_json_string(&self) -> String {
        javascript_json_stringify(self)
    }
}

#[cfg(test)]
static TEST_NULL: Value = Value::Null;

#[cfg(test)]
impl Index<&str> for Value {
    type Output = Value;

    fn index(&self, key: &str) -> &Self::Output {
        self.get(key).unwrap_or(&TEST_NULL)
    }
}

#[cfg(test)]
impl Index<usize> for Value {
    type Output = Value;

    fn index(&self, index: usize) -> &Self::Output {
        self.as_array()
            .and_then(|array| array.get(index))
            .unwrap_or(&TEST_NULL)
    }
}

impl From<SerdeValue> for Value {
    fn from(value: SerdeValue) -> Self {
        match value {
            SerdeValue::Null => Self::Null,
            SerdeValue::Bool(v) => Self::Bool(v),
            SerdeValue::Number(v) => Self::Number(Number::from_json(v)),
            SerdeValue::String(v) => Self::String(v.into()),
            SerdeValue::Array(v) => Self::Array(v.into_iter().map(Self::from).collect()),
            SerdeValue::Object(v) => {
                Self::Object(v.into_iter().map(|(k, v)| (k.into(), v.into())).collect())
            }
        }
    }
}
macro_rules! from_number {
    ($($ty:ty),*) => {$(impl From<$ty> for Value { fn from(value:$ty)->Self {Self::Number(value.into())} })*};
}
from_number!(u8, u16, u32, u64, usize, i8, i16, i32, i64, isize);
impl From<String> for Value {
    fn from(v: String) -> Self {
        Self::String(v.into())
    }
}
impl From<&str> for Value {
    fn from(v: &str) -> Self {
        Self::String(v.into())
    }
}
impl From<bool> for Value {
    fn from(v: bool) -> Self {
        Self::Bool(v)
    }
}
impl Serialize for Value {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serde_json::value::RawValue::from_string(self.to_json_string())
            .map_err(serde::ser::Error::custom)? // codespell:ignore ser
            .serialize(serializer)
    }
}
impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_json_string())
    }
}

// Serde owns ordinary value decoding; the compatibility path below keeps structural traversal in
// one Jiter cursor and borrows only the tokens that need its lossless raw representation.
struct BytesVisitor;
struct FastValue(Value);
struct FastValueVisitor;

impl<'de> Deserialize<'de> for FastValue {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(FastValueVisitor)
    }
}

impl<'de> Visitor<'de> for FastValueVisitor {
    type Value = FastValue;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a JSON value")
    }

    fn visit_unit<E: de::Error>(self) -> Result<Self::Value, E> {
        Ok(FastValue(Value::Null))
    }

    fn visit_bool<E: de::Error>(self, value: bool) -> Result<Self::Value, E> {
        Ok(FastValue(Value::Bool(value)))
    }

    fn visit_i64<E: de::Error>(self, value: i64) -> Result<Self::Value, E> {
        Ok(FastValue(Value::Number(Number::from_json(value.into()))))
    }

    fn visit_u64<E: de::Error>(self, value: u64) -> Result<Self::Value, E> {
        Ok(FastValue(Value::Number(Number::from_json(value.into()))))
    }

    fn visit_f64<E: de::Error>(self, value: f64) -> Result<Self::Value, E> {
        Number::from_f64(value)
            .map(|value| FastValue(Value::Number(value)))
            .ok_or_else(|| E::custom("non-finite JSON number"))
    }

    fn visit_str<E: de::Error>(self, value: &str) -> Result<Self::Value, E> {
        Ok(FastValue(Value::String(value.into())))
    }

    fn visit_seq<A: SeqAccess<'de>>(self, mut sequence: A) -> Result<Self::Value, A::Error> {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element::<FastValue>()? {
            values.push(value.0);
        }
        Ok(FastValue(Value::Array(values)))
    }

    fn visit_map<A: MapAccess<'de>>(self, mut map: A) -> Result<Self::Value, A::Error> {
        let mut object = Object::new();
        // RawValue validates key syntax without rejecting lone-surrogate escapes.
        while let Some(raw) = map.next_key::<&serde_json::value::RawValue>()? {
            let token = raw.get();
            let key = if token.as_bytes().contains(&b'\\') {
                serde_json::from_str::<JsString>(token).map_err(de::Error::custom)?
            } else {
                JsString::from(&token[1..token.len() - 1])
            };
            object.insert(key, map.next_value::<FastValue>()?.0);
        }
        Ok(FastValue(Value::Object(object)))
    }
}

impl<'de> Visitor<'de> for BytesVisitor {
    type Value = Vec<u8>;
    fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("a JSON string")
    }
    fn visit_str<E: de::Error>(self, value: &str) -> Result<Vec<u8>, E> {
        self.visit_bytes(value.as_bytes())
    }
    fn visit_bytes<E: de::Error>(self, bytes: &[u8]) -> Result<Vec<u8>, E> {
        Ok(bytes.to_vec())
    }
    fn visit_byte_buf<E: de::Error>(self, bytes: Vec<u8>) -> Result<Vec<u8>, E> {
        Ok(bytes)
    }
}
pub fn parse(text: &str) -> Result<Value, serde_json::Error> {
    match serde_json::from_str::<FastValue>(text) {
        Ok(value) => Ok(value.0),
        // Serde's raw/byte adapters retain numbers and code units its owned Value cannot.
        Err(_) => parse_raw_value(text),
    }
}

pub fn parse_js_string(source: &JsString) -> Result<Value, serde_json::Error> {
    if let Some(text) = source.as_utf8() {
        return parse(text);
    }
    // IgnoredAny checks grammar without requiring string code units to be UTF-8.
    // Validate before escaping: a backslash followed by a raw surrogate is invalid JSON.
    let mut de = serde_json::Deserializer::from_slice(source.as_bytes());
    serde::de::IgnoredAny::deserialize(&mut de)?;
    de.end()?;
    let bytes = source.as_bytes();
    let mut escaped = Vec::with_capacity(bytes.len());
    let mut offset = 0;
    while offset < bytes.len() {
        if let Some(unit) = is_surrogate_triplet(bytes, offset) {
            escaped.extend_from_slice(format!("\\u{unit:04x}").as_bytes());
            offset += 3;
        } else {
            escaped.push(bytes[offset]);
            offset += 1;
        }
    }
    parse(std::str::from_utf8(&escaped).expect("surrogates were escaped"))
}

fn parse_raw_value(text: &str) -> Result<Value, serde_json::Error> {
    let mut parser = CompatibilityParser::new(text.as_bytes());
    let value = parser.parse_value(0)?;
    parser.finish()?;
    Ok(value)
}

// Jiter owns the structural cursor on the compatibility path. It rejects the two things this
// value type intentionally keeps (lone surrogate escapes and digit runs beyond its range), so
// those tokens are borrowed with RawValue and the cursor is rebased after them. Container state
// lives in the parser below, rather than in Jiter, which makes rebasing safe for nested values.
struct CompatibilityParser<'de> {
    input: &'de [u8],
    base: usize,
    parser: jiter::Jiter<'de>,
}

impl<'de> CompatibilityParser<'de> {
    fn new(input: &'de [u8]) -> Self {
        Self {
            input,
            base: 0,
            parser: jiter::Jiter::new(input),
        }
    }

    fn position(&self) -> usize {
        self.base + self.parser.current_index()
    }

    fn rebase(&mut self, position: usize) {
        self.base = position;
        self.parser = jiter::Jiter::new(&self.input[position..]);
    }

    fn peek(&mut self) -> Result<jiter::Peek, serde_json::Error> {
        self.parser.peek().map_err(jiter_error)
    }

    fn recover_token(&mut self, start: usize) -> Result<&'de str, serde_json::Error> {
        let mut deserializer = serde_json::Deserializer::from_slice(&self.input[start..]);
        let raw = <&serde_json::value::RawValue>::deserialize(&mut deserializer)?;
        let end = start + raw.get().len();
        self.rebase(end);
        Ok(raw.get())
    }

    fn next_object_key(&mut self, first: bool) -> Result<Option<JsString>, serde_json::Error> {
        let result = if first {
            self.parser.next_object()
        } else {
            self.parser.next_key()
        };
        match result {
            Ok(Some(key)) => Ok(Some(JsString::from(key))),
            Ok(None) => Ok(None),
            Err(error) if recoverable_jiter_error(&error) => {
                let token = self.recover_token(self.position())?;
                let colon = self.parser.peek().map_err(jiter_error)?;
                if colon.into_inner() != b':' {
                    return Err(de::Error::custom("expected object colon"));
                }
                self.rebase(self.position() + 1);
                serde_json::from_str(token).map(Some)
            }
            Err(error) => Err(jiter_error(error)),
        }
    }

    fn parse_value(&mut self, depth: usize) -> Result<Value, serde_json::Error> {
        if depth >= 128 {
            return Err(de::Error::custom("recursion limit exceeded"));
        }
        let peek = self.peek()?;
        match peek {
            jiter::Peek::Object => self.parse_object(depth),
            jiter::Peek::Array => self.parse_array(depth),
            jiter::Peek::String => self.parse_string(),
            jiter::Peek::Null => self
                .parser
                .known_null()
                .map(|_| Value::Null)
                .map_err(jiter_error),
            jiter::Peek::True | jiter::Peek::False => self
                .parser
                .known_bool(peek)
                .map(Value::Bool)
                .map_err(jiter_error),
            number if number.is_num() => self.parse_number(),
            _ => Err(de::Error::custom("expected JSON value")),
        }
    }

    fn parse_object(&mut self, depth: usize) -> Result<Value, serde_json::Error> {
        let mut object = Object::new();
        let mut first = true;
        while let Some(key) = self.next_object_key(first)? {
            object.insert(key, self.parse_value(depth + 1)?);
            first = false;
        }
        Ok(Value::Object(object))
    }

    fn parse_array(&mut self, depth: usize) -> Result<Value, serde_json::Error> {
        let mut values = Vec::new();
        let mut first = self.parser.next_array().map_err(jiter_error)?;
        while first.is_some() {
            values.push(self.parse_value(depth + 1)?);
            first = self.parser.array_step().map_err(jiter_error)?;
        }
        Ok(Value::Array(values))
    }

    fn parse_string(&mut self) -> Result<Value, serde_json::Error> {
        let start = self.position();
        match self.parser.next_str() {
            Ok(value) => Ok(Value::String(JsString::from(value))),
            Err(error) if recoverable_jiter_error(&error) => {
                let token = self.recover_token(start)?;
                serde_json::from_str(token).map(Value::String)
            }
            Err(error) => Err(jiter_error(error)),
        }
    }

    fn parse_number(&mut self) -> Result<Value, serde_json::Error> {
        let start = self.position();
        match self.parser.next_number_bytes() {
            Ok(bytes) => Ok(Value::Number(Number::parse_validated(
                std::str::from_utf8(bytes).expect("JSON numbers are UTF-8"),
            ))),
            Err(error) if recoverable_jiter_error(&error) => {
                let token = self.recover_token(start)?;
                Ok(Value::Number(Number::parse_validated(token)))
            }
            Err(error) => Err(jiter_error(error)),
        }
    }

    fn finish(&mut self) -> Result<(), serde_json::Error> {
        self.parser.finish().map_err(jiter_error)
    }
}

fn recoverable_jiter_error(error: &jiter::JiterError) -> bool {
    matches!(
        error.error_type,
        jiter::JiterErrorType::JsonError(
            jiter::JsonErrorType::LoneLeadingSurrogateInHexEscape
                | jiter::JsonErrorType::UnexpectedEndOfHexEscape
                | jiter::JsonErrorType::NumberOutOfRange
        )
    )
}

fn jiter_error(error: jiter::JiterError) -> serde_json::Error {
    de::Error::custom(error.to_string())
}

fn append_json_string(value: &JsString, output: &mut String) {
    output.push('"');
    let bytes = value.as_bytes();
    let mut offset = 0;
    while offset < bytes.len() {
        if let Some(unit) = is_surrogate_triplet(bytes, offset) {
            output.push_str("\\u");
            append_hex4(unit, output);
            offset += 3;
            continue;
        }

        let mut run_end = offset + 1;
        while run_end < bytes.len() && is_surrogate_triplet(bytes, run_end).is_none() {
            run_end += 1;
        }
        let run = std::str::from_utf8(&bytes[offset..run_end])
            .expect("non-surrogate WTF-8 run is valid UTF-8");
        let encoded = serde_json::to_string(run).expect("UTF-8 string serializes");
        output.push_str(&encoded[1..encoded.len() - 1]);
        offset = run_end;
    }
    output.push('"');
}

fn is_surrogate_triplet(bytes: &[u8], offset: usize) -> Option<u16> {
    let &[first, second, third] = bytes.get(offset..offset.saturating_add(3))? else {
        return None;
    };
    if first != 0xed || !(0xa0..=0xbf).contains(&second) || !(0x80..=0xbf).contains(&third) {
        return None;
    }
    Some(
        (u16::from(first & 0x0f) << 12) | (u16::from(second & 0x3f) << 6) | u16::from(third & 0x3f),
    )
}

fn parse_wtf8_bytes(bytes: Vec<u8>) -> Result<Wtf8Buf, &'static str> {
    let mut bytes = bytes.as_slice();
    let mut value = Wtf8Buf::with_capacity(bytes.len());
    while !bytes.is_empty() {
        match std::str::from_utf8(bytes) {
            Ok(text) => {
                value.push_str(text);
                break;
            }
            Err(error) => {
                let valid = error.valid_up_to();
                if valid != 0 {
                    value.push_str(
                        std::str::from_utf8(&bytes[..valid]).expect("UTF-8 prefix is valid"),
                    );
                    bytes = &bytes[valid..];
                }
                let unit = is_surrogate_triplet(bytes, 0).ok_or("invalid WTF-8 string")?;
                value.push(
                    CodePoint::from_u32(u32::from(unit))
                        .expect("surrogate triplet is a valid WTF-8 code point"),
                );
                bytes = &bytes[3..];
            }
        }
    }
    Ok(value)
}

fn append_hex4(value: u16, output: &mut String) {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    for shift in [12, 8, 4, 0] {
        output.push(HEX[((value >> shift) & 0x0f) as usize] as char);
    }
}

/// ECMAScript number formatting. Overflow keeps its sign for string coercion;
/// the JSON serializer independently writes non-finite numbers as null.
pub fn javascript_number_to_string(value: &Number) -> String {
    match value.as_f64() {
        Some(number) => ryu_js::Buffer::new().format_finite(number).to_owned(),
        None if value.is_negative() => "-Infinity".to_owned(),
        None => "Infinity".to_owned(),
    }
}

/// Serialize an owned JSON value with the observable formatting rules used by JavaScript's
/// `JSON.stringify`. The native pipeline keeps values in its JavaScript-compatible `Value`
/// representation, but the default number and object serializers do not reproduce JavaScript's
/// integer-key ordering or `1.0` formatting. Keeping this helper at the final string boundary
/// prevents those representation details from leaking into persisted input/output or metadata.
pub fn javascript_json_stringify(value: &Value) -> String {
    let mut output = Vec::new();
    append_javascript_json(value, &mut output);
    String::from_utf8(output).expect("JSON serialization produces UTF-8")
}

fn append_javascript_json(value: &Value, output: &mut Vec<u8>) {
    match value {
        Value::Null => output.extend_from_slice(b"null"),
        Value::Bool(value) => {
            let bytes: &[u8] = if *value { b"true" } else { b"false" };
            output.extend_from_slice(bytes);
        }
        Value::Number(value) => {
            if value.as_f64().is_none() {
                output.extend_from_slice(b"null");
            } else {
                output.extend_from_slice(javascript_number_to_string(value).as_bytes());
            }
        }
        Value::String(value) => append_json_bytes(value, output),
        Value::Array(values) => {
            output.push(b'[');
            for (index, value) in values.iter().enumerate() {
                if index > 0 {
                    output.push(b',');
                }
                append_javascript_json(value, output);
            }
            output.push(b']');
        }
        Value::Object(values) => {
            let mut keys = values.keys().collect::<Vec<_>>();
            keys.sort_by_key(|key| key.as_utf8().map_or((1, 0), javascript_array_index));
            output.push(b'{');
            for (index, key) in keys.iter().enumerate() {
                if index > 0 {
                    output.push(b',');
                }
                append_json_bytes(key, output);
                output.push(b':');
                append_javascript_json(values.get(*key).expect("key came from the object"), output);
            }
            output.push(b'}');
        }
    }
}

fn append_json_bytes(value: &JsString, output: &mut Vec<u8>) {
    serde_json::to_writer(output, value).expect("JSON strings are serializable");
}

pub(crate) fn javascript_array_index(key: &str) -> (u8, u32) {
    // JavaScript orders canonical array-index property names first, numerically. Returning the
    // same bucket for all other names keeps their original order because `sort_by_key` is stable.
    if key == "0" {
        return (0, 0);
    }
    if key.starts_with('0') {
        return (1, 0);
    }
    if key.bytes().all(|byte| byte.is_ascii_digit()) {
        let Ok(index) = key.parse::<u32>() else {
            return (1, 0);
        };
        if index < u32::MAX {
            return (0, index);
        }
    }
    (1, 0)
}

#[cfg(test)]
mod tests {
    use super::{JsString, Value};

    #[test]
    fn canonicalizes_split_pairs_and_rejects_invalid_bytes() {
        let pair = JsString::from_wtf8(vec![0xed, 0xa0, 0x80, 0xed, 0xb0, 0x80]).unwrap();
        assert_eq!(pair, JsString::from("𐀀"));
        assert_eq!(pair.as_utf8(), Some("𐀀"));

        let mut joined =
            JsString::from_wtf8(vec![0xed, 0xa0, 0x80, b'x', 0xed, 0xb0, 0x80]).unwrap();
        joined.replace_range(3..4, "");
        assert_eq!(joined, pair);

        for invalid in [
            b"\xc3".as_slice(),
            b"\xe2\x28\xa1",
            b"\xc0\xaf",
            b"\xf4\x90\x80\x80",
            b"\xed\xa0\x80\xff",
        ] {
            assert!(JsString::from_wtf8(invalid.to_vec()).is_err());
        }
    }

    #[test]
    fn parses_json_text_with_raw_surrogates_without_accepting_invalid_escapes() {
        let source = JsString::from_wtf8(b"{\"x\":\"\xed\xa0\x80\"}".to_vec()).unwrap();
        assert_eq!(
            super::parse_js_string(&source).unwrap().to_json_string(),
            r#"{"x":"\ud800"}"#
        );
        for invalid in [b"\xed\xa0\x80".as_slice(), b"\"\\\xed\xa0\x80\""] {
            assert!(
                super::parse_js_string(&JsString::from_wtf8(invalid.to_vec()).unwrap()).is_err()
            );
        }
    }

    #[test]
    fn overflowing_numbers_keep_sign_but_stringify_as_null() {
        let huge_integer = "9".repeat(5_000);
        for (text, negative) in [
            ("1e309", false),
            ("-1e309", true),
            (huge_integer.as_str(), false),
        ] {
            let value = Value::parse(text).expect("valid JSON number");
            let number = value.as_number().expect("expected number");
            assert!(number.as_f64().is_none());
            assert_eq!(number.is_negative(), negative);
            assert_eq!(value.to_json_string(), "null");
        }
        let balanced = format!("{huge_integer}e-5000");
        assert_eq!(Value::parse(&balanced).unwrap().as_f64(), Some(1.0));
        assert_eq!(Value::parse("1e-9999").unwrap().as_f64(), Some(0.0));
        for value in [
            Value::parse("-1e-9999").unwrap(),
            Value::parse(r#"{"negative_zero":-1e-9999,"surrogate":"\ud800"}"#).unwrap()
                ["negative_zero"]
                .clone(),
        ] {
            assert_eq!(value.as_f64().unwrap().to_bits(), (-0.0_f64).to_bits());
            assert_eq!(value.to_json_string(), "0");
        }
    }

    #[test]
    fn javascript_stringify_orders_integer_keys_and_numbers() {
        let value: Value = Value::parse(
            r#"{"b":1.0,"+1":"plus","2":"two","1":1e20,"01":"kept","nested":[-0.0,1e-7]}"#,
        )
        .unwrap();
        assert_eq!(
            value.to_json_string(),
            r#"{"1":100000000000000000000,"2":"two","b":1,"+1":"plus","01":"kept","nested":[0,1e-7]}"#
        );
    }
}
