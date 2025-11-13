use crate::error::TypesError;
use std::collections::HashMap;
use std::fmt::{Display, Formatter};

/// A definition of a column in the result set,
/// taken out of the `RowBinaryWithNamesAndTypes` header.
#[derive(Debug, Clone, PartialEq)]
pub struct Column {
    /// The name of the column.
    pub name: String,
    /// The data type of the column.
    pub data_type: DataTypeNode,
}

impl Column {
    #[allow(missing_docs)]
    pub fn new(name: String, data_type: DataTypeNode) -> Self {
        Self { name, data_type }
    }
}

impl Display for Column {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.name, self.data_type)
    }
}

/// Represents a data type in ClickHouse.
/// See <https://clickhouse.com/docs/sql-reference/data-types>
#[derive(Debug, Clone, PartialEq)]
#[non_exhaustive]
#[allow(missing_docs)]
pub enum DataTypeNode {
    Bool,

    UInt8,
    UInt16,
    UInt32,
    UInt64,
    UInt128,
    UInt256,

    Int8,
    Int16,
    Int32,
    Int64,
    Int128,
    Int256,

    Float32,
    Float64,
    BFloat16,

    /// Scale, Precision, 32 | 64 | 128 | 256
    Decimal(u8, u8, DecimalType),

    String,
    FixedString(usize),
    UUID,

    Date,
    Date32,

    /// Optional timezone
    DateTime(Option<String>),
    /// Precision and optional timezone
    DateTime64(DateTimePrecision, Option<String>),

    /// Time-of-day, no timezone (timezone is ignored in value operations)
    Time,
    /// Precision and optional timezone (timezone is ignored in value operations)
    Time64(DateTimePrecision),

    Interval(IntervalType),

    IPv4,
    IPv6,

    Nullable(Box<DataTypeNode>),
    LowCardinality(Box<DataTypeNode>),

    Array(Box<DataTypeNode>),
    Tuple(Vec<DataTypeNode>),
    Enum(EnumType, HashMap<i16, String>),

    /// Key-Value pairs are defined as an array, so it can be used as a slice
    Map([Box<DataTypeNode>; 2]),

    /// Function name and its arguments
    AggregateFunction(String, Vec<DataTypeNode>),

    /// Contains all possible types for this variant
    Variant(Vec<DataTypeNode>),

    Dynamic,
    JSON,

    Point,
    Ring,
    LineString,
    MultiLineString,
    Polygon,
    MultiPolygon,
}

impl DataTypeNode {
    /// Parses a data type from a string that is received
    /// in the `RowBinaryWithNamesAndTypes` and `Native` formats headers.
    /// See also: <https://clickhouse.com/docs/interfaces/formats/RowBinaryWithNamesAndTypes#description>
    pub fn new(name: &str) -> Result<Self, TypesError> {
        match name {
            "UInt8" => Ok(Self::UInt8),
            "UInt16" => Ok(Self::UInt16),
            "UInt32" => Ok(Self::UInt32),
            "UInt64" => Ok(Self::UInt64),
            "UInt128" => Ok(Self::UInt128),
            "UInt256" => Ok(Self::UInt256),
            "Int8" => Ok(Self::Int8),
            "Int16" => Ok(Self::Int16),
            "Int32" => Ok(Self::Int32),
            "Int64" => Ok(Self::Int64),
            "Int128" => Ok(Self::Int128),
            "Int256" => Ok(Self::Int256),
            "Float32" => Ok(Self::Float32),
            "Float64" => Ok(Self::Float64),
            "BFloat16" => Ok(Self::BFloat16),
            "String" => Ok(Self::String),
            "UUID" => Ok(Self::UUID),
            "Date" => Ok(Self::Date),
            "Date32" => Ok(Self::Date32),
            "IPv4" => Ok(Self::IPv4),
            "IPv6" => Ok(Self::IPv6),
            "Bool" => Ok(Self::Bool),
            "Dynamic" => Ok(Self::Dynamic),
            "JSON" => Ok(Self::JSON),
            "Point" => Ok(Self::Point),
            "Ring" => Ok(Self::Ring),
            "LineString" => Ok(Self::LineString),
            "MultiLineString" => Ok(Self::MultiLineString),
            "Polygon" => Ok(Self::Polygon),
            "MultiPolygon" => Ok(Self::MultiPolygon),

            str if str.starts_with("JSON") => Ok(Self::JSON),

            str if str.starts_with("Decimal") => parse_decimal(str),
            str if str.starts_with("DateTime64") => parse_datetime64(str),
            str if str.starts_with("DateTime") => parse_datetime(str),
            str if str.starts_with("Time64") => parse_time64(str),
            str if str.starts_with("Time") => Ok(Self::Time),
            str if str.starts_with("Interval") => Ok(Self::Interval(str[8..].parse()?)),

            str if str.starts_with("Nullable") => parse_nullable(str),
            str if str.starts_with("LowCardinality") => parse_low_cardinality(str),
            str if str.starts_with("FixedString") => parse_fixed_string(str),

            str if str.starts_with("Array") => parse_array(str),
            str if str.starts_with("Enum") => parse_enum(str),
            str if str.starts_with("Map") => parse_map(str),
            str if str.starts_with("Tuple") => parse_tuple(str),
            str if str.starts_with("Variant") => parse_variant(str),

            // ...
            str => Err(TypesError::TypeParsingError(format!(
                "Unknown data type: {str}"
            ))),
        }
    }

    /// LowCardinality(T) -> T
    pub fn remove_low_cardinality(&self) -> &DataTypeNode {
        match self {
            DataTypeNode::LowCardinality(inner) => inner,
            _ => self,
        }
    }
}

impl From<DataTypeNode> for String {
    fn from(value: DataTypeNode) -> Self {
        value.to_string()
    }
}

impl Display for DataTypeNode {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        use DataTypeNode::*;
        match self {
            UInt8 => write!(f, "UInt8"),
            UInt16 => write!(f, "UInt16"),
            UInt32 => write!(f, "UInt32"),
            UInt64 => write!(f, "UInt64"),
            UInt128 => write!(f, "UInt128"),
            UInt256 => write!(f, "UInt256"),
            Int8 => write!(f, "Int8"),
            Int16 => write!(f, "Int16"),
            Int32 => write!(f, "Int32"),
            Int64 => write!(f, "Int64"),
            Int128 => write!(f, "Int128"),
            Int256 => write!(f, "Int256"),
            Float32 => write!(f, "Float32"),
            Float64 => write!(f, "Float64"),
            BFloat16 => write!(f, "BFloat16"),
            Decimal(precision, scale, _) => {
                write!(f, "Decimal({precision}, {scale})")
            }
            String => write!(f, "String"),
            UUID => write!(f, "UUID"),
            Date => write!(f, "Date"),
            Date32 => write!(f, "Date32"),
            DateTime(None) => write!(f, "DateTime"),
            DateTime(Some(tz)) => write!(f, "DateTime('{tz}')"),
            DateTime64(precision, None) => write!(f, "DateTime64({precision})"),
            DateTime64(precision, Some(tz)) => write!(f, "DateTime64({precision}, '{tz}')"),
            Time => write!(f, "Time"),
            Time64(precision) => write!(f, "Time64({precision})"),
            Interval(interval) => write!(f, "Interval{interval}"),
            IPv4 => write!(f, "IPv4"),
            IPv6 => write!(f, "IPv6"),
            Bool => write!(f, "Bool"),
            Nullable(inner) => write!(f, "Nullable({inner})"),
            Array(inner) => write!(f, "Array({inner})"),
            Tuple(elements) => {
                write!(f, "Tuple(")?;
                for (i, element) in elements.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "{element}")?;
                }
                write!(f, ")")
            }
            Map([key, value]) => {
                write!(f, "Map({key}, {value})")
            }
            LowCardinality(inner) => {
                write!(f, "LowCardinality({inner})")
            }
            Enum(enum_type, values) => {
                let mut values_vec = values.iter().collect::<Vec<_>>();
                values_vec.sort_by(|(i1, _), (i2, _)| (*i1).cmp(*i2));
                write!(f, "{enum_type}(")?;
                for (i, (index, name)) in values_vec.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "'{name}' = {index}")?;
                }
                write!(f, ")")
            }
            AggregateFunction(func_name, args) => {
                write!(f, "AggregateFunction({func_name}, ")?;
                for (i, element) in args.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "{element}")?;
                }
                write!(f, ")")
            }
            FixedString(size) => {
                write!(f, "FixedString({size})")
            }
            Variant(types) => {
                write!(f, "Variant(")?;
                for (i, element) in types.iter().enumerate() {
                    if i > 0 {
                        write!(f, ", ")?;
                    }
                    write!(f, "{element}")?;
                }
                write!(f, ")")
            }
            JSON => write!(f, "JSON"),
            Dynamic => write!(f, "Dynamic"),
            Point => write!(f, "Point"),
            Ring => write!(f, "Ring"),
            LineString => write!(f, "LineString"),
            MultiLineString => write!(f, "MultiLineString"),
            Polygon => write!(f, "Polygon"),
            MultiPolygon => write!(f, "MultiPolygon"),
        }
    }
}

/// Represents the underlying integer size of an Enum type.
#[derive(Debug, Clone, PartialEq)]
pub enum EnumType {
    /// Stored as an `Int8`
    Enum8,
    /// Stored as an `Int16`
    Enum16,
}

impl Display for EnumType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            EnumType::Enum8 => write!(f, "Enum8"),
            EnumType::Enum16 => write!(f, "Enum16"),
        }
    }
}

/// DateTime64 precision.
/// Defined as an enum, as it is valid only in the range from 0 to 9.
/// See also: <https://clickhouse.com/docs/sql-reference/data-types/datetime64>
#[derive(Debug, Clone, PartialEq)]
#[allow(missing_docs)]
pub enum DateTimePrecision {
    Precision0,
    Precision1,
    Precision2,
    Precision3,
    Precision4,
    Precision5,
    Precision6,
    Precision7,
    Precision8,
    Precision9,
}

impl DateTimePrecision {
    pub(crate) fn new(char: char) -> Result<DateTimePrecision, TypesError> {
        match char {
            '0' => Ok(DateTimePrecision::Precision0),
            '1' => Ok(DateTimePrecision::Precision1),
            '2' => Ok(DateTimePrecision::Precision2),
            '3' => Ok(DateTimePrecision::Precision3),
            '4' => Ok(DateTimePrecision::Precision4),
            '5' => Ok(DateTimePrecision::Precision5),
            '6' => Ok(DateTimePrecision::Precision6),
            '7' => Ok(DateTimePrecision::Precision7),
            '8' => Ok(DateTimePrecision::Precision8),
            '9' => Ok(DateTimePrecision::Precision9),
            _ => Err(TypesError::TypeParsingError(format!(
                "Invalid DateTime64 precision, expected to be within [0, 9] interval, got {char}"
            ))),
        }
    }
}

/// Represents the underlying integer type for a Decimal.
/// See also: <https://clickhouse.com/docs/sql-reference/data-types/decimal>
#[derive(Debug, Clone, PartialEq)]
pub enum DecimalType {
    /// Stored as an `Int32`
    Decimal32,
    /// Stored as an `Int64`
    Decimal64,
    /// Stored as an `Int128`
    Decimal128,
    /// Stored as an `Int256`
    Decimal256,
}

impl Display for DecimalType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            DecimalType::Decimal32 => write!(f, "Decimal32"),
            DecimalType::Decimal64 => write!(f, "Decimal64"),
            DecimalType::Decimal128 => write!(f, "Decimal128"),
            DecimalType::Decimal256 => write!(f, "Decimal256"),
        }
    }
}

impl DecimalType {
    pub(crate) fn new(precision: u8) -> Result<Self, TypesError> {
        if precision <= 9 {
            Ok(DecimalType::Decimal32)
        } else if precision <= 18 {
            Ok(DecimalType::Decimal64)
        } else if precision <= 38 {
            Ok(DecimalType::Decimal128)
        } else if precision <= 76 {
            Ok(DecimalType::Decimal256)
        } else {
            Err(TypesError::TypeParsingError(format!(
                "Invalid Decimal precision: {precision}"
            )))
        }
    }
}

impl Display for DateTimePrecision {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            DateTimePrecision::Precision0 => write!(f, "0"),
            DateTimePrecision::Precision1 => write!(f, "1"),
            DateTimePrecision::Precision2 => write!(f, "2"),
            DateTimePrecision::Precision3 => write!(f, "3"),
            DateTimePrecision::Precision4 => write!(f, "4"),
            DateTimePrecision::Precision5 => write!(f, "5"),
            DateTimePrecision::Precision6 => write!(f, "6"),
            DateTimePrecision::Precision7 => write!(f, "7"),
            DateTimePrecision::Precision8 => write!(f, "8"),
            DateTimePrecision::Precision9 => write!(f, "9"),
        }
    }
}

/// Represents the type of an interval.
/// See also: <https://clickhouse.com/docs/sql-reference/data-types/special-data-types/interval>
#[derive(Debug, Clone, PartialEq)]
#[allow(missing_docs)]
pub enum IntervalType {
    Nanosecond,
    Microsecond,
    Millisecond,
    Second,
    Minute,
    Hour,
    Day,
    Week,
    Month,
    Quarter,
    Year,
}

impl std::str::FromStr for IntervalType {
    type Err = TypesError;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "Nanosecond" => Ok(IntervalType::Nanosecond),
            "Microsecond" => Ok(IntervalType::Microsecond),
            "Millisecond" => Ok(IntervalType::Millisecond),
            "Second" => Ok(IntervalType::Second),
            "Minute" => Ok(IntervalType::Minute),
            "Hour" => Ok(IntervalType::Hour),
            "Day" => Ok(IntervalType::Day),
            "Week" => Ok(IntervalType::Week),
            "Month" => Ok(IntervalType::Month),
            "Quarter" => Ok(IntervalType::Quarter),
            "Year" => Ok(IntervalType::Year),
            _ => Err(TypesError::TypeParsingError(format!(
                "Unknown interval type: {s}"
            ))),
        }
    }
}

impl Display for IntervalType {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Nanosecond => write!(f, "Nanosecond"),
            Self::Microsecond => write!(f, "Microsecond"),
            Self::Millisecond => write!(f, "Millisecond"),
            Self::Second => write!(f, "Second"),
            Self::Minute => write!(f, "Minute"),
            Self::Hour => write!(f, "Hour"),
            Self::Day => write!(f, "Day"),
            Self::Week => write!(f, "Week"),
            Self::Month => write!(f, "Month"),
            Self::Quarter => write!(f, "Quarter"),
            Self::Year => write!(f, "Year"),
        }
    }
}

fn parse_fixed_string(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 14 {
        let size_str = &input[12..input.len() - 1];
        let size = size_str.parse::<usize>().map_err(|err| {
            TypesError::TypeParsingError(format!(
                "Invalid FixedString size, expected a valid number. Underlying error: {err}, input: {input}, size_str: {size_str}"
            ))
        })?;
        if size == 0 {
            return Err(TypesError::TypeParsingError(format!(
                "Invalid FixedString size, expected a positive number, got zero. Input: {input}"
            )));
        }
        return Ok(DataTypeNode::FixedString(size));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid FixedString format, expected FixedString(N), got {input}"
    )))
}

fn parse_array(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 8 {
        let inner_type_str = &input[6..input.len() - 1];
        let inner_type = DataTypeNode::new(inner_type_str)?;
        return Ok(DataTypeNode::Array(Box::new(inner_type)));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid Array format, expected Array(InnerType), got {input}"
    )))
}

fn parse_enum(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 9 {
        let (enum_type, prefix_len) = if input.starts_with("Enum8") {
            (EnumType::Enum8, 6)
        } else if input.starts_with("Enum16") {
            (EnumType::Enum16, 7)
        } else {
            return Err(TypesError::TypeParsingError(format!(
                "Invalid Enum type, expected Enum8 or Enum16, got {input}"
            )));
        };
        let enum_values_map_str = &input[prefix_len..input.len() - 1];
        let enum_values_map = parse_enum_values_map(enum_values_map_str)?;
        return Ok(DataTypeNode::Enum(enum_type, enum_values_map));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid Enum format, expected Enum8('name' = value), got {input}"
    )))
}

fn parse_datetime(input: &str) -> Result<DataTypeNode, TypesError> {
    if input == "DateTime" {
        return Ok(DataTypeNode::DateTime(None));
    }
    if input.len() >= 12 {
        let timezone = input[10..input.len() - 2].to_string();
        return Ok(DataTypeNode::DateTime(Some(timezone)));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid DateTime format, expected DateTime('timezone'), got {input}"
    )))
}

fn parse_decimal(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 10 {
        let precision_and_scale_str = input[8..input.len() - 1].split(", ").collect::<Vec<_>>();
        if precision_and_scale_str.len() != 2 {
            return Err(TypesError::TypeParsingError(format!(
                "Invalid Decimal format, expected Decimal(P, S), got {input}"
            )));
        }
        let parsed = precision_and_scale_str
            .iter()
            .map(|s| s.parse::<u8>())
            .collect::<Result<Vec<_>, _>>()
            .map_err(|err| {
                TypesError::TypeParsingError(format!(
                    "Invalid Decimal format, expected Decimal(P, S), got {input}. Underlying error: {err}"
                ))
            })?;
        let precision = parsed[0];
        let scale = parsed[1];
        if scale < 1 || precision < 1 {
            return Err(TypesError::TypeParsingError(format!(
                "Invalid Decimal format, expected Decimal(P, S) with P > 0 and S > 0, got {input}"
            )));
        }
        if precision < scale {
            return Err(TypesError::TypeParsingError(format!(
                "Invalid Decimal format, expected Decimal(P, S) with P >= S, got {input}"
            )));
        }
        let size = DecimalType::new(parsed[0])?;
        return Ok(DataTypeNode::Decimal(precision, scale, size));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid Decimal format, expected Decimal(P), got {input}"
    )))
}

fn parse_datetime64(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 13 {
        let mut chars = input[11..input.len() - 1].chars();
        let precision_char = chars.next().ok_or(TypesError::TypeParsingError(format!(
            "Invalid DateTime64 precision, expected a positive number. Input: {input}"
        )))?;
        let precision = DateTimePrecision::new(precision_char)?;
        let maybe_tz = match chars.as_str() {
            str if str.len() > 2 => Some(str[3..str.len() - 1].to_string()),
            _ => None,
        };
        return Ok(DataTypeNode::DateTime64(precision, maybe_tz));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid DateTime format, expected DateTime('timezone'), got {input}"
    )))
}

fn parse_time64(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 8 {
        let mut chars = input[7..input.len() - 1].chars();
        let precision_char = chars.next().ok_or(TypesError::TypeParsingError(format!(
            "Invalid Time64 precision, expected a positive number. Input: {input}"
        )))?;
        let precision = DateTimePrecision::new(precision_char)?;

        return Ok(DataTypeNode::Time64(precision));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid Time64 format, expected Time64(precision, 'timezone'), got {input}"
    )))
}

fn parse_low_cardinality(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 16 {
        let inner_type_str = &input[15..input.len() - 1];
        let inner_type = DataTypeNode::new(inner_type_str)?;
        return Ok(DataTypeNode::LowCardinality(Box::new(inner_type)));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid LowCardinality format, expected LowCardinality(InnerType), got {input}"
    )))
}

fn parse_nullable(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 10 {
        let inner_type_str = &input[9..input.len() - 1];
        let inner_type = DataTypeNode::new(inner_type_str)?;
        return Ok(DataTypeNode::Nullable(Box::new(inner_type)));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid Nullable format, expected Nullable(InnerType), got {input}"
    )))
}

fn parse_map(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 5 {
        let inner_types_str = &input[4..input.len() - 1];
        let inner_types = parse_inner_types(inner_types_str)?;
        if inner_types.len() != 2 {
            return Err(TypesError::TypeParsingError(format!(
                "Expected two inner elements in a Map from input {input}"
            )));
        }
        return Ok(DataTypeNode::Map([
            Box::new(inner_types[0].clone()),
            Box::new(inner_types[1].clone()),
        ]));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid Map format, expected Map(KeyType, ValueType), got {input}"
    )))
}

fn parse_tuple(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() > 7 {
        let inner_types_str = &input[6..input.len() - 1];
        let inner_types = parse_inner_types(inner_types_str)?;
        if inner_types.is_empty() {
            return Err(TypesError::TypeParsingError(format!(
                "Expected at least one inner element in a Tuple from input {input}"
            )));
        }
        return Ok(DataTypeNode::Tuple(inner_types));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid Tuple format, expected Tuple(Type1, Type2, ...), got {input}"
    )))
}

fn parse_variant(input: &str) -> Result<DataTypeNode, TypesError> {
    if input.len() >= 9 {
        let inner_types_str = &input[8..input.len() - 1];
        let inner_types = parse_inner_types(inner_types_str)?;
        return Ok(DataTypeNode::Variant(inner_types));
    }
    Err(TypesError::TypeParsingError(format!(
        "Invalid Variant format, expected Variant(Type1, Type2, ...), got {input}"
    )))
}

/// Considers the element type parsed once we reach a comma outside of parens AND after an unescaped tick.
/// The most complicated cases are values names in the self-defined Enum types:
/// ```
///  let input1 = "Tuple(Enum8('f\'()' = 1))";  // the result is  `f\'()`
///  let input2 = "Tuple(Enum8('(' = 1))";       // the result is  `(`
/// ```
fn parse_inner_types(input: &str) -> Result<Vec<DataTypeNode>, TypesError> {
    let mut inner_types: Vec<DataTypeNode> = Vec::new();

    let input_bytes = input.as_bytes();

    let mut open_parens = 0;
    let mut quote_open = false;
    let mut char_escaped = false;
    let mut last_element_index = 0;

    let mut i = 0;
    while i < input_bytes.len() {
        if char_escaped {
            char_escaped = false;
        } else if input_bytes[i] == b'\\' {
            char_escaped = true;
        } else if input_bytes[i] == b'\'' {
            quote_open = !quote_open; // unescaped quote
        } else if !quote_open {
            if input_bytes[i] == b'(' {
                open_parens += 1;
            } else if input_bytes[i] == b')' {
                open_parens -= 1;
            } else if input_bytes[i] == b',' && open_parens == 0 {
                let data_type_str = String::from_utf8(input_bytes[last_element_index..i].to_vec())
                    .map_err(|_| {
                        TypesError::TypeParsingError(format!(
                            "Invalid UTF-8 sequence in input for the inner data type: {}",
                            &input[last_element_index..]
                        ))
                    })?;
                let data_type = DataTypeNode::new(&data_type_str)?;
                inner_types.push(data_type);
                // Skip ', ' (comma and space)
                if i + 2 <= input_bytes.len() && input_bytes[i + 1] == b' ' {
                    i += 2;
                } else {
                    i += 1;
                }
                last_element_index = i;
                continue; // Skip the normal increment at the end of the loop
            }
        }
        i += 1;
    }

    // Push the remaining part of the type if it seems to be valid (at least all parentheses are closed)
    if open_parens == 0 && last_element_index < input_bytes.len() {
        let data_type_str =
            String::from_utf8(input_bytes[last_element_index..].to_vec()).map_err(|_| {
                TypesError::TypeParsingError(format!(
                    "Invalid UTF-8 sequence in input for the inner data type: {}",
                    &input[last_element_index..]
                ))
            })?;
        let data_type = DataTypeNode::new(&data_type_str)?;
        inner_types.push(data_type);
    }

    Ok(inner_types)
}

#[inline]
fn parse_enum_index(input_bytes: &[u8], input: &str) -> Result<i16, TypesError> {
    String::from_utf8(input_bytes.to_vec())
        .map_err(|_| {
            TypesError::TypeParsingError(format!(
                "Invalid UTF-8 sequence in input for the enum index: {}",
                &input
            ))
        })?
        .parse::<i16>()
        .map_err(|_| {
            TypesError::TypeParsingError(format!(
                "Invalid Enum index, expected a valid number. Input: {input}"
            ))
        })
}

fn parse_enum_values_map(input: &str) -> Result<HashMap<i16, String>, TypesError> {
    let mut names: Vec<String> = Vec::new();
    let mut indices: Vec<i16> = Vec::new();
    let mut parsing_name = true; // false when parsing the index
    let mut char_escaped = false; // we should ignore escaped ticks
    let mut start_index = 1; // Skip the first '

    let mut i = 1;
    let input_bytes = input.as_bytes();
    while i < input_bytes.len() {
        if parsing_name {
            if char_escaped {
                char_escaped = false;
            } else if input_bytes[i] == b'\\' {
                char_escaped = true;
            } else if input_bytes[i] == b'\'' {
                // non-escaped closing tick - push the name
                let name_bytes = &input_bytes[start_index..i];
                let name = String::from_utf8(name_bytes.to_vec()).map_err(|_| {
                    TypesError::TypeParsingError(format!(
                        "Invalid UTF-8 sequence in input for the enum name: {}",
                        &input[start_index..i]
                    ))
                })?;
                names.push(name);

                // Skip ` = ` and the first digit, as it will always have at least one
                if i + 4 >= input_bytes.len() {
                    return Err(TypesError::TypeParsingError(format!(
                        "Invalid Enum format - expected ` = ` after name, input: {input}",
                    )));
                }
                i += 4;
                start_index = i;
                parsing_name = false;
            }
        }
        // Parsing the index, skipping next iterations until the first non-digit one
        else if input_bytes[i] < b'0' || input_bytes[i] > b'9' {
            let index = parse_enum_index(&input_bytes[start_index..i], input)?;
            indices.push(index);

            // the char at this index should be comma
            // Skip `, '`, but not the first char - ClickHouse allows something like Enum8('foo' = 0, '' = 42)
            if i + 2 >= input_bytes.len() {
                break; // At the end of the enum, no more entries
            }
            i += 2;
            start_index = i + 1;
            parsing_name = true;
            char_escaped = false;
        }

        i += 1;
    }

    let index = parse_enum_index(&input_bytes[start_index..i], input)?;
    indices.push(index);

    if names.len() != indices.len() {
        return Err(TypesError::TypeParsingError(format!(
            "Invalid Enum format - expected the same number of names and indices, got names: {}, indices: {}",
            names.join(", "),
            indices
                .iter()
                .map(|index| index.to_string())
                .collect::<Vec<String>>()
                .join(", "),
        )));
    }

    Ok(indices
        .into_iter()
        .zip(names)
        .collect::<HashMap<i16, String>>())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_aggregate_function_display() {
        let simple = DataTypeNode::AggregateFunction("sum".to_string(), vec![DataTypeNode::UInt64]);
        assert_eq!(simple.to_string(), "AggregateFunction(sum, UInt64)");

        let complex = DataTypeNode::AggregateFunction(
            "groupArray".to_string(),
            vec![
                DataTypeNode::String,
                DataTypeNode::UInt32,
                DataTypeNode::Nullable(Box::new(DataTypeNode::Float64)),
            ],
        );
        assert_eq!(
            complex.to_string(),
            "AggregateFunction(groupArray, String, UInt32, Nullable(Float64))"
        );
    }

    #[test]
    fn test_tuple_display() {
        let empty = DataTypeNode::Tuple(vec![]);
        assert_eq!(empty.to_string(), "Tuple()");

        let single = DataTypeNode::Tuple(vec![DataTypeNode::String]);
        assert_eq!(single.to_string(), "Tuple(String)");

        let multiple = DataTypeNode::Tuple(vec![
            DataTypeNode::UInt64,
            DataTypeNode::String,
            DataTypeNode::DateTime(None),
            DataTypeNode::Array(Box::new(DataTypeNode::Int32)),
        ]);
        assert_eq!(
            multiple.to_string(),
            "Tuple(UInt64, String, DateTime, Array(Int32))"
        );
    }

    #[test]
    fn test_enum_display() {
        let mut values1 = HashMap::new();
        values1.insert(1, "one".to_string());
        values1.insert(2, "two".to_string());
        values1.insert(3, "three".to_string());

        let simple_enum = DataTypeNode::Enum(EnumType::Enum8, values1);
        assert_eq!(
            simple_enum.to_string(),
            "Enum8('one' = 1, 'two' = 2, 'three' = 3)"
        );

        // Enum with unordered values (should sort by index)
        let mut values2 = HashMap::new();
        values2.insert(10, "ten".to_string());
        values2.insert(1, "one".to_string());
        values2.insert(5, "five".to_string());

        let ordered_enum = DataTypeNode::Enum(EnumType::Enum16, values2);
        assert_eq!(
            ordered_enum.to_string(),
            "Enum16('one' = 1, 'five' = 5, 'ten' = 10)"
        );
    }

    #[test]
    fn test_variant_display() {
        // Empty variant
        let empty = DataTypeNode::Variant(vec![]);
        assert_eq!(empty.to_string(), "Variant()");

        // Single type variant
        let single = DataTypeNode::Variant(vec![DataTypeNode::String]);
        assert_eq!(single.to_string(), "Variant(String)");

        // Multiple types variant
        let multiple = DataTypeNode::Variant(vec![
            DataTypeNode::UInt64,
            DataTypeNode::String,
            DataTypeNode::Nullable(Box::new(DataTypeNode::DateTime(None))),
            DataTypeNode::Array(Box::new(DataTypeNode::Int32)),
        ]);
        assert_eq!(
            multiple.to_string(),
            "Variant(UInt64, String, Nullable(DateTime), Array(Int32))"
        );

        // Nested variant
        let nested = DataTypeNode::Variant(vec![
            DataTypeNode::Tuple(vec![DataTypeNode::String, DataTypeNode::UInt64]),
            DataTypeNode::Map([
                Box::new(DataTypeNode::String),
                Box::new(DataTypeNode::Int32),
            ]),
        ]);
        assert_eq!(
            nested.to_string(),
            "Variant(Tuple(String, UInt64), Map(String, Int32))"
        );
    }

    #[test]
    fn test_data_type_new_simple() {
        assert_eq!(DataTypeNode::new("UInt8").unwrap(), DataTypeNode::UInt8);
        assert_eq!(DataTypeNode::new("UInt16").unwrap(), DataTypeNode::UInt16);
        assert_eq!(DataTypeNode::new("UInt32").unwrap(), DataTypeNode::UInt32);
        assert_eq!(DataTypeNode::new("UInt64").unwrap(), DataTypeNode::UInt64);
        assert_eq!(DataTypeNode::new("UInt128").unwrap(), DataTypeNode::UInt128);
        assert_eq!(DataTypeNode::new("UInt256").unwrap(), DataTypeNode::UInt256);
        assert_eq!(DataTypeNode::new("Int8").unwrap(), DataTypeNode::Int8);
        assert_eq!(DataTypeNode::new("Int16").unwrap(), DataTypeNode::Int16);
        assert_eq!(DataTypeNode::new("Int32").unwrap(), DataTypeNode::Int32);
        assert_eq!(DataTypeNode::new("Int64").unwrap(), DataTypeNode::Int64);
        assert_eq!(DataTypeNode::new("Int128").unwrap(), DataTypeNode::Int128);
        assert_eq!(DataTypeNode::new("Int256").unwrap(), DataTypeNode::Int256);
        assert_eq!(DataTypeNode::new("Float32").unwrap(), DataTypeNode::Float32);
        assert_eq!(DataTypeNode::new("Float64").unwrap(), DataTypeNode::Float64);
        assert_eq!(
            DataTypeNode::new("BFloat16").unwrap(),
            DataTypeNode::BFloat16
        );
        assert_eq!(DataTypeNode::new("String").unwrap(), DataTypeNode::String);
        assert_eq!(DataTypeNode::new("UUID").unwrap(), DataTypeNode::UUID);
        assert_eq!(DataTypeNode::new("Date").unwrap(), DataTypeNode::Date);
        assert_eq!(DataTypeNode::new("Date32").unwrap(), DataTypeNode::Date32);
        assert_eq!(DataTypeNode::new("IPv4").unwrap(), DataTypeNode::IPv4);
        assert_eq!(DataTypeNode::new("IPv6").unwrap(), DataTypeNode::IPv6);
        assert_eq!(DataTypeNode::new("Bool").unwrap(), DataTypeNode::Bool);
        assert_eq!(DataTypeNode::new("Dynamic").unwrap(), DataTypeNode::Dynamic);
        assert_eq!(DataTypeNode::new("JSON").unwrap(), DataTypeNode::JSON);
        assert_eq!(DataTypeNode::new("JSON(max_dynamic_types=8, max_dynamic_paths=64)").unwrap(), DataTypeNode::JSON);
        assert!(DataTypeNode::new("SomeUnknownType").is_err());
    }

    #[test]
    fn test_data_type_new_fixed_string() {
        assert_eq!(
            DataTypeNode::new("FixedString(1)").unwrap(),
            DataTypeNode::FixedString(1)
        );
        assert_eq!(
            DataTypeNode::new("FixedString(16)").unwrap(),
            DataTypeNode::FixedString(16)
        );
        assert_eq!(
            DataTypeNode::new("FixedString(255)").unwrap(),
            DataTypeNode::FixedString(255)
        );
        assert_eq!(
            DataTypeNode::new("FixedString(65535)").unwrap(),
            DataTypeNode::FixedString(65_535)
        );
        assert!(DataTypeNode::new("FixedString()").is_err());
        assert!(DataTypeNode::new("FixedString(0)").is_err());
        assert!(DataTypeNode::new("FixedString(-1)").is_err());
        assert!(DataTypeNode::new("FixedString(abc)").is_err());
    }

    #[test]
    fn test_data_type_new_array() {
        assert_eq!(
            DataTypeNode::new("Array(UInt8)").unwrap(),
            DataTypeNode::Array(Box::new(DataTypeNode::UInt8))
        );
        assert_eq!(
            DataTypeNode::new("Array(String)").unwrap(),
            DataTypeNode::Array(Box::new(DataTypeNode::String))
        );
        assert_eq!(
            DataTypeNode::new("Array(FixedString(16))").unwrap(),
            DataTypeNode::Array(Box::new(DataTypeNode::FixedString(16)))
        );
        assert_eq!(
            DataTypeNode::new("Array(Nullable(Int32))").unwrap(),
            DataTypeNode::Array(Box::new(DataTypeNode::Nullable(Box::new(
                DataTypeNode::Int32
            ))))
        );
        assert!(DataTypeNode::new("Array()").is_err());
        assert!(DataTypeNode::new("Array(abc)").is_err());
    }

    #[test]
    fn test_data_type_new_decimal() {
        assert_eq!(
            DataTypeNode::new("Decimal(7, 2)").unwrap(),
            DataTypeNode::Decimal(7, 2, DecimalType::Decimal32)
        );
        assert_eq!(
            DataTypeNode::new("Decimal(12, 4)").unwrap(),
            DataTypeNode::Decimal(12, 4, DecimalType::Decimal64)
        );
        assert_eq!(
            DataTypeNode::new("Decimal(27, 6)").unwrap(),
            DataTypeNode::Decimal(27, 6, DecimalType::Decimal128)
        );
        assert_eq!(
            DataTypeNode::new("Decimal(42, 8)").unwrap(),
            DataTypeNode::Decimal(42, 8, DecimalType::Decimal256)
        );
        assert!(DataTypeNode::new("Decimal").is_err());
        assert!(DataTypeNode::new("Decimal(").is_err());
        assert!(DataTypeNode::new("Decimal()").is_err());
        assert!(DataTypeNode::new("Decimal(1)").is_err());
        assert!(DataTypeNode::new("Decimal(1,)").is_err());
        assert!(DataTypeNode::new("Decimal(1, )").is_err());
        assert!(DataTypeNode::new("Decimal(0, 0)").is_err()); // Precision must be > 0
        assert!(DataTypeNode::new("Decimal(x, 0)").is_err()); // Non-numeric precision
        assert!(DataTypeNode::new("Decimal(', ')").is_err());
        assert!(DataTypeNode::new("Decimal(77, 1)").is_err()); // Max precision is 76
        assert!(DataTypeNode::new("Decimal(1, 2)").is_err()); // Scale must be less than precision
        assert!(DataTypeNode::new("Decimal(1, x)").is_err()); // Non-numeric scale
        assert!(DataTypeNode::new("Decimal(42, ,)").is_err());
        assert!(DataTypeNode::new("Decimal(42, ')").is_err());
        assert!(DataTypeNode::new("Decimal(foobar)").is_err());
    }

    #[test]
    fn test_data_type_new_datetime() {
        assert_eq!(
            DataTypeNode::new("DateTime").unwrap(),
            DataTypeNode::DateTime(None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime('UTC')").unwrap(),
            DataTypeNode::DateTime(Some("UTC".to_string()))
        );
        assert_eq!(
            DataTypeNode::new("DateTime('America/New_York')").unwrap(),
            DataTypeNode::DateTime(Some("America/New_York".to_string()))
        );
        assert!(DataTypeNode::new("DateTime()").is_err());
    }

    #[test]
    fn test_data_type_new_datetime64() {
        assert_eq!(
            DataTypeNode::new("DateTime64(0)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision0, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(1)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision1, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(2)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision2, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(3)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision3, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(4)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision4, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(5)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision5, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(6)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision6, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(7)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision7, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(8)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision8, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(9)").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision9, None)
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(0, 'UTC')").unwrap(),
            DataTypeNode::DateTime64(DateTimePrecision::Precision0, Some("UTC".to_string()))
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(3, 'America/New_York')").unwrap(),
            DataTypeNode::DateTime64(
                DateTimePrecision::Precision3,
                Some("America/New_York".to_string())
            )
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(6, 'America/New_York')").unwrap(),
            DataTypeNode::DateTime64(
                DateTimePrecision::Precision6,
                Some("America/New_York".to_string())
            )
        );
        assert_eq!(
            DataTypeNode::new("DateTime64(9, 'Europe/Amsterdam')").unwrap(),
            DataTypeNode::DateTime64(
                DateTimePrecision::Precision9,
                Some("Europe/Amsterdam".to_string())
            )
        );
        assert!(DataTypeNode::new("DateTime64()").is_err());
        assert!(DataTypeNode::new("DateTime64(x)").is_err());
    }

    #[test]
    fn test_data_type_new_time() {
        assert_eq!(DataTypeNode::new("Time").unwrap(), DataTypeNode::Time);
        assert_eq!(
            DataTypeNode::new("Time('UTC')").unwrap(),
            DataTypeNode::Time
        );
        assert_eq!(
            DataTypeNode::new("Time('America/New_York')").unwrap(),
            DataTypeNode::Time
        );
        assert_eq!(DataTypeNode::new("Time()").unwrap(), DataTypeNode::Time);
    }

    #[test]
    fn test_data_type_new_time64() {
        assert_eq!(
            DataTypeNode::new("Time64(0)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision0)
        );
        assert_eq!(
            DataTypeNode::new("Time64(1)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision1)
        );
        assert_eq!(
            DataTypeNode::new("Time64(2)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision2)
        );
        assert_eq!(
            DataTypeNode::new("Time64(3)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision3)
        );
        assert_eq!(
            DataTypeNode::new("Time64(4)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision4)
        );
        assert_eq!(
            DataTypeNode::new("Time64(5)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision5)
        );
        assert_eq!(
            DataTypeNode::new("Time64(6)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision6)
        );
        assert_eq!(
            DataTypeNode::new("Time64(7)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision7)
        );
        assert_eq!(
            DataTypeNode::new("Time64(8)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision8)
        );
        assert_eq!(
            DataTypeNode::new("Time64(9)").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision9)
        );
        assert_eq!(
            DataTypeNode::new("Time64(0, 'UTC')").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision0)
        );
        assert_eq!(
            DataTypeNode::new("Time64(3, 'America/New_York')").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision3)
        );
        assert_eq!(
            DataTypeNode::new("Time64(6, 'America/New_York')").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision6)
        );
        assert_eq!(
            DataTypeNode::new("Time64(9, 'Europe/Amsterdam')").unwrap(),
            DataTypeNode::Time64(DateTimePrecision::Precision9)
        );
        assert!(DataTypeNode::new("Time64()").is_err());
        assert!(DataTypeNode::new("Time64(x)").is_err());
    }

    #[test]
    fn test_data_type_new_interval() {
        assert_eq!(
            DataTypeNode::new("IntervalNanosecond").unwrap(),
            DataTypeNode::Interval(IntervalType::Nanosecond)
        );
        assert_eq!(
            DataTypeNode::new("IntervalMicrosecond").unwrap(),
            DataTypeNode::Interval(IntervalType::Microsecond)
        );
        assert_eq!(
            DataTypeNode::new("IntervalMillisecond").unwrap(),
            DataTypeNode::Interval(IntervalType::Millisecond)
        );
        assert_eq!(
            DataTypeNode::new("IntervalSecond").unwrap(),
            DataTypeNode::Interval(IntervalType::Second)
        );
        assert_eq!(
            DataTypeNode::new("IntervalMinute").unwrap(),
            DataTypeNode::Interval(IntervalType::Minute)
        );
        assert_eq!(
            DataTypeNode::new("IntervalHour").unwrap(),
            DataTypeNode::Interval(IntervalType::Hour)
        );
        assert_eq!(
            DataTypeNode::new("IntervalDay").unwrap(),
            DataTypeNode::Interval(IntervalType::Day)
        );
        assert_eq!(
            DataTypeNode::new("IntervalWeek").unwrap(),
            DataTypeNode::Interval(IntervalType::Week)
        );
        assert_eq!(
            DataTypeNode::new("IntervalMonth").unwrap(),
            DataTypeNode::Interval(IntervalType::Month)
        );
        assert_eq!(
            DataTypeNode::new("IntervalQuarter").unwrap(),
            DataTypeNode::Interval(IntervalType::Quarter)
        );
        assert_eq!(
            DataTypeNode::new("IntervalYear").unwrap(),
            DataTypeNode::Interval(IntervalType::Year)
        );
    }

    #[test]
    fn test_data_type_new_low_cardinality() {
        assert_eq!(
            DataTypeNode::new("LowCardinality(UInt8)").unwrap(),
            DataTypeNode::LowCardinality(Box::new(DataTypeNode::UInt8))
        );
        assert_eq!(
            DataTypeNode::new("LowCardinality(String)").unwrap(),
            DataTypeNode::LowCardinality(Box::new(DataTypeNode::String))
        );
        assert_eq!(
            DataTypeNode::new("LowCardinality(Array(Int32))").unwrap(),
            DataTypeNode::LowCardinality(Box::new(DataTypeNode::Array(Box::new(
                DataTypeNode::Int32
            ))))
        );
        assert_eq!(
            DataTypeNode::new("LowCardinality(Nullable(Int32))").unwrap(),
            DataTypeNode::LowCardinality(Box::new(DataTypeNode::Nullable(Box::new(
                DataTypeNode::Int32
            ))))
        );
        assert!(DataTypeNode::new("LowCardinality").is_err());
        assert!(DataTypeNode::new("LowCardinality()").is_err());
        assert!(DataTypeNode::new("LowCardinality(X)").is_err());
    }

    #[test]
    fn test_data_type_new_nullable() {
        assert_eq!(
            DataTypeNode::new("Nullable(UInt8)").unwrap(),
            DataTypeNode::Nullable(Box::new(DataTypeNode::UInt8))
        );
        assert_eq!(
            DataTypeNode::new("Nullable(String)").unwrap(),
            DataTypeNode::Nullable(Box::new(DataTypeNode::String))
        );
        assert!(DataTypeNode::new("Nullable").is_err());
        assert!(DataTypeNode::new("Nullable()").is_err());
        assert!(DataTypeNode::new("Nullable(X)").is_err());
    }

    #[test]
    fn test_data_type_new_map() {
        assert_eq!(
            DataTypeNode::new("Map(UInt8, String)").unwrap(),
            DataTypeNode::Map([
                Box::new(DataTypeNode::UInt8),
                Box::new(DataTypeNode::String)
            ])
        );
        assert_eq!(
            DataTypeNode::new("Map(String, Int32)").unwrap(),
            DataTypeNode::Map([
                Box::new(DataTypeNode::String),
                Box::new(DataTypeNode::Int32)
            ])
        );
        assert_eq!(
            DataTypeNode::new("Map(String, Map(Int32, Array(Nullable(String))))").unwrap(),
            DataTypeNode::Map([
                Box::new(DataTypeNode::String),
                Box::new(DataTypeNode::Map([
                    Box::new(DataTypeNode::Int32),
                    Box::new(DataTypeNode::Array(Box::new(DataTypeNode::Nullable(
                        Box::new(DataTypeNode::String)
                    ))))
                ]))
            ])
        );
        assert!(DataTypeNode::new("Map()").is_err());
        assert!(DataTypeNode::new("Map").is_err());
        assert!(DataTypeNode::new("Map(K)").is_err());
        assert!(DataTypeNode::new("Map(K, V)").is_err());
        assert!(DataTypeNode::new("Map(Int32, V)").is_err());
        assert!(DataTypeNode::new("Map(K, Int32)").is_err());
        assert!(DataTypeNode::new("Map(String, Int32").is_err());
    }

    #[test]
    fn test_data_type_new_variant() {
        assert_eq!(
            DataTypeNode::new("Variant(UInt8, String)").unwrap(),
            DataTypeNode::Variant(vec![DataTypeNode::UInt8, DataTypeNode::String])
        );
        assert_eq!(
            DataTypeNode::new("Variant(String, Int32)").unwrap(),
            DataTypeNode::Variant(vec![DataTypeNode::String, DataTypeNode::Int32])
        );
        assert_eq!(
            DataTypeNode::new("Variant(Int32, Array(Nullable(String)), Map(Int32, String))")
                .unwrap(),
            DataTypeNode::Variant(vec![
                DataTypeNode::Int32,
                DataTypeNode::Array(Box::new(DataTypeNode::Nullable(Box::new(
                    DataTypeNode::String
                )))),
                DataTypeNode::Map([
                    Box::new(DataTypeNode::Int32),
                    Box::new(DataTypeNode::String)
                ])
            ])
        );
        assert!(DataTypeNode::new("Variant").is_err());
    }

    #[test]
    fn test_data_type_new_tuple() {
        assert_eq!(
            DataTypeNode::new("Tuple(UInt8, String)").unwrap(),
            DataTypeNode::Tuple(vec![DataTypeNode::UInt8, DataTypeNode::String])
        );
        assert_eq!(
            DataTypeNode::new("Tuple(String, Int32)").unwrap(),
            DataTypeNode::Tuple(vec![DataTypeNode::String, DataTypeNode::Int32])
        );
        assert_eq!(
            DataTypeNode::new("Tuple(Bool,Int32)").unwrap(),
            DataTypeNode::Tuple(vec![DataTypeNode::Bool, DataTypeNode::Int32])
        );
        assert_eq!(
            DataTypeNode::new(
                "Tuple(Int32, Array(Nullable(String)), Map(Int32, Tuple(String, Array(UInt8))))"
            )
            .unwrap(),
            DataTypeNode::Tuple(vec![
                DataTypeNode::Int32,
                DataTypeNode::Array(Box::new(DataTypeNode::Nullable(Box::new(
                    DataTypeNode::String
                )))),
                DataTypeNode::Map([
                    Box::new(DataTypeNode::Int32),
                    Box::new(DataTypeNode::Tuple(vec![
                        DataTypeNode::String,
                        DataTypeNode::Array(Box::new(DataTypeNode::UInt8))
                    ]))
                ])
            ])
        );
        assert_eq!(
            DataTypeNode::new(&format!("Tuple(String, {ENUM_WITH_ESCAPING_STR})")).unwrap(),
            DataTypeNode::Tuple(vec![DataTypeNode::String, enum_with_escaping()])
        );
        assert!(DataTypeNode::new("Tuple").is_err());
        assert!(DataTypeNode::new("Tuple(").is_err());
        assert!(DataTypeNode::new("Tuple()").is_err());
        assert!(DataTypeNode::new("Tuple(,)").is_err());
        assert!(DataTypeNode::new("Tuple(X)").is_err());
        assert!(DataTypeNode::new("Tuple(Int32, X)").is_err());
        assert!(DataTypeNode::new("Tuple(Int32, String, X)").is_err());
    }

    #[test]
    fn test_data_type_new_enum() {
        assert_eq!(
            DataTypeNode::new("Enum8('A' = -42)").unwrap(),
            DataTypeNode::Enum(EnumType::Enum8, HashMap::from([(-42, "A".to_string())]))
        );
        assert_eq!(
            DataTypeNode::new("Enum16('A' = -144)").unwrap(),
            DataTypeNode::Enum(EnumType::Enum16, HashMap::from([(-144, "A".to_string())]))
        );
        assert_eq!(
            DataTypeNode::new("Enum8('A' = 1, 'B' = 2)").unwrap(),
            DataTypeNode::Enum(
                EnumType::Enum8,
                HashMap::from([(1, "A".to_string()), (2, "B".to_string())])
            )
        );
        assert_eq!(
            DataTypeNode::new("Enum16('A' = 1, 'B' = 2)").unwrap(),
            DataTypeNode::Enum(
                EnumType::Enum16,
                HashMap::from([(1, "A".to_string()), (2, "B".to_string())])
            )
        );
        assert_eq!(
            DataTypeNode::new(ENUM_WITH_ESCAPING_STR).unwrap(),
            enum_with_escaping()
        );
        assert_eq!(
            DataTypeNode::new("Enum8('foo' = 0, '' = 42)").unwrap(),
            DataTypeNode::Enum(
                EnumType::Enum8,
                HashMap::from([(0, "foo".to_string()), (42, "".to_string())])
            )
        );

        assert!(DataTypeNode::new("Enum()").is_err());
        assert!(DataTypeNode::new("Enum8()").is_err());
        assert!(DataTypeNode::new("Enum16()").is_err());
        assert!(DataTypeNode::new("Enum32('A' = 1, 'B' = 2)").is_err());
        assert!(DataTypeNode::new("Enum32('A','B')").is_err());
        assert!(DataTypeNode::new("Enum32('A' = 1, 'B')").is_err());
        assert!(DataTypeNode::new("Enum32('A' = 1, 'B' =)").is_err());
        assert!(DataTypeNode::new("Enum32('A' = 1, 'B' = )").is_err());
        assert!(DataTypeNode::new("Enum32('A'= 1,'B' =)").is_err());
    }

    #[test]
    fn test_data_type_new_geo() {
        assert_eq!(DataTypeNode::new("Point").unwrap(), DataTypeNode::Point);
        assert_eq!(DataTypeNode::new("Ring").unwrap(), DataTypeNode::Ring);
        assert_eq!(
            DataTypeNode::new("LineString").unwrap(),
            DataTypeNode::LineString
        );
        assert_eq!(DataTypeNode::new("Polygon").unwrap(), DataTypeNode::Polygon);
        assert_eq!(
            DataTypeNode::new("MultiLineString").unwrap(),
            DataTypeNode::MultiLineString
        );
        assert_eq!(
            DataTypeNode::new("MultiPolygon").unwrap(),
            DataTypeNode::MultiPolygon
        );
    }

    #[test]
    fn test_data_type_to_string_simple() {
        // Simple types
        assert_eq!(DataTypeNode::UInt8.to_string(), "UInt8");
        assert_eq!(DataTypeNode::UInt16.to_string(), "UInt16");
        assert_eq!(DataTypeNode::UInt32.to_string(), "UInt32");
        assert_eq!(DataTypeNode::UInt64.to_string(), "UInt64");
        assert_eq!(DataTypeNode::UInt128.to_string(), "UInt128");
        assert_eq!(DataTypeNode::UInt256.to_string(), "UInt256");
        assert_eq!(DataTypeNode::Int8.to_string(), "Int8");
        assert_eq!(DataTypeNode::Int16.to_string(), "Int16");
        assert_eq!(DataTypeNode::Int32.to_string(), "Int32");
        assert_eq!(DataTypeNode::Int64.to_string(), "Int64");
        assert_eq!(DataTypeNode::Int128.to_string(), "Int128");
        assert_eq!(DataTypeNode::Int256.to_string(), "Int256");
        assert_eq!(DataTypeNode::Float32.to_string(), "Float32");
        assert_eq!(DataTypeNode::Float64.to_string(), "Float64");
        assert_eq!(DataTypeNode::BFloat16.to_string(), "BFloat16");
        assert_eq!(DataTypeNode::UUID.to_string(), "UUID");
        assert_eq!(DataTypeNode::Date.to_string(), "Date");
        assert_eq!(DataTypeNode::Date32.to_string(), "Date32");
        assert_eq!(DataTypeNode::IPv4.to_string(), "IPv4");
        assert_eq!(DataTypeNode::IPv6.to_string(), "IPv6");
        assert_eq!(DataTypeNode::Bool.to_string(), "Bool");
        assert_eq!(DataTypeNode::Dynamic.to_string(), "Dynamic");
        assert_eq!(DataTypeNode::JSON.to_string(), "JSON");
        assert_eq!(DataTypeNode::String.to_string(), "String");
    }

    #[test]
    fn test_data_types_to_string_complex() {
        assert_eq!(DataTypeNode::DateTime(None).to_string(), "DateTime");
        assert_eq!(
            DataTypeNode::DateTime(Some("UTC".to_string())).to_string(),
            "DateTime('UTC')"
        );
        assert_eq!(
            DataTypeNode::DateTime(Some("America/New_York".to_string())).to_string(),
            "DateTime('America/New_York')"
        );

        assert_eq!(
            DataTypeNode::Nullable(Box::new(DataTypeNode::UInt64)).to_string(),
            "Nullable(UInt64)"
        );
        assert_eq!(
            DataTypeNode::LowCardinality(Box::new(DataTypeNode::String)).to_string(),
            "LowCardinality(String)"
        );
        assert_eq!(
            DataTypeNode::Array(Box::new(DataTypeNode::String)).to_string(),
            "Array(String)"
        );
        assert_eq!(
            DataTypeNode::Array(Box::new(DataTypeNode::Nullable(Box::new(
                DataTypeNode::String
            ))))
            .to_string(),
            "Array(Nullable(String))"
        );
        assert_eq!(
            DataTypeNode::Tuple(vec![
                DataTypeNode::String,
                DataTypeNode::UInt32,
                DataTypeNode::Float64
            ])
            .to_string(),
            "Tuple(String, UInt32, Float64)"
        );
        assert_eq!(
            DataTypeNode::Map([
                Box::new(DataTypeNode::String),
                Box::new(DataTypeNode::UInt32)
            ])
            .to_string(),
            "Map(String, UInt32)"
        );
        assert_eq!(
            DataTypeNode::Decimal(10, 2, DecimalType::Decimal32).to_string(),
            "Decimal(10, 2)"
        );
        assert_eq!(
            DataTypeNode::Enum(
                EnumType::Enum8,
                HashMap::from([(1, "A".to_string()), (2, "B".to_string())]),
            )
            .to_string(),
            "Enum8('A' = 1, 'B' = 2)"
        );
        assert_eq!(
            DataTypeNode::Enum(
                EnumType::Enum16,
                HashMap::from([(42, "foo".to_string()), (144, "bar".to_string())]),
            )
            .to_string(),
            "Enum16('foo' = 42, 'bar' = 144)"
        );
        assert_eq!(enum_with_escaping().to_string(), ENUM_WITH_ESCAPING_STR);
        assert_eq!(
            DataTypeNode::AggregateFunction("sum".to_string(), vec![DataTypeNode::UInt64])
                .to_string(),
            "AggregateFunction(sum, UInt64)"
        );
        assert_eq!(DataTypeNode::FixedString(16).to_string(), "FixedString(16)");
        assert_eq!(
            DataTypeNode::Variant(vec![DataTypeNode::UInt8, DataTypeNode::Bool]).to_string(),
            "Variant(UInt8, Bool)"
        );
    }

    #[test]
    fn test_datetime64_to_string() {
        let test_cases = [
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision0, None),
                "DateTime64(0)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision1, None),
                "DateTime64(1)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision2, None),
                "DateTime64(2)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision3, None),
                "DateTime64(3)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision4, None),
                "DateTime64(4)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision5, None),
                "DateTime64(5)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision6, None),
                "DateTime64(6)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision7, None),
                "DateTime64(7)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision8, None),
                "DateTime64(8)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision9, None),
                "DateTime64(9)",
            ),
            (
                DataTypeNode::DateTime64(DateTimePrecision::Precision0, Some("UTC".to_string())),
                "DateTime64(0, 'UTC')",
            ),
            (
                DataTypeNode::DateTime64(
                    DateTimePrecision::Precision3,
                    Some("America/New_York".to_string()),
                ),
                "DateTime64(3, 'America/New_York')",
            ),
            (
                DataTypeNode::DateTime64(
                    DateTimePrecision::Precision6,
                    Some("Europe/Amsterdam".to_string()),
                ),
                "DateTime64(6, 'Europe/Amsterdam')",
            ),
            (
                DataTypeNode::DateTime64(
                    DateTimePrecision::Precision9,
                    Some("Asia/Tokyo".to_string()),
                ),
                "DateTime64(9, 'Asia/Tokyo')",
            ),
        ];
        for (data_type, expected_str) in test_cases.iter() {
            assert_eq!(
                &data_type.to_string(),
                expected_str,
                "Expected data type {data_type} to be formatted as {expected_str}"
            );
        }
    }

    #[test]
    fn test_interval_to_string() {
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Nanosecond).to_string(),
            "IntervalNanosecond"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Microsecond).to_string(),
            "IntervalMicrosecond"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Millisecond).to_string(),
            "IntervalMillisecond"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Second).to_string(),
            "IntervalSecond"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Minute).to_string(),
            "IntervalMinute"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Hour).to_string(),
            "IntervalHour"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Day).to_string(),
            "IntervalDay"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Week).to_string(),
            "IntervalWeek"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Month).to_string(),
            "IntervalMonth"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Quarter).to_string(),
            "IntervalQuarter"
        );
        assert_eq!(
            DataTypeNode::Interval(IntervalType::Year).to_string(),
            "IntervalYear"
        );
    }

    #[test]
    fn test_data_type_node_into_string() {
        let data_type = DataTypeNode::new("Array(Int32)").unwrap();
        let data_type_string: String = data_type.into();
        assert_eq!(data_type_string, "Array(Int32)");
    }

    #[test]
    fn test_data_type_to_string_geo() {
        assert_eq!(DataTypeNode::Point.to_string(), "Point");
        assert_eq!(DataTypeNode::Ring.to_string(), "Ring");
        assert_eq!(DataTypeNode::LineString.to_string(), "LineString");
        assert_eq!(DataTypeNode::Polygon.to_string(), "Polygon");
        assert_eq!(DataTypeNode::MultiLineString.to_string(), "MultiLineString");
        assert_eq!(DataTypeNode::MultiPolygon.to_string(), "MultiPolygon");
    }

    #[test]
    fn test_display_column() {
        let column = Column::new(
            "col".to_string(),
            DataTypeNode::new("Array(Int32)").unwrap(),
        );
        assert_eq!(column.to_string(), "col: Array(Int32)");
    }

    #[test]
    fn test_display_decimal_size() {
        assert_eq!(DecimalType::Decimal32.to_string(), "Decimal32");
        assert_eq!(DecimalType::Decimal64.to_string(), "Decimal64");
        assert_eq!(DecimalType::Decimal128.to_string(), "Decimal128");
        assert_eq!(DecimalType::Decimal256.to_string(), "Decimal256");
    }

    #[test]
    fn test_time_time64_roundtrip_and_edges() {
        use super::DateTimePrecision::*;

        // Valid "Time" type (no precision, no timezone)
        assert_eq!(DataTypeNode::new("Time").unwrap(), DataTypeNode::Time);

        // "Time" should ignore timezones – they are parsed but discarded
        assert_eq!(
            DataTypeNode::new("Time('UTC')").unwrap(),
            DataTypeNode::Time
        );
        assert_eq!(
            DataTypeNode::new("Time('Europe/Moscow')").unwrap(),
            DataTypeNode::Time
        );

        // Time64 with precision 0 (seconds)
        assert_eq!(
            DataTypeNode::new("Time64(0)").unwrap(),
            DataTypeNode::Time64(Precision0)
        );

        // Time64 with precision 9 and a timezone (timezone ignored)
        assert_eq!(
            DataTypeNode::new("Time64(9, 'Europe/Amsterdam')").unwrap(),
            DataTypeNode::Time64(Precision9)
        );

        // Time64 with precision 0 and timezone (again, timezone ignored)
        assert_eq!(
            DataTypeNode::new("Time64(0, 'UTC')").unwrap(),
            DataTypeNode::Time64(Precision0)
        );

        // Time64 with precision 3 (milliseconds), no timezone
        assert_eq!(
            DataTypeNode::new("Time64(3)").unwrap(),
            DataTypeNode::Time64(Precision3)
        );

        // Time64 with precision 6 (microseconds), timezone present but ignored
        assert_eq!(
            DataTypeNode::new("Time64(6, 'America/New_York')").unwrap(),
            DataTypeNode::Time64(Precision6)
        );

        // Invalid: Empty argument list
        assert!(DataTypeNode::new("Time64()").is_err());

        // Invalid: Non-numeric precision
        assert!(DataTypeNode::new("Time64(x)").is_err());
    }

    const ENUM_WITH_ESCAPING_STR: &str =
        "Enum8('f\\'' = 1, 'x =' = 2, 'b\\'\\'' = 3, '\\'c=4=' = 42, '4' = 100)";

    fn enum_with_escaping() -> DataTypeNode {
        DataTypeNode::Enum(
            EnumType::Enum8,
            HashMap::from([
                (1, "f\\'".to_string()),
                (2, "x =".to_string()),
                (3, "b\\'\\'".to_string()),
                (42, "\\'c=4=".to_string()),
                (100, "4".to_string()),
            ]),
        )
    }
}
