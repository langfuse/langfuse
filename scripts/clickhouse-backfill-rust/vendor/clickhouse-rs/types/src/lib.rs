//! # clickhouse-types
//!
//! This crate is required for `RowBinaryWithNamesAndTypes` struct definition validation,
//! as it contains ClickHouse data types AST, as well as functions and utilities
//! to parse the types out of the ClickHouse server response.
//!
//! Note that this crate is not intended for public usage,
//! as it might introduce internal breaking changes not following semver.

pub use crate::data_types::{Column, DataTypeNode};
use crate::decoders::read_string;
use crate::error::TypesError;
use bytes::{Buf, BufMut};

/// Exported for internal usage only.
/// Do not use it directly in your code.
pub use crate::leb128::put_leb128;
pub use crate::leb128::read_leb128;

/// ClickHouse data types AST and utilities to parse it from strings.
pub mod data_types;
/// Required decoders to parse the columns definitions from the header of the response.
pub mod decoders;
/// Error types for this crate.
pub mod error;
/// Utils for working with LEB128 encoding and decoding.
pub mod leb128;

/// Parses the columns definitions from the response in `RowBinaryWithNamesAndTypes` format.
/// This is a mandatory step for this format, as it enables client-side data types validation.
#[doc(hidden)]
pub fn parse_rbwnat_columns_header(mut buffer: impl Buf) -> Result<Vec<Column>, TypesError> {
    let num_columns = read_leb128(&mut buffer)?;
    if num_columns == 0 {
        return Err(TypesError::EmptyColumns);
    }
    let mut columns_names: Vec<String> = Vec::with_capacity(num_columns as usize);
    for _ in 0..num_columns {
        let column_name = read_string(&mut buffer)?;
        columns_names.push(column_name);
    }
    let mut column_data_types: Vec<DataTypeNode> = Vec::with_capacity(num_columns as usize);
    for _ in 0..num_columns {
        let column_type = read_string(&mut buffer)?;
        let data_type = DataTypeNode::new(&column_type)?;
        column_data_types.push(data_type);
    }
    let columns = columns_names
        .into_iter()
        .zip(column_data_types)
        .map(|(name, data_type)| Column::new(name, data_type))
        .collect();
    Ok(columns)
}

/// Having a table definition as a slice of [`Column`],
/// encodes it into the `RowBinary` format, and puts it into the provided buffer.
/// This is required to insert the data in `RowBinaryWithNamesAndTypes` format.
#[doc(hidden)]
pub fn put_rbwnat_columns_header(
    columns: &[Column],
    mut buffer: impl BufMut,
) -> Result<(), TypesError> {
    if columns.is_empty() {
        return Err(TypesError::EmptyColumns);
    }
    put_leb128(&mut buffer, columns.len() as u64);
    for column in columns {
        put_leb128(&mut buffer, column.name.len() as u64);
        buffer.put_slice(column.name.as_bytes());
    }
    for column in columns.iter() {
        let data_type = column.data_type.to_string();
        put_leb128(&mut buffer, data_type.len() as u64);
        buffer.put_slice(data_type.as_bytes());
    }
    Ok(())
}

#[cfg(test)]
mod test {
    use super::*;
    use crate::data_types::DataTypeNode;
    use bytes::BytesMut;

    #[test]
    fn test_rbwnat_header_round_trip() {
        let mut buffer = BytesMut::new();
        let columns = vec![
            Column::new("id".to_string(), DataTypeNode::Int32),
            Column::new("name".to_string(), DataTypeNode::String),
        ];
        put_rbwnat_columns_header(&columns, &mut buffer).unwrap();
        let parsed_columns = parse_rbwnat_columns_header(&mut buffer).unwrap();
        assert_eq!(parsed_columns, columns);
    }
}
