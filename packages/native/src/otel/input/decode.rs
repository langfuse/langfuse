//! Generate `Deserialize` for the structs in `input.rs`.
//!
//! `JsonField` borrows one field's JSON text, then parses it into an owned `Value`.
//! A lone surrogate escape in a string or an overflowing number is handled within
//! that field. Attribute values exceeding the tree's depth limit retain their
//! complete JSON text; other overly deep fields become `null`.
//!
//! `CompatibleContainerDeserializer` handles the remaining envelope errors, such
//! as a string containing a lone surrogate escape where an object was expected.
//! Typed containers use empty defaults for unexpected JSON types; duplicate fields
//! keep the last value.

use std::marker::PhantomData;
use std::ops::Deref;

use super::super::value::{JsString, Object, Value};
use serde::de::{IgnoredAny, MapAccess, SeqAccess, Visitor};
use serde::{Deserialize, Deserializer};
use serde_json::value::RawValue;

const JSON_FIELD_TOKEN: &str = "langfuse::otel::JsonField";
pub(super) const FIELD: u8 = 0;
pub(super) const ATTRIBUTES: u8 = 1;
pub(super) const SCOPE: u8 = 2;
const ATTRIBUTE_ENTRY: u8 = 3;
const ATTRIBUTE_VALUE: u8 = 4;

/// A serde adapter for the typed OTLP envelope retry.
///
/// `events::process_to_events` retries the original bytes with this adapter after
/// serde_json rejects an envelope value outside `JsonField`, such as a string
/// containing a lone surrogate escape where a container was expected.
///
/// The adapter borrows each object or array member as `RawValue`, then feeds its
/// span through the typed visitor. Scalar members become `unit`, so wrong-shaped
/// container fields produce their empty default. `JsonField` receives raw spans
/// for dynamic values, using the same field-local decoding as the first attempt.
pub struct CompatibleContainerDeserializer<'de, E = serde_json::Error> {
    raw: &'de serde_json::value::RawValue,
    error: PhantomData<fn() -> E>,
}

impl<'de> CompatibleContainerDeserializer<'de> {
    pub fn from_bytes(bytes: &'de [u8]) -> Result<Self, serde_json::Error> {
        let raw = serde_json::from_slice::<&'de serde_json::value::RawValue>(bytes)?;
        Ok(Self {
            raw,
            error: PhantomData,
        })
    }
}

impl<'de, E> CompatibleContainerDeserializer<'de, E> {
    fn from_raw(raw: &'de serde_json::value::RawValue) -> Self {
        Self {
            raw,
            error: PhantomData,
        }
    }
}

struct RawContainerVisitor<V>(V);

impl<'de, V> Visitor<'de> for RawContainerVisitor<V>
where
    V: Visitor<'de>,
{
    type Value = V::Value;

    fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.expecting(formatter)
    }

    fn visit_map<A>(self, map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        self.0.visit_map(RawContainerMapAccess { map })
    }

    fn visit_seq<A>(self, sequence: A) -> Result<Self::Value, A::Error>
    where
        A: SeqAccess<'de>,
    {
        self.0.visit_seq(RawContainerSeqAccess { sequence })
    }
}

struct RawContainerMapAccess<A> {
    map: A,
}

impl<'de, A> MapAccess<'de> for RawContainerMapAccess<A>
where
    A: MapAccess<'de>,
{
    type Error = A::Error;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>, Self::Error>
    where
        K: serde::de::DeserializeSeed<'de>,
    {
        self.map.next_key_seed(seed)
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value, Self::Error>
    where
        V: serde::de::DeserializeSeed<'de>,
    {
        let raw = self.map.next_value::<&'de serde_json::value::RawValue>()?;
        seed.deserialize(CompatibleContainerDeserializer::<A::Error>::from_raw(raw))
    }
}

struct RawContainerSeqAccess<A> {
    sequence: A,
}

impl<'de, A> SeqAccess<'de> for RawContainerSeqAccess<A>
where
    A: SeqAccess<'de>,
{
    type Error = A::Error;

    fn next_element_seed<T>(&mut self, seed: T) -> Result<Option<T::Value>, Self::Error>
    where
        T: serde::de::DeserializeSeed<'de>,
    {
        let Some(raw) = self
            .sequence
            .next_element::<&'de serde_json::value::RawValue>()?
        else {
            return Ok(None);
        };
        seed.deserialize(CompatibleContainerDeserializer::<A::Error>::from_raw(raw))
            .map(Some)
    }
}

impl<'de, E> Deserializer<'de> for CompatibleContainerDeserializer<'de, E>
where
    E: serde::de::Error,
{
    type Error = E;

    fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>,
    {
        match self.raw.get().as_bytes().first() {
            Some(b'{') | Some(b'[') => {
                let mut deserializer = serde_json::Deserializer::from_str(self.raw.get());
                deserializer
                    .deserialize_any(RawContainerVisitor(visitor))
                    .map_err(E::custom)
            }
            _ => visitor.visit_unit(),
        }
    }

    // Pass the JSON text to JsonFieldVisitor to retain strings with lone surrogate
    // escapes and numbers outside serde_json's range.
    fn deserialize_newtype_struct<V>(
        self,
        name: &'static str,
        visitor: V,
    ) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>,
    {
        if name == JSON_FIELD_TOKEN {
            return visitor.visit_borrowed_str(self.raw.get());
        }
        let mut deserializer = serde_json::Deserializer::from_str(self.raw.get());
        deserializer
            .deserialize_newtype_struct(name, visitor)
            .map_err(E::custom)
    }

    fn deserialize_bytes<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>,
    {
        let mut deserializer = serde_json::Deserializer::from_str(self.raw.get());
        deserializer.deserialize_bytes(visitor).map_err(E::custom)
    }

    fn deserialize_ignored_any<V>(self, visitor: V) -> Result<V::Value, Self::Error>
    where
        V: Visitor<'de>,
    {
        visitor.visit_unit()
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string
        byte_buf option unit unit_struct seq tuple tuple_struct map struct enum identifier
    }
}

/// `JsonField` applies JavaScript number normalization to values used by event construction.
/// Boxed so absent fields occupy one pointer in sparse spans.
pub struct JsonField<const BOUNDARY: u8 = FIELD>(Box<Value>);

impl<const BOUNDARY: u8> Deref for JsonField<BOUNDARY> {
    type Target = Value;

    fn deref(&self) -> &Value {
        &self.0
    }
}

impl<'de, const BOUNDARY: u8> Deserialize<'de> for JsonField<BOUNDARY> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        struct JsonFieldVisitor<const BOUNDARY: u8>;
        impl<'de, const BOUNDARY: u8> Visitor<'de> for JsonFieldVisitor<BOUNDARY> {
            type Value = JsonField<BOUNDARY>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("an OTLP attribute value")
            }

            fn visit_newtype_struct<D: Deserializer<'de>>(
                self,
                deserializer: D,
            ) -> Result<Self::Value, D::Error> {
                let raw = <&RawValue>::deserialize(deserializer)?;
                self.visit_borrowed_str(raw.get())
            }

            fn visit_borrowed_str<E: serde::de::Error>(
                self,
                source: &'de str,
            ) -> Result<Self::Value, E> {
                parse_field(source, BOUNDARY)
                    .map(JsonField::new)
                    .map_err(E::custom)
            }
        }
        deserializer.deserialize_newtype_struct(JSON_FIELD_TOKEN, JsonFieldVisitor::<BOUNDARY>)
    }
}

// When Value::parse reaches its recursion limit, parse object members as raw
// spans. Retry each attribute separately so shallow siblings keep their types.
// A still-too-deep attribute keeps its complete value (including OTLP wrappers)
// as JSON text, preserving the data without constructing a deeper tree.
fn parse_field(source: &str, boundary: u8) -> Result<Value, serde_json::Error> {
    match Value::parse(source) {
        Ok(value) => return Ok(value),
        Err(error) if is_recursion_limit(&error) => {}
        Err(error) => return Err(error),
    }
    match (source.trim_start().as_bytes().first(), boundary) {
        (Some(b'{'), ATTRIBUTES | SCOPE | ATTRIBUTE_ENTRY) => {
            let fields: indexmap::IndexMap<JsString, &RawValue> = serde_json::from_str(source)?;
            let mut object = Object::new();
            for (key, raw) in fields {
                let child = match (boundary, key.as_utf8()) {
                    (SCOPE, Some("attributes")) => ATTRIBUTES,
                    (ATTRIBUTES, _) | (ATTRIBUTE_ENTRY, Some("value")) => ATTRIBUTE_VALUE,
                    _ => FIELD,
                };
                let mut value = parse_field(raw.get(), child)?;
                if boundary == ATTRIBUTES
                    && key.as_utf8() == Some("values")
                    && value.is_string()
                    && raw.get().starts_with('[')
                {
                    let entries = recover_attribute_entries(raw.get())?;
                    if super::super::attributes::is_key_value_list(&entries) {
                        value = Value::Array(entries);
                    }
                }
                object.insert(key, value);
            }
            Ok(Value::Object(object))
        }
        (Some(b'['), ATTRIBUTES) => recover_attribute_entries(source).map(Value::Array),
        (_, ATTRIBUTE_VALUE) => Ok(Value::String(source.into())),
        _ => Ok(Value::Null),
    }
}

fn recover_attribute_entries(source: &str) -> Result<Vec<Value>, serde_json::Error> {
    serde_json::from_str::<Vec<&RawValue>>(source)?
        .into_iter()
        .map(|raw| parse_field(raw.get(), ATTRIBUTE_ENTRY))
        .collect()
}

fn is_recursion_limit(error: &impl std::fmt::Display) -> bool {
    error.to_string().contains("recursion limit exceeded")
}

impl<const BOUNDARY: u8> JsonField<BOUNDARY> {
    fn new(value: Value) -> Self {
        Self(Box::new(value))
    }

    pub fn into_value(self) -> Value {
        *self.0
    }
}

/// Decode array members as typed containers; other JSON types produce an empty array.
pub struct Array<T>(pub Vec<T>);

impl<T> Default for Array<T> {
    fn default() -> Self {
        Self(Vec::new())
    }
}

pub(super) trait Container<'de>: Default {
    fn has_fields(&self) -> bool {
        false
    }

    fn read_map<A: MapAccess<'de>>(mut map: A) -> Result<Self, A::Error> {
        while map.next_key::<JsString>()?.is_some() {
            map.next_value::<IgnoredAny>()?;
        }
        Ok(Self::default())
    }

    fn read_seq<A: SeqAccess<'de>>(mut sequence: A) -> Result<Self, A::Error> {
        while sequence.next_element::<IgnoredAny>()?.is_some() {}
        Ok(Self::default())
    }
}

pub(super) struct ContainerVisitor<T>(pub(super) PhantomData<T>);

impl<'de, T: Container<'de>> Visitor<'de> for ContainerVisitor<T> {
    type Value = T;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("an OTLP container")
    }

    fn visit_map<A: MapAccess<'de>>(self, map: A) -> Result<T, A::Error> {
        T::read_map(map)
    }

    fn visit_seq<A: SeqAccess<'de>>(self, sequence: A) -> Result<T, A::Error> {
        T::read_seq(sequence)
    }

    fn visit_str<E: serde::de::Error>(self, _: &str) -> Result<T, E> {
        Ok(T::default())
    }

    fn visit_bool<E: serde::de::Error>(self, _: bool) -> Result<T, E> {
        Ok(T::default())
    }

    fn visit_i64<E: serde::de::Error>(self, _: i64) -> Result<T, E> {
        Ok(T::default())
    }

    fn visit_u64<E: serde::de::Error>(self, _: u64) -> Result<T, E> {
        Ok(T::default())
    }

    fn visit_f64<E: serde::de::Error>(self, _: f64) -> Result<T, E> {
        Ok(T::default())
    }

    fn visit_unit<E: serde::de::Error>(self) -> Result<T, E> {
        Ok(T::default())
    }
}

impl<'de, T: Deserialize<'de> + Container<'de>> Container<'de> for Array<T> {
    fn read_seq<A: SeqAccess<'de>>(mut sequence: A) -> Result<Self, A::Error> {
        let mut values = Vec::new();
        while let Some(value) = sequence.next_element::<T>()? {
            if value.has_fields() {
                values.push(value);
            }
        }
        Ok(Self(values))
    }
}

impl<'de, T: Deserialize<'de> + Container<'de>> Deserialize<'de> for Array<T> {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        deserializer.deserialize_any(ContainerVisitor(PhantomData))
    }
}

// The OTLP boundary follows JSON.parse's last-key-wins rule and treats
// non-object container values as empty containers.
macro_rules! otlp_object {
    ($name:ident { $($field:ident: $ty:ty => $key:literal),* $(,)? }) => {
        #[derive(Default)]
        pub struct $name {
            $(pub $field: Option<$ty>,)*
        }

        impl<'de> $crate::otel::input::decode::Container<'de> for $name {
            fn has_fields(&self) -> bool {
                false $(|| self.$field.is_some())*
            }

            fn read_map<A: ::serde::de::MapAccess<'de>>(mut map: A) -> Result<Self, A::Error> {
                let mut value = Self::default();
                while let Some(key) =
                    map.next_key::<$crate::otel::value::JsString>()?
                {
                    match key.as_str() {
                        $($key => value.$field = Some(map.next_value()?),)*
                        _ => { map.next_value::<::serde::de::IgnoredAny>()?; }
                    }
                }
                Ok(value)
            }
        }

        impl<'de> ::serde::Deserialize<'de> for $name {
            fn deserialize<D: ::serde::Deserializer<'de>>(
                deserializer: D,
            ) -> Result<Self, D::Error> {
                deserializer.deserialize_any(
                    $crate::otel::input::decode::ContainerVisitor(
                        ::std::marker::PhantomData,
                    ),
                )
            }
        }
    };
}

pub(super) use otlp_object;
