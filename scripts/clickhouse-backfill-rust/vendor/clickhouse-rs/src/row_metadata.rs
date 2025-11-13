use crate::Row;
use crate::error::Error;
use crate::error::Result;
use crate::row::RowKind;
use clickhouse_types::Column;
use std::collections::HashMap;
use std::fmt::{Display, Formatter};
use std::str::FromStr;

#[derive(Debug, PartialEq)]
pub(crate) enum AccessType {
    WithSeqAccess,
    WithMapAccess(Vec<usize>),
}

/// Contains a vector of [`Column`] objects parsed from the beginning
/// of `RowBinaryWithNamesAndTypes` data stream.
///
/// [`RowMetadata`] should be owned outside the (de)serializer,
/// as it is calculated only once per struct. It does not have lifetimes,
/// so it does not introduce a breaking change to [`crate::cursors::RowCursor`].
pub(crate) struct RowMetadata {
    /// Database schema, or table columns, are parsed before the first call to deserializer.
    /// However, the order here depends on the usage context:
    /// * For selects, it is defined in the same order as in the database schema.
    /// * For inserts, it is adjusted to the order of fields in the struct definition.
    pub(crate) columns: Vec<Column>,
    /// This determines whether we can just use [`crate::rowbinary::de::RowBinarySeqAccess`]
    /// or a more sophisticated approach with [`crate::rowbinary::de::RowBinaryStructAsMapAccess`]
    /// to support structs defined with different fields order than in the schema.
    ///
    /// Deserializing a struct as a map can be significantly slower, but that depends
    /// on the shape of the data. In some cases, there is no noticeable difference,
    /// in others, it could be up to 2-3x slower.
    pub(crate) access_type: AccessType,
}

pub(crate) struct InsertMetadata {
    pub(crate) row_metadata: RowMetadata,
    pub(crate) column_default_kinds: Vec<ColumnDefaultKind>,
    pub(crate) column_lookup: HashMap<String, usize>,
}

#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub(crate) enum ColumnDefaultKind {
    Unset,
    Default,
    Materialized,
    Ephemeral,
    Alias,
}

impl RowMetadata {
    pub(crate) fn new_for_cursor<T: Row>(columns: Vec<Column>) -> Result<Self> {
        let access_type = match T::KIND {
            RowKind::Primitive => {
                if columns.len() != 1 {
                    return Err(Error::SchemaMismatch(format!(
                        "While processing a primitive row: \
                        expected only 1 column in the database schema, \
                        but got {} instead.\n#### All schema columns:\n{}",
                        columns.len(),
                        join_panic_schema_hint(&columns),
                    )));
                }
                AccessType::WithSeqAccess // ignored
            }
            RowKind::Tuple => {
                if T::COLUMN_COUNT != columns.len() {
                    return Err(Error::SchemaMismatch(format!(
                        "While processing a tuple row: database schema has {} columns, \
                        but the tuple definition has {} fields in total.\
                        \n#### All schema columns:\n{}",
                        columns.len(),
                        T::COLUMN_COUNT,
                        join_panic_schema_hint(&columns),
                    )));
                }
                AccessType::WithSeqAccess // ignored
            }
            RowKind::Vec => {
                if columns.len() != 1 {
                    return Err(Error::SchemaMismatch(format!(
                        "While processing a row defined as a vector: \
                        expected only 1 column in the database schema, \
                        but got {} instead.\n#### All schema columns:\n{}",
                        columns.len(),
                        join_panic_schema_hint(&columns),
                    )));
                }
                AccessType::WithSeqAccess // ignored
            }
            RowKind::Struct => {
                if columns.len() != T::COLUMN_NAMES.len() {
                    return Err(Error::SchemaMismatch(format!(
                        "While processing struct {}: database schema has {} columns, \
                        but the struct definition has {} fields.\
                        \n#### All struct fields:\n{}\n#### All schema columns:\n{}",
                        T::NAME,
                        columns.len(),
                        T::COLUMN_NAMES.len(),
                        join_panic_schema_hint(T::COLUMN_NAMES),
                        join_panic_schema_hint(&columns),
                    )));
                }
                let mut mapping = Vec::with_capacity(T::COLUMN_NAMES.len());
                let mut expected_index = 0;
                let mut should_use_map = false;
                for col in &columns {
                    if let Some(index) = T::COLUMN_NAMES.iter().position(|field| col.name == *field)
                    {
                        if index != expected_index {
                            should_use_map = true
                        }
                        expected_index += 1;
                        mapping.push(index);
                    } else {
                        return Err(Error::SchemaMismatch(format!(
                            "While processing struct {}: database schema has a column {col} \
                            that was not found in the struct definition.\
                            \n#### All struct fields:\n{}\n#### All schema columns:\n{}",
                            T::NAME,
                            join_panic_schema_hint(T::COLUMN_NAMES),
                            join_panic_schema_hint(&columns),
                        )));
                    }
                }
                if should_use_map {
                    AccessType::WithMapAccess(mapping)
                } else {
                    AccessType::WithSeqAccess
                }
            }
        };
        Ok(Self {
            columns,
            access_type,
        })
    }

    /// Returns the index of the column in the database schema
    /// that corresponds to the field with the given index in the struct.
    ///
    /// Only makes sense for selects; for inserts, it is always the same as `struct_idx`,
    /// since we write the header with the field order defined in the struct,
    /// and ClickHouse server figures out the rest on its own.
    #[inline]
    pub(crate) fn get_schema_index(&self, struct_idx: usize) -> Result<usize> {
        match &self.access_type {
            AccessType::WithMapAccess(mapping) => {
                if struct_idx < mapping.len() {
                    Ok(mapping[struct_idx])
                } else {
                    // unreachable
                    Err(Error::SchemaMismatch(
                        "Struct has more fields than columns in the database schema".to_string(),
                    ))
                }
            }
            AccessType::WithSeqAccess => Ok(struct_idx), // should be unreachable
        }
    }

    /// Returns `true` if the field order in the struct is different from the database schema.
    ///
    /// Only makes sense for selects; for inserts, it is always `false`.
    #[inline]
    pub(crate) fn is_field_order_wrong(&self) -> bool {
        matches!(self.access_type, AccessType::WithMapAccess(_))
    }
}

impl FromStr for ColumnDefaultKind {
    type Err = Error;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "" => Ok(Self::Unset),
            "DEFAULT" => Ok(Self::Default),
            "MATERIALIZED" => Ok(Self::Materialized),
            "EPHEMERAL" => Ok(Self::Ephemeral),
            "ALIAS" => Ok(Self::Alias),
            other => Err(Error::Other(
                format!("unknown column default_kind {other}").into(),
            )),
        }
    }
}

impl ColumnDefaultKind {
    pub(crate) fn is_immutable(self) -> bool {
        matches!(self, Self::Materialized | Self::Alias)
    }

    pub(crate) fn has_default(self) -> bool {
        matches!(self, Self::Default | Self::Materialized | Self::Alias)
    }

    pub(crate) fn to_str(self) -> &'static str {
        match self {
            ColumnDefaultKind::Unset => "",
            ColumnDefaultKind::Default => "DEFAULT",
            ColumnDefaultKind::Materialized => "MATERIALIZED",
            ColumnDefaultKind::Ephemeral => "EPHEMERAL",
            ColumnDefaultKind::Alias => "ALIAS",
        }
    }
}

impl Display for ColumnDefaultKind {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.to_str())
    }
}

impl InsertMetadata {
    pub(crate) fn to_row<T: Row>(&self) -> Result<RowMetadata> {
        if T::KIND != RowKind::Struct {
            return Err(Error::SchemaMismatch(format!(
                "SerializerRowMetadata can only be created for structs, \
                but got {:?} instead.\n#### All schema columns:\n{}",
                T::KIND,
                join_panic_schema_hint(&self.row_metadata.columns),
            )));
        }

        let mut result_columns: Vec<Column> = Vec::with_capacity(T::COLUMN_COUNT);
        let mut set_columns: Vec<bool> = vec![false; self.row_metadata.columns.len()];

        for struct_column_name in T::COLUMN_NAMES {
            match self.column_lookup.get(*struct_column_name) {
                Some(&col) => {
                    if self.column_default_kinds[col].is_immutable() {
                        return Err(Error::SchemaMismatch(format!(
                            "While processing struct {}: column {struct_column_name} is immutable (declared as `{}`)",
                            T::NAME,
                            self.column_default_kinds[col],
                        )));
                    }

                    // TODO: what should happen if a column is mentioned multiple times?
                    set_columns[col] = true;

                    result_columns.push(self.row_metadata.columns[col].clone())
                }
                None => {
                    return Err(Error::SchemaMismatch(format!(
                        "While processing struct {}: database schema has no column named {struct_column_name}.\
                        \n#### All struct fields:\n{}\n#### All schema columns:\n{}",
                        T::NAME,
                        join_panic_schema_hint(T::COLUMN_NAMES),
                        join_panic_schema_hint(&self.row_metadata.columns),
                    )));
                }
            }
        }

        let missing_columns = set_columns.iter().enumerate().filter_map(|(col, &is_set)| {
            if is_set || self.column_default_kinds[col].has_default() {
                return None;
            }

            Some(&self.row_metadata.columns[col])
        });

        let missing_columns_hint = join_panic_schema_hint(missing_columns);

        if !missing_columns_hint.is_empty() {
            return Err(Error::SchemaMismatch(format!(
                "While processing struct {}: the following non-default columns are missing:\n{missing_columns_hint}\
                 \n#### All struct fields:\n{}\n#### All schema columns:\n{}",
                T::NAME,
                join_panic_schema_hint(T::COLUMN_NAMES),
                join_panic_schema_hint(&self.row_metadata.columns),
            )));
        }

        Ok(RowMetadata {
            columns: result_columns,
            access_type: AccessType::WithSeqAccess, // ignored
        })
    }
}

fn join_panic_schema_hint<T: Display>(col: impl IntoIterator<Item = T>) -> String {
    col.into_iter()
        .map(|c| format!("- {c}"))
        .collect::<Vec<String>>()
        .join("\n")
}
