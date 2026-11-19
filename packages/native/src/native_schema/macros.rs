//! Implement `clickhouse_table_schema!`, called by `native_schema.rs`.
//!
//! Its helper macros generate the two row structs and their field-reading,
//! conversion, media-restoration and ClickHouse column methods from one field list.

macro_rules! column_name {
    ($field:ident) => {
        stringify!($field)
    };
    ($field:ident as $name:literal) => {
        $name
    };
}
macro_rules! logical_type {
    ($native:ty, $logical:ty) => {
        $logical
    };
    ($native:ty) => {
        $native
    };
}
macro_rules! read_owned {
    ($row:ident, $field:ident, $ty:ty, $name:expr, $policy:expr, metadata) => {
        crate::native_owned::default_string(
            $row.$field,
            $policy,
            &$row.metadata_names,
            &$row.metadata_values,
        )
    };
    ($row:ident, $field:ident, $ty:ty, $name:expr, $policy:expr) => {
        crate::native_owned::into_prepared::<$ty, _>($row.$field, $name)?
    };
}
macro_rules! restore_field {
    ($row:ident, $field:ident, $restore:ident, resolved) => {};
    ($row:ident, $field:ident, $restore:ident) => {
        crate::native_owned::restore_field(&mut $row.$field, $restore)?;
    };
}

macro_rules! apply_attribute {
    ($row:ident, $field:ident, $attributes:ident, $method:ident [$($key:expr),*]) => {
        $row.$field = $attributes.$method(&[$($key),*]);
    };
    ($row:ident, $field:ident, $attributes:ident) => {};
}

macro_rules! define_row_types {
    ($($field:ident $(as $name:literal)? $(logical($logical_ty:ty))? : $ty:ty),* $(,)?) => {
        #[derive(Debug)]
        pub struct PreparedEventRow { $(pub(crate) $field: $ty,)* }

        #[derive(Clone, Debug, Default, Serialize)]
        pub struct OtelStorageRow {
            $(
                $(#[serde(rename = $name)])?
                pub(crate) $field: logical_type!($ty $(, $logical_ty)?),
            )*
        }
    };
}

macro_rules! impl_prepared_row {
    ($($field:ident $(as $name:literal)? : $ty:ty => $policy:expr),* $(,)?) => {
        impl PreparedEventRow {
            pub(crate) fn columns() -> Vec<(String, String, bool)> {
                vec![$((column_name!($field $(as $name)?).into(),
                    crate::native_columns::column_type::<$ty>().to_string(),
                    $policy != DefaultPolicy::None),)*]
            }

            pub(crate) fn schema() -> ch_core_rs::schema::Schema {
                ch_core_rs::schema::Schema::new(vec![$(
                    ch_core_rs::schema::Field {
                        name: column_name!($field $(as $name)?).into(),
                        ch_type: crate::native_columns::column_type::<$ty>(),
                    },
                )*])
            }

            pub(crate) fn build_columns(rows: &[std::sync::Arc<Self>])
                -> Result<Vec<ch_core_rs::column::Column>, crate::native_columns::NativeColumnError>
            {
                Ok(vec![$(crate::native_columns::build_column::<$ty, _>(rows.iter().map(|row| &row.$field))?,)*])
            }
        }
    };
}

macro_rules! impl_otel_row {
    ($(
        $field:ident $(as $name:literal)?
        $(otel($method:ident [$($key:expr),*]))?
        $(media($media:ident))? $(default($default:ident))?
        : $ty:ty => $policy:expr
    ),* $(,)?) => {
        impl OtelStorageRow {
            /// Fill the declared attribute mappings. Event construction supplies IDs,
            /// ingestion context and provider-specific fields afterward.
            pub fn from_attributes(attributes: &mut crate::otel::attributes::EventAttributes<'_>) -> Self {
                let mut row = Self::default();
                $(apply_attribute!(row, $field, attributes $(, $method [$($key),*])?);)*
                row
            }

            pub fn restore_media(&mut self, restore: &mut impl FnMut(&mut String) -> Result<(), String>) -> Result<(), String> {
                $(restore_field!(self, $field, restore $(, $media)?);)*
                Ok(())
            }

            pub fn into_prepared(self) -> Result<PreparedEventRow, String> {
                Ok(PreparedEventRow { $(
                    $field: read_owned!(self, $field, $ty, column_name!($field $(as $name)?), $policy $(, $default)?),
                )* })
            }
        }
    };
}

macro_rules! compat_read {
    ($object:ident, $metadata:ident, metadata_names $($rest:tt)*) => {
        $metadata.take_names()
    };
    ($object:ident, $metadata:ident, metadata_values $($rest:tt)*) => {
        $metadata.take_values()
    };
    (
        $object:ident,
        $metadata:ident,
        $field:ident $(as $name:literal)? $(logical($logical_ty:ty))?
        $(otel($method:ident [$($key:expr),*]))?
        $(media($media:ident))? $(default($default:ident))?
        : $ty:ty => $policy:expr
    ) => {
        crate::native_js::from_js_field::<$ty>(
            $object,
            column_name!($field $(as $name)?),
            $policy,
            &$metadata,
        )?
    };
}

macro_rules! impl_js_compat {
    ($(
        $field:ident $(as $name:literal)? $(logical($logical_ty:ty))?
        $(otel($method:ident [$($key:expr),*]))?
        $(media($media:ident))? $(default($default:ident))?
        : $ty:ty => $policy:expr
    ),* $(,)?) => {
        impl PreparedEventRow {
            pub(crate) fn from_js_fields(
                object: Object<'_>,
                mut metadata: crate::native_js::MetadataValues,
            ) -> Result<Self, String> {
                $(let $field = compat_read!(
                    object,
                    metadata,
                    $field $(as $name)? $(logical($logical_ty))?
                        $(otel($method [$($key),*]))?
                        $(media($media))? $(default($default))?
                        : $ty => $policy
                );)*
                Ok(Self { $($field,)* })
            }
        }
    };
}

macro_rules! clickhouse_table_schema {
    ($(
        $field:ident $(as $name:literal)? $(logical($logical_ty:ty))?
        $(otel($method:ident [$($key:expr),*]))?
        $(media($media:ident))? $(default($default:ident))?
        : $ty:ty => $policy:expr
    ),* $(,)?) => {
        define_row_types! { $($field $(as $name)? $(logical($logical_ty))?: $ty,)* }
        impl_prepared_row! { $($field $(as $name)?: $ty => $policy,)* }
        impl_js_compat! {
            $($field $(as $name)? $(logical($logical_ty))?
                $(otel($method [$($key),*]))?
                $(media($media))? $(default($default))?: $ty => $policy,)*
        }
        impl_otel_row! {
            $($field $(as $name)? $(otel($method [$($key),*]))?
                $(media($media))? $(default($default))?: $ty => $policy,)*
        }
    };
}
