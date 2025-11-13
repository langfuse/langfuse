use crate::Row;
use crate::error::{Error, Result};
use crate::row_metadata::RowMetadata;
use crate::rowbinary::utils::{ensure_size, get_unsigned_leb128};
use crate::rowbinary::validation::{DataTypeValidator, SchemaValidator, SerdeType};
use bytes::Buf;
use core::mem::size_of;
use serde::de::MapAccess;
use serde::{
    Deserialize,
    de::{DeserializeSeed, Deserializer, EnumAccess, SeqAccess, VariantAccess, Visitor},
};
use std::marker::PhantomData;
use std::{convert::TryFrom, str};

/// Deserializes a row from `input` with a row encoded in `RowBinary`.
///
/// If the optional metadata ([`RowMetadata`]) parsed from `RowBinaryWithNamesAndTypes` header
/// is provided, the deserializer performs validation of the parsed row against that meta.
///
/// It accepts _a reference to_ a byte slice because it somehow leads to a more
/// performant generated code than `(&[u8]) -> Result<(T, usize)>` and even
/// `(&[u8], &mut Option<T>) -> Result<usize>`.
pub(crate) fn deserialize_row<'data, 'cursor, T: Deserialize<'data> + Row>(
    input: &mut &'data [u8],
    metadata: Option<&'cursor RowMetadata>,
) -> Result<T> {
    match metadata {
        Some(metadata) => deserialize_row_with_validation(input, metadata),
        None => deserialize_row_without_validation(input),
    }
}

/// Deserializes a value from `input` with a row encoded in `RowBinary`,
/// i.e. only when validation is disabled in the client.
fn deserialize_row_without_validation<'data, 'cursor, T: Deserialize<'data> + Row>(
    input: &mut &'data [u8],
) -> Result<T> {
    let mut deserializer = RowBinaryDeserializer::<T, _>::new(input, ());
    T::deserialize(&mut deserializer)
}

/// Deserializes a value from `input` using metadata ([`RowMetadata`])
/// parsed from `RowBinaryWithNamesAndTypes` header to validate the data types.
/// This is used when [`crate::Row`] validation is enabled in the client (default).
fn deserialize_row_with_validation<'data, 'cursor, T: Deserialize<'data> + Row>(
    input: &mut &'data [u8],
    metadata: &'cursor RowMetadata,
) -> Result<T> {
    let validator = DataTypeValidator::new(metadata);
    let mut deserializer = RowBinaryDeserializer::<T, _>::new(input, validator);
    T::deserialize(&mut deserializer)
}

/// A deserializer for the `RowBinary(WithNamesAndTypes)` format.
///
/// See https://clickhouse.com/docs/en/interfaces/formats#rowbinary for details.
struct RowBinaryDeserializer<'cursor, 'data, R: Row, V = ()>
where
    V: SchemaValidator<R>,
{
    input: &'cursor mut &'data [u8],
    validator: V,
    _marker: PhantomData<R>,
}

impl<'cursor, 'data, R: Row, V> RowBinaryDeserializer<'cursor, 'data, R, V>
where
    V: SchemaValidator<R>,
{
    fn new(input: &'cursor mut &'data [u8], validator: V) -> Self {
        Self {
            input,
            validator,
            _marker: PhantomData,
        }
    }

    fn inner(
        &mut self,
        serde_type: SerdeType,
    ) -> Result<RowBinaryDeserializer<'_, 'data, R, V::Inner<'_>>> {
        let validator = self.validator.validate(serde_type)?;
        Ok(RowBinaryDeserializer {
            validator,
            input: self.input,
            _marker: PhantomData,
        })
    }

    fn read_vec(&mut self, size: usize) -> Result<Vec<u8>> {
        Ok(self.read_slice(size)?.to_vec())
    }

    fn read_slice(&mut self, size: usize) -> Result<&'data [u8]> {
        ensure_size(&mut self.input, size)?;
        let slice = &self.input[..size];
        self.input.advance(size);
        Ok(slice)
    }

    fn read_size(&mut self) -> Result<usize> {
        let size = get_unsigned_leb128(&mut self.input)?;
        // TODO: what about another error?
        usize::try_from(size).map_err(|_| Error::NotEnoughData)
    }
}

macro_rules! impl_num {
    ($ty:ty, $deser_method:ident, $visitor_method:ident, $reader_method:ident, $serde_type:expr) => {
        #[inline(always)]
        fn $deser_method<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
            self.validator.validate($serde_type)?;
            ensure_size(&mut self.input, core::mem::size_of::<$ty>())?;
            let value = self.input.$reader_method();
            visitor.$visitor_method(value)
        }
    };
}

macro_rules! impl_num_or_enum {
    ($ty:ty, $deser_method:ident, $visitor_method:ident, $reader_method:ident, $serde_type:expr) => {
        #[inline(always)]
        fn $deser_method<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
            let mut maybe_enum_validator = self.validator.validate($serde_type)?;
            ensure_size(&mut self.input, core::mem::size_of::<$ty>())?;
            let value = self.input.$reader_method();
            maybe_enum_validator.validate_identifier::<$ty>(value)?;
            visitor.$visitor_method(value)
        }
    };
}

impl<'data, R: Row, Validator> Deserializer<'data>
    for &mut RowBinaryDeserializer<'_, 'data, R, Validator>
where
    Validator: SchemaValidator<R>,
{
    type Error = Error;

    impl_num_or_enum!(i8, deserialize_i8, visit_i8, get_i8, SerdeType::I8);
    impl_num_or_enum!(i16, deserialize_i16, visit_i16, get_i16_le, SerdeType::I16);

    impl_num!(i32, deserialize_i32, visit_i32, get_i32_le, SerdeType::I32);
    impl_num!(i64, deserialize_i64, visit_i64, get_i64_le, SerdeType::I64);
    #[rustfmt::skip]
    impl_num!(i128, deserialize_i128, visit_i128, get_i128_le, SerdeType::I128);

    impl_num!(u8, deserialize_u8, visit_u8, get_u8, SerdeType::U8);
    impl_num!(u16, deserialize_u16, visit_u16, get_u16_le, SerdeType::U16);
    impl_num!(u32, deserialize_u32, visit_u32, get_u32_le, SerdeType::U32);
    impl_num!(u64, deserialize_u64, visit_u64, get_u64_le, SerdeType::U64);
    #[rustfmt::skip]
    impl_num!(u128, deserialize_u128, visit_u128, get_u128_le, SerdeType::U128);

    impl_num!(f32, deserialize_f32, visit_f32, get_f32_le, SerdeType::F32);
    impl_num!(f64, deserialize_f64, visit_f64, get_f64_le, SerdeType::F64);

    #[inline(always)]
    fn deserialize_any<V: Visitor<'data>>(self, _: V) -> Result<V::Value> {
        Err(Error::DeserializeAnyNotSupported)
    }

    #[inline(always)]
    fn deserialize_unit<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        // TODO: revise this.
        // TODO - skip validation?
        visitor.visit_unit()
    }

    #[inline(always)]
    fn deserialize_bool<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        self.validator.validate(SerdeType::Bool)?;
        ensure_size(&mut self.input, 1)?;
        match self.input.get_u8() {
            0 => visitor.visit_bool(false),
            1 => visitor.visit_bool(true),
            v => Err(Error::InvalidTagEncoding(v as usize)),
        }
    }

    #[inline(always)]
    fn deserialize_str<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        self.validator.validate(SerdeType::Str)?;
        let size = self.read_size()?;
        let slice = self.read_slice(size)?;
        let str = str::from_utf8(slice).map_err(Error::from)?;
        visitor.visit_borrowed_str(str)
    }

    #[inline(always)]
    fn deserialize_string<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        self.validator.validate(SerdeType::String)?;
        let size = self.read_size()?;
        let vec = self.read_vec(size)?;
        let string = String::from_utf8(vec).map_err(|err| Error::from(err.utf8_error()))?;
        visitor.visit_string(string)
    }

    #[inline(always)]
    fn deserialize_bytes<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        let size = self.read_size()?;
        self.validator.validate(SerdeType::Bytes(size))?;
        let slice = self.read_slice(size)?;
        visitor.visit_borrowed_bytes(slice)
    }

    #[inline(always)]
    fn deserialize_byte_buf<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        let size = self.read_size()?;
        self.validator.validate(SerdeType::ByteBuf(size))?;
        visitor.visit_byte_buf(self.read_vec(size)?)
    }

    /// This is used to deserialize identifiers for either:
    /// - `Variant` data type
    /// - out-of-order struct fields using [`MapAccess`].
    #[inline(always)]
    fn deserialize_identifier<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        ensure_size(&mut self.input, size_of::<u8>())?;
        let value = self.input.get_u8();
        // TODO: is there a better way to validate that the deserialized value matches the schema?
        // TODO: theoretically, we can track if we are currently processing a struct field id,
        //  and don't call the validator in that case, cause it will never be a `Variant`.
        self.validator.validate_identifier::<u8>(value)?;
        visitor.visit_u8(value)
    }

    #[inline(always)]
    fn deserialize_enum<V: Visitor<'data>>(
        self,
        _name: &'static str,
        _variants: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value> {
        let deserializer = &mut self.inner(SerdeType::Variant)?;
        visitor.visit_enum(RowBinaryEnumAccess { deserializer })
    }

    #[inline(always)]
    fn deserialize_tuple<V: Visitor<'data>>(self, len: usize, visitor: V) -> Result<V::Value> {
        let deserializer = &mut self.inner(SerdeType::Tuple(len))?;
        visitor.visit_seq(RowBinaryTupleSeqAccess { deserializer, len })
    }

    #[inline(always)]
    fn deserialize_option<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        ensure_size(&mut self.input, 1)?;
        let is_null = self.input.get_u8();
        let deserializer = &mut self.inner(SerdeType::Option)?;
        match is_null {
            0 => visitor.visit_some(deserializer),
            1 => visitor.visit_none(),
            v => Err(Error::InvalidTagEncoding(v as usize)),
        }
    }

    #[inline(always)]
    fn deserialize_seq<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        let len = self.read_size()?;
        let deserializer = &mut self.inner(SerdeType::Seq(len))?;
        visitor.visit_seq(RowBinarySeqAccess { deserializer, len })
    }

    #[inline(always)]
    fn deserialize_map<V: Visitor<'data>>(self, visitor: V) -> Result<V::Value> {
        let len = self.read_size()?;
        let deserializer = &mut self.inner(SerdeType::Map(len))?;
        visitor.visit_map(RowBinaryMapAccess {
            deserializer,
            remaining: len,
        })
    }

    #[inline(always)]
    fn deserialize_struct<V: Visitor<'data>>(
        self,
        _name: &'static str,
        fields: &'static [&'static str],
        visitor: V,
    ) -> Result<V::Value> {
        if !self.validator.is_field_order_wrong() {
            visitor.visit_seq(RowBinarySeqAccess {
                deserializer: self,
                len: fields.len(),
            })
        } else {
            visitor.visit_map(RowBinaryStructAsMapAccess {
                deserializer: self,
                current_field_idx: 0,
                fields,
            })
        }
    }

    #[inline(always)]
    fn deserialize_newtype_struct<V: Visitor<'data>>(
        self,
        _name: &str,
        visitor: V,
    ) -> Result<V::Value> {
        visitor.visit_newtype_struct(self)
    }

    #[inline(always)]
    fn deserialize_char<V: Visitor<'data>>(self, _: V) -> Result<V::Value> {
        panic!("character types are unsupported: `char`");
    }

    #[inline(always)]
    fn deserialize_unit_struct<V: Visitor<'data>>(
        self,
        name: &'static str,
        _visitor: V,
    ) -> Result<V::Value> {
        panic!("unit types are unsupported: `{name}`");
    }

    #[inline(always)]
    fn deserialize_tuple_struct<V: Visitor<'data>>(
        self,
        name: &'static str,
        _len: usize,
        _visitor: V,
    ) -> Result<V::Value> {
        panic!("tuple struct types are unsupported: `{name}`");
    }

    #[inline(always)]
    fn deserialize_ignored_any<V: Visitor<'data>>(self, _visitor: V) -> Result<V::Value> {
        panic!("ignored types are unsupported");
    }

    #[inline(always)]
    fn is_human_readable(&self) -> bool {
        false
    }
}

struct RowBinaryTupleSeqAccess<'de, 'cursor, 'data, R: Row, Validator>
where
    Validator: SchemaValidator<R>,
{
    deserializer: &'de mut RowBinaryDeserializer<'cursor, 'data, R, Validator>,
    len: usize,
}

impl<'data, R: Row, Validator> SeqAccess<'data>
    for RowBinaryTupleSeqAccess<'_, '_, 'data, R, Validator>
where
    Validator: SchemaValidator<R>,
{
    type Error = Error;

    fn next_element_seed<T>(&mut self, seed: T) -> Result<Option<T::Value>>
    where
        T: DeserializeSeed<'data>,
    {
        if self.len > 0 {
            self.len -= 1;
            let value = DeserializeSeed::deserialize(seed, &mut *self.deserializer)?;

            if self.len == 0 {
                self.deserializer.validator.check_tuple_fully_validated()?;
            }

            Ok(Some(value))
        } else {
            Ok(None)
        }
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.len)
    }
}

/// Used in [`Deserializer::deserialize_seq`], [`Deserializer::deserialize_tuple`],
/// and it could be used in [`Deserializer::deserialize_struct`],
/// if we detect that the field order matches the database schema.
struct RowBinarySeqAccess<'de, 'cursor, 'data, R: Row, Validator>
where
    Validator: SchemaValidator<R>,
{
    deserializer: &'de mut RowBinaryDeserializer<'cursor, 'data, R, Validator>,
    len: usize,
}

impl<'data, R: Row, Validator> SeqAccess<'data> for RowBinarySeqAccess<'_, '_, 'data, R, Validator>
where
    Validator: SchemaValidator<R>,
{
    type Error = Error;

    fn next_element_seed<T>(&mut self, seed: T) -> Result<Option<T::Value>>
    where
        T: DeserializeSeed<'data>,
    {
        if self.len > 0 {
            self.len -= 1;
            let value = DeserializeSeed::deserialize(seed, &mut *self.deserializer)?;
            Ok(Some(value))
        } else {
            Ok(None)
        }
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.len)
    }
}

/// Used in [`Deserializer::deserialize_map`].
struct RowBinaryMapAccess<'de, 'cursor, 'data, R: Row, Validator>
where
    Validator: SchemaValidator<R>,
{
    deserializer: &'de mut RowBinaryDeserializer<'cursor, 'data, R, Validator>,
    remaining: usize,
}

impl<'data, R: Row, Validator> MapAccess<'data> for RowBinaryMapAccess<'_, '_, 'data, R, Validator>
where
    Validator: SchemaValidator<R>,
{
    type Error = Error;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>>
    where
        K: DeserializeSeed<'data>,
    {
        if self.remaining == 0 {
            return Ok(None);
        }
        self.remaining -= 1;
        seed.deserialize(&mut *self.deserializer).map(Some)
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value>
    where
        V: DeserializeSeed<'data>,
    {
        seed.deserialize(&mut *self.deserializer)
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.remaining)
    }
}

/// Used in [`Deserializer::deserialize_struct`] to support wrong struct field order
/// as long as the data types and field names are exactly matching the database schema.
struct RowBinaryStructAsMapAccess<'de, 'cursor, 'data, R: Row, Validator>
where
    Validator: SchemaValidator<R>,
{
    deserializer: &'de mut RowBinaryDeserializer<'cursor, 'data, R, Validator>,
    current_field_idx: usize,
    fields: &'static [&'static str],
}

struct StructFieldIdentifier(&'static str);

impl<'de> Deserializer<'de> for StructFieldIdentifier {
    type Error = Error;

    fn deserialize_identifier<V>(self, visitor: V) -> Result<V::Value>
    where
        V: Visitor<'de>,
    {
        visitor.visit_borrowed_str(self.0)
    }

    fn deserialize_any<V>(self, _visitor: V) -> Result<V::Value>
    where
        V: Visitor<'de>,
    {
        panic!("StructFieldIdentifier is supposed to use `deserialize_identifier` only");
    }

    serde::forward_to_deserialize_any! {
        bool i8 i16 i32 i64 i128 u8 u16 u32 u64 u128 f32 f64 char str string
        bytes byte_buf option unit unit_struct newtype_struct seq tuple
        tuple_struct map struct enum ignored_any
    }
}

/// Without schema order "restoration", the following query:
///
/// ```sql
/// SELECT 'foo' :: String AS a,
///        'bar' :: String AS c
/// ```
///
/// Will produce a wrong result, if the struct is defined as:
///
/// ```rs
///     struct Data {
///         c: String,
///         a: String,
///     }
/// ```
///
/// If we just use [`RowBinarySeqAccess`] here, `c` will be deserialized into the `a` field,
/// and `a` will be deserialized into the `c` field, which is a classic case of data corruption.
impl<'data, R: Row, Validator> MapAccess<'data>
    for RowBinaryStructAsMapAccess<'_, '_, 'data, R, Validator>
where
    Validator: SchemaValidator<R>,
{
    type Error = Error;

    fn next_key_seed<K>(&mut self, seed: K) -> Result<Option<K::Value>>
    where
        K: DeserializeSeed<'data>,
    {
        if self.current_field_idx >= self.fields.len() {
            return Ok(None);
        }
        let schema_index = self
            .deserializer
            .validator
            .get_schema_index(self.current_field_idx)?;
        let field_id = StructFieldIdentifier(self.fields[schema_index]);
        self.current_field_idx += 1;
        seed.deserialize(field_id).map(Some)
    }

    fn next_value_seed<V>(&mut self, seed: V) -> Result<V::Value>
    where
        V: DeserializeSeed<'data>,
    {
        seed.deserialize(&mut *self.deserializer)
    }

    fn size_hint(&self) -> Option<usize> {
        Some(self.fields.len())
    }
}

/// Used in [`Deserializer::deserialize_enum`].
struct RowBinaryEnumAccess<'de, 'cursor, 'data, R: Row, Validator>
where
    Validator: SchemaValidator<R>,
{
    deserializer: &'de mut RowBinaryDeserializer<'cursor, 'data, R, Validator>,
}

struct VariantDeserializer<'de, 'cursor, 'data, R: Row, Validator>
where
    Validator: SchemaValidator<R>,
{
    deserializer: &'de mut RowBinaryDeserializer<'cursor, 'data, R, Validator>,
}

impl<'data, R: Row, Validator> VariantAccess<'data>
    for VariantDeserializer<'_, '_, 'data, R, Validator>
where
    Validator: SchemaValidator<R>,
{
    type Error = Error;

    fn unit_variant(self) -> Result<()> {
        panic!("unit variants are unsupported");
    }

    fn newtype_variant_seed<T>(self, seed: T) -> Result<T::Value>
    where
        T: DeserializeSeed<'data>,
    {
        DeserializeSeed::deserialize(seed, &mut *self.deserializer)
    }

    fn tuple_variant<V>(self, len: usize, visitor: V) -> Result<V::Value>
    where
        V: Visitor<'data>,
    {
        self.deserializer.deserialize_tuple(len, visitor)
    }

    fn struct_variant<V>(self, fields: &'static [&'static str], visitor: V) -> Result<V::Value>
    where
        V: Visitor<'data>,
    {
        self.deserializer.deserialize_tuple(fields.len(), visitor)
    }
}

impl<'de, 'cursor, 'data, R: Row, Validator> EnumAccess<'data>
    for RowBinaryEnumAccess<'de, 'cursor, 'data, R, Validator>
where
    Validator: SchemaValidator<R>,
{
    type Error = Error;
    type Variant = VariantDeserializer<'de, 'cursor, 'data, R, Validator>;

    fn variant_seed<T>(self, seed: T) -> Result<(T::Value, Self::Variant), Self::Error>
    where
        T: DeserializeSeed<'data>,
    {
        let value = seed.deserialize(&mut *self.deserializer)?;
        let deserializer = VariantDeserializer {
            deserializer: self.deserializer,
        };
        Ok((value, deserializer))
    }
}
