use crate::Row;
use crate::error::Error::SequenceMustHaveLength;
use crate::error::{Error, Result};
use crate::row_metadata::RowMetadata;
use crate::rowbinary::validation::{DataTypeValidator, SchemaValidator, SerdeType};
use bytes::BufMut;
use clickhouse_types::put_leb128;
use serde::ser::SerializeMap;
use serde::{
    Serialize,
    ser::{Impossible, SerializeSeq, SerializeStruct, SerializeTuple, Serializer},
};
use std::marker::PhantomData;

/// Serializes `row` using the `RowBinary` format and writes to `buffer`.
pub(crate) fn serialize_row_binary<B: BufMut, R: Row + Serialize>(
    buffer: B,
    row: &R,
) -> Result<()> {
    let mut serializer = RowBinarySerializer::<B, R>::new(buffer, ());
    row.serialize(&mut serializer)?;
    Ok(())
}

/// Serializes `row` using the `RowBinary` format and writes to `buffer`.
/// Additionally, it will perform validation against the provided `row_metadata`,
/// similarly to how [`crate::rowbinary::de::deserialize_row_with_validation`] works.
/// `RowBinaryWithNamesAndTypes` header is expected to be written by [`crate::insert::Insert`].
pub(crate) fn serialize_with_validation<B: BufMut, R: Row + Serialize>(
    buffer: B,
    value: &R,
    metadata: &RowMetadata,
) -> Result<()> {
    let validator = DataTypeValidator::<R>::new(metadata);
    let mut serializer = RowBinarySerializer::new(buffer, validator);
    value.serialize(&mut serializer)?;
    Ok(())
}

/// A serializer for the RowBinary format.
///
/// See https://clickhouse.com/docs/en/interfaces/formats#rowbinary for details.
struct RowBinarySerializer<B: BufMut, R: Row, V: SchemaValidator<R> = ()> {
    buffer: B,
    validator: V,
    _marker: PhantomData<R>,
}

type RowBinaryInnerTypeSerializer<'ser, B, R, V> = RowBinarySerializer<&'ser mut B, R, V>;

impl<B: BufMut, R: Row, V: SchemaValidator<R>> RowBinarySerializer<B, R, V> {
    fn new(buffer: B, validator: V) -> Self {
        Self {
            buffer,
            validator,
            _marker: PhantomData,
        }
    }
}

macro_rules! impl_num {
    ($ty:ty, $ser_method:ident, $writer_method:ident, $serde_type:expr) => {
        #[inline]
        fn $ser_method(self, v: $ty) -> Result<()> {
            self.validator.validate($serde_type)?;
            self.buffer.$writer_method(v);
            Ok(())
        }
    };
}

macro_rules! impl_num_or_enum {
    ($ty:ty, $ser_method:ident, $writer_method:ident, $serde_type:expr) => {
        #[inline]
        fn $ser_method(self, v: $ty) -> Result<()> {
            self.validator
                .validate($serde_type)?
                .validate_identifier::<$ty>(v)?;
            self.buffer.$writer_method(v);
            Ok(())
        }
    };
}

impl<'ser, B: BufMut, R: Row, V: SchemaValidator<R>> Serializer
    for &'ser mut RowBinarySerializer<B, R, V>
{
    type Error = Error;
    type Ok = ();

    type SerializeStruct = Self;

    type SerializeSeq = RowBinaryInnerTypeSerializer<'ser, B, R, V::Inner<'ser>>;
    type SerializeTuple = Self::SerializeSeq;
    type SerializeMap = Self::SerializeSeq;

    type SerializeStructVariant = Impossible<(), Error>;
    type SerializeTupleStruct = Impossible<(), Error>;
    type SerializeTupleVariant = Impossible<(), Error>;

    impl_num_or_enum!(i8, serialize_i8, put_i8, SerdeType::I8);
    impl_num_or_enum!(i16, serialize_i16, put_i16_le, SerdeType::I16);

    impl_num!(i32, serialize_i32, put_i32_le, SerdeType::I32);
    impl_num!(i64, serialize_i64, put_i64_le, SerdeType::I64);
    impl_num!(i128, serialize_i128, put_i128_le, SerdeType::I128);
    impl_num!(u8, serialize_u8, put_u8, SerdeType::U8);
    impl_num!(u16, serialize_u16, put_u16_le, SerdeType::U16);
    impl_num!(u32, serialize_u32, put_u32_le, SerdeType::U32);
    impl_num!(u64, serialize_u64, put_u64_le, SerdeType::U64);
    impl_num!(u128, serialize_u128, put_u128_le, SerdeType::U128);
    impl_num!(f32, serialize_f32, put_f32_le, SerdeType::F32);
    impl_num!(f64, serialize_f64, put_f64_le, SerdeType::F64);

    #[inline]
    fn serialize_bool(self, v: bool) -> Result<()> {
        self.validator.validate(SerdeType::Bool)?;
        self.buffer.put_u8(v as _);
        Ok(())
    }

    #[inline]
    fn serialize_char(self, _v: char) -> Result<()> {
        panic!("character types are unsupported: `char`");
    }

    #[inline]
    fn serialize_str(self, v: &str) -> Result<()> {
        self.validator.validate(SerdeType::Str)?;
        put_leb128(&mut self.buffer, v.len() as u64);
        self.buffer.put_slice(v.as_bytes());
        Ok(())
    }

    #[inline]
    fn serialize_bytes(self, v: &[u8]) -> Result<()> {
        let size = v.len();
        self.validator.validate(SerdeType::Bytes(size))?;
        put_leb128(&mut self.buffer, size as u64);
        self.buffer.put_slice(v);
        Ok(())
    }

    #[inline]
    fn serialize_none(self) -> Result<()> {
        self.validator.validate(SerdeType::Option)?;
        self.buffer.put_u8(1);
        Ok(())
    }

    #[inline]
    fn serialize_some<T: Serialize + ?Sized>(self, value: &T) -> Result<()> {
        let opt_validator = self.validator.validate(SerdeType::Option)?;
        let mut inner = RowBinarySerializer::new(&mut self.buffer, opt_validator);
        inner.buffer.put_u8(0);
        value.serialize(&mut inner)
    }

    #[inline]
    fn serialize_unit(self) -> Result<()> {
        panic!("unit types are unsupported: `()`");
    }

    #[inline]
    fn serialize_unit_struct(self, name: &'static str) -> Result<()> {
        panic!("unit types are unsupported: `{name}`");
    }

    #[inline]
    fn serialize_unit_variant(
        self,
        name: &'static str,
        _variant_index: u32,
        variant: &'static str,
    ) -> Result<()> {
        panic!("unit variant types are unsupported: `{name}::{variant}`");
    }

    #[inline]
    fn serialize_newtype_struct<T: Serialize + ?Sized>(
        self,
        _name: &'static str,
        value: &T,
    ) -> Result<()> {
        value.serialize(self)
    }

    #[inline]
    fn serialize_newtype_variant<T: Serialize + ?Sized>(
        self,
        name: &'static str,
        variant_index: u32,
        variant: &'static str,
        value: &T,
    ) -> Result<()> {
        // Max number of types in the Variant data type is 255
        // See also: https://github.com/ClickHouse/ClickHouse/issues/54864
        if variant_index > 255 {
            panic!(
                "max number of types in the Variant data type is 255, \
                 got {variant_index} for {name}::{variant}"
            );
        }
        let idx = variant_index as u8; // safe cast due to the check above
        let mut inner = self.validator.validate(SerdeType::Variant)?;
        inner.validate_identifier(idx)?;
        self.buffer.put_u8(idx);
        value.serialize(&mut RowBinarySerializer::new(&mut self.buffer, inner))
    }

    #[inline]
    fn serialize_seq(self, len: Option<usize>) -> Result<Self::SerializeSeq> {
        let len = len.ok_or(SequenceMustHaveLength)?;
        let inner = self.validator.validate(SerdeType::Seq(len))?;
        put_leb128(&mut self.buffer, len as u64);
        Ok(RowBinarySerializer::new(&mut self.buffer, inner))
    }

    #[inline]
    fn serialize_tuple(self, len: usize) -> Result<Self::SerializeTuple> {
        let inner = self.validator.validate(SerdeType::Tuple(len))?;
        Ok(RowBinarySerializer::new(&mut self.buffer, inner))
    }

    #[inline]
    fn serialize_tuple_struct(
        self,
        name: &'static str,
        _len: usize,
    ) -> Result<Self::SerializeTupleStruct> {
        panic!("tuple struct types are unsupported: `{name}`");
    }

    #[inline]
    fn serialize_tuple_variant(
        self,
        name: &'static str,
        _variant_index: u32,
        variant: &'static str,
        _len: usize,
    ) -> Result<Self::SerializeTupleVariant> {
        panic!("tuple variant types are unsupported: `{name}::{variant}`");
    }

    #[inline]
    fn serialize_map(self, len: Option<usize>) -> Result<Self::SerializeMap> {
        let len = len.ok_or(SequenceMustHaveLength)?;
        put_leb128(&mut self.buffer, len as u64);
        let inner = self.validator.validate(SerdeType::Map(len))?;
        Ok(RowBinarySerializer::new(&mut self.buffer, inner))
    }

    #[inline]
    fn serialize_struct(self, _name: &'static str, _len: usize) -> Result<Self::SerializeStruct> {
        Ok(self)
    }

    #[inline]
    fn serialize_struct_variant(
        self,
        name: &'static str,
        _variant_index: u32,
        variant: &'static str,
        _len: usize,
    ) -> Result<Self::SerializeStructVariant> {
        panic!("struct variant types are unsupported: `{name}::{variant}`");
    }

    #[inline]
    fn is_human_readable(&self) -> bool {
        false
    }
}

/// Unlike [`SerializeSeq`], [`SerializeTuple`] and [`SerializeMap`],
/// this is supposed to be the main entry point of serialization.
/// The impl here uses the _reference_ to the serializer with B: BufMut,
/// while the others are implemented over the concrete type,
/// but with [`&mut B: BufMut`] inside.
impl<B: BufMut, R: Row, V: SchemaValidator<R>> SerializeStruct
    for &'_ mut RowBinarySerializer<B, R, V>
{
    type Error = Error;
    type Ok = ();

    #[inline]
    fn serialize_field<T: Serialize + ?Sized>(&mut self, _: &'static str, value: &T) -> Result<()> {
        value.serialize(&mut **self)
    }

    #[inline]
    fn end(self) -> Result<()> {
        Ok(())
    }
}

impl<B: BufMut, R: Row, V: SchemaValidator<R>> SerializeSeq
    for RowBinaryInnerTypeSerializer<'_, B, R, V>
{
    type Error = Error;
    type Ok = ();

    #[inline]
    fn serialize_element<T>(&mut self, value: &T) -> std::result::Result<(), Self::Error>
    where
        T: ?Sized + Serialize,
    {
        value.serialize(self)
    }

    #[inline]
    fn end(self) -> Result<()> {
        Ok(())
    }
}

impl<B: BufMut, R: Row, V: SchemaValidator<R>> SerializeTuple
    for RowBinaryInnerTypeSerializer<'_, B, R, V>
{
    type Error = Error;
    type Ok = ();

    #[inline]
    fn serialize_element<T>(&mut self, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        value.serialize(self)
    }

    #[inline]
    fn end(self) -> Result<()> {
        Ok(())
    }
}

/// TODO: usage of [`SerializeMap::serialize_entry`] implies some borrow checker issues.
impl<'ser, B: BufMut, R: Row, V: SchemaValidator<R>> SerializeMap
    for RowBinaryInnerTypeSerializer<'ser, B, R, V>
{
    type Error = Error;
    type Ok = ();

    #[inline]
    fn serialize_key<T>(&mut self, key: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        key.serialize(self)
    }

    #[inline]
    fn serialize_value<T>(&mut self, value: &T) -> Result<()>
    where
        T: ?Sized + Serialize,
    {
        value.serialize(self)
    }

    #[inline]
    fn end(self) -> Result<()> {
        Ok(())
    }
}
