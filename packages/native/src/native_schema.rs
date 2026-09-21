//! The insertable part of `events_full` and its prepared Rust row.
//!
//! The macro invocation below is the only per-column declaration. It drives the prepared row,
//! the live-schema metadata, JSON conversion, and the typed Native column writes together.

use clickhouse::native::builder::BlockBuilder;
use serde_json::Value;

use crate::native_codec::{DateTime64Micros, Decimal64, FromJson};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum ColumnKind {
    String,
    DateTime64,
    NullableDateTime64,
    NullableString,
    NullableUInt16,
    Bool,
    UInt8,
    UInt16,
    UInt64,
    Decimal,
    ArrayString,
    MapStringString,
    MapStringUInt64,
    MapStringDecimal,
}

impl ColumnKind {
    /// Convert the type spelling returned by `system.columns` to the codec's logical type.
    #[cfg(test)]
    pub(crate) fn from_clickhouse_type(value: &str) -> Result<Self, String> {
        let normalized: String = value
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect();
        match normalized.as_str() {
            "String" | "LowCardinality(String)" => Ok(Self::String),
            "DateTime64(6)" => Ok(Self::DateTime64),
            "Nullable(DateTime64(6))" => Ok(Self::NullableDateTime64),
            "Nullable(String)" | "Nullable(LowCardinality(String))" => Ok(Self::NullableString),
            "Nullable(UInt16)" => Ok(Self::NullableUInt16),
            "Bool" => Ok(Self::Bool),
            "UInt8" => Ok(Self::UInt8),
            "UInt16" => Ok(Self::UInt16),
            "UInt64" => Ok(Self::UInt64),
            "Decimal(18,12)" => Ok(Self::Decimal),
            "Array(String)" | "Array(LowCardinality(String))" => Ok(Self::ArrayString),
            "Map(String,String)" | "Map(LowCardinality(String),String)" => {
                Ok(Self::MapStringString)
            }
            "Map(String,UInt64)" | "Map(LowCardinality(String),UInt64)" => {
                Ok(Self::MapStringUInt64)
            }
            "Map(String,Decimal(18,12))" | "Map(LowCardinality(String),Decimal(18,12))" => {
                Ok(Self::MapStringDecimal)
            }
            _ => Err(format!("unsupported events_full column type {value:?}")),
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DefaultPolicy {
    None,
    Literal(&'static str),
    Metadata(&'static str),
    MetadataFallback(&'static str, &'static str),
    MetadataEquals(&'static str, &'static str),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) struct ColumnSpec {
    pub(crate) name: &'static str,
    pub(crate) kind: ColumnKind,
    pub(crate) default_policy: DefaultPolicy,
}

macro_rules! schema_column_name {
    ($field:ident) => {
        stringify!($field)
    };
    ($field:ident as $name:literal) => {
        $name
    };
}

macro_rules! prepared_json_value {
    (
        $value:ident,
        $event_bytes:ident,
        event_bytes $(as $name:literal)?,
        $ty:ty,
        $policy:expr,
        computed
    ) => {
        $event_bytes
    };
    (
        $value:ident,
        $event_bytes:ident,
        $field:ident $(as $name:literal)?,
        $ty:ty,
        $policy:expr
    ) => {
        crate::native_codec::from_json_field::<$ty>(
            $value,
            schema_column_name!($field $(as $name)?),
            $policy,
        )?
    };
}

/// Declare the prepared row and every operation that must agree with its shape.
macro_rules! clickhouse_table_schema {
    (
        $(
            $field:ident $(as $name:literal)? : $ty:ty => $( @ $source:ident )? $policy:expr
        ),* $(,)?
    ) => {
        #[derive(Clone, Debug)]
        pub(crate) struct PreparedEvent {
            $(pub(crate) $field: $ty,)*
        }

pub(crate) const EVENTS_FULL_INSERT_COLUMNS: &[ColumnSpec] = &[
            $(ColumnSpec {
                name: schema_column_name!($field $(as $name)?),
                kind: <$ty as FromJson>::COLUMN_KIND,
                default_policy: $policy,
            },)*
        ];

        impl PreparedEvent {
            /// Convert one prepared ingestion object and compute accounting before typed defaults.
            pub(crate) fn from_json(value: &Value) -> Result<Self, String> {
                // `event_bytes` describes the immutable prepared JSON row. In particular, it
                // intentionally sees raw decimal values and omitted DEFAULT-backed fields.
                let event_bytes = crate::native_codec::event_bytes(value)?;

                Ok(Self {
                    $(
                        $field: prepared_json_value!(
                            value,
                            event_bytes,
                            $field $(as $name)?,
                            $ty,
                            $policy $(, $source)?
                        ),
                    )*
                })
            }

            /// Write this row type through clickhouse-rs's typed `Encode` implementations.
            pub(crate) fn encode_into(
                builder: &mut BlockBuilder,
                rows: &[Self],
            ) -> Result<(), String> {
                $(
                    let name = schema_column_name!($field $(as $name)?);
                    let mut column = builder
                        .upsert_column::<&$ty>(name)
                        .map_err(|error| format!("cannot add column {name}: {error}"))?;
                    for row in rows {
                        column
                            .add(&row.$field)
                            .map_err(|error| format!("cannot encode column {name}: {error}"))?;
                    }
                )*
                Ok(())
            }
        }
    };
}

// Keep this list in the same order as the insertable events_full contract. Materialized and alias
// columns remain server-owned and therefore are intentionally absent.
clickhouse_table_schema! {
    project_id: String => DefaultPolicy::None,
    trace_id: String => DefaultPolicy::None,
    span_id: String => DefaultPolicy::None,
    parent_span_id: String => DefaultPolicy::None,
    name: String => DefaultPolicy::None,
    environment: String => DefaultPolicy::Literal("default"),
    version: String => DefaultPolicy::None,
    release: String => DefaultPolicy::None,
    trace_name: String => DefaultPolicy::None,
    user_id: String => DefaultPolicy::None,
    session_id: String => DefaultPolicy::None,
    level: String => DefaultPolicy::None,
    status_message: String => DefaultPolicy::None,
    prompt_id: String => DefaultPolicy::None,
    prompt_name: String => DefaultPolicy::None,
    model_id: String => DefaultPolicy::None,
    provided_model_name: String => DefaultPolicy::None,
    model_parameters: String => DefaultPolicy::None,
    input: String => DefaultPolicy::None,
    output: String => DefaultPolicy::None,
    evaluator_id: String => DefaultPolicy::Metadata("evaluator_id"),
    evaluation_rule_id: String => {
        DefaultPolicy::MetadataFallback("evaluation_rule_id", "job_configuration_id")
    },
    experiment_id: String => DefaultPolicy::None,
    experiment_name: String => DefaultPolicy::None,
    experiment_description: String => DefaultPolicy::None,
    experiment_dataset_id: String => DefaultPolicy::None,
    experiment_item_id: String => DefaultPolicy::None,
    experiment_item_expected_output: String => DefaultPolicy::None,
    experiment_item_root_span_id: String => DefaultPolicy::None,
    source: String => DefaultPolicy::None,
    service_name: String => DefaultPolicy::None,
    service_version: String => DefaultPolicy::None,
    scope_name: String => DefaultPolicy::None,
    scope_version: String => DefaultPolicy::None,
    telemetry_sdk_language: String => DefaultPolicy::None,
    telemetry_sdk_name: String => DefaultPolicy::None,
    telemetry_sdk_version: String => DefaultPolicy::None,
    blob_storage_file_path: String => DefaultPolicy::None,
    ingestion_api_key: String => DefaultPolicy::None,
    ingestion_sdk_name: String => DefaultPolicy::None,
    ingestion_sdk_version: String => DefaultPolicy::None,
    event_type as "type": String => DefaultPolicy::None,
    start_time: DateTime64Micros => DefaultPolicy::None,
    created_at: DateTime64Micros => DefaultPolicy::None,
    updated_at: DateTime64Micros => DefaultPolicy::None,
    event_ts: DateTime64Micros => DefaultPolicy::None,
    end_time: Option<DateTime64Micros> => DefaultPolicy::None,
    completion_start_time: Option<DateTime64Micros> => DefaultPolicy::None,
    experiment_item_version: Option<DateTime64Micros> => DefaultPolicy::None,
    prompt_version: Option<u16> => DefaultPolicy::None,
    is_app_root: bool => DefaultPolicy::None,
    bookmarked: bool => DefaultPolicy::None,
    public: bool => DefaultPolicy::None,
    evaluator_execution_is_test: bool => {
        DefaultPolicy::MetadataEquals("evaluator_test", "true")
    },
    is_deleted: u8 => DefaultPolicy::None,
    event_bytes: u64 => @computed DefaultPolicy::None,
    tags: Vec<String> => DefaultPolicy::None,
    tool_calls: Vec<String> => DefaultPolicy::None,
    tool_call_names: Vec<String> => DefaultPolicy::None,
    metadata_names: Vec<String> => DefaultPolicy::None,
    metadata_values: Vec<String> => DefaultPolicy::None,
    experiment_metadata_names: Vec<String> => DefaultPolicy::None,
    experiment_metadata_values: Vec<String> => DefaultPolicy::None,
    experiment_item_metadata_names: Vec<String> => DefaultPolicy::None,
    experiment_item_metadata_values: Vec<String> => DefaultPolicy::None,
    provided_usage_details: std::collections::BTreeMap<String, u64> => DefaultPolicy::None,
    usage_details: std::collections::BTreeMap<String, u64> => DefaultPolicy::None,
    provided_cost_details: std::collections::BTreeMap<String, Decimal64> => DefaultPolicy::None,
    cost_details: std::collections::BTreeMap<String, Decimal64> => DefaultPolicy::None,
    usage_pricing_tier_id: Option<String> => DefaultPolicy::None,
    usage_pricing_tier_name: Option<String> => DefaultPolicy::None,
    tool_definitions: std::collections::BTreeMap<String, String> => DefaultPolicy::None,
}

#[cfg(test)]
pub(crate) fn find_column(name: &str) -> Option<&'static ColumnSpec> {
    EVENTS_FULL_INSERT_COLUMNS
        .iter()
        .find(|column| column.name == name)
}
