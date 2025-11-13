use crate::error::{Error, Result};
use crate::{Row, row::RowKind, row_metadata::RowMetadata};
use clickhouse_types::data_types::{Column, DataTypeNode, DecimalType, EnumType};
use std::collections::HashMap;
use std::fmt::Display;
use std::marker::PhantomData;

/// This trait is used to validate the schema of a [`crate::Row`] against the parsed RBWNAT schema.
/// Note that [`SchemaValidator`] is also implemented for `()`,
/// which is used to skip validation if the user disabled it.
pub(crate) trait SchemaValidator<R: Row>: Sized {
    type Inner<'serde>: SchemaValidator<R>
    where
        Self: 'serde;
    /// The main entry point. The validation flow based on the [`Row::KIND`].
    /// For container types (nullable, array, map, tuple, variant, etc.),
    /// it will return an [`InnerDataTypeValidator`] instance (see [`InnerDataTypeValidatorKind`]),
    /// which has its own implementation of this method, allowing recursive validation.
    fn validate(&mut self, serde_type: SerdeType) -> Result<Self::Inner<'_>>;
    /// Validates that an identifier exists in the values map for enums,
    /// or stores the variant identifier for the next serde call.
    fn validate_identifier<T: EnumOrVariantIdentifier>(&mut self, value: T) -> Result<()>;
    /// Having the database schema from RBWNAT, the crate can detect that
    /// while the field names and the types are correct, the field order in the struct
    /// does not match the column order in the database schema, and we should use
    /// `MapAccess` instead of `SeqAccess` to seamlessly deserialize the struct.
    fn is_field_order_wrong(&self) -> bool;
    /// Returns the "restored" index of the schema column for the given struct field index.
    /// It is used only if the crate detects that while the field names and the types are correct,
    /// the field order in the struct does not match the column order in the database schema.
    fn get_schema_index(&self, struct_idx: usize) -> Result<usize>;
    // If the database schema contains a tuple with more elements than it is defined in the struct,
    // this method will emit an error indicating that the struct definition is incomplete.
    fn check_tuple_fully_validated(&self) -> Result<()>;
}

pub(crate) struct DataTypeValidator<'caller, R: Row> {
    metadata: &'caller RowMetadata,
    current_column_idx: usize,
    _marker: PhantomData<R>,
}

impl<'caller, R: Row> DataTypeValidator<'caller, R> {
    pub(crate) fn new(metadata: &'caller RowMetadata) -> Self {
        Self {
            metadata,
            current_column_idx: 0,
            _marker: PhantomData::<R>,
        }
    }

    fn get_current_column(&self) -> Result<Option<&Column>> {
        if self.current_column_idx > 0 && self.current_column_idx <= self.metadata.columns.len() {
            // index is immediately moved to the next column after the root validator is called
            let schema_index = self.get_schema_index(self.current_column_idx - 1)?;
            Ok(Some(&self.metadata.columns[schema_index]))
        } else {
            Ok(None)
        }
    }

    fn get_current_column_name_and_type(&self) -> Result<(String, &DataTypeNode)> {
        let current_column = self.get_current_column()?;
        Ok(current_column
            .map(|c| (format!("{}.{}", R::NAME, c.name), &c.data_type))
            // both should be defined at this point
            .unwrap_or(("Struct".to_string(), &DataTypeNode::Bool)))
    }

    fn err_on_schema_mismatch<'serde>(
        &'serde self,
        data_type: &DataTypeNode,
        serde_type: &SerdeType,
        is_inner: bool,
    ) -> Result<Option<InnerDataTypeValidator<'serde, 'caller, R>>> {
        match R::KIND {
            RowKind::Primitive => Err(Error::SchemaMismatch(format!(
                "While processing row as a primitive: attempting to (de)serialize \
                 ClickHouse type {data_type} as {serde_type} which is not compatible"
            ))),
            RowKind::Vec => Err(Error::SchemaMismatch(format!(
                "While processing row as a vector: attempting to (de)serialize \
                 ClickHouse type {data_type} as {serde_type} which is not compatible"
            ))),
            RowKind::Tuple => Err(Error::SchemaMismatch(format!(
                "While processing row as a tuple: attempting to (de)serialize \
                 ClickHouse type {data_type} as {serde_type} which is not compatible"
            ))),
            RowKind::Struct => {
                if is_inner {
                    let (full_name, full_data_type) = self.get_current_column_name_and_type()?;
                    Err(Error::SchemaMismatch(format!(
                        "While processing column {full_name} defined as {full_data_type}: attempting to (de)serialize \
                        nested ClickHouse type {data_type} as {serde_type} which is not compatible"
                    )))
                } else {
                    Err(Error::SchemaMismatch(format!(
                        "While processing column {}: attempting to (de)serialize \
                        ClickHouse type {} as {} which is not compatible",
                        self.get_current_column_name_and_type()?.0,
                        data_type,
                        serde_type
                    )))
                }
            }
        }
    }
}

impl<'caller, R: Row> SchemaValidator<R> for DataTypeValidator<'caller, R> {
    type Inner<'serde>
        = Option<InnerDataTypeValidator<'serde, 'caller, R>>
    where
        Self: 'serde;

    #[inline]
    fn validate(&'_ mut self, serde_type: SerdeType) -> Result<Self::Inner<'_>> {
        match R::KIND {
            // `fetch::<i32>` for a "primitive row" type
            RowKind::Primitive => {
                if self.current_column_idx == 0 && self.metadata.columns.len() == 1 {
                    let data_type = &self.metadata.columns[0].data_type;
                    validate_impl(self, data_type, &serde_type, false)
                } else {
                    Err(Error::SchemaMismatch(format!(
                        "Primitive row is expected to be a single value, got columns: {:?}",
                        self.metadata.columns
                    )))
                }
            }
            // `fetch::<(i16, i32)>` or `fetch::<(T, u64)>` for a "tuple row" type
            RowKind::Tuple => {
                match serde_type {
                    SerdeType::Tuple(_) => Ok(Some(InnerDataTypeValidator {
                        root: self,
                        kind: InnerDataTypeValidatorKind::RootTuple(&self.metadata.columns, 0),
                    })),
                    _ => {
                        // should be unreachable
                        Err(Error::SchemaMismatch(format!(
                            "While processing tuple row: expected serde type Tuple(N), got {serde_type}"
                        )))
                    }
                }
            }
            // `fetch::<Vec<i32>>` for a "vector row" type
            RowKind::Vec => {
                let data_type = &self.metadata.columns[0].data_type;
                match data_type {
                    DataTypeNode::Array(inner_type) => {
                        let kind = InnerDataTypeValidatorKind::RootArray(inner_type);
                        Ok(Some(InnerDataTypeValidator { root: self, kind }))
                    }
                    _ => Err(Error::SchemaMismatch(format!(
                        "Expected Array type when validating root level sequence, but got {}",
                        self.metadata.columns[0].data_type
                    ))),
                }
            }
            // `fetch::<T>` for a "struct row" type, which is supposed to be the default flow
            RowKind::Struct => {
                if self.current_column_idx < self.metadata.columns.len() {
                    let current_column = &self.metadata.columns[self.current_column_idx];
                    self.current_column_idx += 1;
                    validate_impl(self, &current_column.data_type, &serde_type, false)
                } else {
                    Err(Error::SchemaMismatch(format!(
                        "Struct {} has more fields than columns in the database schema",
                        R::NAME
                    )))
                }
            }
        }
    }

    #[inline]
    fn is_field_order_wrong(&self) -> bool {
        self.metadata.is_field_order_wrong()
    }

    #[inline]
    fn get_schema_index(&self, struct_idx: usize) -> Result<usize> {
        self.metadata.get_schema_index(struct_idx)
    }

    #[cold]
    fn validate_identifier<T: EnumOrVariantIdentifier>(&mut self, _value: T) -> Result<()> {
        unreachable!()
    }

    #[cold]
    fn check_tuple_fully_validated(&self) -> Result<()> {
        unreachable!()
    }
}

/// Having a ClickHouse `Map<K, V>` defined as a `HashMap<K, V>` in Rust, Serde will call:
/// - `deserialize_map`     for `Vec<(K, V)>`
/// - `deserialize_<key>`   suitable for `K`
/// - `deserialize_<value>` suitable for `V`
#[derive(Debug)]
pub(crate) enum MapValidatorState {
    Key,
    Value,
}

/// Having a ClickHouse `Map<K, V>` defined as `Vec<(K, V)>` in Rust, Serde will call:
/// - `deserialize_seq`     for `Vec<(K, V)>`
/// - `deserialize_tuple`   for `(K, V)`
/// - `deserialize_<key>`   suitable for `K`
/// - `deserialize_<value>` suitable for `V`
#[derive(Debug)]
pub(crate) enum MapAsSequenceValidatorState {
    Tuple,
    Key,
    Value,
}

pub(crate) struct InnerDataTypeValidator<'serde, 'caller, R: Row> {
    root: &'serde DataTypeValidator<'caller, R>,
    kind: InnerDataTypeValidatorKind<'caller>,
}

#[derive(Debug)]
pub(crate) enum InnerDataTypeValidatorKind<'caller> {
    Array(&'caller DataTypeNode),
    FixedString(usize),
    Map(&'caller [Box<DataTypeNode>; 2], MapValidatorState),
    /// Allows supporting ClickHouse `Map<K, V>` defined as `Vec<(K, V)>` in Rust
    MapAsSequence(&'caller [Box<DataTypeNode>; 2], MapAsSequenceValidatorState),
    Tuple(&'caller [DataTypeNode]),
    /// This is a hack to support deserializing tuples/arrays (and not structs) from fetch calls
    RootTuple(&'caller [Column], usize),
    RootArray(&'caller DataTypeNode),
    Enum(&'caller HashMap<i16, String>),
    Variant(&'caller [DataTypeNode], VariantValidationState),
    Nullable(&'caller DataTypeNode),
}

#[derive(Debug)]
pub(crate) enum VariantValidationState {
    Pending,
    Identifier(u8),
}

impl<'caller, R: Row> SchemaValidator<R> for Option<InnerDataTypeValidator<'_, 'caller, R>> {
    type Inner<'serde>
        = Self
    where
        Self: 'serde;

    #[inline]
    fn validate(&mut self, serde_type: SerdeType) -> Result<Self> {
        if self.is_none() {
            return Ok(None);
        }

        let inner = self.as_mut().unwrap(); // checked above
        match &mut inner.kind {
            InnerDataTypeValidatorKind::Map(kv, state) => match state {
                MapValidatorState::Key => {
                    let result = validate_impl(inner.root, &kv[0], &serde_type, true);
                    *state = MapValidatorState::Value;
                    result
                }
                MapValidatorState::Value => {
                    let result = validate_impl(inner.root, &kv[1], &serde_type, true);
                    *state = MapValidatorState::Key;
                    result
                }
            },
            InnerDataTypeValidatorKind::MapAsSequence(kv, state) => {
                match state {
                    // the first state is simply skipped, as the same validator
                    // will be called again for the Key and then the Value types
                    MapAsSequenceValidatorState::Tuple => {
                        *state = MapAsSequenceValidatorState::Key;
                        Ok(self.take())
                    }
                    MapAsSequenceValidatorState::Key => {
                        let result = validate_impl(inner.root, &kv[0], &serde_type, true);
                        *state = MapAsSequenceValidatorState::Value;
                        result
                    }
                    MapAsSequenceValidatorState::Value => {
                        let result = validate_impl(inner.root, &kv[1], &serde_type, true);
                        *state = MapAsSequenceValidatorState::Tuple;
                        result
                    }
                }
            }
            InnerDataTypeValidatorKind::Array(inner_type) => {
                validate_impl(inner.root, inner_type, &serde_type, true)
            }
            InnerDataTypeValidatorKind::Nullable(inner_type) => {
                validate_impl(inner.root, inner_type, &serde_type, true)
            }
            InnerDataTypeValidatorKind::Tuple(elements_types) => {
                match elements_types.split_first() {
                    Some((first, rest)) => {
                        *elements_types = rest;
                        validate_impl(inner.root, first, &serde_type, true)
                    }
                    None => {
                        let (full_name, full_data_type) =
                            inner.root.get_current_column_name_and_type()?;

                        Err(Error::SchemaMismatch(format!(
                            "While processing column {full_name} defined as {full_data_type}: \
                            attempting to (de)serialize {serde_type} while no more elements are allowed"
                        )))
                    }
                }
            }
            InnerDataTypeValidatorKind::FixedString(_len) => {
                Ok(None) // actually unreachable
            }
            InnerDataTypeValidatorKind::RootTuple(columns, current_index) => {
                if *current_index < columns.len() {
                    let data_type = &columns[*current_index].data_type;
                    *current_index += 1;

                    validate_impl(inner.root, data_type, &serde_type, true)
                } else {
                    let (full_name, full_data_type) =
                        inner.root.get_current_column_name_and_type()?;

                    Err(Error::SchemaMismatch(format!(
                        "While processing root tuple element {full_name} defined as {full_data_type}: \
                         attempting to (de)serialize {serde_type} while no more elements are allowed"
                    )))
                }
            }
            InnerDataTypeValidatorKind::RootArray(inner_data_type) => {
                validate_impl(inner.root, inner_data_type, &serde_type, true)
            }
            InnerDataTypeValidatorKind::Variant(possible_types, state) => match state {
                VariantValidationState::Pending => {
                    unreachable!()
                }
                VariantValidationState::Identifier(value) => {
                    if *value as usize >= possible_types.len() {
                        let (full_name, full_data_type) =
                            inner.root.get_current_column_name_and_type()?;

                        return Err(Error::SchemaMismatch(format!(
                            "While processing column {full_name} defined as {full_data_type}: \
                             Variant identifier {value} is out of bounds, max allowed index is {}",
                            possible_types.len() - 1
                        )));
                    }

                    let data_type = &possible_types[*value as usize];
                    validate_impl(inner.root, data_type, &serde_type, true)
                }
            },
            // TODO - check enum string value correctness in the hashmap?
            //  is this even possible?
            InnerDataTypeValidatorKind::Enum(_values_map) => {
                unreachable!()
            }
        }
    }

    fn validate_identifier<T: EnumOrVariantIdentifier>(&mut self, value: T) -> Result<()> {
        use InnerDataTypeValidatorKind::{Enum, Variant};
        if let Some(inner) = self {
            match T::IDENTIFIER_TYPE {
                IdentifierType::Enum8 | IdentifierType::Enum16 => {
                    if let Enum(values_map) = &inner.kind
                        && !values_map.contains_key(&(value.into_i16()))
                    {
                        let (full_name, full_data_type) =
                            inner.root.get_current_column_name_and_type()?;

                        return Err(Error::SchemaMismatch(format!(
                            "While processing column {full_name} defined as {full_data_type}: \
                            Enum8 value {value} is not present in the database schema"
                        )));
                    }
                }
                IdentifierType::Variant => {
                    if let Variant(possible_types, state) = &mut inner.kind {
                        // ClickHouse guarantees max 255 variants, i.e. the same max value as u8
                        if value.into_u8() < (possible_types.len() as u8) {
                            *state = VariantValidationState::Identifier(value.into_u8());
                        } else {
                            let (full_name, full_data_type) =
                                inner.root.get_current_column_name_and_type()?;

                            return Err(Error::SchemaMismatch(format!(
                                "While processing column {full_name} defined as {full_data_type}: \
                                 Variant identifier {value} is out of bounds, max allowed index is {}",
                                possible_types.len() - 1
                            )));
                        }
                    }
                }
            }
        }

        Ok(())
    }

    #[inline(always)]
    fn is_field_order_wrong(&self) -> bool {
        false
    }

    #[cold]
    fn get_schema_index(&self, _struct_idx: usize) -> Result<usize> {
        unreachable!()
    }

    fn check_tuple_fully_validated(&self) -> Result<()> {
        if let Some(inner) = self
            && let InnerDataTypeValidatorKind::Tuple(elements_types) = inner.kind
            && !elements_types.is_empty()
        {
            let (column_name, column_type) = inner
                .root
                .get_current_column_name_and_type()
                .expect("correct columns for InnerDataTypeValidator::drop");

            return Err(Error::SchemaMismatch(format!(
                "While processing column {} defined as {}: tuple was not fully (de)serialized; \
                 missing elements: {}; likely, the struct definition for this field is incomplete",
                column_name,
                column_type,
                elements_types
                    .iter()
                    .map(|c| c.to_string())
                    .collect::<Vec<String>>()
                    .join(", ")
            )));
        }

        Ok(())
    }
}

// TODO: is there a way to eliminate multiple branches with similar patterns?
//  static/const dispatch?
//  separate smaller inline functions?
#[inline]
fn validate_impl<'serde, 'caller, R: Row>(
    root: &'serde DataTypeValidator<'caller, R>,
    column_data_type: &'caller DataTypeNode,
    serde_type: &SerdeType,
    is_inner: bool,
) -> Result<Option<InnerDataTypeValidator<'serde, 'caller, R>>> {
    let data_type = column_data_type.remove_low_cardinality();
    match serde_type {
        SerdeType::Bool
            if data_type == &DataTypeNode::Bool || data_type == &DataTypeNode::UInt8 =>
        {
            Ok(None)
        }
        SerdeType::I8 => match data_type {
            DataTypeNode::Int8 => Ok(None),
            DataTypeNode::Enum(EnumType::Enum8, values_map) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Enum(values_map),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::I16 => match data_type {
            DataTypeNode::Int16 => Ok(None),
            DataTypeNode::Enum(EnumType::Enum16, values_map) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Enum(values_map),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::I32
            if data_type == &DataTypeNode::Int32
                || data_type == &DataTypeNode::Date32
                || matches!(data_type, DataTypeNode::Time)
                || matches!(
                    data_type,
                    DataTypeNode::Decimal(_, _, DecimalType::Decimal32)
                ) =>
        {
            Ok(None)
        }
        SerdeType::I64
            if data_type == &DataTypeNode::Int64
                || matches!(data_type, DataTypeNode::DateTime64(_, _))
                || matches!(data_type, DataTypeNode::Time64(_))
                || matches!(
                    data_type,
                    DataTypeNode::Decimal(_, _, DecimalType::Decimal64)
                )
                || matches!(data_type, DataTypeNode::Interval(_)) =>
        {
            Ok(None)
        }
        SerdeType::I128
            if data_type == &DataTypeNode::Int128
                || matches!(
                    data_type,
                    DataTypeNode::Decimal(_, _, DecimalType::Decimal128)
                ) =>
        {
            Ok(None)
        }
        SerdeType::U8 if data_type == &DataTypeNode::UInt8 => Ok(None),
        SerdeType::U16
            if data_type == &DataTypeNode::UInt16 || data_type == &DataTypeNode::Date =>
        {
            Ok(None)
        }
        SerdeType::U32
            if data_type == &DataTypeNode::UInt32
                || matches!(data_type, DataTypeNode::DateTime(_))
                || data_type == &DataTypeNode::IPv4 =>
        {
            Ok(None)
        }
        SerdeType::U64 if data_type == &DataTypeNode::UInt64 => Ok(None),
        SerdeType::U128 if data_type == &DataTypeNode::UInt128 => Ok(None),
        SerdeType::F32 if data_type == &DataTypeNode::Float32 => Ok(None),
        SerdeType::F64 if data_type == &DataTypeNode::Float64 => Ok(None),
        SerdeType::Str | SerdeType::String
            if data_type == &DataTypeNode::String || data_type == &DataTypeNode::JSON =>
        {
            Ok(None)
        }
        // allows to work with BLOB strings as well
        SerdeType::Bytes(_) | SerdeType::ByteBuf(_) if data_type == &DataTypeNode::String => {
            Ok(None)
        }
        SerdeType::Option => {
            if let DataTypeNode::Nullable(inner_type) = data_type {
                Ok(Some(InnerDataTypeValidator {
                    root,
                    kind: InnerDataTypeValidatorKind::Nullable(inner_type),
                }))
            } else {
                root.err_on_schema_mismatch(data_type, serde_type, is_inner)
            }
        }
        SerdeType::Seq(_) => match data_type {
            DataTypeNode::Array(inner_type) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(inner_type),
            })),
            // A map can be defined as `Vec<(K, V)>` in the struct
            DataTypeNode::Map(kv) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::MapAsSequence(
                    kv,
                    MapAsSequenceValidatorState::Tuple,
                ),
            })),
            DataTypeNode::Ring => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::Point),
            })),
            DataTypeNode::Polygon => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::Ring),
            })),
            DataTypeNode::MultiPolygon => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::Polygon),
            })),
            DataTypeNode::LineString => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::Point),
            })),
            DataTypeNode::MultiLineString => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::LineString),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::Tuple(len) => match data_type {
            DataTypeNode::FixedString(n) => {
                if n == len {
                    Ok(Some(InnerDataTypeValidator {
                        root,
                        kind: InnerDataTypeValidatorKind::FixedString(*n),
                    }))
                } else {
                    let (full_name, full_data_type) = root.get_current_column_name_and_type()?;
                    Err(Error::SchemaMismatch(format!(
                        "While processing column {full_name} defined as {full_data_type}: attempting to (de)serialize \
                        nested ClickHouse type {data_type} as {serde_type}",
                    )))
                }
            }
            DataTypeNode::Tuple(elements) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Tuple(elements),
            })),
            DataTypeNode::Array(inner_type) => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(inner_type),
            })),
            DataTypeNode::IPv6 => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Array(&DataTypeNode::UInt8),
            })),
            DataTypeNode::UUID => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Tuple(UUID_TUPLE_ELEMENTS),
            })),
            DataTypeNode::Point => Ok(Some(InnerDataTypeValidator {
                root,
                kind: InnerDataTypeValidatorKind::Tuple(POINT_TUPLE_ELEMENTS),
            })),
            _ => root.err_on_schema_mismatch(data_type, serde_type, is_inner),
        },
        SerdeType::Map(_) => {
            if let DataTypeNode::Map(kv) = data_type {
                Ok(Some(InnerDataTypeValidator {
                    root,
                    kind: InnerDataTypeValidatorKind::Map(kv, MapValidatorState::Key),
                }))
            } else {
                Err(Error::SchemaMismatch(format!(
                    "Expected Map for {serde_type} call, but got {data_type}"
                )))
            }
        }
        SerdeType::Variant => {
            if let DataTypeNode::Variant(possible_types) = data_type {
                Ok(Some(InnerDataTypeValidator {
                    root,
                    kind: InnerDataTypeValidatorKind::Variant(
                        possible_types,
                        VariantValidationState::Pending,
                    ),
                }))
            } else {
                Err(Error::SchemaMismatch(format!(
                    "Expected Variant for {serde_type} call, but got {data_type}"
                )))
            }
        }

        _ => root.err_on_schema_mismatch(
            data_type,
            serde_type,
            is_inner || matches!(column_data_type, DataTypeNode::LowCardinality { .. }),
        ),
    }
}

impl<R: Row> SchemaValidator<R> for () {
    type Inner<'serde> = ();

    #[inline(always)]
    fn validate(&mut self, _serde_type: SerdeType) -> Result<()> {
        Ok(())
    }

    #[inline(always)]
    fn is_field_order_wrong(&self) -> bool {
        // We can't detect incorrect field order with just plain `RowBinary` format
        false
    }

    #[inline(always)]
    fn validate_identifier<T: EnumOrVariantIdentifier>(&mut self, _value: T) -> Result<()> {
        Ok(())
    }

    #[cold]
    fn get_schema_index(&self, _struct_idx: usize) -> Result<usize> {
        unreachable!()
    }

    #[inline(always)]
    fn check_tuple_fully_validated(&self) -> Result<()> {
        Ok(())
    }
}

/// Which Serde data type (De)serializer used for the given type.
/// Displays into certain Rust types for convenience in errors reporting.
/// See also: available methods in [`serde::Serializer`] and [`serde::Deserializer`].
#[derive(Clone, Debug, PartialEq)]
pub(crate) enum SerdeType {
    Bool,
    I8,
    I16,
    I32,
    I64,
    I128,
    U8,
    U16,
    U32,
    U64,
    U128,
    F32,
    F64,
    Str,
    String,
    Option,
    Variant,
    Bytes(usize),
    ByteBuf(usize),
    Tuple(usize),
    Seq(usize),
    Map(usize),
    // Identifier,
    // Char,
    // Unit,
    // Struct,
    // NewtypeStruct,
    // TupleStruct,
    // UnitStruct,
    // IgnoredAny,
}

impl Display for SerdeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SerdeType::Bool => write!(f, "bool"),
            SerdeType::I8 => write!(f, "i8"),
            SerdeType::I16 => write!(f, "i16"),
            SerdeType::I32 => write!(f, "i32"),
            SerdeType::I64 => write!(f, "i64"),
            SerdeType::I128 => write!(f, "i128"),
            SerdeType::U8 => write!(f, "u8"),
            SerdeType::U16 => write!(f, "u16"),
            SerdeType::U32 => write!(f, "u32"),
            SerdeType::U64 => write!(f, "u64"),
            SerdeType::U128 => write!(f, "u128"),
            SerdeType::F32 => write!(f, "f32"),
            SerdeType::F64 => write!(f, "f64"),
            SerdeType::Str => write!(f, "&str"),
            SerdeType::String => write!(f, "String"),
            SerdeType::Bytes(len) => write!(f, "&[u8; {len}]"),
            SerdeType::ByteBuf(_len) => write!(f, "Vec<u8>"),
            SerdeType::Option => write!(f, "Option<T>"),
            SerdeType::Variant => write!(f, "enum"),
            SerdeType::Seq(_len) => write!(f, "Vec<T>"),
            SerdeType::Tuple(len) => write!(f, "a tuple or sequence with length {len}"),
            SerdeType::Map(_len) => write!(f, "Map<K, V>"),
            // SerdeType::Identifier => "identifier",
            // SerdeType::Char => "char",
            // SerdeType::Unit => "()",
            // SerdeType::Struct => "struct",
            // SerdeType::NewtypeStruct => "newtype struct",
            // SerdeType::TupleStruct => "tuple struct",
            // SerdeType::UnitStruct => "unit struct",
            // SerdeType::IgnoredAny => "ignored any",
        }
    }
}

#[derive(Debug)]
pub(crate) enum IdentifierType {
    Enum8,
    Enum16,
    Variant,
}
pub(crate) trait EnumOrVariantIdentifier: Display + Copy {
    const IDENTIFIER_TYPE: IdentifierType;
    fn into_u8(self) -> u8;
    fn into_i16(self) -> i16;
}
impl EnumOrVariantIdentifier for u8 {
    const IDENTIFIER_TYPE: IdentifierType = IdentifierType::Variant;
    // none of these should be ever called
    #[inline(always)]
    fn into_u8(self) -> u8 {
        self
    }
    #[inline(always)]
    fn into_i16(self) -> i16 {
        self as i16
    }
}
impl EnumOrVariantIdentifier for i8 {
    const IDENTIFIER_TYPE: IdentifierType = IdentifierType::Enum8;
    #[inline(always)]
    fn into_i16(self) -> i16 {
        self as i16
    }
    // we need only i16 for enum values HashMap
    #[inline(always)]
    fn into_u8(self) -> u8 {
        self as u8
    }
}
impl EnumOrVariantIdentifier for i16 {
    const IDENTIFIER_TYPE: IdentifierType = IdentifierType::Enum16;
    #[inline(always)]
    fn into_i16(self) -> i16 {
        self
    }
    // should not be ever called
    #[inline(always)]
    fn into_u8(self) -> u8 {
        self as u8
    }
}

const UUID_TUPLE_ELEMENTS: &[DataTypeNode; 2] = &[DataTypeNode::UInt64, DataTypeNode::UInt64];
const POINT_TUPLE_ELEMENTS: &[DataTypeNode; 2] = &[DataTypeNode::Float64, DataTypeNode::Float64];
