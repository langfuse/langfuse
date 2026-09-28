//! The insertable part of `events_full` and its prepared Rust row.
//!
//! The macro invocation below is the only per-column declaration. It drives the prepared row,
//! column type metadata, JS reads, and typed Native column writes.

use clickhouse::native::builder::BlockBuilder;
use clickhouse::native::encode::Encode;
use napi::bindgen_prelude::{Object, Unknown};

use crate::native_codec::{DateTime64Micros, Decimal64};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum DefaultPolicy {
    None,
    Literal(&'static str),
    Metadata(&'static str),
    MetadataFallback(&'static str, &'static str),
    MetadataEquals(&'static str, &'static str),
}

macro_rules! schema_column_name {
    ($field:ident) => {
        stringify!($field)
    };
    ($field:ident as $name:literal) => {
        $name
    };
}

macro_rules! prepare_metadata_field {
    (
        $metadata:ident,
        $field:ident $(as $name:literal)?,
        $ty:ty,
        $policy:expr,
        metadata_names
    ) => {
        let $field = $metadata.take_names();
    };
    (
        $metadata:ident,
        $field:ident $(as $name:literal)?,
        $ty:ty,
        $policy:expr,
        metadata_values
    ) => {
        let $field = $metadata.take_values();
    };
    (
        $metadata:ident,
        $field:ident $(as $name:literal)?,
        $ty:ty,
        $policy:expr $(, $source:ident)?
    ) => {};
}

macro_rules! prepare_js_field {
    (
        $object:ident,
        $metadata:ident,
        $field:ident $(as $name:literal)?,
        $ty:ty,
        $policy:expr,
        computed
    ) => {
        let $field = crate::native_js::required_js_field::<$ty>(
            $object,
            schema_column_name!($field $(as $name)?),
        )?;
    };
    (
        $object:ident,
        $metadata:ident,
        $field:ident $(as $name:literal)?,
        $ty:ty,
        $policy:expr,
        metadata_names
    ) => {};
    (
        $object:ident,
        $metadata:ident,
        $field:ident $(as $name:literal)?,
        $ty:ty,
        $policy:expr,
        metadata_values
    ) => {};
    (
        $object:ident,
        $metadata:ident,
        $field:ident $(as $name:literal)?,
        $ty:ty,
        $policy:expr
    ) => {
        let $field = crate::native_js::from_js_field::<$ty>(
            $object,
            schema_column_name!($field $(as $name)?),
            $policy,
            &$metadata,
        )?;
    };
}

/// Declare the prepared row and every operation that must agree with its shape.
macro_rules! clickhouse_table_schema {
    (
        $(
            $field:ident $(as $name:literal)? : $ty:ty => $( @ $source:ident )? $policy:expr
        ),* $(,)?
    ) => {
        #[derive(Debug)]
        pub(crate) struct PreparedEventRow {
            $(pub(crate) $field: $ty,)*
        }

        impl PreparedEventRow {
            /// Convert one finalized JavaScript row directly into owned Rust fields.
            ///
            /// The schema macro generates typed reads for the declared columns and ignores
            /// unrelated properties. Only owned typed fields leave the NAPI call.
            pub(crate) fn from_js(value: Unknown<'_>) -> Result<Self, String> {
                let object: Object<'_> = match value.get_type().map_err(|error| error.to_string())? {
                    napi::ValueType::Object => unsafe { value.cast() }
                        .map_err(|error| error.to_string())?,
                    value_type => {
                        return Err(format!(
                            "prepared event must be an object, got {value_type:?}"
                        ));
                    }
                };
                let mut metadata = crate::native_js::MetadataValues::from_js(&object)?;
                $(
                    prepare_js_field!(
                        object,
                        metadata,
                        $field $(as $name)?,
                        $ty,
                        $policy $(, $source)?
                    );
                )*
                $(
                    prepare_metadata_field!(
                        metadata,
                        $field $(as $name)?,
                        $ty,
                        $policy $(, $source)?
                    );
                )*
                Ok(Self {
                    $(
                        $field,
                    )*
                })
            }

            /// Return the insertable columns and their Native type names from this declaration.
            pub(crate) fn columns() -> Vec<(String, String, bool)> {
                vec![$(
                    (
                        schema_column_name!($field $(as $name)?).to_owned(),
                        <$ty as Encode>::produces().to_string(),
                        $policy != DefaultPolicy::None,
                    ),
                )*]
            }

            /// Write shared prepared rows through clickhouse-rs's typed `Encode` implementations.
            pub(crate) fn encode_arcs(
                builder: &mut BlockBuilder,
                rows: &[std::sync::Arc<Self>],
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
    ingestion_sdk_name: String => DefaultPolicy::Literal("unknown"),
    ingestion_sdk_version: String => DefaultPolicy::Literal("unknown"),
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
    metadata_names: Vec<String> => @metadata_names DefaultPolicy::None,
    metadata_values: Vec<String> => @metadata_values DefaultPolicy::None,
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
