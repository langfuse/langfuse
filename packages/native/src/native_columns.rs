//! Build ch-core-rs columns from prepared event rows.

use std::collections::BTreeMap;
use std::fmt;

use ch_core_rs::bitmap::Bitmap;
use ch_core_rs::column::{
    ArrayColumn, BoolColumn, Column, DecimalColumn, MapColumn, PrimitiveColumn, TupleColumn,
    Utf8Column,
};
use ch_core_rs::schema::ChType;

use crate::native_codec::{DateTime64Micros, Decimal64, SkillReference, SkillResourceLoaded};

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum NativeColumnError {
    StringColumnTooLarge,
    Message(String),
}

impl fmt::Display for NativeColumnError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::StringColumnTooLarge => {
                formatter.write_str("String column exceeds i32::MAX bytes")
            }
            Self::Message(message) => formatter.write_str(message),
        }
    }
}

impl From<String> for NativeColumnError {
    fn from(message: String) -> Self {
        Self::Message(message)
    }
}

/// Maps one prepared field type to its owned ch-core column.
///
/// The input is a slice of row references. Nested implementations flatten references and let the
/// leaf implementation allocate each output buffer once.
pub(crate) trait NativeColumn: Sized {
    fn ch_type() -> ChType;

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError>;
}

trait NullableColumn: NativeColumn + Default {}

pub(crate) fn column_type<T: NativeColumn>() -> ChType {
    T::ch_type()
}

pub(crate) fn build_column<'a, T, I>(values: I) -> Result<Column, NativeColumnError>
where
    T: NativeColumn + 'a,
    I: IntoIterator<Item = &'a T>,
{
    let values: Vec<&'a T> = values.into_iter().collect();
    T::build(&values)
}

fn checked_string_offset(value: usize) -> Result<i32, NativeColumnError> {
    i32::try_from(value).map_err(|_| NativeColumnError::StringColumnTooLarge)
}

fn checked_i64_offset(value: usize, kind: &str) -> Result<i64, NativeColumnError> {
    i64::try_from(value).map_err(|_| format!("{kind} offset exceeds i64::MAX").into())
}

impl NativeColumn for String {
    fn ch_type() -> ChType {
        ChType::String
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        let total_bytes = values.iter().try_fold(0usize, |total, value| {
            total
                .checked_add(value.len())
                .ok_or_else(|| "String data length overflow".to_owned())
        })?;
        let _ = checked_string_offset(total_bytes)?;

        let mut offsets = Vec::with_capacity(values.len() + 1);
        offsets.push(0);
        let mut data = Vec::with_capacity(total_bytes);
        for value in values {
            data.extend_from_slice(value.as_bytes());
            offsets.push(checked_string_offset(data.len())?);
        }
        Ok(Column::Utf8(Utf8Column::new(offsets, data)))
    }
}

impl NativeColumn for bool {
    fn ch_type() -> ChType {
        ChType::Bool
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        let len = values.len();
        let mut bitmap = vec![0; len.div_ceil(8)];
        for (index, value) in values.iter().enumerate() {
            if **value {
                bitmap[index / 8] |= 1 << (index % 8);
            }
        }
        Ok(Column::Bool(BoolColumn {
            bitmap,
            len,
            validity: None,
        }))
    }
}

macro_rules! impl_primitive_column {
    ($ty:ty, $ch_type:ident, $variant:ident) => {
        impl NativeColumn for $ty {
            fn ch_type() -> ChType {
                ChType::$ch_type
            }

            fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
                Ok(Column::$variant(PrimitiveColumn::new(
                    values.iter().map(|value| **value).collect(),
                )))
            }
        }
    };
}

impl_primitive_column!(u8, UInt8, UInt8);
impl_primitive_column!(u16, UInt16, UInt16);
impl_primitive_column!(u32, UInt32, UInt32);
impl_primitive_column!(u64, UInt64, UInt64);

impl NativeColumn for DateTime64Micros {
    fn ch_type() -> ChType {
        ChType::DateTime64 {
            precision: 6,
            timezone: None,
        }
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        Ok(Column::DateTime64(PrimitiveColumn::new(
            values.iter().map(|value| value.0).collect(),
        )))
    }
}

impl NullableColumn for String {}
impl NullableColumn for u16 {}
impl NullableColumn for u32 {}
impl NullableColumn for DateTime64Micros {}

impl NativeColumn for Decimal64 {
    fn ch_type() -> ChType {
        ChType::Decimal {
            precision: 18,
            scale: 12,
            bits: 64,
        }
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        let capacity = values
            .len()
            .checked_mul(std::mem::size_of::<i64>())
            .ok_or_else(|| "Decimal data length overflow".to_owned())?;
        let mut data = Vec::with_capacity(capacity);
        for value in values {
            data.extend_from_slice(&value.0.to_le_bytes());
        }
        Ok(Column::Decimal(DecimalColumn::new(data, 8, 18, 12)))
    }
}

impl<T> NativeColumn for Option<T>
where
    T: NullableColumn,
{
    fn ch_type() -> ChType {
        ChType::Nullable(Box::new(T::ch_type()))
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        let default = T::default();
        let mut null_map = Vec::with_capacity(values.len());
        let inner: Vec<&T> = values
            .iter()
            .map(|value| match value {
                Some(value) => {
                    null_map.push(0);
                    value
                }
                None => {
                    null_map.push(1);
                    &default
                }
            })
            .collect();
        with_validity(T::build(&inner)?, Bitmap::from_ch_null_map(&null_map))
    }
}

fn with_validity(column: Column, validity: Bitmap) -> Result<Column, NativeColumnError> {
    match column {
        Column::Utf8(mut column) => {
            column.validity = Some(validity);
            Ok(Column::Utf8(column))
        }
        Column::UInt16(mut column) => {
            column.validity = Some(validity);
            Ok(Column::UInt16(column))
        }
        Column::UInt32(mut column) => {
            column.validity = Some(validity);
            Ok(Column::UInt32(column))
        }
        Column::DateTime64(mut column) => {
            column.validity = Some(validity);
            Ok(Column::DateTime64(column))
        }
        _ => Err("Nullable wrapper is unsupported for this column"
            .to_owned()
            .into()),
    }
}

impl<T> NativeColumn for Vec<T>
where
    T: NativeColumn,
{
    fn ch_type() -> ChType {
        ChType::Array(Box::new(T::ch_type()))
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        let total_values = values.iter().try_fold(0usize, |total, row| {
            total
                .checked_add(row.len())
                .ok_or_else(|| "Array element count overflow".to_owned())
        })?;
        let mut offsets = Vec::with_capacity(values.len() + 1);
        offsets.push(0);
        let mut flattened = Vec::with_capacity(total_values);
        for row in values {
            flattened.extend(row.iter());
            offsets.push(checked_i64_offset(flattened.len(), "Array")?);
        }
        let child = T::build(&flattened)?;
        Ok(Column::Array(ArrayColumn::new(offsets, child)))
    }
}

impl<V> NativeColumn for BTreeMap<String, V>
where
    V: NativeColumn,
{
    fn ch_type() -> ChType {
        ChType::Map(Box::new(ChType::String), Box::new(V::ch_type()))
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        let total_entries = values.iter().try_fold(0usize, |total, map| {
            total
                .checked_add(map.len())
                .ok_or_else(|| "Map entry count overflow".to_owned())
        })?;
        let mut offsets = Vec::with_capacity(values.len() + 1);
        offsets.push(0);
        let mut keys = Vec::with_capacity(total_entries);
        let mut map_values = Vec::with_capacity(total_entries);
        for map in values {
            keys.extend(map.keys());
            map_values.extend(map.values());
            offsets.push(checked_i64_offset(keys.len(), "Map")?);
        }

        let entries = Column::Tuple(TupleColumn::new(
            vec![String::build(&keys)?, V::build(&map_values)?],
            total_entries,
        ));
        Ok(Column::Map(MapColumn::new(offsets, entries)))
    }
}

impl NativeColumn for SkillReference {
    fn ch_type() -> ChType {
        ChType::Tuple(vec![
            (None, <Option<String>>::ch_type()),
            (None, <Option<u32>>::ch_type()),
            (None, <String>::ch_type()),
        ])
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        let ids: Vec<&Option<String>> = values
            .iter()
            .map(|value| &value.langfuse_skill_id)
            .collect();
        let versions: Vec<&Option<u32>> = values.iter().map(|value| &value.skill_version).collect();
        let names: Vec<&String> = values.iter().map(|value| &value.skill_name).collect();
        Ok(Column::Tuple(TupleColumn::new(
            vec![
                Option::<String>::build(&ids)?,
                Option::<u32>::build(&versions)?,
                String::build(&names)?,
            ],
            values.len(),
        )))
    }
}

impl NativeColumn for SkillResourceLoaded {
    fn ch_type() -> ChType {
        ChType::Tuple(vec![
            (None, <Option<String>>::ch_type()),
            (None, <Option<u32>>::ch_type()),
            (None, <String>::ch_type()),
            (None, <String>::ch_type()),
        ])
    }

    fn build(values: &[&Self]) -> Result<Column, NativeColumnError> {
        let ids: Vec<&Option<String>> = values
            .iter()
            .map(|value| &value.langfuse_skill_id)
            .collect();
        let versions: Vec<&Option<u32>> = values.iter().map(|value| &value.skill_version).collect();
        let names: Vec<&String> = values.iter().map(|value| &value.skill_name).collect();
        let paths: Vec<&String> = values.iter().map(|value| &value.file_path).collect();
        Ok(Column::Tuple(TupleColumn::new(
            vec![
                Option::<String>::build(&ids)?,
                Option::<u32>::build(&versions)?,
                String::build(&names)?,
                String::build(&paths)?,
            ],
            values.len(),
        )))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn string_offset_limit_is_checked_without_allocating_the_column() {
        assert_eq!(checked_string_offset(i32::MAX as usize), Ok(i32::MAX));
        assert_eq!(
            checked_string_offset(i32::MAX as usize + 1),
            Err(NativeColumnError::StringColumnTooLarge)
        );
    }
}
