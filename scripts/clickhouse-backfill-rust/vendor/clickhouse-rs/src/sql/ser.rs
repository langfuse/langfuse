use std::fmt::{self, Write};

use serde::{
    Serialize,
    ser::{self, SerializeSeq, SerializeTuple, Serializer},
};
use thiserror::Error;

use super::escape;

// === SerializerError ===

#[derive(Debug, Error)]
enum SerializerError {
    #[error("{0} is unsupported")]
    Unsupported(&'static str),
    #[error("{0}")]
    Custom(String),
}

impl ser::Error for SerializerError {
    fn custom<T: fmt::Display>(msg: T) -> Self {
        Self::Custom(msg.to_string())
    }
}

impl From<fmt::Error> for SerializerError {
    fn from(err: fmt::Error) -> Self {
        Self::Custom(err.to_string())
    }
}

// === SqlSerializer ===

type Result<T = (), E = SerializerError> = std::result::Result<T, E>;
type Impossible = ser::Impossible<(), SerializerError>;

struct SqlSerializer<'a, W> {
    writer: &'a mut W,
    in_param: bool,
}

macro_rules! unsupported {
    ($ser_method:ident($ty:ty) -> $ret:ty, $($other:tt)*) => {
        #[inline]
        fn $ser_method(self, _v: $ty) -> $ret {
            Err(SerializerError::Unsupported(stringify!($ser_method)))
        }
        unsupported!($($other)*);
    };
    ($ser_method:ident($ty:ty), $($other:tt)*) => {
        unsupported!($ser_method($ty) -> Result, $($other)*);
    };
    ($ser_method:ident, $($other:tt)*) => {
        #[inline]
        fn $ser_method(self) -> Result {
            Err(SerializerError::Unsupported(stringify!($ser_method)))
        }
        unsupported!($($other)*);
    };
    () => {};
}

macro_rules! forward_to_display {
    ($ser_method:ident($ty:ty), $($other:tt)*) => {
        #[inline]
        fn $ser_method(self, v: $ty) -> Result {
            write!(self.writer, "{}", &v)?;
            Ok(())
        }
        forward_to_display!($($other)*);
    };
    () => {};
}

impl<'a, W: Write> Serializer for SqlSerializer<'a, W> {
    type Error = SerializerError;
    type Ok = ();
    type SerializeMap = Impossible;
    type SerializeSeq = SqlListSerializer<'a, W>;
    type SerializeStruct = Impossible;
    type SerializeStructVariant = Impossible;
    type SerializeTuple = SqlListSerializer<'a, W>;
    type SerializeTupleStruct = Impossible;
    type SerializeTupleVariant = Impossible;

    unsupported!(
        serialize_map(Option<usize>) -> Result<Impossible>,
        serialize_unit,
        serialize_unit_struct(&'static str),
    );

    #[inline]
    fn serialize_bytes(self, value: &[u8]) -> Result {
        escape::hex_bytes(value, self.writer)?;
        Ok(())
    }

    forward_to_display!(
        serialize_i8(i8),
        serialize_i16(i16),
        serialize_i32(i32),
        serialize_i64(i64),
        serialize_u8(u8),
        serialize_u16(u16),
        serialize_u32(u32),
        serialize_u64(u64),
        serialize_f32(f32),
        serialize_f64(f64),
        serialize_bool(bool),
    );

    #[inline]
    fn serialize_char(self, value: char) -> Result {
        let mut tmp = [0u8; 4];
        self.serialize_str(value.encode_utf8(&mut tmp))
    }

    #[inline]
    fn serialize_i128(self, value: i128) -> Result {
        if self.in_param {
            // Casts aren't allowed in parameters, but the type is already fixed anyway.
            write!(self.writer, "{value}")?;
        } else {
            write!(self.writer, "{value}::Int128")?;
        }

        Ok(())
    }

    #[inline]
    fn serialize_u128(self, value: u128) -> Result {
        if self.in_param {
            write!(self.writer, "{value}")?;
        } else {
            write!(self.writer, "{value}::UInt128")?;
        }

        Ok(())
    }

    #[inline]
    fn serialize_str(self, value: &str) -> Result {
        escape::string(value, self.writer)?;
        Ok(())
    }

    #[inline]
    fn serialize_seq(self, _len: Option<usize>) -> Result<SqlListSerializer<'a, W>> {
        self.writer.write_char('[')?;
        Ok(SqlListSerializer {
            writer: self.writer,
            in_param: self.in_param,
            has_items: false,
            closing_char: ']',
        })
    }

    #[inline]
    fn serialize_tuple(self, _len: usize) -> Result<SqlListSerializer<'a, W>> {
        self.writer.write_char('(')?;
        Ok(SqlListSerializer {
            writer: self.writer,
            in_param: self.in_param,
            has_items: false,
            closing_char: ')',
        })
    }

    #[inline]
    fn serialize_some<T: Serialize + ?Sized>(self, _value: &T) -> Result {
        _value.serialize(self)
    }

    #[inline]
    fn serialize_none(self) -> std::result::Result<Self::Ok, Self::Error> {
        self.writer.write_str("NULL")?;
        Ok(())
    }

    #[inline]
    fn serialize_unit_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        variant: &'static str,
    ) -> Result {
        escape::string(variant, self.writer)?;
        Ok(())
    }

    #[inline]
    fn serialize_newtype_struct<T: Serialize + ?Sized>(
        self,
        _name: &'static str,
        value: &T,
    ) -> Result {
        value.serialize(self)
    }

    #[inline]
    fn serialize_newtype_variant<T: Serialize + ?Sized>(
        self,
        _name: &'static str,
        _variant_index: u32,
        _variant: &'static str,
        _value: &T,
    ) -> Result {
        Err(SerializerError::Unsupported("serialize_newtype_variant"))
    }

    #[inline]
    fn serialize_tuple_struct(self, _name: &'static str, _len: usize) -> Result<Impossible> {
        Err(SerializerError::Unsupported("serialize_tuple_struct"))
    }

    #[inline]
    fn serialize_tuple_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        _variant: &'static str,
        _len: usize,
    ) -> Result<Impossible> {
        Err(SerializerError::Unsupported("serialize_tuple_variant"))
    }

    #[inline]
    fn serialize_struct(self, _name: &'static str, _len: usize) -> Result<Self::SerializeStruct> {
        Err(SerializerError::Unsupported("serialize_struct"))
    }

    #[inline]
    fn serialize_struct_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        _variant: &'static str,
        _len: usize,
    ) -> Result<Self::SerializeStructVariant> {
        Err(SerializerError::Unsupported("serialize_struct_variant"))
    }

    #[inline]
    fn is_human_readable(&self) -> bool {
        true
    }
}

// === SqlListSerializer ===

struct SqlListSerializer<'a, W> {
    writer: &'a mut W,
    in_param: bool,
    has_items: bool,
    closing_char: char,
}

impl<W: Write> SerializeSeq for SqlListSerializer<'_, W> {
    type Error = SerializerError;
    type Ok = ();

    #[inline]
    fn serialize_element<T>(&mut self, value: &T) -> Result
    where
        T: Serialize + ?Sized,
    {
        if self.has_items {
            self.writer.write_char(',')?;
        }

        self.has_items = true;

        value.serialize(SqlSerializer {
            writer: self.writer,
            in_param: self.in_param,
        })
    }

    #[inline]
    fn end(self) -> Result {
        self.writer.write_char(self.closing_char)?;
        Ok(())
    }
}

impl<W: Write> SerializeTuple for SqlListSerializer<'_, W> {
    type Error = SerializerError;
    type Ok = ();

    #[inline]
    fn serialize_element<T>(&mut self, value: &T) -> Result
    where
        T: Serialize + ?Sized,
    {
        SerializeSeq::serialize_element(self, value)
    }

    #[inline]
    fn end(self) -> Result {
        SerializeSeq::end(self)
    }
}

// === ParamSerializer ===

struct ParamSerializer<'a, W> {
    writer: &'a mut W,
}

impl<'a, W: Write> Serializer for ParamSerializer<'a, W> {
    type Error = SerializerError;
    type Ok = ();
    type SerializeMap = Impossible;
    type SerializeSeq = SqlListSerializer<'a, W>;
    type SerializeStruct = Impossible;
    type SerializeStructVariant = Impossible;
    type SerializeTuple = SqlListSerializer<'a, W>;
    type SerializeTupleStruct = Impossible;
    type SerializeTupleVariant = Impossible;

    unsupported!(
        serialize_map(Option<usize>) -> Result<Impossible>,
        serialize_bytes(&[u8]),
        serialize_unit,
        serialize_unit_struct(&'static str),
    );

    forward_to_display!(
        serialize_i8(i8),
        serialize_i16(i16),
        serialize_i32(i32),
        serialize_i64(i64),
        serialize_i128(i128),
        serialize_u8(u8),
        serialize_u16(u16),
        serialize_u32(u32),
        serialize_u64(u64),
        serialize_u128(u128),
        serialize_f32(f32),
        serialize_f64(f64),
        serialize_bool(bool),
    );

    #[inline]
    fn serialize_char(self, value: char) -> Result {
        let mut tmp = [0u8; 4];
        self.serialize_str(value.encode_utf8(&mut tmp))
    }

    #[inline]
    fn serialize_str(self, value: &str) -> Result {
        // ClickHouse expects strings in params to be unquoted until inside a nested type
        // nested types go through serialize_seq which'll quote strings
        Ok(escape::escape(value, self.writer)?)
    }

    #[inline]
    fn serialize_seq(self, _len: Option<usize>) -> Result<SqlListSerializer<'a, W>> {
        self.writer.write_char('[')?;
        Ok(SqlListSerializer {
            writer: self.writer,
            in_param: true,
            has_items: false,
            closing_char: ']',
        })
    }

    #[inline]
    fn serialize_tuple(self, _len: usize) -> Result<SqlListSerializer<'a, W>> {
        self.writer.write_char('(')?;
        Ok(SqlListSerializer {
            writer: self.writer,
            in_param: true,
            has_items: false,
            closing_char: ')',
        })
    }

    #[inline]
    fn serialize_some<T: Serialize + ?Sized>(self, _value: &T) -> Result {
        _value.serialize(self)
    }

    #[inline]
    fn serialize_none(self) -> std::result::Result<Self::Ok, Self::Error> {
        self.writer.write_str("NULL")?;
        Ok(())
    }

    #[inline]
    fn serialize_unit_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        variant: &'static str,
    ) -> Result {
        escape::string(variant, self.writer)?;
        Ok(())
    }

    #[inline]
    fn serialize_newtype_struct<T: Serialize + ?Sized>(
        self,
        _name: &'static str,
        value: &T,
    ) -> Result {
        value.serialize(self)
    }

    #[inline]
    fn serialize_newtype_variant<T: Serialize + ?Sized>(
        self,
        _name: &'static str,
        _variant_index: u32,
        _variant: &'static str,
        _value: &T,
    ) -> Result {
        Err(SerializerError::Unsupported("serialize_newtype_variant"))
    }

    #[inline]
    fn serialize_tuple_struct(self, _name: &'static str, _len: usize) -> Result<Impossible> {
        Err(SerializerError::Unsupported("serialize_tuple_struct"))
    }

    #[inline]
    fn serialize_tuple_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        _variant: &'static str,
        _len: usize,
    ) -> Result<Impossible> {
        Err(SerializerError::Unsupported("serialize_tuple_variant"))
    }

    #[inline]
    fn serialize_struct(self, _name: &'static str, _len: usize) -> Result<Self::SerializeStruct> {
        Err(SerializerError::Unsupported("serialize_struct"))
    }

    #[inline]
    fn serialize_struct_variant(
        self,
        _name: &'static str,
        _variant_index: u32,
        _variant: &'static str,
        _len: usize,
    ) -> Result<Self::SerializeStructVariant> {
        Err(SerializerError::Unsupported("serialize_struct_variant"))
    }

    #[inline]
    fn is_human_readable(&self) -> bool {
        true
    }
}

// === Public API ===

pub(crate) fn write_arg(writer: &mut impl Write, value: &impl Serialize) -> Result<(), String> {
    value
        .serialize(SqlSerializer {
            writer,
            in_param: false,
        })
        .map_err(|err| err.to_string())
}

pub(crate) fn write_param(writer: &mut impl Write, value: &impl Serialize) -> Result<(), String> {
    value
        .serialize(ParamSerializer { writer })
        .map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check(v: impl Serialize) -> String {
        let mut out = String::new();
        write_arg(&mut out, &v).unwrap();
        out
    }

    #[test]
    fn it_writes_bytes() {
        use serde_bytes::ByteArray;
        use serde_bytes::ByteBuf;
        use serde_bytes::Bytes;

        assert_eq!(check(Bytes::new(b"hello")), "X'68656C6C6F'");
        assert_eq!(check(Bytes::new(b"")), "X''");
        assert_eq!(check(Bytes::new(b"a\xffb")), "X'61FF62'");
        assert_eq!(check(Bytes::new(b"a'b")), "X'612762'");

        assert_eq!(check(ByteArray::new(*b"hello")), "X'68656C6C6F'");
        assert_eq!(check(ByteArray::new(*b"")), "X''");
        assert_eq!(check(ByteArray::new(*b"a\xffb")), "X'61FF62'");
        assert_eq!(check(ByteArray::new(*b"a'b")), "X'612762'");

        assert_eq!(check(ByteBuf::from(b"hello")), "X'68656C6C6F'");
        assert_eq!(check(ByteBuf::from(b"")), "X''");
        assert_eq!(check(ByteBuf::from(b"a\xffb")), "X'61FF62'");
        assert_eq!(check(ByteBuf::from(b"a'b")), "X'612762'");

        assert_eq!(check(b"hello"), "(104,101,108,108,111)");
        assert_eq!(check(b""), "()");
        assert_eq!(check(b"a\xffb"), "(97,255,98)");
        assert_eq!(check(b"a'b"), "(97,39,98)");
    }

    #[test]
    fn it_writes_numeric_primitives() {
        assert_eq!(check(42), "42");
        assert_eq!(check(42.5), "42.5");
        assert_eq!(check(42u128), "42::UInt128");
        assert_eq!(check(42i128), "42::Int128");
    }

    #[test]
    fn it_writes_chars() {
        assert_eq!(check('8'), "'8'");
        assert_eq!(check('\''), "'\\''");
        // TODO: assert_eq!(check('\n'), "'\\n'");
    }

    #[test]
    fn it_writes_strings() {
        assert_eq!(check("ab"), "'ab'");
        assert_eq!(check("a'b"), "'a\\'b'");
        // TODO: assert_eq!(check("a\nb"), "'a\\nb'");
    }

    #[test]
    fn it_writes_unit_variants() {
        #[derive(Serialize)]
        enum Enum {
            A,
        }
        assert_eq!(check(Enum::A), "'A'");
    }

    #[test]
    fn it_writes_newtypes() {
        #[derive(Serialize)]
        struct N(u32);
        #[derive(Serialize)]
        struct F(f64);

        assert_eq!(check(N(42)), "42");
        assert_eq!(check(F(42.5)), "42.5");
    }

    #[test]
    fn it_writes_arrays() {
        assert_eq!(check(&[42, 43][..]), "[42,43]");
        assert_eq!(check(vec![42, 43]), "[42,43]");
    }

    #[test]
    fn it_writes_tuples() {
        assert_eq!(check((42, 43)), "(42,43)");
    }

    #[test]
    fn it_writes_options() {
        assert_eq!(check(None::<i32>), "NULL");
        assert_eq!(check(Some(32)), "32");
        assert_eq!(check(Some(vec![42, 43])), "[42,43]");
    }

    #[test]
    fn it_fails_on_unsupported() {
        let mut out = String::new();
        assert!(write_arg(&mut out, &std::collections::HashMap::<u32, u32>::new()).is_err());
        assert!(write_arg(&mut out, &()).is_err());

        #[derive(Serialize)]
        struct Unit;
        assert!(write_arg(&mut out, &Unit).is_err());

        #[derive(Serialize)]
        struct Struct {
            a: u32,
        }
        assert!(write_arg(&mut out, &Struct { a: 42 }).is_err());

        #[derive(Serialize)]
        struct TupleStruct(u32, u32);
        assert!(write_arg(&mut out, &TupleStruct(42, 42)).is_err());

        #[derive(Serialize)]
        enum Enum {
            Newtype(u32),
            Tuple(u32, u32),
            Struct { a: u32 },
        }
        assert!(write_arg(&mut out, &Enum::Newtype(42)).is_err());
        assert!(write_arg(&mut out, &Enum::Tuple(42, 42)).is_err());
        assert!(write_arg(&mut out, &Enum::Struct { a: 42 }).is_err());
    }
}
